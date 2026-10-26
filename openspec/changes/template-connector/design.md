## Context

Plan p17, change 4 of 4, for issue #34. Changes 1 to 3 are archived under
`openspec/changes/archive/2026-10-23-template-registry`,
`2026-10-25-template-editor` and `2026-10-26-template-pdf-layout`; their
designs explain the registry, uids, `templateChanges`, versions, locks (D11
of template-editor) and the PDF options. No UI is added, so there is no
mockup.

One brief builds this change.

### The owner's decisions (2026-10-26)

- Claude gets **read, duplicate, save a new version and delete**.
- Claude changes a template by sending the **whole body with the version it
  read** (not small edit operations).
- `create_project` **takes a template**, and a new tool **updates a project
  to its template's latest version**.
- A version saved through the connector carries a **note prefixed with the
  connected app's name**.

### The code today

- **Connector**: `packages/server/src/mcp/tools.ts`. `TOOL_NAMES` (`:49-72`,
  22 names); the `tool(name, description, hints, shape, run)` wrapper
  (`:144-178`) checks the `read_write` scope and the write quota for every
  tool that is not read-only, wraps the answer as JSON text, and turns
  throws into tool errors (`mcp/errors.ts` `toToolError`). `AppError`s pass
  through with their status and code. `INSTRUCTIONS` (`:76-81`). The scene
  description is built from the built-in `avventura` (`:83-99`,
  template-registry D8). `create_project` (`:292-308`) passes no template.
  `get_project` (`:245-290`) does not name the template. The caller is
  `McpCaller {userId, scope, grantId, clientName}` (`mcp/server.ts:17-22`).
- **Template storage**: `packages/server/src/templates.ts`.
  `listTemplates`, `accountTemplates`, `templateOfDoc`,
  `templateForNewProject` (400 `template_unknown`), `templateUsage`,
  `lockTemplate`, `holdTemplate`, `duplicateTemplate` (fills uids with
  `withUids`, `:162-174`), `saveTemplateVersion` (409
  `template_version_conflict`, 400 `invalid_template`, forces id, version
  and kind), `deleteTemplate` (409 `template_in_use`, bin included).
  `latestTemplate` (`:95-102`) is private. Routes in
  `packages/server/src/routes/templates.ts`; the REST note is ≤ 500.
- **Locks**: only the web editor knows them: `READ_KEYS` and `isLocked` in
  `packages/web/src/templates/draft.ts:30-71`. The server accepts any valid
  body.
- **Updating a project**: client-side only. `updateEdits(text, from, to,
options)` in `packages/project/src/update.ts:65`; the web dialog
  (`packages/web/src/templates/TemplateUpdate.tsx`) applies it with
  `applyTemplateUpdate` (`packages/web/src/editor/undo.ts:46-63`): the
  edits and `setTemplate` in one transaction.
- **Connector writes to the document** go through `apply()` in
  `packages/server/src/mcp/edits.ts:231-271`: `snapshotThenWrite`
  (`packages/server/src/snapshots.ts:209`) snapshots the text as a `claude`
  snapshot, then writes the whole new text in one `live.transact` if the text
  did not move. History's «Undo» for a Claude edit needs a `target`
  (`undoClaudeEdit`, `snapshots.ts:323`); without one it answers
  `not_undoable` and «Restore» is the way back.
- **Web templates store**: `TemplatesProvider`
  (`packages/web/src/templates/TemplatesContext.tsx:16-24`) fetches once on
  mount; `reload()` after the app's own saves; `missing(ref)` once per
  unknown ref. Nothing notices a version saved elsewhere.
- **Tests**: `packages/server/test/db/mcp.test.ts` (`setup()` at `:100-118`,
  `s.call(name, args)`), helpers in `test/db/mcp-helpers.ts`
  (`mcpCallTool`, `mcpListTools`), templates and the connector in
  `test/db/templates.test.ts`. E2E: `e2e/claude.ts` `connectClaude(page)`
  gives a signed-in MCP client.

