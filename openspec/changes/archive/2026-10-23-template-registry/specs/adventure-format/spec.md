## MODIFIED Requirements

### Requirement: Templates are data

The checks SHALL read the sections, their order, the scene fields, the callout types, the sheet keys, the limits and the style rules from a template definition, validated when it is loaded, and the grade tables from a separate list of game systems. A template SHALL have an id, a version, a name and a kind: `adventure` for adventures and one-shots, `campaign` for campaigns. The package SHALL ship the
template `avventura` version 1, matching the `enhanced-avventure-rpg` model,
the template `campagna` version 1 (front matter keys and the sections
Premessa, Fronti, PNG ricorrenti, Fili aperti, Sessioni), and the Kulthos
game system. Built-in templates SHALL be found by id and version. Every
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
