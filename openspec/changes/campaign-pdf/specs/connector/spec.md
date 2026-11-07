## MODIFIED Requirements

### Requirement: Template tools

The connector SHALL let Claude read the built-in and the account's document
templates (`list_templates`, `get_template`), copy one
(`duplicate_template`), save a new version of one of the account's
(`save_template_version`) and delete one no project uses
(`delete_template`). Built-ins SHALL stay read-only. `list_templates`
SHALL list each built-in once, at its latest version, with all its
versions; `get_template` and `duplicate_template` SHALL take a built-in's
version, its latest when none is given. `delete_template` SHALL
be refused with `template_in_use` while any project of the account, in the
bin included, uses any version of it. `create_project` SHALL accept an
optional template, its latest version when none is given, and SHALL refuse
one of another kind with `template_unknown`. `get_project` SHALL name the
project's template, its version and the template's latest version. The
description of `save_template_version` SHALL say which PDF options each
kind of template accepts: in campaign templates `print` and `newPage` on
any section but the appendix, never `sideColumn`.

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

#### Scenario: A built-in in two versions

- **WHEN** Claude calls `list_templates`, then `get_template` for `campagna`
  with and without `version: 1`, then `create_project` with the category
  campaign and the template `campagna` without a version
- **THEN** «Campagna» is listed once at version 2 with versions 1 and 2,
  `get_template` answers v1 and v2, and the project uses `campagna@2`
