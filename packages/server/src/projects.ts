import { randomUUID } from 'node:crypto';
import {
  createProjectDoc,
  isCategory,
  projectRow,
  skeletonDocument,
  summarize,
  type CampaignRef,
  type Category,
  type ProjectRow,
  type Status,
  type Summary,
} from 'promptbook-project';
import * as Y from 'yjs';
import type { Db, Queryable } from './db.js';
import { AppError } from './errors.js';
import { sweepExpired } from './oauth/tokens.js';
import { getSettings } from './routes/settings.js';

// The projects table and the stored documents. The document is the source;
// the row is its summary, written from it on every store (design decision 6).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID.test(value);

export type { ProjectRow };

interface DbRow {
  id: string;
  title: string;
  category: Category;
  status: Status;
  campaign_id: string | null;
  system: string;
  seed: string;
  todo_done: number;
  todo_total: number;
  next_due: string | null;
  scenes: number | null;
  words: number | null;
  errors: number | null;
  warnings: number | null;
  created_at: Date;
  edited_at: Date;
  deleted_at: Date | null;
}

// The join below has already applied the campaign rule, so the row's link is
// a live campaign or null.
const toRow = (r: DbRow): ProjectRow =>
  projectRow(
    {
      id: r.id,
      title: r.title,
      category: r.category,
      status: r.status,
      campaignId: r.campaign_id,
      system: r.system,
      seed: r.seed,
      todoDone: r.todo_done,
      todoTotal: r.todo_total,
      nextDue: r.next_due,
      scenes: r.scenes,
      words: r.words,
      errors: r.errors,
      warnings: r.warnings,
    },
    {
      createdAt: r.created_at.toISOString(),
      editedAt: r.edited_at.toISOString(),
      deletedAt: r.deleted_at?.toISOString() ?? null,
    },
    r.campaign_id === null ? [] : [{ id: r.campaign_id }],
  );

// A link to a campaign in the bin, gone or not a campaign reads as
// stand-alone: the children's rows are not rewritten when their campaign is
// deleted or restored.
const SELECT = `
  select p.id, p.title, p.category, p.status,
         case when c.id is null then null else p.campaign_id end as campaign_id,
         p.system, p.seed, p.todo_done, p.todo_total, to_char(p.next_due, 'YYYY-MM-DD') as next_due,
         p.scenes, p.words, p.errors, p.warnings, p.created_at, p.edited_at, p.deleted_at
  from projects p
  left join projects c on c.id = p.campaign_id and c.owner_id = p.owner_id
                      and c.category = 'campaign' and c.deleted_at is null`;

export async function listProjects(db: Queryable, ownerId: string, { bin }: { bin: boolean }): Promise<ProjectRow[]> {
  const rows = await db.query<DbRow>(
    `${SELECT} where p.owner_id = $1 and (p.deleted_at is not null) = $2
     order by ${bin ? 'p.deleted_at' : 'p.edited_at'} desc, p.id`,
    [ownerId, bin],
  );
  return rows.map(toRow);
}

export async function getProject(db: Queryable, ownerId: string, id: string): Promise<ProjectRow | null> {
  if (!isUuid(id)) return null;
  const row = await db.queryOne<DbRow>(`${SELECT} where p.owner_id = $1 and p.id = $2`, [ownerId, id]);
  return row ? toRow(row) : null;
}

// The user's campaigns not in the bin: what a new project may join and what
// imports match `campagna` with. With the bin: what a stored summary checks
// links against, so a link to a campaign in the bin survives an edit and the
// list's join alone decides how it shows.
export async function campaignsOf(
  db: Queryable,
  ownerId: string,
  { includeBin = false }: { includeBin?: boolean } = {},
): Promise<CampaignRef[]> {
  return db.query<CampaignRef>(
    `select id, title from projects
     where owner_id = $1 and category = 'campaign' and ($2 or deleted_at is null)
     order by title, id`,
    [ownerId, includeBin],
  );
}

const summaryParams = (s: Summary) => [
  s.title,
  s.status,
  s.campaignId,
  s.system,
  s.seed,
  s.todoDone,
  s.todoTotal,
  s.nextDue,
  s.scenes,
  s.words,
  s.errors,
  s.warnings,
];

