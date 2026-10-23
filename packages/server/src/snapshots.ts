import { createHash } from 'node:crypto';
import { parseAdventure, type Template } from 'promptbook-format';
import { countWords, findTarget, readDocument, readMeta, templateOf } from 'promptbook-project';
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
// adventure or a one-shot, read with the project's template, the whole text
// for a campaign.
export function documentWords(text: string, template: Template): number {
  if (template.kind === 'campaign') return countWords(text);
  const { model } = parseAdventure(text, { template });
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
  // The project's template, for the word count.
  template: Template;
  // A Claude snapshot's edit, for its undo.
  tool?: string;
  target?: string;
  beforeSection?: string;
  afterHash?: string;
  grantId?: string | null;
}

export const LABEL_MAX = 200;

// At most LABEL_MAX UTF-16 units, never half a surrogate pair: a restore of a
// restore names the one before, so labels would otherwise grow.
function cutLabel(label: string): string {
  if (label.length <= LABEL_MAX) return label;
  const code = label.charCodeAt(LABEL_MAX - 1);
  return label.slice(0, code >= 0xd800 && code <= 0xdbff ? LABEL_MAX - 1 : LABEL_MAX);
}

export async function insertSnapshot(db: Queryable, s: NewSnapshot): Promise<Snapshot> {
  const row = await db.queryOne<DbRow>(
    `insert into snapshots (project_id, kind, label, text, words, tool, target, before_section, after_hash, grant_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning ${COLUMNS}`,
    [
      s.projectId,
      s.kind,
      cutLabel(s.label),
      s.text,
      documentWords(s.text, s.template),
      s.tool ?? null,
      s.target ?? null,
      s.beforeSection ?? null,
      s.afterHash ?? null,
      s.grantId ?? null,
    ],
  );
  return { ...toRow(row!), text: s.text };
}

// The most Claude snapshots a project keeps, besides the 30 days: a busy
// client cannot fill the table with full copies of the document.
export const CLAUDE_SNAPSHOTS_MAX = 200;

// Removes the oldest Claude snapshots of a project beyond the cap.
export async function pruneClaudeSnapshots(db: Queryable, projectId: string): Promise<number> {
  const rows = await db.query(
    `delete from snapshots where id in (
       select id from snapshots where project_id = $1 and kind = 'claude'
       order by created_at desc, id desc offset $2)
     returning id`,
    [projectId, CLAUDE_SNAPSHOTS_MAX],
  );
  return rows.length;
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

// A user snapshot of the text as the open clients have it, or as stored. A
// project with no stored document has no text to keep.
export async function createUserSnapshot(db: Db, sync: Sync, project: ProjectRow, label: string): Promise<SnapshotRow> {
  const doc = sync.liveDocument(project.id) ?? (await loadProjectDoc(db, project.id));
  if (!doc) throw new AppError(409, 'no_document', 'This project has no stored text to snapshot.');
  const snapshot = await insertSnapshot(db, {
    projectId: project.id,
    kind: 'user',
    label,
    text: readDocument(doc),
    template: templateOf(readMeta(doc)),
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
    // The snapshot never outlives a write that did not happen: a moved text,
    // a write that throws, a connection closed under it.
    let written = false;
    let threw = false;
    try {
      written = await live.transact((doc) => {
        if (readDocument(doc) !== text) return false;
        setDocumentText(doc, replacement);
        return true;
      });
    } catch (error) {
      threw = true;
      throw error;
    } finally {
      if (!written) {
        try {
          await removeSnapshot(db, stored.id);
        } catch (error) {
          // The write's own error says more than the cleanup's.
          if (!threw) throw error;
        }
      }
    }
    if (written) {
      live.broadcast(snapshotMessage(stored));
      return stored;
    }
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
          template: templateOf(readMeta(live.doc)),
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
function undoneText(text: string, template: Template, edit: ClaudeEdit): string {
  const found = findTarget(text, template, edit.target!);
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
          template: templateOf(readMeta(live.doc)),
        }),
      next: (text) => undoneText(text, templateOf(readMeta(live.doc)), edit),
    });
    return strip(stored);
  } finally {
    await live.close();
  }
}
