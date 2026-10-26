## MODIFIED Requirements

### Requirement: Tools

The endpoint SHALL offer `list_projects`, `get_project`, `create_project`,
`get_outline`, `read_document`, `replace_section`, `add_scene`, `list_todo`,
`add_todo`, `get_inspiration`, `add_inspiration_item`, `list_research`,
`get_research_note`, `save_research_note`, `add_research_topic`,
`get_brainstorm_log`, `add_brainstorm_entry`, `get_board`,
`set_scene_prompts`, `add_image_prompt`, `update_image_prompt`,
`remove_image_prompt`, `list_templates`, `get_template`,
`duplicate_template`, `save_template_version`, `delete_template` and
`update_project_template`, with input schemas, descriptions and
annotations. No tool SHALL write the seed, tick or remove to-do items, or
delete anything, except `remove_image_prompt`, which removes an image prompt
and never a file, and `delete_template`, which deletes a document template
no project uses. The descriptions SHALL tell Claude to read a project's
brainstorm log first in a new chat. Everything a tool writes SHALL be marked
as Claude's where the data has an author, and SHALL reach the project's open
editors without a reload.

#### Scenario: Brainstorm entry saved

- **WHEN** Claude calls `add_brainstorm_entry` with a title, two ideas, a
  rejected idea with why and an open question
- **THEN** the project's brainstorm log has that entry first, via Claude,
  dated now

#### Scenario: Project created

- **WHEN** Claude calls `create_project` with the title «La fiera di
  Randazzo» and the category one-shot
- **THEN** a draft one-shot exists with the user's one-shot skeleton and
  to-do template and no seed

#### Scenario: Board tools listed

- **WHEN** a client lists the endpoint's tools
- **THEN** the list holds twenty-eight tools: `get_board` as a read tool,
  `set_scene_prompts`, `add_image_prompt` and `update_image_prompt` as write
  tools, and `remove_image_prompt` as a destructive write tool

## ADDED Requirements

### Requirement: Template tools

The connector SHALL let Claude read the built-in and the account's document
templates (`list_templates`, `get_template`), copy one
(`duplicate_template`), save a new version of one of the account's
(`save_template_version`) and delete one no project uses
(`delete_template`). Built-ins SHALL stay read-only. `delete_template` SHALL
be refused with `template_in_use` while any project of the account, in the
bin included, uses any version of it. `create_project` SHALL accept an
optional template, its latest version when none is given, and SHALL refuse
one of another kind with `template_unknown`. `get_project` SHALL name the
project's template, its version and the template's latest version.

#### Scenario: Templates listed

- **WHEN** Claude calls `list_templates` for an account with «Avventura
  Kulthos» at v3, its default for adventures
- **THEN** the answer holds «Avventura» and «Campagna» as built-ins and
  «Avventura Kulthos» with version 3, marked default, with its three
  versions and their notes

#### Scenario: Built-in is read-only

- **WHEN** Claude calls `save_template_version` with the id `avventura`
- **THEN** the call fails with `not_found`, and `duplicate_template` from
  `avventura` gives an editable copy at version 1

#### Scenario: Template in use

- **WHEN** Claude calls `delete_template` on a template one project in the
  bin uses
- **THEN** the call fails with `template_in_use` and the template keeps
  every version

#### Scenario: Project from a template

- **WHEN** Claude calls `create_project` with the category adventure and the
  template «Avventura Kulthos» without a version
- **THEN** the project uses the template's latest version, and
  `get_project` names it

### Requirement: Saving a template version through the connector

`save_template_version` SHALL take the template's whole body and the
version it was read at, and SHALL save it as the next version. A base
version that is no longer the latest SHALL be refused with
`template_version_conflict`; a body equal to the base version SHALL be
refused with `no_changes`; a body that breaks a locked row SHALL be refused
with `invalid_template`, naming every row. Rows Claude adds SHALL get a uid.
The stored note SHALL begin with «via » and the connected app's name. The
answer SHALL list the changes since the base version.

#### Scenario: Claude adds a section

- **WHEN** Claude reads «Avventura Kulthos» v2 and saves it with the section
  «Atmosfera» added and the note «mood section», connected as «Claude»
- **THEN** v3 exists with the note «via Claude: mood section», «Atmosfera»
  has a uid, the answer lists «Atmosfera» as added, and projects on v2 stay
  on v2

#### Scenario: Locked section removed

- **WHEN** Claude saves a body without the section that has the role
  `scenes`
- **THEN** the call fails with `invalid_template` naming that section, and
  no version is saved

#### Scenario: Stale base version

- **WHEN** Claude saves with base version 2 after the app saved v3
- **THEN** the call fails with `template_version_conflict`

### Requirement: Updating a project's template through the connector

`update_project_template` SHALL move a project to the latest version of its
template, as the app's update dialog does: optionally adding an empty
heading for each new section and renaming headings and field labels the new
version renames. It SHALL snapshot the document first when it changes the
text, as Claude's, and SHALL change the text and the recorded version in one
transaction. A project already on the latest version, or on a built-in,
SHALL be refused with `template_up_to_date`.

#### Scenario: Project updated

- **WHEN** a project on «Avventura Kulthos» v2 is open in the editor and
  Claude calls `update_project_template` after v3 renamed «Inizio forte» to
  «Apertura» and added «Atmosfera»
- **THEN** the open editor shows the heading «Apertura» and an empty
  «Atmosfera» section without a reload, the project records v3, and History
  lists a Claude snapshot of the text before

#### Scenario: Already on the latest version

- **WHEN** Claude calls `update_project_template` on a project on the
  built-in «Avventura»
- **THEN** the call fails with `template_up_to_date` and nothing changes
