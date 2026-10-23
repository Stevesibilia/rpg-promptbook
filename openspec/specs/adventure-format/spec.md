# adventure-format Specification

## Purpose

How RPG Promptbook reads an adventure: the grammar of the document, the model built from it, the template definition it is checked against, and the problems the checks report.

## Requirements

### Requirement: Parsing returns a model and every problem

The format package SHALL provide a pure, synchronous function that takes the
text of an adventure and a template and returns a model and the list of all
problems found. It SHALL always return a model, even when the text has errors.
It SHALL run without I/O in Node, in Electron and in the browser.

#### Scenario: Document with errors

- **WHEN** a document with an unknown scene field and an unresolved sheet
  reference is parsed
- **THEN** the result holds a model with every scene, and a problem for each of
  the two errors

#### Scenario: Same input, same output

- **WHEN** the same text is parsed twice with the same template
- **THEN** both results are deeply equal

### Requirement: Nothing is dropped silently

Every block of the document SHALL either be placed in the model or produce a
problem that names it. Content the model cannot place SHALL be kept in the
model's list of unplaced content, with its position.

#### Scenario: Text before the first field of a scene

- **WHEN** a scene has a paragraph between its heading and its first field
  label
- **THEN** the paragraph is kept as unplaced content of that scene and an error
  points at it

#### Scenario: Unknown section

- **WHEN** the document has `## Note sparse`, which the template does not list
- **THEN** the section is kept in the model where it stands, as a plain section,
  and a warning names it

### Requirement: Problems carry code, severity, position and fixes

Each problem SHALL have a stable code, a severity (error or warning), a
message, and the start and end of the text it refers to as offsets and as
1-based line and column. A problem inside a scene SHALL carry the scene id.
Where the correction is unambiguous, a problem SHALL carry one or more fixes,
each a list of text edits.

#### Scenario: Unknown field with fixes

- **WHEN** scene S5 contains `**Se il tempo stringe:** …`
- **THEN** the problem has code `scene.field.unknown`, severity error, scene id
  `S5`, the range of the label, and a fix that turns the paragraph into a
  `[!riquadro] Se il tempo stringe` callout

### Requirement: Templates are data

The checks SHALL read the sections, their order, the scene fields, the callout types, the sheet keys, the grade tables per system, the limits and the style rules from a template definition, validated when it is loaded. The package SHALL ship the
template `avventura` version 1, matching the `enhanced-avventure-rpg` model,
with the Kulthos grade table. No template label SHALL be hard-coded in the
parser or the checks.

#### Scenario: Invalid template definition

- **WHEN** a template definition has a scene field without a label
- **THEN** loading it fails with a message naming the field

#### Scenario: A field added to the template

- **WHEN** `Se il tempo stringe` is added to the template's scene fields
- **THEN** the same S5 text parses without the unknown-field error

### Requirement: Front matter holds the header

The header SHALL be YAML front matter. The template SHALL list its keys:
`titolo` (required), `sottotitolo`, `sistema`, `formato`, `durata`,
`giocatori`, `ambientazione`, `tempi`, `linguetta`, `campagna`, `arco`,
`fronti`, `fili`, `autore`, `copyright`, `licenza`. A missing required key
SHALL be an error, an unknown key a warning, invalid YAML an error at its line.
`licenza` SHALL accept an SPDX id or free text; an unknown SPDX-looking id
SHALL be a warning.

#### Scenario: No title

- **WHEN** the front matter has no `titolo`
- **THEN** an error with code `meta.required` names `titolo`

#### Scenario: Licence

- **WHEN** `licenza: CC-BY-NC-SA-4.0` is set
- **THEN** the model holds it as an SPDX id, with no problem

### Requirement: Sections follow the template

Level-2 headings SHALL be matched by name against the template's sections. A
missing required section SHALL be an error; sections out of the template's
order SHALL be an error listing the found order; «La vicenda in breve» SHALL
be the first section.

#### Scenario: Missing section

- **WHEN** the document has no `## Orologio`
- **THEN** an error with code `section.missing` names it

### Requirement: Scenes have ids and fields

Inside `## Scene`, each `### S<n>. Name` heading SHALL start a scene with id
`S<n>`. A level-3 heading without an id SHALL be an error, and so SHALL a
duplicate id. Each paragraph that starts with a bold label SHALL be matched
against the template's scene fields: inline fields (`**Label:** text`) and
block fields (`**Label**` followed by a list or a table). An unknown label
SHALL be an error. A missing required field SHALL be an error and a missing recommended field a warning. Climax-only
fields (`Regole della situazione`, `Cosa decide la notte`) SHALL be allowed in
any scene. A label that starts a line inside another paragraph SHALL be an
error saying a blank line is missing.

#### Scenario: Scene without id

- **WHEN** the scenes section contains `### La casa che cede`
- **THEN** an error with code `scene.id.missing` points at the heading

#### Scenario: Missing blank line

- **WHEN** `**In gioco:** …` follows the previous line with no blank line
  between them
- **THEN** an error with code `field.blank-line` points at the label

### Requirement: Callouts mark typed boxes

