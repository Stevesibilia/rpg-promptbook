## ADDED Requirements

### Requirement: PDF options per section

The Sections tab of an adventure template SHALL show an «In the PDF» column.
A section with a role SHALL show its fixed place in the PDF and a «Printed /
Left out» toggle, except the appendix, which shows «Not printed» only. A
section without a role SHALL show «Printed / Left out» and, when printed,
«New page» (on by default) and «Side column» (off by default). Campaign
templates SHALL show no PDF options. The preview SHALL mark a section that
will not print «not in the PDF». A change of options SHALL count in the
save bar and be listed in the save dialog as «PDF options of «X»».

#### Scenario: Leave out a role section

- **WHEN** the user sets «Prima della sessione» to «Left out» in an own
  template
- **THEN** the save bar counts 1 change, the preview shows «## Prima della
  sessione» marked «not in the PDF», and the save dialog lists «PDF options
  of «Prima della sessione»»

#### Scenario: Options of an own section

- **WHEN** the user adds «Atmosfera»
- **THEN** its row shows «Printed», «New page» on and «Side column» off;
  after «Left out», only «Left out» shows

#### Scenario: Toggle back

- **WHEN** the user turns «New page» off and on again
- **THEN** the save bar counts no change for it

#### Scenario: Built-in

- **WHEN** the user views «Avventura»
- **THEN** the column shows each section's place and its toggles disabled