## Goals / Non-Goals

**Goals:** the six tools and `create_project`'s template; whole-body saves
that keep the locks; the update with a snapshot; the web app showing
versions saved elsewhere.

**Non-Goals:** small edit operations (the owner chose whole bodies); setting
the default templates from the connector; a JSON Schema of the template;
tool descriptions per project template (tool lists are per connection,
template-registry D8 stands); template writes on the desktop app (it
forwards writes to the server already, and is not a connector).

## Decisions

### D1. Six tools (owner)

| Tool                      | Hints                          | Input                                                                                 |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| `list_templates`          | read, idempotent               | `kind?: 'adventure' \| 'campaign'`                                                    |
| `get_template`            | read, idempotent               | `templateId`, `version?` (latest when omitted)                                        |
| `duplicate_template`      | write                          | `from: {id, version?}`, `name` (1-200)                                                |
| `save_template_version`   | write                          | `templateId`, `baseVersion` (int ≥ 1), `body` (object), `note?` (≤ 400, default `''`) |
| `delete_template`         | write, idempotent, destructive | `templateId`                                                                          |
| `update_project_template` | write, idempotent              | `projectId`, `addSections?` (default true), `renameHeadings?` (default true)          |

Add them to `TOOL_NAMES` after `create_project`'s group (order:
`list_templates`, `get_template`, `duplicate_template`,
`save_template_version`, `delete_template`, `update_project_template`), in
a new file `packages/server/src/mcp/templates.ts` with
`registerTemplateTools(kit)`, like `registerBoardTools` in `mcp/board.ts`.
Extend `ToolKit` with what they need (`db`, `caller`) rather than
reaching into `registerTools`' closure. Every id is the `id` schema
(trimmed, 1-64). Write tools go through the same wrapper, so scope and quota
apply unchanged.

The file header comment of `tools.ts` and the connector spec say no tool
deletes anything but `remove_image_prompt`: both name `delete_template` as
the second exception.

### D2. What the read tools answer (architect)

`list_templates`: the built-ins and every template of the account, latest
version each, built-ins first, then by name:

```json
{
  "templates": [
    {
      "id": "t-…",
      "name": "Avventura Kulthos",
      "kind": "adventure",
      "version": 3,
      "builtin": false,
      "copiedFrom": "Avventura",
      "default": true,
      "projects": 2,
      "versions": [{ "version": 1, "note": "", "createdAt": "…" }]
    }
  ]
}
```

`default` from the account's settings (`defaultTemplates[kind]`, a built-in
when the setting names none of the account's); `projects` is the sum of
`templateUsage` over all versions of that id; built-ins have one version
with an empty note and `createdAt: null`.

`get_template`: `{id, version, latestVersion, builtin, note, createdAt,
projects (on this version), template}` where `template` is the body exactly
as stored (`Template`, uids included). Unknown id or version → 404
`not_found` («No template with that id and version. list_templates shows
yours.»).

### D3. Saving a version: whole body, base version (owner)

`save_template_version` calls `saveTemplateVersion(db, userId, id,
{baseVersion, body, note})` (D6 for the note). The server already forces
`id`, `version` and the kind, and refuses a stale base. This change adds,
inside `saveTemplateVersion` (so the REST route gets them too):

1. **Uids for new items**: the body goes through `withUids` before
   `defineTemplate`, so sections, meta keys, scene fields and boxes Claude
   adds get a uid, and the next version's changes match them. Existing uids
   are kept (`??=`).
2. **Locks** (D4), against the base version's body: violations → 400
   `invalid_template` with every violation in the message, «; »-joined.
3. **Nothing changed**: when the new body, with `version` and `note` left
   aside, equals the base version's body as stored (deep equality of the
   parsed `Template`s, uids included), refuse with 400 `no_changes`
   («body: is the same as version N.»). An empty version is noise in the
   history and the update dialog.

