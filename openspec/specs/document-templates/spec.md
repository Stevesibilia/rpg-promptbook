# document-templates Specification

## Purpose

TBD - created by archiving change template-editor. Update Purpose after archive.

## Requirements

### Requirement: The account's templates

Each account SHALL hold its own document templates, each with an id made
by the server, a kind (adventure or campaign) and numbered versions that
never change once saved. Duplicating a built-in or an own template SHALL
make a new template at version 1. The built-in templates SHALL be
read-only. Every reader of a project's document SHALL resolve the
project's template among the account's templates and the built-ins.

#### Scenario: Duplicate a built-in

- **WHEN** the user duplicates «Avventura»
- **THEN** the list shows «Copia di Avventura», v1, «Copied from
  Avventura», no projects, with «Edit» and «Delete»

### Requirement: Templates offline on desktop

The desktop app SHALL read the account's templates offline from its last
copy. Creating, saving and deleting templates SHALL need the server.

#### Scenario: Offline on desktop

- **WHEN** the desktop app is offline and the user opens a project made
  from an own template
- **THEN** the project is checked against that template, and the template
  list shows it with its editing controls disabled

### Requirement: Template list

Settings → Document templates SHALL list the templates in two groups,
«Adventures and one-shots» and «Campaigns», as
[docs/mockups/templates.html](../../../docs/mockups/templates.html) state 1
shows them: name, latest version, «Built-in» and «Default» marks, origin,
game system and the number of projects using any version. Each group SHALL
have one default, which new projects of that kind preselect. «Delete» SHALL
be offered only for an own template no project uses.

#### Scenario: Make default

- **WHEN** the user presses «Make default» on «Avventura Kulthos»
- **THEN** it is marked «Default», «Avventura» is not, and the next new
  adventure preselects «Avventura Kulthos»

#### Scenario: Template in use

- **WHEN** a project uses version 1 of «Avventura Kulthos»
- **THEN** its row shows no «Delete», and the server refuses a delete with
  `template_in_use`

### Requirement: Template editor

Opening a template SHALL show the editor of states 2 to 6 of the mockup: a
name, the kind, a game system, tabs for sections, scene fields, boxes,
front matter and limits (sections and front matter only for a campaign),
and a live preview of the starting document a new project would get. A
built-in SHALL open read-only with a «Duplicate» banner. Unsaved changes
SHALL be counted in a save bar; leaving with unsaved changes SHALL ask
before discarding them.

#### Scenario: Rename a section with a role

- **WHEN** the user renames «Inizio forte» to «Apertura» in an own template
- **THEN** the preview's heading reads «## Apertura» with an amber mark, the
  save bar counts 1 change, and after saving, a project on the new version
  prints its read-aloud on the start page as before

### Requirement: Locked rows

Locked rows SHALL show a lock and SHALL NOT be removable: rows with a role, the front matter keys the app reads by name, and boxes
needed at least once per place. Sections and fields with a role MAY be
renamed; locked keys SHALL NOT.

#### Scenario: Locked row

- **WHEN** the user looks at the «Scene» section's row
- **THEN** its remove button is disabled with the tooltip saying it is
  needed by the checks and the PDF

### Requirement: Template versions

Saving SHALL create the next version, after a dialog listing the changes
since the saved version and an optional note. Projects SHALL keep the
version they use. A save based on a version that is no longer the latest
SHALL be refused with `template_version_conflict`, and the editor SHALL say
so and offer to reload.

#### Scenario: Save a version

- **WHEN** the user adds the section «Atmosfera» to «Avventura Kulthos» v2
  and saves with the note «Atmosfera»
- **THEN** the list shows v3, and projects on v2 still use v2

#### Scenario: Two tabs save

- **WHEN** two tabs edit v2 and both save
- **THEN** the first makes v3 and the second is refused with a message
  offering to reload

### Requirement: Update a project to the latest version

A project whose template has a newer version SHALL show «<name> vK · vN
available» in the editor's top bar. Its dialog SHALL list the changes, offer
to add the new sections' headings and to rename the headings and labels
that changed, and say how the checks' errors and warnings change. Updating
SHALL record the new version and apply the chosen text edits as one undo
step. A project whose template cannot be found SHALL use its kind's
built-in and say so in the status bar.

#### Scenario: Update with renames

- **WHEN** a project on v2 is updated to v3, which renamed «Inizio forte» to
  «Apertura» and added «Atmosfera», with both boxes ticked
- **THEN** the document's heading reads «## Apertura», an empty «##
  Atmosfera» follows «Verità del mondo», the top bar no longer shows
  «available», and one undo restores the text and v2

### Requirement: PDF options per section

The Sections tab of an adventure template SHALL show an «In the PDF» column.
A section with a role SHALL show its fixed place in the PDF and a «Printed /
Left out» toggle, except the appendix, which shows «Not printed» only. A
section without a role SHALL show «Printed / Left out» and, when printed,
«New page» (on by default) and «Side column» (off by default). Campaign
templates SHALL show no PDF options. The preview SHALL mark a section that
will not print «not in the PDF». A change of options SHALL count in the
save bar and be listed in the save dialog as «PDF options of «X»».

#### Scenario: Leave out a role section

- **WHEN** the user sets «Prima della sessione» to «Left out» in an own
  template
- **THEN** the save bar counts 1 change, the preview shows «## Prima della
  sessione» marked «not in the PDF», and the save dialog lists «PDF options
  of «Prima della sessione»»

#### Scenario: Options of an own section

- **WHEN** the user adds «Atmosfera»
- **THEN** its row shows «Printed», «New page» on and «Side column» off;
  after «Left out», only «Left out» shows

#### Scenario: Toggle back

- **WHEN** the user turns «New page» off and on again
- **THEN** the save bar counts no change for it

#### Scenario: Built-in

- **WHEN** the user views «Avventura»
- **THEN** the column shows each section's place and its toggles disabled

### Requirement: Locks enforced on save

The server SHALL refuse with `invalid_template` any new version that, against the version it is based on, removes a locked section, scene field or front matter key, changes a row's role, adds a role, or renames a locked front matter key. Boxes SHALL be locked only within one edit, as the editor shows them: a box every place needs MAY be set to «any» and removed in the same save. The editor and the server SHALL share one definition of locked rows.

#### Scenario: Role section renamed

- **WHEN** a version renames the section with the role `strongStart` from
  «Inizio forte» to «Apertura»
- **THEN** the save succeeds

#### Scenario: Locked key renamed

- **WHEN** a version renames the front matter key `licenza`
- **THEN** the save fails with `invalid_template` naming `licenza`

### Requirement: Templates saved elsewhere

The web app SHALL read the account's templates again when its window gets the
focus back, at most once every ten seconds, so a version saved in another
tab or through the connector shows in Settings and in an open project's
«vN available» without a reload. An open template editor SHALL keep its
draft.

#### Scenario: Version saved by Claude

- **WHEN** Claude saves v2 of the template an open project uses at v1, and
  the user comes back to the app's window
- **THEN** the project's top bar shows «v2 available»
