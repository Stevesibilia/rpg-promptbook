import {
  builtinTemplates,
  resolveTemplate,
  templateChanges,
  type Template,
  type TemplateRef,
  type TextEdit,
} from 'promptbook-format';
import { readDocument, readHidden, readMeta, setTemplate, updateEdits, type Settings } from 'promptbook-project';
import type * as Y from 'yjs';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { openLiveDocument } from '../live.js';
import type { ProjectRow } from '../projects.js';
import { getSettings } from '../routes/settings.js';
import { insertSnapshot, pruneClaudeSnapshots, snapshotThenWrite } from '../snapshots.js';
import {
  accountTemplates,
  deleteTemplate,
  duplicateTemplate,
  latestTemplate,
  listTemplates,
  saveTemplateVersion,
  TEMPLATE_ID,
  templateUsage,
  templateVersions,
} from '../templates.js';
import { check } from './edits.js';
import type { ToolKit } from './tools.js';

// Document templates as tools (template-connector design decisions 1 to 8):
// Claude reads the built-ins and the account's templates, copies one, saves
// a new version of one of the account's from the whole body it read, deletes
// one no project uses, and moves a project to its template's latest version.
// Built-ins are read-only. Saves go through saveTemplateVersion, so the
// connector meets the same locks, conflicts and checks as the app.

// The longest body a save takes, serialised; the built-in adventure is about
// 6 000 characters.
const BODY_MAX = 100_000;
const NOTE_MAX = 400;
const APP_NAME_MAX = 60;

const NO_TEMPLATE = () =>
  new AppError(404, 'not_found', 'No template with that id and version. list_templates shows yours.');

// A not_found from the template functions, worded for Claude.
async function orNoTemplate<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError && error.code === 'not_found') throw NO_TEMPLATE();
    throw error;
  }
}

const isBuiltin = (id: string) => builtinTemplates.some((t) => t.id === id);

// The latest version of a template id: the account's latest, or 1 for a
// built-in; null for an id neither holds.
async function latestVersion(kit: ToolKit, id: string): Promise<number | null> {
  if (isBuiltin(id)) return 1;
  if (!TEMPLATE_ID.test(id)) return null;
  return (await latestTemplate(kit.db, kit.caller.userId, id))?.version ?? null;
}

// The version a tool's `{id, version?}` names: the given one, else the
// latest; 1 for an id nobody holds, which the template functions refuse.
export async function refOf(kit: ToolKit, ref: { id: string; version?: number | undefined }): Promise<TemplateRef> {
  return { id: ref.id, version: ref.version ?? (await latestVersion(kit, ref.id)) ?? 1 };
}

// The template the account's settings make the default for its kind: one of
// the account's when the setting names it, else the kind's built-in.
function defaultIds(settings: Pick<Settings, 'defaultTemplates'>, own: readonly { id: string; kind: string }[]) {
  return (kind: Template['kind']) => {
    const id = settings.defaultTemplates[kind];
    if (own.some((t) => t.id === id && t.kind === kind)) return id;
    return builtinTemplates.find((t) => t.kind === kind)!.id;
  };
}

// The stored note: where the save came from, then Claude's note.
export function versionNote(clientName: string, note: string): string {
  const app = clientName.trim().slice(0, APP_NAME_MAX) || 'a connected app';
  return note ? `via ${app}: ${note}` : `via ${app}`;
}

function applyEdits(text: string, edits: readonly TextEdit[]): string {
  let out = text;
  // From the end, so each edit's positions still hold.
  for (const edit of [...edits].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, edit.from) + edit.insert + out.slice(edit.to);
  }
  return out;
}

const sameRef = (a: TemplateRef, b: TemplateRef) => a.id === b.id && a.version === b.version;

const UP_TO_DATE = () =>
  new AppError(409, 'template_up_to_date', 'The project already uses the latest version of its template.');
const TEMPLATE_GONE = () =>
  new AppError(409, 'template_unknown', 'The project’s template is not one of yours any more; it cannot be updated.');
const TEMPLATE_MOVED = () =>
  new AppError(409, 'document_changed', 'The project’s template changed meanwhile; call again.');

interface UpdateOptions {
  addSections: boolean;
  renameHeadings: boolean;
}

