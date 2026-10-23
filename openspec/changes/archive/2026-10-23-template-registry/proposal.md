## Why

Issue
[Stevesibilia/rpg-promptbook#34](https://github.com/Stevesibilia/rpg-promptbook/issues/34)
asks for templates users can create and edit. The owner agreed the mockup
[docs/mockups/templates.html](../../../docs/mockups/templates.html): a
template list in Settings, a form editor with a live preview of the starting
document, campaign templates, versions that projects keep until updated, and
a few PDF options per section. Control-room plan p17 splits the work into
four changes; this is the first.

Today the built-in template `avventura@1` is imported directly in 20 places
across web, server, desktop, project and layout, and the layout and the editor
still find 15 sections and scene fields by their Italian label. Nothing can
use another template until every consumer gets its template from the project,
and finds what it needs by role.

## What Changes

- **Roles for everything the code finds.** New section roles `backstory`,
  `clock`, `truths`, `before`; new scene field roles `place`, `inPlay`,
  `mustHave`, `happens`, `tests`, `derail`, `situation`, `decides`. The
  layout and the editor find sections and fields only by role.
- **Game systems leave the template.** The Kulthos grade table moves to a
  list of built-in game systems that the parser takes beside the template.
- **A campaign template.** The campaign skeleton becomes the built-in
  template `campagna@1` (front matter keys and sections). Campaigns stay
  unchecked.
- **A registry.** Built-in templates are listed and resolved by
  `{ id, version }`.
- **Projects pin their template.** The project doc's meta gains `template`
  (`{ id, version }`); a project without one reads as its category's
  built-in. New projects write it at creation.
- **Every consumer resolves the project's template** instead of importing
  `avventura`: editor, parse and PDF workers, syntax sheet, status bar, this
  scene, PDF review, skeleton, summary, targets, appendix, board, server
  snapshots and connector edits, desktop snapshots.

No visible change: same documents, same problems, same PDF bytes.

Out of scope (later changes of plan p17): user templates and their storage,
the template editor, versions beyond the built-ins, PDF options per section,
checks for campaigns, connector tools for templates.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `adventure-format`: templates find what the code needs by role; game
  systems are separate; the built-in campaign template.
- `projects`: a project pins its template; skeletons come from the pinned
  template, campaigns included.

## Impact

- `packages/format`: `template/schema.ts`, `template/avventura.ts`, new
  `template/campagna.ts`, new `template/registry.ts`, new `systems.ts`;
  `parse/sheets.ts`, `checks/sheets.ts`, `convert/index.ts`, `index.ts`.
- `packages/project`: `model.ts`, `doc.ts`, new `template.ts`,
  `skeleton.ts`, `summary.ts`, `targets.ts`, `appendix.ts`, `board.ts`.
- `packages/layout`: `src/input.ts`.
- `packages/web`: `editor/Editor.tsx`, `editor/analysis/parse.worker.ts`,
  `editor/analysis/client.ts`, `editor/analysis/field.ts`,
  `editor/pdf/pdf.worker.ts`, `editor/pdf/PdfReview.tsx`,
  `editor/SyntaxSheet.tsx`, `editor/StatusBar.tsx`, `editor/ThisScene.tsx`,
  `editor/inserts.ts`.
- `packages/server`: `snapshots.ts`, `mcp/edits.ts`, `mcp/tools.ts`.
- `packages/desktop`: `src/main/snapshots.ts`.
- No database migration, no UI change, no change to the Typst template.
