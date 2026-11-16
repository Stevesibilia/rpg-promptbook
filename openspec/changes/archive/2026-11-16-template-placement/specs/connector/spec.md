## ADDED Requirements

### Requirement: Column marks through the connector

`update_project_template` SHALL accept `writeColumns`, false by default, which writes the new version's column as a mark on each part of the document that takes a column and has no mark, as the app's update dialog does. The tool SHALL never change a mark already in the text. The
description of `add_scene` SHALL show the mark on the block fields that
take a column and say it is optional. The description of
`save_template_version` SHALL name the column properties of a template and
the sections and scene fields that accept them. Section names, targets and
titles the tools answer SHALL NOT hold a mark.

#### Scenario: Update with marks

- **WHEN** Claude calls `update_project_template` with `writeColumns: true`
  on a project whose text has `## Orologio`, after the new version moved
  «Orologio» to the side column
- **THEN** the text reads `## Orologio {laterale}`, the project records the
  new version, and History lists a Claude snapshot of the text before

#### Scenario: Default leaves the text alone

- **WHEN** Claude calls `update_project_template` without `writeColumns`
  and the new version only moved «Orologio» to the side column
- **THEN** the text is unchanged and the project records the new version

#### Scenario: Targets without marks

- **WHEN** the document has `## Orologio {laterale}` and Claude calls
  `get_outline`
- **THEN** the section is listed as «Orologio»

#### Scenario: Save a column

- **WHEN** Claude sends `save_template_version` a body whose «Orologio»
  section has `pdf: { column: 'side' }`
- **THEN** the version is saved and the answer's `changes` lists the column
  change of «Orologio»