// Moves a project to its template's latest version (design decision 8): the
// update dialog's edits and the new version in one transaction, a Claude
// snapshot of the text first when there are edits.
async function updateProjectTemplate(kit: ToolKit, project: ProjectRow, options: UpdateOptions) {
  const { db, sync, caller } = kit;
  const doc = await kit.docOf(project);
  const from = readMeta(doc).template;
  if (!TEMPLATE_ID.test(from.id)) throw UP_TO_DATE();
  const to = await latestTemplate(db, caller.userId, from.id);
  if (!to) throw TEMPLATE_GONE();
  if (to.version <= from.version) throw UP_TO_DATE();
  const fromTemplate = resolveTemplate(from, await accountTemplates(db, caller.userId, from));
  if (!fromTemplate) throw TEMPLATE_GONE();
  const ref = { id: to.id, version: to.version };
  const editsOf = (d: Y.Doc) => {
    if (!sameRef(readMeta(d).template, from)) throw TEMPLATE_MOVED();
    return updateEdits(readDocument(d), fromTemplate, to, options);
  };

  const live = await openLiveDocument(sync, project.id, caller.userId);
  try {
    let count = 0;
    let snapshotId: string | null = null;
    // Nothing to add or rename: only the version changes, with no snapshot.
    const plain = await live.transact((d) => {
      if (editsOf(d).length > 0) return false;
      setTemplate(d, ref);
      return true;
    });
    if (!plain) {
      const stored = await snapshotThenWrite(db, live, {
        next: (text) => {
          const edits = editsOf(live.doc);
          count = edits.length;
          return applyEdits(text, edits);
        },
        still: (d) => sameRef(readMeta(d).template, from),
        also: (d) => setTemplate(d, ref),
        snapshot: (text) =>
          insertSnapshot(db, {
            projectId: project.id,
            kind: 'claude',
            label: `Template «${to.name}» v${from.version} → v${to.version}`,
            text,
            template: fromTemplate,
            tool: 'update_project_template',
            grantId: caller.grantId,
          }),
      });
      snapshotId = stored.id;
      await pruneClaudeSnapshots(db, project.id);
    }
    const checked = check(readDocument(live.doc), to, readHidden(live.doc), new Date());
    return {
      template: { id: to.id, name: to.name, from: from.version, to: to.version },
      changes: templateChanges(fromTemplate, to),
      edits: count,
      snapshotId,
      errors: checked?.errors ?? null,
      warnings: checked?.warnings ?? null,
    };
  } finally {
    await live.close();
  }
}