The tool's answer: `{id, version, note, changes}`, where `changes` is
`templateChanges(base, saved)` as the format returns it. `templateChanges`
does not compare tables, sheets, the appendix, references or ids; the
description says so, and says to read the template again to check them.

Bodies are plain `z.object`s, so unknown keys are dropped silently. The tool
description tells Claude to start from `get_template`'s `template` and keep
every key and every `uid`; the `changes` list is how it sees what was
taken. A serialised `body` over 100 000 characters is refused by the tool's
schema (`invalid_input`); the built-in adventure is about 6 kB.

Rejected: a JSON Schema export (zod's `toJSONSchema` of a discriminated
union with `superRefine` does not carry the refusals, and the stored body
is a better example); patch operations (owner).

### D4. Locks move to the format and the server enforces them (architect)

New `packages/format/src/template/locks.ts`, exported from the package
index:

- `READ_KEYS` and `isLocked(list, item)`, moved from
  `packages/web/src/templates/draft.ts` unchanged (template-editor D11);
  `draft.ts` imports them from `promptbook-format` and keeps
  `keyRenamable`.
- `lockViolations(base: Template, next: Template): string[]`, each a
  sentence naming the row:
  - every locked row of `base` (sections, meta keys, and for adventures
    scene fields) has a match in `next`, by `uid`, else by
    `role`, else by name (`name` / `key` / `label` / `type`), else
    «section «X» is locked: it cannot be removed»;
  - a matched row keeps its `role`, and `next` has no role `base` lacks:
    «roles cannot change: «X» …»;
  - a locked meta key keeps its `key`;
  - boxes are locked only inside one draft, as the editor shows them: a box every place needs can be set to «any» and removed in the same save, so the server checks no box lock. A box paired by `uid`, else by `type`, keeps its look.

`saveTemplateVersion` reads the base version's body (it holds the lock
already) and calls `lockViolations`. The web editor never produces a violation, so its saves are unchanged; a test proves the editor's own operations (rename a role section, rename a free key, add and remove an own section, set a needed box to «any» and remove it) pass.

### D5. Duplicate and delete (owner, architect)

`duplicate_template` calls `duplicateTemplate(db, userId, from, name)`;
`from.version` omitted means the latest (built-ins: 1). Answer
`{id, version: 1, name, copiedFrom}`.

`delete_template` calls `deleteTemplate`. 409 `template_in_use` keeps its
message (how many projects, bin included); the description says to move or
delete those projects in the app first. A built-in's id → 404 `not_found`.
Answer `{deleted: id}`.

### D6. Version note (owner)

The stored note is `via ${app}: ${note}`, or `via ${app}` when the note is
empty, where `app` is `caller.clientName` trimmed and cut to 60 characters.
The tool's `note` is ≤ 400, so the stored note stays under the REST limit of 500.

### D7. `create_project` takes a template (owner)

New optional input `template: {id, version?}`. `version` omitted resolves
to the latest version of the account's template, or 1 for a built-in, then
`createProject(..., { ..., template })` as the REST route does; the kind
check and `template_unknown` stay the server's. The description says
omitted means the user's default for the category.

Share the «latest version of an id» lookup: export `latestTemplate` from
`templates.ts` and use it here, in D2 and in D8.

### D8. `update_project_template` (owner, architect)

1. `projectOf`, `docOf`, `from = readMeta(doc).template`.
2. A built-in id, or no newer version of the account's id
   (`latestTemplate`), → 409 `template_up_to_date` («The project already
   uses the latest version of its template.»). A `from` the account no
   longer holds → 409 `template_unknown`.
