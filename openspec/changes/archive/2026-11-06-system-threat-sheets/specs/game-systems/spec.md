## ADDED Requirements

### Requirement: Game systems are data

A game system SHALL have an id, a name, sheet kinds and lookup tables,
validated when it is defined. A sheet kind SHALL have a name, the value the
sheet's `Tipo` writes, and a list of fields. A field SHALL have a key, a
block (text, number, choice from a table, stat row, boxes, clock, list,
rows, lines to fill in, yes/no), a place in the scene's threat box (row,
subtitle, quote, full sheet only), a requirement (optional, recommended,
required) and the block's options. A lookup table SHALL have named columns,
the first being the key, and rows of values. Systems SHALL hold no formulas:
a table fills counts and labels, and every other number is written by hand.

#### Scenario: Invalid system

- **WHEN** a system's kind has a choice field on the table «Gradi» and the
  system has no table of that name
- **THEN** defining it fails with a message naming the field and the table

#### Scenario: Count from a table needs its choice

- **WHEN** a kind counts the boxes of `Ferite` from the table «Gradi» and has
  no choice field on «Gradi»
- **THEN** defining it fails with a message naming `Ferite`

### Requirement: Built-in game systems

The package SHALL ship, read-only, the systems Kulthos, Vileborn, Not the
End, Outgunned, D&D 5e, Historia, Blades in the Dark, PbtA, Fate, Call of
Cthulhu, Mörk Borg and Coriolis, with the sheet kinds, fields and tables of
the agreed mockup `docs/mockups/game-systems.html`. They SHALL hold structure
only, no rules text. Historia SHALL have the same sheet as D&D 5e.

#### Scenario: Outgunned's kinds

- **WHEN** the built-in Outgunned is read
- **THEN** it has the kinds Scagnozzi, Cattivo and Boss, each with `Grinta`
  as required boxes with marks

#### Scenario: Kulthos as data

- **WHEN** the built-in Kulthos is read
- **THEN** its table «Gradi» gives Ordinaria 3 wounds and 1 affliction,
  Straordinaria 6 and 2, Leggendaria 9 and 3, and its kind `Minaccia`
  counts `Ferite` from that table in groups of 3

### Requirement: Fields read by their block

A field SHALL be read by its block: a choice by the table's first column; a
stat row as label and value pairs; boxes from the table, a fixed number, or
the number written, with marked boxes written in brackets (`6 (3)`); a
written clock as items `Text: size`; a list as items, `Name (text)` for
paragraphs; rows as items `Cell: cell · cell`, a column bound to a table
showing that table's number as tokens; a yes/no as yes when written, unless
it says no. Items SHALL be written on one line separated by `·`, or as
sub-bullets of the field.

#### Scenario: Marked boxes

- **WHEN** a Boss sheet writes `- **Grinta:** 10 (8, 10)`
- **THEN** the field reads 10 boxes with the 8th and 10th marked

#### Scenario: Rows with a table

- **WHEN** a Not the End challenge writes `Prove` with the sub-bullet
  `Sfondarlo: difficilissima · molto pericolosa`
- **THEN** the row reads the action «Sfondarlo», difficulty 5 tokens and
  danger 2 tokens
