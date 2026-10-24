import { randomInt, randomUUID } from 'node:crypto';
import {
  defaultTemplateRef,
  defineTemplate,
  resolveTemplate,
  TemplateError,
  type Template,
  type TemplateInput,
  type TemplateRef,
} from 'promptbook-format';
import { readMeta, templateKindOf, templateOf, type Category, type Settings } from 'promptbook-project';
import type * as Y from 'yjs';
import type { Db, Queryable } from './db.js';
import { AppError } from './errors.js';

// The account's document templates (template-editor design decisions 1 to 4):
// one row per version, never updated. Every reader of a project's document
// resolves its template among these and the built-ins.

export interface StoredTemplate {
  id: string;
  version: number;
  body: Template;
  note: string;
  createdAt: string;
}

interface Row {
  id: string;
  version: number;
  body: unknown;
  note: string;
  created_at: Date;
}

// A new template's id: "t-" and ten lower-case base-36 characters. Never a
// built-in's id, which has no such prefix, so resolveTemplate's order (the
// account's first) cannot shadow a built-in.
const ID_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';
export const TEMPLATE_ID = /^t-[0-9a-z]{10}$/;
export const newTemplateId = (): string =>
  `t-${Array.from({ length: 10 }, () => ID_CHARS[randomInt(ID_CHARS.length)]).join('')}`;

// A stored body as a template, or null when it no longer validates (a body
// stored by a later version of the app, say). Never throws.
function readBody(row: Pick<Row, 'id' | 'version' | 'body'>): Template | null {
  try {
    return defineTemplate(row.body as TemplateInput);
  } catch (error) {
    console.warn(`Skipping the stored template ${row.id}@${row.version}: ${(error as Error).message}`);
    return null;
  }
}

// Every version of every template of the account, by id then version. A
// body that does not validate is left out.
export async function listTemplates(db: Queryable, userId: string): Promise<StoredTemplate[]> {
  const rows = await db.query<Row>(
    'select id, version, body, note, created_at from document_templates where user_id = $1 order by id, version',
    [userId],
  );
  return rows.flatMap((row) => {
    const body = readBody(row);
    return body ? [{ id: row.id, version: row.version, body, note: row.note, createdAt: row.created_at.toISOString() }] : [];
  });
}

// The account's templates as the readers take them (`extra`). With a ref,
// only that one version, for the readers of one project: one row by primary
// key, none when the account does not hold it (a built-in, or a deleted
// template), and the reader then falls back as templateOf does.
export async function accountTemplates(db: Queryable, userId: string, ref?: TemplateRef): Promise<Template[]> {
  const rows = ref
    ? await db.query<Row>('select id, version, body from document_templates where user_id = $1 and id = $2 and version = $3', [
        userId,
        ref.id,
        ref.version,
      ])
    : await db.query<Row>('select id, version, body from document_templates where user_id = $1 order by id, version', [
        userId,
      ]);
  return rows.flatMap((row) => readBody(row) ?? []);
}

// The template a project's document records, among the account's and the
// built-ins, falling back as templateOf does.
export async function templateOfDoc(db: Queryable, userId: string, doc: Y.Doc): Promise<Template> {
  const meta = readMeta(doc);
  return templateOf(meta, await accountTemplates(db, userId, meta.template));
}

// The latest version of one of the account's templates, or null.
async function latestTemplate(db: Queryable, userId: string, id: string): Promise<Template | null> {
  const row = await db.queryOne<Row>(
    'select id, version, body from document_templates where user_id = $1 and id = $2 order by version desc limit 1',
    [userId, id],
  );
  return row ? readBody(row) : null;
}

// The template a new project starts from (design decision 6): the one asked
// for, which must be the account's or a built-in and of the category's kind
// (else template_unknown); else the kind's default from the settings at its
// latest version; else the kind's built-in.
export async function templateForNewProject(
  db: Queryable,
  userId: string,
  category: Category,
  settings: Pick<Settings, 'defaultTemplates'>,
  ref?: TemplateRef,
): Promise<Template> {
  const kind = templateKindOf(category);
  if (ref) {
    const found = resolveTemplate(ref, await accountTemplates(db, userId, ref));
    if (found?.kind !== kind) {
      throw new AppError(400, 'template_unknown', `template: is not one of your ${kind} templates or a built-in.`);
    }
    return found;
  }
  const builtin = resolveTemplate(defaultTemplateRef(kind))!;
  const id = settings.defaultTemplates[kind];
  // A built-in's id (one version each), or a value no client writes.
  if (!TEMPLATE_ID.test(id)) return builtin;
  const latest = await latestTemplate(db, userId, id);
  return latest?.kind === kind ? latest : builtin;
}

// The account's projects not in the bin per "<id>@<version>", built-ins
// included; a row that records no template counts as its kind's built-in.
export async function templateUsage(db: Queryable, userId: string): Promise<Record<string, number>> {
  const adventure = defaultTemplateRef('adventure');
  const campaign = defaultTemplateRef('campaign');
  const rows = await db.query<{ ref: string; count: number }>(
    `select coalesce(template_id, case when category = 'campaign' then $2::text else $3::text end) || '@' ||
            coalesce(template_version, case when category = 'campaign' then $4::int else $5::int end) as ref,
            count(*)::int as count
     from projects where owner_id = $1 and deleted_at is null
     group by ref order by ref`,
    [userId, campaign.id, adventure.id, campaign.version, adventure.version],
  );
  return Object.fromEntries(rows.map((r) => [r.ref, r.count]));
}

