## Context

Plan p17, change 2 of 4, for issue #34. The owner agreed the mockup
[docs/mockups/templates.html](../../../docs/mockups/templates.html); the
implementer reads the HTML (its `seed()`, `ROLE`, `renderList`,
`renderEditorPane`, `preview`, `openSave`, `openUpdate`, `openNew` and
`NOTES` hold the agreed layout and copy), and "The mockup in words" below
says what was agreed. Change 1's archived design
(`openspec/changes/archive/2026-10-23-template-registry/design.md`) explains
roles, the registry and `templateOf`; its "Carried to change 2" list is
settled here in D12 to D15.

Two briefs build this change on one branch: **A**, data (groups 1 to 5),
then **B**, the UI (groups 6 to 9).

### The code today

- **Settings** are one JSON object per user: `user_settings(user_id,
settings jsonb)` (`server/migrations/001_init.sql:29`), `GET`/`PUT
/api/settings` with a strict zod schema (`server/src/routes/settings.ts:11-49`),
  `Settings` and `defaultSettings()` in `project/src/settings.ts:5-47`. The
  web saves through `createSettingsSaver` (`web/src/settings/saver.ts:25`).
- **Desktop** caches `GET /api/settings` in `server_cache` through
  `cached()` (`desktop/src/main/router.ts:118,195-209`); writes are forwarded
  and offline answer 503 (`:77,130`). Offline UI is `NeedsServerGroup`
  (`web/src/desktop/NeedsServer.tsx:23`).
- **Project columns from the summary**: `gdrarchive_url`/`gdrarchive_label`
  (`server/migrations/006_gdrarchive.sql`, `server/src/projects.ts:45,139,164,312`).
- **Creation**: web `NewProjectDialog.tsx:87-121` (preview with
  `skeletonDocument`, then `api.createProject`); server `routes/projects.ts:28-73`
  and `projects.ts:188-232`; seed `seed.ts:193-221`; desktop offline
  `desktop/src/main/create.ts:42-130`. `ProjectInput.template`,
  `skeletonDocument(category, input, template?)` and `setTemplate` exist and
  have no callers.
- **Readers** call `templateOf`/`adventureTemplateOf` with no `extra`:
  `EditorPage.tsx:62-66`, `ResearchView.tsx:40`, `BoardView.tsx:400`,
  `useBoard.ts:138`, `project/summary.ts:81`, `project/board.ts:812`,
  `desktop/main/snapshots.ts:149`, `server/snapshots.ts:186,273,339,341`,
  `server/mcp/edits.ts:250`, `server/mcp/tools.ts:87,322,356`.
- **Settings page**: sections at `SettingsPage.tsx:20-36`; `documents`
  renders the static `DocumentTemplates` (`:93,214-235`).

## Goals / Non-Goals

**Goals:** the mockup's states 1 to 9, minus the PDF column; stored
versions; every reader uses the account's templates; offline reading on
desktop.

**Non-Goals:** PDF options (change 3), a Game systems page, connector
template tools (change 4), checks for campaigns, editing a template offline,
sharing templates between accounts.

## The mockup in words

- **List** (Settings → Document templates, state 1): two groups, «Adventures
  and one-shots» and «Campaigns». A row: name, `vN` chip, «Built-in» chip,
  «Default» chip; under it «Comes with Promptbook» or «Copied from <name>»,
  the game system, «N projects» or «no projects». Actions: «Make default»
  (not on the default), «Duplicate», «View» (built-in) or «Edit», «Delete»
  (own and unused only). Lead and footer text as in `renderList`.
- **Editor** (states 2 to 6): «← Document templates»; a built-in shows the
  banner «Built-in template. It can't be changed; duplicate it to make your
  own.» with «Duplicate», and every control disabled. A card with Name, For
  (read-only kind), Game system (None or a built-in system; hint «Grades and
  wounds come from the game system.»). Tabs with counts: Sections, Scene
  fields, Boxes, Front matter, Limits and style; a campaign has Sections and
  Front matter only.
- **Rows**: ▲▼ to move; the name in an input; «Needed» select (required,
  recommended, optional); «Used for» with a lock and the role's English name,
  or «Your own» in italics; ✕ to remove, disabled with a tooltip on locked
  rows. An «+ Add …» field under each list. Changed rows get an amber bar,
  added rows a green one. Scene fields add Form (inline, block) and «Climax
  only»; Boxes show `[!type]`, label, Column, «Allowed in» chips and «Per
  place»; Front matter has Key, Type, Needed. Limits and style is a form.
- **Preview**: «Starting document», sticky on the right, the editor's look,
  built from the draft (D9), with changed lines amber and added lines green,
  «optional» after optional headings.