3. `fromTemplate = resolveTemplate(from, await accountTemplates(db, userId,
from))`; `to = latest`.
4. Write through the live document with a snapshot, as `apply()` does,
   with `tool: 'update_project_template'`, kind `claude`, label
   `Template «${to.name}» v${from.version} → v${to.version}`, and no
   `target`, `beforeSection` or `afterHash`: History offers Restore, and
   Undo answers `not_undoable` as it does for any snapshot without a
   target. The plan, run on the live text inside the write, checks that
   `readMeta(doc).template` still equals `from` (else 409
   `document_changed`, «The project's template changed meanwhile; call
   again.») and computes `updateEdits(text, fromTemplate, to, {addSections,
renameHeadings})`.
5. `snapshotThenWrite` gains an optional `also?: (doc: Y.Doc) => void`, run
   in the same `live.transact` after the text is set; this tool passes
   `doc => setTemplate(doc, {id: to.id, version: to.version})`, so the text
   and the version change in one Yjs transaction.
6. No edits (nothing added or renamed): skip the snapshot and set the
   template through `write()`.

Answer: `{template: {id, name, from: from.version, to: to.version},
changes: templateChanges(fromTemplate, to), edits: n, snapshotId | null,
errors, warnings}` with the counts from `check()` on the new text, as
`replace_section` reports them.

Rejected: an app-style undo step (the server write is not in any editor's
undo history, like every connector write; the snapshot is the way back).
Known limit: Restore brings back the text, and the project stays on the new
version.

### D9. Descriptions and instructions (architect)

- `INSTRUCTIONS` gains one line: «Document templates set a project's
  sections, scene fields and boxes. To change one, read it with
  get_template, then send save_template_version the whole template with the
  version you read; built-ins are read-only, so duplicate_template first.
  Projects keep their version until update_project_template moves them.»
- `save_template_version`'s description: keep every key and `uid`; new rows
  need no uid; locked rows (D4); a role section can be renamed, not removed;
  `pdf` options only on sections without a role, never on the appendix or
  in campaigns; the answer's `changes` leaves out tables, sheets, appendix,
  references and ids.
- `add_scene`'s description keeps the built-in's fields and adds: «A
  project on another template: get_project names it, get_template lists its
  scene fields.»
- `get_project` gains `template: {id, version, name, builtin,
latestVersion}`.

### D10. The web app reloads templates on focus (architect)

`TemplatesProvider` calls `store.reload()` when the window gets the focus
back or the document becomes visible, at most once every 10 seconds. A
version Claude saved then shows in Settings and as «vN available» in an open
project; an open template editor keeps its draft (a stale save still meets
the 409 and its reload offer). `update_project_template` needs nothing new:
the project's meta changes, and `missing(ref)` fetches the unknown version.

## Risks

- **Restore after an update** leaves the project on the new version (D8).
  Accepted; if a test shows the editor misreads the restored text under the
  new version in a way a fresh project would not, report it.
- **`snapshotThenWrite`'s `also`** must run inside the same transaction as
  the text; if the live document API makes that impossible, report it, do
  not write the meta in a second transaction.
- **Locks refusing an existing stored version**: a body saved by v0.13 or
  v0.14 that already breaks a lock (it cannot through the editor) would make
  every next save refuse. If the tests or the owner's data show one, report
  it; do not relax the rule.
- **`clientName`** is the name the client registered; it is shown, never
  parsed. Keep it as text in the note.
- **Tool count**: tests and the spec assert the number of tools (22 → 28);
  update both.

## Verification

- DB tests per tool in a new `packages/server/test/db/mcp-templates.test.ts`:
  each answer's shape, scope (`read` client refused on writes), every
  refusal named above with its code, the note prefix, the lock violations,
  `no_changes`, the conflict, `create_project` with a template and with a
  wrong kind, the update with and without edits and its snapshot.
- Format tests for `lockViolations`, and the editor's own operations passing.
- E2E in `e2e/templates.spec.ts`, with `connectClaude`: Claude duplicates
  «Avventura», saves v2 adding «Atmosfera» and renaming «Inizio forte»; a
  project open on v1 shows «v2 available» after the page gets the focus
  back; Claude calls `update_project_template` and the editor shows the
  renamed heading and the new section; History lists the snapshot.
