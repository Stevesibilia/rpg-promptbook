## ADDED Requirements

### Requirement: Column marks in the editor

In an adventure or a one-shot the editor SHALL show a column mark in its own style after its heading or label, on every line, including lines no selection touches. A label followed by a mark SHALL keep the field-label
style. A mark whose word is not a column SHALL show as a warning, with the
check's message. Inserting a block scene field that takes a column SHALL
write the label with the mark of the column the project's template sets.
The syntax sheet SHALL list the two marks and the parts that take one.

#### Scenario: Mark off the active line

- **WHEN** the document has `## Orologio {laterale}` and the cursor is on
  another line
- **THEN** the line shows «Orologio» as a heading without `##`, followed by
  `{laterale}` in the mark's style

#### Scenario: Insert a field

- **WHEN** the user inserts «Chi c'è» from «This scene» in a project on the
  built-in template
- **THEN** the scene gains `**Chi c'è** {laterale}` followed by an empty
  list item

#### Scenario: Unknown word

- **WHEN** the document has `## Verità del mondo {latterale}`
- **THEN** the mark shows as a warning and the checks list «Unknown column
  «latterale»: write principale or laterale. Until then this part prints
  where the template says.»

### Requirement: Column commands in the palette

The palette SHALL list «Move to side column» when the cursor is in a part that takes a column and prints in the main column, and «Move to main column» when it prints in the side column; elsewhere it SHALL list neither. Running the command SHALL write the mark after the part's heading or
label, or replace the mark that is there, as one undo step.

#### Scenario: Move the clock from the palette

- **WHEN** the cursor is under `## Orologio` in a project on the built-in
  template and the user runs «Move to side column»
- **THEN** the heading reads `## Orologio {laterale}`

#### Scenario: Replace a mark

- **WHEN** the cursor is in the list under `**Da non perdere qui** {laterale}`
  and the user runs «Move to main column»
- **THEN** the label reads `**Da non perdere qui** {principale}`

#### Scenario: A part without a column

- **WHEN** the cursor is under `## Indizi`
- **THEN** the palette lists neither command