- **Save bar**: «N unsaved changes · M projects use vK and keep it until
  updated», «Discard», «Save as vK+1». Save opens «Save <name> vK+1» with the
  change list (Added / Changed / Removed), «Note for this version
  (optional)», and the sentence on projects keeping their version.
- **Project** (state 8): the top bar shows «<name> vK · vN available» in
  amber when a newer version exists, nothing extra otherwise; the status bar
  names the template and version. The dialog «Update to <name> vN»: the
  change list, «Add the new sections' headings to the document» and «Rename
  the headings that changed», each with the concrete headings under it, the
  checks' result after the update, «Not now» and «Update to vN».
- **New project** (state 9): a «Template» select under the category,
  listing that kind's templates with their latest version, the default
  preselected and marked, hint «The project keeps this version until you
  update it.»

## Decisions

### D1. Storage: one row per version (architect)

Migration `007_document_templates.sql`:

```sql
create table document_templates (
  user_id uuid not null references users(id) on delete cascade,
  id text not null,
  version int not null check (version > 0),
  body jsonb not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, id, version)
);

alter table projects
  add column template_id text,
  add column template_version int,
  add constraint projects_template_whole check ((template_id is null) = (template_version is null));
```

A version is never updated: editing inserts the next version. `body` is the
whole template definition, `id` and `version` equal to the row's. The two
project columns come from the document's summary like the gdrarchive ones
(`projects.ts:139,164,312`), and count a template's projects; null reads as
the kind's built-in.

Reason: projects pin a version (change 1, D5), so every version a project
might name must stay readable.

### D2. Ids (architect)

A new template's id is `t-` plus 10 random lower-case base-36 characters,
made by the server. The server never stores an id equal to a
built-in id (`avventura`, `campagna`). `resolveTemplate` keeps its order
(`extra` first), safe because of this rule.

### D3. API (architect)

In `server/src/routes/templates.ts`, account-scoped by `requireSession`:

- `GET /api/templates` → `{ templates: StoredTemplate[], usage: Record<string, number> }`.
  `StoredTemplate = { id, version, body, note, createdAt }`,
  every version of every template; `usage` counts the account's projects
  (not in the bin) per `"<id>@<version>"`, built-ins included, null columns
  counted as the kind's built-in.
- `POST /api/templates` `{ from: TemplateRef, name }` → 201 the new
  template's version 1, a copy of `from` (built-in or own) with the new id
  and name, and `copiedFrom` set to the source's name.
- `POST /api/templates/:id/versions` `{ baseVersion, body, note }` → 201 the
  new version. 409 `template_version_conflict` when `baseVersion` is not the
  latest (another tab saved). The body is validated with `defineTemplate`;
  its `id` and `version` are overwritten with the path's id and the next
  version; its `kind` must equal version 1's.
- `DELETE /api/templates/:id` → 204; 409 `template_in_use` when `usage`
  counts any project for any version.

The source name lives in the body as `copiedFrom` (D7), so no column is needed.

### D4. The account's templates reach every reader (architect)

`server/src/templates.ts` exports `listTemplates(db, userId):
Promise<StoredTemplate[]>` and `accountTemplates(db, userId):
Promise<Template[]>` (each body through `defineTemplate`; an invalid body is
skipped and logged, never thrown). Every server reader listed under "The
code today" passes `await accountTemplates(db, userId)` as `extra`.

The web gets them once per page through a `TemplatesProvider` (React
context, `web/src/templates/TemplatesContext.tsx`) mounted in the shell,
exposing `{ templates: Template[], stored, usage, reload() }`; it fetches
`GET /api/templates` on mount and after every save, duplicate or delete.
Every web reader passes `extra` from it.

### D5. Desktop offline (architect)

`router.ts` serves `GET /api/templates` with `cached('templates', …, {
templates: [], usage: {} })`, like settings; the three writes are forwarded
and answer 503 offline. In the UI the list and editor are wrapped in
`NeedsServerGroup` for writes; reading works offline from the cache.
`desktop/main/snapshots.ts` and `create.ts` read the cached templates.

### D6. Defaults and creation (architect)

`Settings` gains `defaultTemplates: { adventure: string; campaign: string }`
(template ids), optional in the server's schema with the built-in ids as
default, so a desktop on v0.12 that PUTs settings without it still saves.
«Make default» saves settings.