// A new project's row and document. The category column is written here
// only: the category is fixed at creation, so no summary rewrites it.
export async function insertProject(tx: Queryable, ownerId: string, doc: Y.Doc): Promise<void> {
  const summary = summarize(doc, { campaigns: await campaignsOf(tx, ownerId, { includeBin: true }) });
  await tx.query(
    `insert into projects (id, owner_id, category, title, status, campaign_id, system, seed,
                           todo_done, todo_total, next_due, scenes, words, errors, warnings)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [summary.id, ownerId, summary.category, ...summaryParams(summary)],
  );
  await tx.query('insert into project_docs (project_id, state) values ($1, $2)', [
    summary.id,
    Buffer.from(Y.encodeStateAsUpdate(doc)),
  ]);
}

// The campaign a new or imported project goes into: one of the user's
// campaigns not in the bin, and never for a campaign (a campaign is not
// nested).
export function campaignFor(
  category: Category,
  campaignId: string | null,
  campaigns: readonly CampaignRef[],
): CampaignRef | null {
  if (campaignId === null) return null;
  const campaign = category === 'campaign' ? undefined : campaigns.find((c) => c.id === campaignId);
  if (!campaign) throw new AppError(400, 'invalid_campaign', 'campaignId: is not one of your campaigns.');
  return campaign;
}

export interface NewProject {
  category: Category;
  title: string;
  campaignId: string | null;
  // The settings' default system when not given.
  system?: string | undefined;
  status?: Status | undefined;
  seed?: string | undefined;
}

// A new project from the user's templates: the category's to-do list and the
// skeleton document with the settings' defaults in its front matter. Shared
// by the REST route and the connector's create_project. The id is the
// desktop app's when it chose one (createWithId).
export async function createProject(
  db: Db,
  ownerId: string,
  input: NewProject,
  id: string = randomUUID(),
): Promise<ProjectRow> {
  const settings = await getSettings(db, ownerId);
  await db.withTransaction(async (tx) => {
    const campaign = campaignFor(input.category, input.campaignId, await campaignsOf(tx, ownerId));
    const system = input.system ?? settings.system;
    const doc = createProjectDoc({
      id,
      title: input.title,
      category: input.category,
      status: input.status ?? 'draft',
      campaignId: campaign?.id ?? null,
      system,
      seed: input.seed ?? '',
      todo: settings.todoTemplates[input.category],
      document: skeletonDocument(input.category, {
        title: input.title,
        system,
        campaignTitle: campaign?.title ?? null,
        author: settings.author,
        copyright: settings.copyright,
        licence: settings.licence,
      }),
    });
    await insertProject(tx, ownerId, doc);
  });
  return (await getProject(db, ownerId, id))!;
}

// The largest document state the desktop app may upload. No document size
// limit exists anywhere else, so this is the one (desktop-app design
// decision 9).
export const MAX_STATE_BYTES = 5 * 1024 * 1024;

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const invalidState = (why: string) => new AppError(400, 'invalid_state', `state: ${why}`);

// A project document as the desktop app uploads it, base64 of a Yjs update,
// checked to read as a project with this id before anything is stored. The
// document's own front matter, to-do list and the rest are the user's, as
// any edit over sync would be.
export function readUploadedState(id: string, state: string): Y.Doc {
  if (state.length % 4 !== 0 || !BASE64.test(state)) throw invalidState('is not base64.');
  const bytes = Buffer.from(state, 'base64');
  if (bytes.length > MAX_STATE_BYTES) throw invalidState(`is larger than ${MAX_STATE_BYTES / 1024 / 1024} MB.`);
  const doc = new Y.Doc();
  let meta: { id: unknown; category: unknown };
  try {
    Y.applyUpdate(doc, bytes);
    const map = doc.getMap<unknown>('meta');
    meta = { id: map.get('id'), category: map.get('category') };
    // Every part a summary reads must read; a shared type of the wrong kind
    // throws here rather than when the row is written.
    summarize(doc, { campaigns: [] });
  } catch {
    throw invalidState('is not a project document.');
  }
  if (!isCategory(meta.category)) throw invalidState('is not a project document.');
  if (meta.id !== id) throw invalidState('is the document of another project id.');
  return doc;
}

const UNIQUE_VIOLATION = '23505';

// Creates a project with the id the desktop app chose, from its uploaded
// document or else from the templates. The same id sent again by its owner
// (a retry after a lost answer) answers the project as it is and changes
// nothing; the provider then sends anything newer. An id another user has
// is refused.
export async function createWithId(
  db: Db,
  ownerId: string,
  id: string,
  create: () => Promise<unknown>,
): Promise<{ project: ProjectRow; created: boolean }> {
  for (let attempt = 0; ; attempt++) {
    const existing = await db.queryOne<{ owner_id: string }>('select owner_id from projects where id = $1', [id]);
    if (existing) {
      if (existing.owner_id !== ownerId) throw new AppError(409, 'id_taken', 'id: is taken.');
      return { project: (await getProject(db, ownerId, id))!, created: false };
    }
    try {
      await create();
      return { project: (await getProject(db, ownerId, id))!, created: true };
    } catch (error) {
      // Two uploads of one id at once: the second finds the first's row.
      if ((error as { code?: unknown }).code !== UNIQUE_VIOLATION || attempt > 0) throw error;
    }
  }
}

// Writes a document's state and its summary in one transaction. A project
// that is gone (purged) is skipped.
export async function storeProjectDoc(db: Db, projectId: string, doc: Y.Doc): Promise<void> {
  await db.withTransaction(async (tx) => {
    const project = await tx.queryOne<{ owner_id: string }>('select owner_id from projects where id = $1 for update', [
      projectId,
    ]);
    if (!project) return;
    const summary = summarize(doc, { campaigns: await campaignsOf(tx, project.owner_id, { includeBin: true }) });
    await tx.query(
      `insert into project_docs (project_id, state) values ($1, $2)
       on conflict (project_id) do update set state = excluded.state, updated_at = now()`,
      [projectId, Buffer.from(Y.encodeStateAsUpdate(doc))],
    );
    await tx.query(
      `update projects set title = $2, status = $3, campaign_id = $4, system = $5, seed = $6,
              todo_done = $7, todo_total = $8, next_due = $9, scenes = $10, words = $11,
              errors = $12, warnings = $13, edited_at = now()
       where id = $1`,
      [projectId, ...summaryParams(summary)],
    );
  });
}

// A project's stored document, or null.
export async function loadProjectDoc(db: Queryable, projectId: string): Promise<Y.Doc | null> {
  const row = await db.queryOne<{ state: Buffer }>('select state from project_docs where project_id = $1', [
    projectId,
  ]);
  if (!row) return null;
  const doc = new Y.Doc();
  Y.applyUpdate(doc, row.state);
  return doc;
}

// Moves a project to the bin; false when it is not the owner's or already there.
export async function binProject(db: Queryable, ownerId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db.query(
    'update projects set deleted_at = now() where id = $1 and owner_id = $2 and deleted_at is null returning id',
    [id, ownerId],
  );
  return rows.length > 0;
}

export async function restoreProject(db: Queryable, ownerId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db.query(
    'update projects set deleted_at = null where id = $1 and owner_id = $2 and deleted_at is not null returning id',
    [id, ownerId],
  );
  return rows.length > 0;
}

export const BIN_DAYS = 30;
// Claude's and restore snapshots are kept that long; the user's until deleted.
export const SNAPSHOT_DAYS = 30;

export interface Purged {
  projects: number;
  loginFailures: number;
  oidcLogins: number;
  snapshots: number;
  oauthCodes: number;
  oauthTokens: number;
  oauthRegistrations: number;
}

// Removes projects in the bin for more than 30 days, with their documents
// and snapshots, sign-in failures older than a day, expired single sign-on
// handshakes, Claude and restore snapshots older than 30 days, expired OAuth
// codes and tokens, and registration counts older than a day. Answers what it
// removed.
export async function purge(db: Queryable): Promise<Purged> {
  const projects = await db.query(
    `delete from projects where deleted_at < now() - make_interval(days => $1) returning id`,
    [BIN_DAYS],
  );
  const failures = await db.query(`delete from login_failures where at < now() - interval '1 day' returning id`);
  const logins = await db.query('delete from oidc_logins where expires_at < now() returning state');
  const snapshots = await db.query(
    `delete from snapshots where kind <> 'user' and created_at < now() - make_interval(days => $1) returning id`,
    [SNAPSHOT_DAYS],
  );
  const oauth = await sweepExpired(db);
  const registrations = await db.query(
    `delete from oauth_registrations where at < now() - interval '1 day' returning id`,
  );
  return {
    projects: projects.length,
    loginFailures: failures.length,
    oidcLogins: logins.length,
    snapshots: snapshots.length,
    oauthCodes: oauth.codes,
    oauthTokens: oauth.tokens,
    oauthRegistrations: registrations.length,
  };
}
