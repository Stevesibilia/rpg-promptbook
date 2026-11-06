## MODIFIED Requirements

### Requirement: Templates are data

The checks SHALL read the sections, their order, the scene fields, the callout types, the sheet's type key, the limits and the style rules from a template definition, validated when it is loaded, and the sheet kinds and lookup tables from a separate list of game systems. A template SHALL have an id, a version, a name and a kind: `adventure` for adventures and one-shots, `campaign` for campaigns. The package SHALL ship the
template `avventura` version 1, matching the `enhanced-avventure-rpg` model,
whose only sheet key is `Tipo`,
the template `campagna` version 1 (front matter keys and the sections
Premessa, Fronti, PNG ricorrenti, Fili aperti, Sessioni), and the built-in
game systems. Built-in templates SHALL be found by id and version. Every
section and scene field that code outside the parser needs SHALL carry a
role, unique in its template, and code SHALL find them by role, never by
label. No template label SHALL be hard-coded in the parser, the checks, the
layout or the editor.

#### Scenario: Invalid template definition

- **WHEN** a template definition has a scene field without a label
- **THEN** loading it fails with a message naming the field

#### Scenario: A field added to the template

- **WHEN** `Se il tempo stringe` is added to the template's scene fields
- **THEN** the same S5 text parses without the unknown-field error

#### Scenario: A renamed field keeps its place

- **WHEN** a copy of `avventura` renames the field with the role `mustHave`
  to `Imperdibile`, and a scene writes `**Imperdibile**` with a list
- **THEN** the PDF prints that list in the scene's side column, as it prints
  «Da non perdere qui» with `avventura`

#### Scenario: Built-in template by id and version

- **WHEN** the registry is asked for `{ id: "avventura", version: 1 }`
- **THEN** it answers the built-in `avventura` template, and for an unknown
  id or version it answers none

#### Scenario: A saved template with the old sheet keys

- **WHEN** a user template saved before this change lists `Grado`,
  `Ferite` and the other old sheet keys
- **THEN** it still loads, and its sheets are read by the system's kinds

### Requirement: Sheets hold threat data in their own keys

Under `## Schede`, each `### Name` SHALL be a sheet whose bullet items with
bold keys are its fields. When the front matter names a game system and the
sheet's `Tipo` names one of its sheet kinds, the sheet's fields SHALL be read
by that kind's blocks; otherwise the sheet is plain text, with no problem. A
boxes field counted from a table, when written, SHALL agree with the table,
or a warning says how. Two sheets with the same name (the part before the
comma) SHALL be an error. Other bold keys are free and SHALL be kept as the
sheet's fields. A `####` heading inside a sheet, or an item that is not a
field of the kind and names a value of a table used by a required choice
field (Ordinaria, Straordinaria, Leggendaria in Kulthos), SHALL be a warning
suggesting a sheet of its own, since it gets no threat box. Under
`### Pregenerati`, `####` headings are pregenerated characters.

#### Scenario: Grade and counts disagree

- **WHEN** a Kulthos sheet has `Grado: Ordinaria` and `Ferite: 3 contatori
da 3`
- **THEN** a warning with code `sheet.grade.counts` says Ordinaria has 3
  wounds in one counter

#### Scenario: Threat written inside another sheet

- **WHEN** Salvi's sheet has an item `**Avatar di Sabaoth**, …: Minaccia
Straordinaria, risvegliata, …`
- **THEN** a warning with code `sheet.nested-threat` suggests a sheet of its own
  for the Avatar

#### Scenario: Two sheets with the same name

- **WHEN** two sheets are titled `Guardiano, il vecchio` and `Guardiano, il
custode`
- **THEN** an error with code `sheet.name.duplicate` points at the second
  heading, since sheet ids come from the name and must be unique

#### Scenario: A sheet of another kind

- **WHEN** a Kulthos adventure has a sheet with `Tipo: PNG alleato`
- **THEN** it is plain text, with no problem and no threat box

### Requirement: References to sheets resolve

`→ Schede: Name` SHALL resolve to exactly one sheet, by its full title or by
the part before the comma. An unresolved or ambiguous name SHALL be an error.
Every sheet with a kind referenced under a scene's `Chi c'è` SHALL be listed
once in that scene's threats. A sheet with a kind referenced elsewhere in a
scene and not under `Chi c'è` SHALL be a warning saying it gets no threat box.

#### Scenario: Reference by short name

- **WHEN** a scene has `→ Schede: Tenente Donato` and the sheet is titled
  `Tenente Donato, il Primo dei Quieti`
- **THEN** the reference resolves to that sheet

#### Scenario: Threat cited outside Chi c'è

- **WHEN** S5 cites `→ Schede: Sabaoth` only in `Da non perdere qui`
- **THEN** a warning with code `ref.threat.outside` names Sabaoth and S5

## ADDED Requirements

### Requirement: Problems from the game system

The checks SHALL warn, never block, when: the front matter names a system
that does not exist (`system.unknown`, on the front matter key); a sheet of a
kind lacks a required field (`sheet.field.required`, on the sheet heading;
the sheet then gets no threat box); a field's value cannot be read by its
block (`sheet.value.invalid`, on the field; the field then prints as
written). Missing recommended fields SHALL give no problem.

#### Scenario: Unknown system

- **WHEN** an adventure's front matter says `sistema: Altro`
- **THEN** a warning with code `system.unknown` names «Altro», and its
  sheets are plain text

#### Scenario: Required field missing

- **WHEN** a Kulthos sheet has `Tipo: Minaccia` and no `Grado`
- **THEN** a warning with code `sheet.field.required` names `Grado`, and the
  sheet gets no threat box

#### Scenario: Value outside the table

- **WHEN** a Kulthos sheet writes `Grado: Mitica`
- **THEN** a warning with code `sheet.value.invalid` says «Mitica» is not in
  the table «Gradi»
