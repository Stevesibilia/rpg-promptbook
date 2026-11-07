## MODIFIED Requirements

### Requirement: Templates are data

The checks SHALL read the sections, their order, the scene fields, the callout types, the sheet's type key, the limits and the style rules from a template definition, validated when it is loaded, and the sheet kinds and lookup tables from a separate list of game systems. A template SHALL have an id, a version, a name and a kind: `adventure` for adventures and one-shots, `campaign` for campaigns. The package SHALL ship the
template `avventura` version 1, matching the `enhanced-avventure-rpg` model,
whose only sheet key is `Tipo`,
the template `campagna` version 1 (front matter keys and the sections
Premessa, Fronti, PNG ricorrenti, Fili aperti, Sessioni), the template
`campagna` version 2, matching the `campagna-rpg` model (the same front
matter keys; the sections Premessa, Verità del mondo, Fronti, Fazioni, PNG
ricorrenti, PG e agganci, Archi, Finali possibili, Fili aperti, Temi e
motivi, Prima della campagna, Aggiornamenti, and «Appendice: stile visivo e
sonoro» with the role `appendix`; Fronti, PNG ricorrenti, Archi and Fili
aperti on a new page), and the built-in game systems. Built-in templates
SHALL be found by id and version, and a built-in's latest version by its
id. Every
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

#### Scenario: Two versions of «Campagna»

- **WHEN** the registry is asked for `{ id: "campagna", version: 1 }`, then
  for the latest `campagna`
- **THEN** it answers v1 with the section Sessioni, then v2 with the
  appendix

### Requirement: Section PDF options

A template section SHALL accept optional PDF options. In an adventure
template: `print`, for any section but the appendix; `newPage` and
`sideColumn`, for sections without a role. In a campaign template: `print`
and `newPage`, for any section but the appendix; never `sideColumn`.
Absent options SHALL read as their defaults: printed; a new page for an
adventure's section without a role, flowing in a campaign; no side column.
A template that sets `newPage` or `sideColumn` on an adventure's section
with a role, any option on the appendix, or `sideColumn` in a campaign
template SHALL be refused with the option's path. A campaign template
SHALL be refused, at the section's role, when a section has a role other
than `appendix`.

#### Scenario: Defaults

- **WHEN** a template adds «Atmosfera» with no options
- **THEN** it reads as printed, on a new page, without a side column

#### Scenario: Option on a role section

- **WHEN** a template sets `newPage` on «Inizio forte»
- **THEN** the template is refused at `sections.<n>.pdf.newPage`

#### Scenario: Campaign defaults

- **WHEN** a campaign template has «Fazioni» with no options
- **THEN** it reads as printed and flowing

#### Scenario: Side column in a campaign

- **WHEN** a campaign template sets `sideColumn` on «Fronti»
- **THEN** the template is refused at `sections.<n>.pdf.sideColumn` with
  «campaigns have no side column»

## ADDED Requirements

### Requirement: Reading a campaign

The package SHALL read a campaign's document with its campaign template
into its front matter, the text before the first `##`, and its `##`
sections in document order, each with its heading, its source range,
whether the template lists it, its PDF options and its blocks with their
source ranges. A `### X. Name` heading whose X is one to three capital
letters followed by a number SHALL be a subheading with the ID X and the
name; other `###` and deeper headings SHALL be subheadings without an ID.
Reading a campaign SHALL report no problems: campaigns are not checked.

#### Scenario: A front with an ID

- **WHEN** «## Fronti» holds `### F1. La Compagnia` and `### Note`
- **THEN** the section's blocks hold a subheading with ID «F1» and name «La
  Compagnia», and one with no ID named «Note»

#### Scenario: Unknown section

- **WHEN** a campaign on «Campagna» v2 has «## Appunti del master»
- **THEN** it is read as a section the template does not list, printed and
  flowing
