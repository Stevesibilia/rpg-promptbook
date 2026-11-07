## MODIFIED Requirements

### Requirement: PDF options per section

The Sections tab SHALL show an «In the PDF» column. In an adventure
template, a section with a role SHALL show its fixed place in the PDF and a
«Printed / Left out» toggle, except the appendix, which shows «Not printed»
only; a section without a role SHALL show «Printed / Left out» and, when
printed, «New page» (on by default) and «Side column» (off by default). In
a campaign template, every section but the appendix SHALL show «Printed /
Left out» and, when printed, «New page» (off by default); the appendix
SHALL show «Never in the PDF» only; the tab's note SHALL read «Sections the
template does not list still print, flowing after the section before
them.» The preview SHALL mark a section that will not print «not in the
PDF», and, in a campaign template, a section that starts a page «new page».
A change of options SHALL count in the save bar and be listed in the save
dialog as «PDF options of «X»».

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

#### Scenario: Campaign built-in

- **WHEN** the user views «Campagna» v2
- **THEN** Fronti, PNG ricorrenti, Archi and Fili aperti show «Printed» and
  «New page» on, the others «Printed» and «New page» off, all disabled, the
  appendix «Never in the PDF», and no row shows «Side column»

#### Scenario: Leave a campaign section out

- **WHEN** the user sets «Aggiornamenti» to «Left out» in a copy of
  «Campagna»
- **THEN** its «New page» toggle hides, the preview marks «## Aggiornamenti»
  «not in the PDF», and the save bar counts 1 change

## ADDED Requirements

### Requirement: Built-ins with more than one version

A built-in template MAY have several versions; projects SHALL keep the
version they record, a project that records none SHALL read as version 1 of
its kind's built-in, and new projects SHALL get the latest. The template
list SHALL show one entry per built-in, at its latest version; opening it
SHALL show that version, with the banner adding «v1 stays available for the
projects that use it.» when older versions exist. The package SHALL ship
«Campagna» versions 1 and 2.

#### Scenario: One «Campagna» in the list

- **WHEN** the user opens Settings → Document templates
- **THEN** «Campaigns» lists one «Campagna», v2, «Built-in»

#### Scenario: A project keeps v1

- **WHEN** a campaign records `campagna@1` and the user opens it
- **THEN** it uses v1's sections, and a new campaign starts from v2's
