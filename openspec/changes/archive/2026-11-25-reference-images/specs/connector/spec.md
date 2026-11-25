## ADDED Requirements

### Requirement: References through the connector

`get_board` SHALL list, for each image prompt, its images with an id, a name and whether each is chosen and generated, and the ids of the prompt's references. `generate_image` SHALL accept `references`, up to three image
ids of the same project: left out, the generation uses the prompt's
references; given, also empty, the generation uses the list and the prompt
remembers it. The tool's answer SHALL name the references sent. A refusal
SHALL carry the same sentence as in the app.

#### Scenario: Claude keeps a face

- **WHEN** Claude reads `get_board`, takes the id of the chosen image of
  «Padre Anselmo» and calls `generate_image` on a prompt of S2 with
  `references: [<that id>]`
- **THEN** the generation is sent with that reference, the answer lists it,
  and the board shows «References: Padre Anselmo» on the prompt

#### Scenario: Left out

- **WHEN** Claude calls `generate_image` without `references` on a prompt
  that has one
- **THEN** the generation is sent with the prompt's reference
