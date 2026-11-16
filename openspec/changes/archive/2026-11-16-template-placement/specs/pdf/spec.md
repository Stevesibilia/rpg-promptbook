## ADDED Requirements

### Requirement: Placement of the night and scene parts

The PDF of an adventure SHALL print each night part («Da non perdere stasera», the revelations, «Orologio», «Verità del mondo») and each of the scene fields with the roles `mustHave`, `happens`, `cast` and `clues` in its effective column: the column of its mark in the text, else the column its template sets, else the default. On the night page the main
column SHALL hold its parts in the order of the text; the side column SHALL
hold «Da non perdere stasera» first, then its other parts in the order of
the text, then the side boxes. On a scene page each column SHALL hold its
fields in the order `mustHave`, `happens`, `cast`, `clues`: in the main
column after the read-alouds and before the handouts, in the side column
before the threat boxes and the side boxes. A part in the side column SHALL
print in the side column's look, and a part in the main column under a
heading as its neighbours there. A mark on a scene field SHALL move that
field in that scene only. A mark SHALL never be printed.

#### Scenario: A mark moves a section

- **WHEN** a document on the built-in template has `## Orologio {laterale}`
- **THEN** the PDF prints «Orologio» as a box in the side column of the
  night page, under «Da non perdere stasera», and the text `{laterale}` appears
  nowhere in the PDF

#### Scenario: A mark moves a field in one scene

- **WHEN** S1 has `**Da non perdere qui** {principale}` and S2 has
  `**Da non perdere qui**`
- **THEN** S1 prints «Da non perdere qui» in the main column under its
  read-aloud, and S2 prints it as a box in the side column

#### Scenario: The template moves a part

- **WHEN** a template sets the revelations to the main column and the
  document has no mark
- **THEN** the PDF prints «Rivelazioni» under a heading in the main column
  of the night page

#### Scenario: Built-in unchanged

- **WHEN** the PDF of «L'Ancora di Sabaoth» is built with the built-in
  template and each recorded set of options
- **THEN** its bytes are the same as before this change

### Requirement: No automatic placement

The PDF SHALL NOT move a part to another column, nor break a side box across pages, when the part does not fit: a part prints in its effective column. When the side column of a night page or of a scene page has no
part, no side box and no threat box, the main column SHALL print the full
width of the page.

#### Scenario: A long list in the side column

- **WHEN** the revelations are in the side column and their box does not
  fit under the overview
- **THEN** the box prints whole on the next page, in the side column

#### Scenario: Everything in the main column

- **WHEN** every night part of a document is in the main column and the
  overview has no side box
- **THEN** the night parts print the full width of the page
