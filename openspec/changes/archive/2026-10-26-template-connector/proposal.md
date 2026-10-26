## Why

Issue
[Stevesibilia/rpg-promptbook#34](https://github.com/Stevesibilia/rpg-promptbook/issues/34),
plan p17, change 4 of 4. Changes 1 to 3 (v0.12.1 to v0.14.0) made document
templates data, gave them an editor in Settings and PDF options. The issue's
last point is still open: «Claude can read and change templates.» The
connector has 22 tools and none of them touches a template; `create_project`
cannot even pick one.

## What Changes

- **Six new connector tools** (28 in all): `list_templates` and
  `get_template` (read), `duplicate_template`, `save_template_version`,
  `update_project_template` (write), and `delete_template` (destructive
  write).
- **Whole-body saves.** Claude reads a template's JSON with `get_template`,
  sends the whole changed body with the version it read; a save based on an
  older version is refused with `template_version_conflict`, as two tabs
  are. The answer lists the changes the save made.
- **Version notes say where a save came from**: «via <app name>: <note>».
- **`create_project` takes an optional template**; `get_project` names the
  project's template and its latest version.
- **`update_project_template`** moves a project to its template's latest
  version, as the app's update dialog does (add new sections, rename
  headings), with a History snapshot first.
- **Locked rows are enforced by the server** on every save, the app's
  included: rows with a role, the front matter keys the app reads, and boxes
  every place needs cannot be removed, roles cannot move, locked keys keep
  their name. The editor already refuses these; Claude's whole-body saves
  could otherwise break them.
- **The web app picks up templates saved elsewhere** when its window gets the
  focus back, so a version Claude saved shows «vN available» without a
  reload.

Out of scope: changing the account's default templates through the
connector; a Game systems page; template tools on the desktop app's offline
store (the connector is the server's).

## Capabilities

### Modified Capabilities

- `connector`: six template tools, `create_project`'s template,
  `get_project`'s template, `delete_template` as the second deleting tool.
- `document-templates`: locks enforced on save; templates reloaded when the
  window gets the focus back.

## Impact

`packages/format` (locks moved here from the web), `packages/server`
(template functions, snapshots, connector tools), `packages/web` (draft
imports the locks, focus reload), `README.md`. No migration, no new route.