`NewProject` and the server's `createBody` gain an optional `template:
TemplateRef`; `createProject` resolves it among the account's and the
built-ins and refuses (400 `template_unknown`) one it cannot find or whose
kind does not match the category. Without it, the kind's default from
settings at its latest version, falling back to the built-in. The skeleton
comes from the resolved template, and `createProjectDoc` records the ref.
Seed and desktop offline create follow the same rule (offline from the
cache).

### D7. Schema additions (architect)

- Optional `uid: string` on sections, scene fields, callouts and meta keys.
  The editor gives every item it adds a uid (`crypto.randomUUID()`);
  built-ins have none.
- Optional `system: string` on adventure templates: the game system's name
  the skeleton writes in `sistema` (the user's default system from settings
  wins when set, as today).
- Optional `copiedFrom: string` on both kinds.
- A `limits`/`style` edit is a plain edit of today's fields.

### D8. Changes between versions (plan)

`format/src/template/changes.ts`: `templateChanges(from: Template, to:
Template): TemplateChange[]`, with
`TemplateChange = { kind: 'added' | 'changed' | 'removed', what: 'section' |
'field' | 'box' | 'key' | 'limits' | 'name', label: string, before?: string,
detail?: 'renamed' | 'requirement' | 'form' | 'climax' | 'column' | 'places' | 'count' }`.
Items match by `uid`, else by `role`, else by name (key for meta, `type` and
`meta` for callouts). The save dialog, the save bar's count, the rows' bars
and the update dialog all use it; the mockup's sentences ("Section «X»
renamed «Y»", "Scene field «X» now required") are its rendering in
`web/src/templates/changes.ts`.

### D9. The starting document (plan)

`skeletonDocument` writes, under the scenes section, `### S1. Prima scena`,
then every non-climax field that is `required` or `recommended`, in order
(inline `**Label:** `, block `**Label**` then an empty line), each callout
whose `perPlace.min` ≥ 1 and that is allowed in `scene` as `> [!type]` and
`> `, and the reactions table header with one empty row; under the
`strongStart` section, the callouts with `min` ≥ 1 allowed in
`strongStart`. The editor's preview renders `skeletonDocument`'s output
with the app's CodeMirror preview styles, not a second implementation.
This changes the skeleton for new projects; existing projects are untouched.

### D10. Update to latest (plan)

`project/src/update.ts`: `updateEdits(text: string, from: Template, to:
Template, options: { addSections: boolean; renameHeadings: boolean }):
TextEdit[]`. Added sections go after the previous section of `to` that is
present in the text, as an empty `## Heading`; renamed sections and fields
rewrite the heading or bold label wherever the parser found them. The web
applies the edits and `setTemplate(doc, to)` in one `doc.transact`, so one
undo step covers both. «After the update» parses the text with the edits
applied against `to` and reports the error and warning counts that differ
from now.

### D11. Locks (architect)

Rows with a role, and the front matter keys the app reads by name (change 1,
D10: `titolo`, `sottotitolo`, `sistema`, `formato`, `durata`, `giocatori`,
`ambientazione`, `tempi`, `campagna`, `arco`, `autore`, `copyright`,
`licenza`), show the lock and cannot be removed. Sections and fields can be
renamed; locked keys cannot (their name is what the code reads). Callouts
with `perPlace.min` ≥ 1 cannot be removed.

### D12. Missing callouts degrade (plan)

`ThisScene` and `readAloudOf` stop asserting a read-aloud, handout and box
callout (`find(...)!`); a template without one shows nothing for it.

### D13. A pinned template the device does not hold (plan)

`templateOf` keeps its fallback. The status bar then says «<built-in name>
(template not found)» so it is never silent; writes still work.

### D14. Template changes reconfigure the editor (plan)

`Editor.tsx` puts the template-dependent extensions (preview, analysis,
slash menu) in a CodeMirror `Compartment` and reconfigures on a template
change, instead of recreating the view, so the update keeps undo history.

### D15. Skeleton kind check (plan)

`skeletonDocument` throws when the template's kind does not match the
category; `setTemplate` stays permissive (the reader falls back, D13).

### D16. Drafts are local (architect)

The draft lives in the page's state only. Leaving the editor with unsaved
changes asks «Discard unsaved changes?» in the app's `Modal`. Nothing is
stored until «Save».

## Risks / Trade-offs

- **Old desktop clients.** A v0.12 desktop PUTs settings without
  `defaultTemplates`: the schema must accept it (D6). Prove it with a server
  test.
- **Skeleton change.** D9 changes what new projects start with. If an
  existing test pins the old skeleton, update it and say so; do not keep the
  old output.
- **Usage counts.** If keeping `template_id`/`template_version` in step
  with the document needs more than the summary path gdrarchive uses,
  report it.
- **Big UI.** Brief B: if the editor's state grows beyond a reducer in one
  module, split by tab and say so.

## Migration Plan

Migration 007 adds the table and two nullable columns; existing projects
read as built-ins. The summary fills the columns the next time each project
is stored.

## Open Questions

None.
