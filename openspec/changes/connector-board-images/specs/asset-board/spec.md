## ADDED Requirements

### Requirement: Images attached from Atelier

An image attached from Atelier through the connector SHALL land on its
prompt as a received image, like a dropped file, named
`<label>-atelier-<first 8 characters of the Atelier id>.<ext>`, with its
width and height, marked as Claude's, and SHALL keep the Atelier image's id.
It SHALL carry no model and no cost: its thumbnail SHALL show no badge, and
it SHALL add nothing to the project's or the account's spending. The viewer
SHALL show a row «From · Atelier» for it, with the link «No. <first 8> in
Atelier ↗» when the server's Atelier address is known, and SHALL show no
«Matched by» row for it. Its thumbnail SHALL be filled in like a generated
image's.

#### Scenario: An attached image on the board

- **WHEN** Claude attaches Atelier image `52f9552c-…` to the NPC prompt
  «Padre Anselmo»
- **THEN** the prompt is Received with one more image named
  `padre-anselmo-atelier-52f9552c.png`, without a badge, and the
  project's spending is unchanged

#### Scenario: The viewer links back

- **WHEN** the user opens that image in the viewer on a server with an
  Atelier address
- **THEN** a row reads «From · Atelier» with the link «No. 52f9552c in
  Atelier ↗»

#### Scenario: Exported like any image

- **WHEN** a board whose chosen image was attached from Atelier is exported
  for CueBard
- **THEN** the pack holds it as it holds a dropped one
