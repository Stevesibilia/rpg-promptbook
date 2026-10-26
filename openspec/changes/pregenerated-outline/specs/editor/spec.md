## MODIFIED Requirements

### Requirement: Outline

The outline SHALL list the front matter, the sections, the scenes under the
scenes section and, under the sheets section in text order, the sheets and
the pregenerated characters block (named as the template names it), with
each pregenerated character one level deeper, each with a badge counting its
own problems that are not hidden, coloured by the worst severity among them.
The item holding the cursor SHALL be highlighted. Clicking an item SHALL move
the cursor to its heading and scroll it into view. Scenes SHALL be reordered
by dragging or with Alt+↑ and Alt+↓, as one edit that keeps every other byte
of the text and does not renumber scene ids. The outline SHALL collapse and
open with ⌘1 and its button, remembered in the browser. For a campaign it
SHALL list the `##` and `###` headings without badges or moves.

#### Scenario: Jump to a scene

- **WHEN** the user clicks «S4» in the outline
- **THEN** the cursor is on the `### S4.` heading and it is in view

#### Scenario: Move a scene

- **WHEN** the user drags S2 below S3
- **THEN** the document has S3 before S2, the ids are unchanged, and another
  tab shows the same order

#### Scenario: Badge without hidden problems

- **WHEN** S2 has one problem and the user dismisses it
- **THEN** S2 has no badge in the outline

#### Scenario: Pregenerated characters listed

- **WHEN** `## Schede` holds `### Pregenerati` with `#### Ada Rossi` and
  `#### Bruno Valli`, and Ada's text has one problem
- **THEN** the outline lists «Pregenerati» under «Schede» at the sheets'
  level, with «Ada Rossi» and «Bruno Valli» one level deeper, and the badge
  is on «Ada Rossi»

#### Scenario: Jump to a pregenerated character

- **WHEN** the user clicks «Bruno Valli» in the outline
- **THEN** the cursor is on the `#### Bruno Valli` heading, it is in view,
  and the status bar shows «Pregenerati · Bruno Valli»
