import { createHash } from 'node:crypto';
import { parseAdventure, templates } from 'promptbook-format';
import { countWords, findTarget, readDocument, type Category } from 'promptbook-project';
import type { Db, Queryable } from './db.js';
import { AppError } from './errors.js';
import { broadcastToProject, openLiveDocument, setDocumentText, snapshotMessage, type LiveDocument } from './live.js';
import { isUuid, loadProjectDoc, SNAPSHOT_DAYS, type ProjectRow } from './projects.js';
import type { Sync } from './sync.js';

// Server snapshots of a project's prep document (connector design decisions
// 6 and 13). Callers check first that the project is the user's and not in
// the bin.

export const snapshotKinds = ['claude', 'user', 'restore'] as const;
export type SnapshotKind = (typeof snapshotKinds)[number];

// How many times a write that snapshots first tries again when the document
// changed between the snapshot and the write.
const WRITE_ATTEMPTS = 3;

// One snapshot as the list answers it, without its text.
export interface SnapshotRow {
  id: string;
  kind: SnapshotKind;
  label: string;
  tool: string | null;
  target: string | null;
  words: number;
  createdAt: string;
  // Null for the user's own.
  expiresAt: string | null;
}

export interface Snapshot extends SnapshotRow {
  text: string;
}

interface DbRow {
  id: string;
  kind: SnapshotKind;
  label: string;
  tool: string | null;
  target: string | null;
  words: number;
  created_at: Date;
  text?: string;
}

const COLUMNS = 'id, kind, label, tool, target, words, created_at';

function toRow(r: DbRow): SnapshotRow {
  const expires = r.kind === 'user' ? null : new Date(r.created_at.getTime() + SNAPSHOT_DAYS * 86_400_000);
  return {
    id: r.id,
    kind: r.kind,
    label: r.label,
    tool: r.tool,
    target: r.target,
    words: r.words,
    createdAt: r.created_at.toISOString(),
    expiresAt: expires?.toISOString() ?? null,
  };
}

// SHA-256 hex of a text in UTF-8: what read_document answers as a section's
// hash and what a Claude snapshot keeps as after_hash.
export const textHash = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

// Words as the project summary counts them: after the front matter for an
// adventure or a one-shot, the whole text for a campaign.
export function documentWords(text: string, category: Category): number {
  if (category === 'campaign') return countWords(text);
  const { model } = parseAdventure(text, { template: templates.avventura });
  return countWords(model.meta.range ? text.slice(model.meta.range.end.offset) : text);
}

export async function listSnapshots(
  db: Queryable,
  projectId: string,
  { kind, limit }: { kind?: SnapshotKind | undefined; limit?: number | undefined } = {},
): Promise<SnapshotRow[]> {
  const rows = await db.query<DbRow>(
    `select ${COLUMNS} from snapshots
     where project_id = $1 and ($2::text is null or kind = $2)
     order by created_at desc, id
     limit $3`,
    [projectId, kind ?? null, limit ?? null],
  );
  return rows.map(toRow);
}

export async function getSnapshot(db: Queryable, projectId: string, id: string): Promise<Snapshot | null> {
  if (!isUuid(id)) return null;
  const row = await db.queryOne<DbRow & { text: string }>(
    `select ${COLUMNS}, text from snapshots where project_id = $1 and id = $2`,
    [projectId, id],
  );
  return row ? { ...toRow(row), text: row.text } : null;
}

export interface NewSnapshot {
  projectId: string;
  kind: SnapshotKind;
  label: string;
  text: string;
  category: Category;
  // A Claude snapshot's edit, for its undo.
  tool?: string;
  target?: string;
  beforeSection?: string;
  afterHash?: string;
  grantId?: string | null;
}

export async function insertSnapshot(db: Queryable, s: NewSnapshot): Promise<Snapshot> {
  const row = await db.queryOne<DbRow>(
    `insert into snapshots (project_id, kind, label, text, words, tool, target, before_section, after_hash, grant_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning ${COLUMNS}`,
    [
      s.projectId,
      s.kind,
      s.label,
      s.text,
      documentWords(s.text, s.category),
      s.tool ?? null,
      s.target ?? null,
      s.beforeSection ?? null,
      s.afterHash ?? null,
      s.grantId ?? null,
    ],
  );
  return { ...toRow(row!), text: s.text };
}

const removeSnapshot = (db: Queryable, id: string) => db.query('delete from snapshots where id = $1', [id]);

// Only the user's own snapshots can be deleted.
export async function deleteSnapshot(db: Queryable, projectId: string, id: string): Promise<void> {
  const snapshot = await getSnapshot(db, projectId, id);
  if (!snapshot) throw new AppError(404, 'not_found', 'Not found.');
  if (snapshot.kind !== 'user') {
    throw new AppError(409, 'not_deletable', 'Only your own snapshots can be deleted; the others expire.');
  }
  await removeSnapshot(db, id);
}

