## ADDED Requirements

### Requirement: Column of the night parts and scene fields

The template editor SHALL show a «Main / Side» switch in «In the PDF» for the sections with the roles `reminders`, `clock` and `truths`, in a fixed row «↳ Rivelazioni» under the overview's row, and in an «In the PDF» column of the Scene fields tab for the fields with the roles `mustHave`, `happens`, `cast` and `clues`. Every other scene field SHALL show its fixed
place on the scene page. A page sketch under each table SHALL show which
parts print in the main column and which in the side column, and follow the
switches. The starting document SHALL show each part's column as a mark. A
switch set back to the saved value SHALL count as no change. A change of
column SHALL count in the save bar and be listed in the save dialog as
«…prints in the side column» or «…prints in the main column». A built-in
template SHALL show the switches disabled.

#### Scenario: Move the clock

- **WHEN** the user sets «Orologio» to «Side» in an own template
- **THEN** the save bar counts 1 change, the night page sketch lists
  «Orologio» in the side column, the starting document reads
  `## Orologio {laterale}`, and the save dialog lists «Section «Orologio»
  prints in the side column»

#### Scenario: Move the revelations

- **WHEN** the user sets «↳ Rivelazioni» to «Main»
- **THEN** the sketch lists «Rivelazioni» in the main column and the save
  bar counts 1 change

#### Scenario: Scene fields

- **WHEN** the user opens the Scene fields tab of an own template
- **THEN** «Da non perdere qui», «Cosa succede da sé», «Chi c'è» and
  «Indizi qui» show the switch, «Prove e regole» shows «Framed, main
  column», and «Se deragliano» shows «End of main column»

#### Scenario: Switch back

- **WHEN** the user sets «Chi c'è» to «Main» and then to «Side» again
- **THEN** the save bar counts no change for it

#### Scenario: Built-in

- **WHEN** the user views «Avventura»
- **THEN** «Da non perdere stasera» shows «Side» chosen, «Orologio» shows
  «Main» chosen, and every switch is disabled

### Requirement: Column marks on a template update

The update dialog SHALL offer, unticked, to write the column marks where the text has none, when at least one part of the document that takes a column has no mark. With the option, updating SHALL write the new version's
column as a mark on each such part, in the same undo step as the update.
With or without the option, updating SHALL NOT change a mark already in the
text. The dialog's change list SHALL include the column changes between the
two versions.

#### Scenario: Marks written

- **WHEN** a project on v2 whose text has `## Orologio` and
  `## Verità del mondo {laterale}` is updated to v3 with the option ticked
- **THEN** the text reads `## Orologio {principale}`, the heading
  `## Verità del mondo {laterale}` is unchanged, and one undo restores the
  text and v2

#### Scenario: Option left unticked

- **WHEN** v3 moved «Orologio» to the side column and the project is
  updated without the option
- **THEN** the text is unchanged and the PDF prints «Orologio» in the side
  column
