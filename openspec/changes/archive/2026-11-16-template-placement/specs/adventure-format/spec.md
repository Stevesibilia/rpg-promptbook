## ADDED Requirements

### Requirement: Column marks in the text

The parser SHALL read a column mark, one word in braces, at the end of a level-2 heading and directly after the bold label of a block field or of the revelations list when nothing else follows in the paragraph. `{laterale}` SHALL mean the side column and `{principale}` the main
column, compared trimmed and without regard to case. The mark SHALL NOT be
part of the heading's or the label's name: sections and fields SHALL match
the template without it, and the model SHALL hold the mark's word, its
column and its position on the section, the field or the revelations label.
A marked label SHALL stay a block field and keep the list or table after
it. Braces in an inline field, in a level-3 heading, in a list item or
holding more than one word SHALL stay text, and a campaign document SHALL
have no marks.

#### Scenario: A mark on a section

- **WHEN** the document has `## Orologio {laterale}`
- **THEN** the section is «Orologio» with the role `clock`, its heading
  reads «Orologio», and its mark is the side column

#### Scenario: A mark on a block field

- **WHEN** a scene has `**Da non perdere qui** {principale}` followed by a
  list
- **THEN** the field is a block field holding the list, its mark is the
  main column, and no `content.unplaced` is reported for the list

#### Scenario: No mark

- **WHEN** the document has `## Orologio` and `**Da non perdere qui**`
- **THEN** both parse as before, with no mark

#### Scenario: Braces in an inline field

- **WHEN** a scene has `**In gioco:** {laterale}`
- **THEN** the field is inline with the text `{laterale}` and no mark

### Requirement: Column settings in a template

An adventure template SHALL accept an optional column, `main` or `side`, on the sections with the roles `reminders`, `clock` and `truths`, on the revelations list of the overview, and on the scene fields with the roles `mustHave`, `happens`, `cast` and `clues`. An absent column SHALL read as the
default: side for `reminders`, the revelations, `mustHave` and `cast`; main
for `clock`, `truths`, `happens` and `clues`. A column on any other section
or scene field, or in a campaign template, SHALL be refused with the
property's path. The effective column of a part SHALL be the column of its
mark when the mark's word is known, else the template's column, else the
default. The changes between two templates SHALL list each part whose
column differs.

#### Scenario: Built-in defaults

- **WHEN** the built-in «Avventura» version 1 is read
- **THEN** «Da non perdere stasera», the revelations, «Da non perdere qui»
  and «Chi c'è» read as the side column, «Orologio», «Verità del mondo»,
  «Cosa succede da sé» and «Indizi qui» as the main column, and the
  template's data has no column key

#### Scenario: A column where none belongs

- **WHEN** a template sets a column on «Indizi»
- **THEN** the template is refused at `sections[n].pdf.column`

#### Scenario: The mark wins

- **WHEN** the template sets «Orologio» to the side column and the document
  has `## Orologio {principale}`
- **THEN** the effective column of the clock is the main column

#### Scenario: A column change is listed

- **WHEN** two versions of a template differ only in the column of «Chi c'è»
- **THEN** the changes hold one entry for the field «Chi c'è», with the
  detail `column`, from `side` to `main`

### Requirement: Column mark warnings

The checks SHALL report, as warnings that change nothing in the PDF, a mark whose word is not a column and a mark on a part that takes no column. A mark with an unknown word on a part that takes a column SHALL be
`column.unknown`, at the mark, and the part SHALL print where the template
says. A mark on a section or a block field that takes no column, and one of
the two known words in braces at the end of a scene heading, SHALL be
`column.ignored`.

#### Scenario: Unknown word

- **WHEN** the document has `## Verità del mondo {latterale}`
- **THEN** a warning with code `column.unknown` at the mark says «Unknown
  column «latterale»: write principale or laterale. Until then this part
  prints where the template says.»

#### Scenario: A part without a column

- **WHEN** the document has `## Indizi {laterale}`
- **THEN** a warning with code `column.ignored` points at the mark, and the
  section is still «Indizi»

#### Scenario: Known words give no warning

- **WHEN** the document has `## Orologio {laterale}` and
  `**Chi c'è** {principale}`
- **THEN** no problem with a code starting `column.` is reported
