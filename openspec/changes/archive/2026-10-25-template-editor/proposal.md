## Why

Issue
[Stevesibilia/rpg-promptbook#34](https://github.com/Stevesibilia/rpg-promptbook/issues/34),
plan p17, change 2 of 4. Change 1 (`template-registry`, v0.12.1) made
templates data that every reader resolves from the project. This change
lets the owner make and edit them, as the agreed mockup
[docs/mockups/templates.html](../../../docs/mockups/templates.html) shows
(states 1 to 9).

## What Changes

- **Stored templates.** Per account, immutable versions, on the server;
  the desktop app keeps a cached copy for offline reading. Every reader
  resolves a project's template among the account's and the built-ins.
- **Settings → Document templates.** The list per kind (adventures and
  one-shots, campaigns), with Duplicate, View or Edit, Make default,
  Delete when unused.
- **The template editor.** Name and game system; tabs Sections, Scene
  fields, Boxes, Front matter, Limits and style (campaigns: Sections and
  Front matter); a live preview of the starting document; a save bar that
  counts changes; saving makes a new version, with an optional note.
  Sections and fields with a role, and the front matter keys the app reads,
  show a lock: they can be renamed (sections, fields) or set optional, not
  removed.
- **New project** picks a template, the kind's default preselected.
- **Update to latest.** A project on an older version shows it in the top
  bar; a dialog lists the changes, offers to add the new sections' headings
  and rename changed ones, and says what the checks will report after.
- **The starting document** gets the first scene's required fields, the
  boxes required in a scene and in «Inizio forte», and the reactions table,
  empty, as the mockup's preview shows.

Out of scope: PDF options per section (change 3: the mockup's «In the PDF»
column is not built here), a Game systems settings page (the template
chooses among the built-in systems), connector tools for templates
(change 4).

## Capabilities

### New Capabilities

- `document-templates`: the account's templates, their versions, the
  editor, and updating a project to a newer version.

### Modified Capabilities

- `projects`: a new project is created from a chosen template, and its
  starting document holds the first scene's required parts.

## Impact

- `packages/format`: optional `uid` on template items, optional `system`,
  `templateChanges`.
- `packages/project`: `settings.ts` (`defaultTemplates`), `skeleton.ts`,
  new `update.ts`.
- `packages/server`: migration `007_document_templates.sql`, new
  `templates.ts` and `routes/templates.ts`, `projects.ts`, `routes/projects.ts`,
  `routes/settings.ts`, `seed.ts`, `snapshots.ts`, `mcp/*`.
- `packages/desktop`: `main/router.ts`, `main/create.ts`.
- `packages/web`: `api.ts`, new `templates/` (list, editor, preview,
  dialogs), `settings/SettingsPage.tsx`, `projects/NewProjectDialog.tsx`,
  `editor/EditorPage.tsx`, `editor/Editor.tsx`, `editor/ThisScene.tsx`.
- e2e: a new `templates.spec.ts`.
