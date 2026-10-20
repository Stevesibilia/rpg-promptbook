## MODIFIED Requirements

### Requirement: Callouts mark typed boxes

The parser SHALL read as a callout a blockquote whose first line is `[!type]`, `[!type] Title` or `[!type|meta] Title`. The template SHALL define the types:
`leggi` (read-aloud), `documento` (handout, title expected), `riquadro` (box)
and `riquadro|laterale` (box in the side column). Each scene and «Inizio
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
