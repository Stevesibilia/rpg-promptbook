## ADDED Requirements

### Requirement: Every read-aloud prints

The PDF SHALL print every read-aloud callout of a scene in the scene's
read-aloud place, in the order written, and every read-aloud of «Inizio
forte» in that section, in order. Double-clicking any of them in the review
SHALL jump to that callout in the editor.

#### Scenario: Two read-alouds in a scene

- **WHEN** S2 has two `[!leggi]` callouts
- **THEN** S2's page shows both read-aloud boxes, one after the other, in
  the read-aloud place

#### Scenario: Two read-alouds in «Inizio forte»

- **WHEN** «Inizio forte» has two `[!leggi]` callouts
- **THEN** the PDF shows both, in order, styled as read-alouds
