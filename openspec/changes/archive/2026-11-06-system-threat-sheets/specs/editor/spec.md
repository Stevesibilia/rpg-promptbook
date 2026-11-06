## MODIFIED Requirements

### Requirement: Insert menu and sheet completion

The editor SHALL open an insert menu when, in an adventure or a one-shot, `/`
is typed as the only character of a line. The menu SHALL list the inserts allowed at that place: the missing fields of
the scene first, then callouts allowed there, sheet reference, reactions
table and new scene. Under `## Schede` it SHALL also list a sheet of each
kind of the project's game system, which inserts the heading, the `Tipo` and
the kind's required and recommended keys. Choosing an entry SHALL replace the `/` with the same
text the inspector's buttons insert; Escape SHALL leave the `/`. After
`→ Schede: ` the sheet names of the document SHALL complete. In a campaign
`/` SHALL offer headings only.

#### Scenario: New scene from the menu

- **WHEN** the scenes section has S1 to S5 and the user types `/` on an empty
  line in it and chooses New scene
- **THEN** the line becomes `### S6. ` with the cursor after it

#### Scenario: A sheet of a kind

- **WHEN** in an Outgunned adventure the user types `/` on an empty line
  under `## Schede` and chooses «Sheet: Boss»
- **THEN** the line becomes `### ` with the cursor after it, followed by
  `- **Tipo:** Boss` and `- **Grinta:** `

### Requirement: Syntax sheet

⌘/ SHALL open a dialog listing, from the template's own data, the front
matter keys, the sections, the scene fields, the callouts with their syntax
and limits, the reference marker, the reactions table, the sheet's type key
and the id prefixes, each with its requirement, and, from the project's game
system, each sheet kind with its fields, blocks and requirements.

#### Scenario: Sheet matches the template

- **WHEN** the user opens the syntax sheet
- **THEN** every scene field of the adventure template is listed in order

#### Scenario: Kinds of the system

- **WHEN** the user opens the syntax sheet in a Kulthos adventure
- **THEN** it lists the kind `Minaccia` with `Grado` as a required choice
  from «Gradi»
