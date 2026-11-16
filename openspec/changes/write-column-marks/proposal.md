# Write the column marks into an existing document

## Why

Since `template-placement` (#63, v0.22.0) a new document carries a column
mark on every part its template places. A document made before has none. The
only way to get them all is a template update, with an option that is
unticked by default and that exists only when the template has a newer
version. The owner expected the marks to be there by default (issue #65).

## What Changes

- A palette command «Write column marks» writes every missing mark in the
  open document, from the project's template, as one undo step. It is listed
  only while at least one mark is missing. The PDF does not change: a missing
  mark already means the template's column.
- In the template update dialog the option «Write the column marks where the
  text has none» is ticked by default.
- No document is rewritten without the owner asking: no automatic write on
  open, no bulk action over all projects (owner decision, 2026-11-16).
- The connector is unchanged: `update_project_template` keeps
  `writeColumns` false by default.

## Impact

- `promptbook-project`: new export `columnMarkEdits`.
- `promptbook-web`: palette entry and its action, update dialog default.
- `e2e/templates.spec.ts`: the dialog's default, the new command.
- Mockup `docs/mockups/templates.html` (states 8 and 10) and
  `docs/design.md`.
- Specs: `editor` (added requirement), `document-templates` (modified
  requirement).