// A user snapshot of the text as the open clients have it, or as stored.
export async function createUserSnapshot(db: Db, sync: Sync, project: ProjectRow, label: string): Promise<SnapshotRow> {
  const doc = sync.liveDocument(project.id) ?? (await loadProjectDoc(db, project.id));
  const snapshot = await insertSnapshot(db, {
    projectId: project.id,
    kind: 'user',
    label,
    text: doc ? readDocument(doc) : '',
    category: project.category,
  });
  broadcastToProject(sync, project.id, snapshotMessage(snapshot));
  return strip(snapshot);
}

const strip = ({ text: _text, ...row }: Snapshot): SnapshotRow => row;

// Stores a snapshot of the current text, then writes the next text through
// the live document. The snapshot's insert is an await, during which a
// client may type: the write then checks inside its transaction that the
// text is still the one snapshotted, and when it is not, deletes that
// snapshot and starts again from the new text. So the snapshot always holds
// exactly the text the write replaced, and no keystroke is lost. `next`
// answers the text to write, or throws to refuse before anything is stored;
// `moved` is the refusal once every attempt found the text moved.
export async function snapshotThenWrite(
  db: Queryable,
  live: LiveDocument,
  {
    snapshot,
    next,
    attempts = WRITE_ATTEMPTS,
    moved = () =>
      new AppError(409, 'document_busy', 'The document kept changing while it was being replaced; try again.'),
  }: {
    snapshot: (text: string) => Promise<Snapshot>;
    next: (text: string) => string;
    attempts?: number;
    moved?: () => Error;
  },
): Promise<Snapshot> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const text = readDocument(live.doc);
    const replacement = next(text);
    const stored = await snapshot(text);
    const written = live.transact((doc) => {
      if (readDocument(doc) !== text) return false;
      setDocumentText(doc, replacement);
      return true;
    });
    if (written) {
      live.broadcast(snapshotMessage(stored));
      return stored;
    }
    await removeSnapshot(db, stored.id);
  }
  throw moved();
}

// Restores a snapshot: a restore snapshot of the current text first, then the
// snapshot's text through the live document.
export async function restoreSnapshot(
  db: Db,
  sync: Sync,
  project: ProjectRow,
  userId: string,
  id: string,
): Promise<SnapshotRow> {
  const source = await getSnapshot(db, project.id, id);
  if (!source) throw new AppError(404, 'not_found', 'Not found.');
  const live = await openLiveDocument(sync, project.id, userId);
  try {
    const stored = await snapshotThenWrite(db, live, {
      snapshot: (text) =>
        insertSnapshot(db, {
          projectId: project.id,
          kind: 'restore',
          label: `${source.label} · ${source.createdAt}`,
          text,
          category: project.category,
        }),
      next: () => source.text,
    });
    return strip(stored);
  } finally {
    await live.close();
  }
}

interface ClaudeEdit {
  label: string;
  tool: string | null;
  target: string | null;
  before_section: string | null;
  after_hash: string | null;
}

const SECTION_CHANGED = () =>
  new AppError(
    409,
    'section_changed',
    "This part changed after Claude's edit. Use History to restore the whole document.",
  );

// The text with Claude's edit taken back: the target's text before the edit
// in place of the target, or, for an added scene, the scene and the blank
// lines before it removed. Refuses when the target no longer reads as
// Claude left it.
function undoneText(text: string, category: Category, edit: ClaudeEdit): string {
  const found = findTarget(text, category, edit.target!);
  if (!found.ok) throw SECTION_CHANGED();
  const { from, to } = found.target;
  if (textHash(text.slice(from, to)) !== edit.after_hash) throw SECTION_CHANGED();
  if (edit.tool === 'add_scene') return text.slice(0, from).replace(/(?:\r?\n[ \t]*)+$/, '') + text.slice(to);
  return text.slice(0, from) + edit.before_section! + text.slice(to);
}

// Undoes one Claude edit, and only that part of the document: text typed
// elsewhere since stays. A restore snapshot of the current text is stored
// first, so what Claude wrote is kept.
export async function undoClaudeEdit(
  db: Db,
  sync: Sync,
  project: ProjectRow,
  userId: string,
  id: string,
): Promise<SnapshotRow> {
  if (!isUuid(id)) throw new AppError(404, 'not_found', 'Not found.');
  const edit = await db.queryOne<ClaudeEdit & { kind: SnapshotKind }>(
    'select kind, label, tool, target, before_section, after_hash from snapshots where project_id = $1 and id = $2',
    [project.id, id],
  );
  if (!edit) throw new AppError(404, 'not_found', 'Not found.');
  if (edit.kind !== 'claude' || !edit.target || edit.after_hash === null || edit.before_section === null) {
    throw new AppError(409, 'not_undoable', 'Only a Claude edit can be undone; use Restore for this snapshot.');
  }
  const live = await openLiveDocument(sync, project.id, userId);
  try {
    const stored = await snapshotThenWrite(db, live, {
      snapshot: (text) =>
        insertSnapshot(db, {
          projectId: project.id,
          kind: 'restore',
          label: `Before undoing Claude's edit of ${edit.label}`,
          text,
          category: project.category,
        }),
      next: (text) => undoneText(text, project.category, edit),
    });
    return strip(stored);
  } finally {
    await live.close();
  }
}
