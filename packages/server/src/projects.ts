import { summarize, type CampaignRef, type Category, type Status, type Summary } from 'promptbook-project';
import * as Y from 'yjs';
import type { Db, Queryable } from './db.js';

// The projects table and the stored documents. The document is the source;
// the row is its summary, written from it on every store (design decision 6).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID.test(value);

// One row of the project list, as the API answers it.
export interface ProjectRow {
  id: string;
  title: string;
  category: Category;
  status: Status;
  campaignId: string | null;
  system: string;
  seed: string;
  todoDone: number;
  todoTotal: number;
  nextDue: string | null;
  scenes: number | null;
  words: number | null;
  errors: number | null;
  warnings: number | null;
  createdAt: string;
  editedAt: string;
  deletedAt: string | null;
}

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

const toRow = (r: DbRow): ProjectRow => ({
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
  createdAt: r.created_at.toISOString(),
  editedAt: r.edited_at.toISOString(),
  deletedAt: r.deleted_at?.toISOString() ?? null,
});

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

// Removes projects in the bin for more than 30 days, with their documents,
// sign-in failures older than a day and expired single sign-on handshakes.
// Answers what it removed.
export async function purge(db: Queryable): Promise<{ projects: number; loginFailures: number; oidcLogins: number }> {
  const projects = await db.query(
    `delete from projects where deleted_at < now() - make_interval(days => $1) returning id`,
    [BIN_DAYS],
  );
  const failures = await db.query(`delete from login_failures where at < now() - interval '1 day' returning id`);
  const logins = await db.query('delete from oidc_logins where expires_at < now() returning state');
  return { projects: projects.length, loginFailures: failures.length, oidcLogins: logins.length };
}