export function registerTemplateTools(kit: ToolKit): void {
  const { tool, db, caller } = kit;
  const id = kit.schemas.id;
  const templateId = id.describe('The template’s id, from list_templates.');
  const version = z.int().positive();

  tool(
    'list_templates',
    'List the document templates you can use: the built-ins («Avventura» for adventures and one-shots, «Campagna» for campaigns), read-only, then your own by name, each at its latest version with every version’s note, whether it is your default for its kind, and how many projects use it (the bin included).',
    { title: 'List templates', readOnly: true, idempotent: true },
    { kind: z.enum(['adventure', 'campaign']).optional().describe('Only adventure or campaign templates.') },
    async (args) => {
      const [stored, usage, settings] = await Promise.all([
        listTemplates(db, caller.userId),
        templateUsage(db, caller.userId),
        getSettings(db, caller.userId),
      ]);
      const byId = new Map<string, typeof stored>();
      for (const t of stored) byId.set(t.id, [...(byId.get(t.id) ?? []), t]);
      const own = [...byId.values()].map((versions) => versions.at(-1)!.body);
      const defaultOf = defaultIds(settings, own);
      const used = (tid: string) =>
        Object.entries(usage).reduce((n, [ref, count]) => (ref.slice(0, ref.lastIndexOf('@')) === tid ? n + count : n), 0);
      const builtins = builtinTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        kind: t.kind,
        version: t.version,
        builtin: true,
        copiedFrom: null,
        default: defaultOf(t.kind) === t.id,
        projects: used(t.id),
        versions: [{ version: t.version, note: '', createdAt: null }],
      }));
      const mine = [...byId.values()]
        .map((versions) => {
          const latest = versions.at(-1)!.body;
          return {
            id: latest.id,
            name: latest.name,
            kind: latest.kind,
            version: latest.version,
            builtin: false,
            copiedFrom: latest.copiedFrom ?? null,
            default: defaultOf(latest.kind) === latest.id,
            projects: used(latest.id),
            versions: versions.map((v) => ({ version: v.version, note: v.note, createdAt: v.createdAt })),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'it') || a.id.localeCompare(b.id));
      return { templates: [...builtins, ...mine].filter((t) => !args.kind || t.kind === args.kind) };
    },
  );

  tool(
    'get_template',
    'One document template, at its latest version or the one you ask for: its whole body as stored (`template`), the version’s note and how many projects use that version. To change one of yours, edit this body and send it whole to save_template_version with the version you read.',
    { title: 'Get a template', readOnly: true, idempotent: true },
    { templateId, version: version.optional().describe('The version to read; the latest when omitted.') },
    async (args) => {
      const usage = await templateUsage(db, caller.userId);
      const builtin = builtinTemplates.find((t) => t.id === args.templateId);
      if (builtin) {
        if (args.version !== undefined && args.version !== builtin.version) throw NO_TEMPLATE();
        return {
          id: builtin.id,
          version: builtin.version,
          latestVersion: builtin.version,
          builtin: true,
          note: '',
          createdAt: null,
          projects: usage[`${builtin.id}@${builtin.version}`] ?? 0,
          template: builtin,
        };
      }
      const versions = await templateVersions(db, caller.userId, args.templateId);
      const found = args.version === undefined ? versions.at(-1) : versions.find((v) => v.version === args.version);
      if (!found) throw NO_TEMPLATE();
      return {
        id: found.id,
        version: found.version,
        latestVersion: versions.at(-1)!.version,
        builtin: false,
        note: found.note,
        createdAt: found.createdAt,
        projects: usage[`${found.id}@${found.version}`] ?? 0,
        template: found.body,
      };
    },
  );

  tool(
    'duplicate_template',
    'Copy a built-in or one of your templates as version 1 of a new template of yours, with its own id and the name you give. Built-ins are read-only: duplicate one to change it.',
    { title: 'Duplicate a template', readOnly: false, idempotent: false },
    {
      from: z
        .strictObject({ id: templateId, version: version.optional().describe('The version to copy; the latest when omitted.') })
        .describe('The template to copy.'),
      name: kit.schemas.requiredText(200).describe('The new template’s name.'),
    },
    async (args) => {
      const copy = await duplicateTemplate(db, caller.userId, await refOf(kit, args.from), args.name);
      return { id: copy.id, version: copy.version, name: copy.body.name, copiedFrom: copy.body.copiedFrom ?? null };
    },
  );

  tool(
    'save_template_version',
    'Save the next version of one of your templates. Start from get_template’s `template`, change it, and send the whole body with the version you read as baseVersion: a save from an older version is refused (template_version_conflict), as is a body equal to it (no_changes). ' +
      'Keep every key and every `uid`: unknown keys are dropped, and a row without its uid reads as removed and added again. Rows you add need no uid. ' +
      'Locked rows stay: sections and scene fields with a role, the front matter keys the app reads (titolo, sistema, licenza…) and keys with a role cannot be removed, roles cannot move or be added, and a locked key keeps its name; a section with a role can be renamed. ' +
      'PDF options (`pdf`) go only on sections without a role, never on the appendix, and not in campaign templates. ' +
      'The answer’s `changes` lists what changed in sections, scene fields, boxes, keys, limits, name and game system; tables, sheets, the appendix, references and ids are not compared, so read the template again to check them. ' +
      'Projects keep their version until update_project_template moves them.',
    { title: 'Save a template version', readOnly: false, idempotent: false },
    {
      templateId,
      baseVersion: version.describe('The version you read with get_template.'),
      body: z
        .record(z.string(), z.unknown())
        .refine((body) => JSON.stringify(body).length <= BODY_MAX, `must be at most ${BODY_MAX} characters as JSON`)
        .describe('The whole template, as get_template answers it in `template`.'),
      note: z.string().trim().max(NOTE_MAX).default('').describe('What this version changes, in a few words.'),
    },
    async (args) => {
      const [base] = await accountTemplates(db, caller.userId, { id: args.templateId, version: args.baseVersion });
      const saved = await orNoTemplate(() =>
        saveTemplateVersion(db, caller.userId, args.templateId, {
          baseVersion: args.baseVersion,
          body: args.body,
          note: versionNote(caller.clientName, args.note),
        }),
      );
      return {
        id: saved.id,
        version: saved.version,
        note: saved.note,
        changes: base ? templateChanges(base, saved.body) : [],
      };
    },
  );

  tool(
    'delete_template',
    'Delete one of your templates, every version of it. Refused (template_in_use) while any of your projects uses one of its versions, those in the bin included: the user deletes those projects in the app, and empties them from the bin, first. Built-ins cannot be deleted.',
    { title: 'Delete a template', readOnly: false, idempotent: true, destructive: true },
    { templateId },
    async (args) => {
      await orNoTemplate(() => deleteTemplate(db, caller.userId, args.templateId));
      return { deleted: args.templateId };
    },
  );

  tool(
    'update_project_template',
    'Move a project to the latest version of its template, as the app’s update dialog does: an empty heading for each section the new version adds (addSections), and the headings and field labels it renames rewritten (renameHeadings). A snapshot of the text is kept first when the text changes; History’s Restore brings it back. Refused (template_up_to_date) when the project is on the latest version or on a built-in.',
    { title: 'Update a project’s template', readOnly: false, idempotent: true },
    {
      projectId: kit.schemas.projectId,
      addSections: z.boolean().default(true).describe('Add an empty heading for each new section.'),
      renameHeadings: z.boolean().default(true).describe('Rewrite renamed headings and field labels.'),
    },
    async (args) => {
      const project = await kit.projectOf(args.projectId);
      return updateProjectTemplate(kit, project, { addSections: args.addSections, renameHeadings: args.renameHeadings });
    },
  );
}