const toStored = (row: Row, body: Template): StoredTemplate => ({
  id: row.id,
  version: row.version,
  body,
  note: row.note,
  createdAt: row.created_at.toISOString(),
});

const invalidTemplate = (error: unknown) => {
  if (error instanceof TemplateError) return new AppError(400, 'invalid_template', `body: ${error.issues.join('; ')}`);
  return error;
};

// Gives every section, scene field, callout and meta key without a uid one,
// so an own template's items pair across renames from version 1 (design
// decision 7, amended at build).
function withUids(template: Template): TemplateInput {
  const copy = JSON.parse(JSON.stringify(template)) as TemplateInput;
  const fill = (items: { uid?: string | undefined }[]) => {
    for (const item of items) item.uid ??= randomUUID();
  };
  fill(copy.sections);
  fill(copy.meta);
  if (copy.kind === 'adventure') {
    fill(copy.sceneFields);
    fill(copy.callouts);
  }
  return copy;
}

const UNIQUE_VIOLATION = '23505';

// A copy of a built-in or of one of the account's templates, as version 1 of
// a new template with its own id and name.
export async function duplicateTemplate(db: Db, userId: string, from: TemplateRef, name: string): Promise<StoredTemplate> {
  const source = resolveTemplate(from, await accountTemplates(db, userId, from));
  if (!source) throw new AppError(400, 'template_unknown', 'from: is not one of your templates or a built-in.');
  for (let attempt = 0; ; attempt++) {
    const id = newTemplateId();
    let body: Template;
    try {
      body = defineTemplate({ ...withUids(source), id, version: 1, name, copiedFrom: source.name });
    } catch (error) {
      throw invalidTemplate(error);
    }
    try {
      const row = await db.queryOne<Row>(
        `insert into document_templates (user_id, id, version, body) values ($1, $2, 1, $3)
         returning id, version, body, note, created_at`,
        [userId, id, JSON.stringify(body)],
      );
      return toStored(row!, body);
    } catch (error) {
      // An id the account already has: draw another.
      if ((error as { code?: unknown }).code !== UNIQUE_VIOLATION || attempt > 2) throw error;
    }
  }
}

const NOT_FOUND = () => new AppError(404, 'not_found', 'Not found.');
const CONFLICT = () =>
  new AppError(409, 'template_version_conflict', 'baseVersion: is not the latest version; another save came first.');

// The next version of one of the account's templates. `baseVersion` is the
// version the editor started from: any other latest means another save came
// first. The body's id and version are the path's id and the next version;
// its kind is version 1's.
export async function saveTemplateVersion(
  db: Db,
  userId: string,
  id: string,
  { baseVersion, body, note }: { baseVersion: number; body: Record<string, unknown>; note: string },
): Promise<StoredTemplate> {
  if (!TEMPLATE_ID.test(id)) throw NOT_FOUND();
  const head = await db.queryOne<{ latest: number | null; kind: string | null }>(
    `select max(version) as latest,
            (select body->>'kind' from document_templates where user_id = $1 and id = $2 and version = 1) as kind
     from document_templates where user_id = $1 and id = $2`,
    [userId, id],
  );
  if (!head || head.latest === null) throw NOT_FOUND();
  if (baseVersion !== head.latest) throw CONFLICT();
  let template: Template;
  try {
    template = defineTemplate({ ...body, id, version: head.latest + 1 } as TemplateInput);
  } catch (error) {
    throw invalidTemplate(error);
  }
  if (template.kind !== head.kind) {
    throw new AppError(400, 'invalid_template', `body: kind must stay ${head.kind ?? 'as version 1 has it'}.`);
  }
  try {
    const row = await db.queryOne<Row>(
      `insert into document_templates (user_id, id, version, body, note) values ($1, $2, $3, $4, $5)
       returning id, version, body, note, created_at`,
      [userId, id, template.version, JSON.stringify(template), note],
    );
    return toStored(row!, template);
  } catch (error) {
    // Two saves from the same version at once: the second finds the first's.
    if ((error as { code?: unknown }).code === UNIQUE_VIOLATION) throw CONFLICT();
    throw error;
  }
}

// Deletes every version of one of the account's templates, refused while any
// of its projects not in the bin uses one.
export async function deleteTemplate(db: Db, userId: string, id: string): Promise<void> {
  if (!TEMPLATE_ID.test(id)) throw NOT_FOUND();
  await db.withTransaction(async (tx) => {
    // Locks the template's rows, so a save cannot slip in between the check
    // and the delete.
    const rows = await tx.query('select version from document_templates where user_id = $1 and id = $2 for update', [
      userId,
      id,
    ]);
    if (rows.length === 0) throw NOT_FOUND();
    const used = await tx.queryOne<{ count: number }>(
      'select count(*)::int as count from projects where owner_id = $1 and template_id = $2 and deleted_at is null',
      [userId, id],
    );
    if (used && used.count > 0) {
      throw new AppError(409, 'template_in_use', `The template is used by ${used.count} project${used.count > 1 ? 's' : ''}.`);
    }
    await tx.query('delete from document_templates where user_id = $1 and id = $2', [userId, id]);
  });
}