The parser SHALL read as a callout a blockquote whose first line is `[!type]`, `[!type] Title` or `[!type|meta] Title`. The template SHALL define the types:
`leggi` (read-aloud), `documento` (handout, title expected), `riquadro` (box)
and `riquadro|laterale` (box in the side column, allowed in scenes, «A colpo
d'occhio» and «Regole della notte»). Each scene and «Inizio
forte» SHALL have at least one `leggi`, and MAY have several; none SHALL be
an error, and the model SHALL keep every `leggi` of a place in the order
written. A `documento` without a title SHALL be a warning. An unknown type
SHALL be an error listing the valid ones. A plain blockquote inside a scene
SHALL be a warning asking whether it is a read-aloud or a handout. A callout
of a known type in a place its template definition does not allow SHALL be a
warning (`callout.place`).

#### Scenario: Read-aloud after a handout

- **WHEN** a scene has a `[!documento]` callout followed by a `[!leggi]`
  callout
- **THEN** the model's read-aloud is the `[!leggi]` one and the handout is the
  `[!documento]` one, with no problem

#### Scenario: Two read-alouds in a scene

- **WHEN** a scene has two `[!leggi]` callouts
- **THEN** the model holds both as the scene's read-alouds, in order, and no
  problem is reported

#### Scenario: Two read-alouds in «Inizio forte»

- **WHEN** «Inizio forte» has two `[!leggi]` callouts
- **THEN** the model holds both, in order, and no problem is reported

#### Scenario: Scene without a read-aloud

- **WHEN** a scene has no `[!leggi]` callout
- **THEN** an error with code `callout.count` names the scene

#### Scenario: Unknown callout type

- **WHEN** a scene has `> [!nota]`
- **THEN** an error with code `callout.type.unknown` lists the valid types

#### Scenario: Callout out of place

- **WHEN** «Orologio» holds a `[!riquadro|laterale]` callout
- **THEN** a warning with code `callout.place` names the places it is allowed

#### Scenario: Side box in «Regole della notte»

- **WHEN** «Regole della notte» holds a `[!riquadro|laterale]` callout
- **THEN** no `callout.place` problem is reported

### Requirement: Tables are recognised by their header

In a scene, the table whose first header cell starts with «Se i PG» SHALL be
the reactions table; a scene without one SHALL be an error. Any other table
SHALL be kept as a plain table where it stands. The scene map, the clue
tracker and the NPC table SHALL be read from their sections by their columns.

#### Scenario: Two tables in a scene

- **WHEN** a scene has a reactions table and another table
- **THEN** the model holds both, separately, and no problem is reported

### Requirement: Sheets hold threat data in their own keys

Under `## Schede`, each `### Name` SHALL be a sheet whose bullet items with
bold keys are its fields. `Tipo`, `Grado`, `Natura`, `Ferite`, `Afflizioni`,
`Branco` and `Talenti` SHALL be read as data. A sheet with `Grado` SHALL get
its wound and affliction counts from the system's grade table; `Ferite` and
`Afflizioni`, when written, SHALL agree with the grade, or a warning says how.
Two sheets with the same name (the part before the comma) SHALL be an error.
Talents SHALL come only from `Talenti`. Other bold keys are free and SHALL be
kept as the sheet's fields. A `####` heading inside a sheet, or an item other
than `Tipo` that describes a threat with a grade (Ordinaria, Straordinaria,
Leggendaria), SHALL be a warning suggesting a sheet of its own, since it gets
no threat box. Under `### Pregenerati`, `####` headings are pregenerated
characters.

#### Scenario: Grade and counts disagree

- **WHEN** a sheet has `Grado: Ordinaria` and `Ferite: 3 contatori da 3`
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

### Requirement: References to sheets resolve

`→ Schede: Name` SHALL resolve to exactly one sheet, by its full title or by
the part before the comma. An unresolved or ambiguous name SHALL be an error.
Every graded sheet referenced under a scene's `Chi c'è` SHALL be listed once
in that scene's threats. A graded sheet referenced elsewhere in a scene and not
under `Chi c'è` SHALL be a warning saying it gets no threat box.

#### Scenario: Reference by short name

- **WHEN** a scene has `→ Schede: Tenente Donato` and the sheet is titled
  `Tenente Donato, il Primo dei Quieti`
- **THEN** the reference resolves to that sheet

#### Scenario: Threat cited outside Chi c'è

- **WHEN** S5 cites `→ Schede: Sabaoth` only in `Da non perdere qui`
- **THEN** a warning with code `ref.threat.outside` names Sabaoth and S5

### Requirement: Revelations and clues agree

The model SHALL read revelations (`- **R1.** …` under `**Rivelazioni**`),
clues written in scenes (`- **I1.** text (R1)`), the clue tracker and the scene
map. These SHALL be errors: a revelation with fewer than three clues; a clue
pointing at a missing revelation or scene; a tracker clue written in no scene;
a scene missing from the map or a map row without a scene; `Indizi qui` with
clue numbers but no text. These SHALL be warnings: all clues of a revelation in
one scene; a tracker clue not written in the scene the tracker gives.

#### Scenario: Too few clues

- **WHEN** R2 is linked by two clues in the tracker
- **THEN** an error with code `clue.revelation.count` says R2 has 2 clues
  (minimum 3)

### Requirement: The appendix is keyed by scene id

Under `## Appendice`, each `### S<n>. Name` SHALL be matched to the scene with
that id; a title that differs from the scene's SHALL be a warning, not a lost
row. Each row SHALL hold `visual:` and `mood:`; a missing one SHALL be a
warning. `visual:` or `mood:` outside the appendix SHALL be an error. Images
written as `![alt](asset:<id>)` SHALL be read as references to the project's
assets.

#### Scenario: Renamed scene

- **WHEN** scene S3 is renamed and its appendix row keeps the old title
- **THEN** the row still belongs to S3 and a warning notes the old title

### Requirement: Limits and style rules

From the template's limits: «La vicenda in breve» outside 300–600 words SHALL
be a warning; more than 700 words from «A colpo d'occhio» to «Inizio forte»
SHALL be a warning; more than 5 items in «Da non perdere stasera» SHALL be an
error. From the template's style rules: an em dash or en dash in the text SHALL
be an error at its position.

#### Scenario: En dash

- **WHEN** a line contains `S2 – S4`
- **THEN** an error with code `style.dash` points at the dash
