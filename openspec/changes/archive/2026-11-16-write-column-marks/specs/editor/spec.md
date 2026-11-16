## ADDED Requirements

### Requirement: Write the column marks from the palette

In an adventure or a one-shot the palette SHALL list «Write column marks» while at least one part of the document that takes a column has no mark, and SHALL NOT list it otherwise. Running the command SHALL write the mark of
the column the project's template sets after the heading or label of each
such part, as one undo step, and SHALL NOT change a mark already in the
text. The PDF SHALL be the same before and after the command.

#### Scenario: Marks written on an older document

- **WHEN** a project on the built-in template has `## Orologio`,
  `**Rivelazioni**` and `**Chi c'è**` without marks and the user runs «Write
  column marks»
- **THEN** the text reads `## Orologio {principale}`,
  `**Rivelazioni** {laterale}` and `**Chi c'è** {laterale}`, and one undo
  removes the three marks

#### Scenario: A mark in the text stays

- **WHEN** the document has `## Orologio {laterale}` and
  `## Verità del mondo`, and the user runs «Write column marks»
- **THEN** the heading `## Orologio {laterale}` is unchanged and the other
  reads `## Verità del mondo {principale}`

#### Scenario: Nothing to write

- **WHEN** every part that takes a column has a mark
- **THEN** the palette does not list «Write column marks»
