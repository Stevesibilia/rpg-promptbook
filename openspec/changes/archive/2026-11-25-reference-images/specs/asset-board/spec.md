## ADDED Requirements

### Requirement: Reference images on a prompt

An image prompt SHALL hold up to three reference images, each an image on the board of the same project, in any category. The references SHALL be saved in the project and sync like the prompt's text. The Generate panel
SHALL list the picked references with a way to remove each, SHALL offer the
board's images to pick from with the chosen images first, and SHALL NOT let
a fourth be picked. An image that is only on this device SHALL NOT be
pickable. A reference whose image is no longer on the board SHALL drop off
the prompt, and the panel SHALL say how many did. A prompt with references
SHALL show their labels on its card.

#### Scenario: Pick a portrait for a scene

- **WHEN** the user opens Generate on a prompt of S2, opens «+ Add» and
  clicks the chosen image of the NPC «Padre Anselmo»
- **THEN** the panel shows it under «References» with «1 of 3», the prompt's
  card reads «References: Padre Anselmo», and another device shows the same
  after sync

#### Scenario: Remembered

- **WHEN** the user closes the panel and opens Generate on the same prompt
  again
- **THEN** «Padre Anselmo» is still picked

#### Scenario: Three at most

- **WHEN** three references are picked
- **THEN** the «+ Add» tile is gone and the other images of an open grid are
  disabled

#### Scenario: The image is removed

- **WHEN** the image picked as a reference is removed from the board
- **THEN** the prompt's card no longer lists it and the panel says «1
  reference no longer on the board»

### Requirement: References sent with a generation

A generation SHALL send the prompt's references to the provider with the prompt's text, for every image of the run. Through OpenRouter the images SHALL travel as input references of the image request; through Atelier
they SHALL be passed as Atelier images, uploaded there first when the board
image did not come from Atelier. The server SHALL refuse the generation,
charging nothing, when a reference is not an image of the project, has not
reached the server, is not a PNG, JPEG or WebP, is over 20 MB, or when the
references are over 30 MB together, with a sentence that says which. The
panel's estimate SHALL say that the input images are extra, without a
figure.

#### Scenario: Generate with a reference

- **WHEN** the user generates 2 images on a prompt with one reference
  through OpenRouter
- **THEN** each of the two requests carries one input reference and the two
  images land on the prompt

#### Scenario: Through Atelier

- **WHEN** the provider is Atelier and the reference is a file dropped on
  the board
- **THEN** the server uploads it to Atelier and starts the generation with
  that image's id

#### Scenario: Not on the server yet

- **WHEN** a generation names a reference whose bytes the server does not
  hold
- **THEN** the answer is a refusal reading «A reference image has not
  reached the server yet. Wait for it to sync, or remove it.» and no image
  is requested

### Requirement: References of a generated image

A generated image SHALL record the references it was made with, and the viewer SHALL show them: the labels of those still on the board, and the count of those removed since.

#### Scenario: Viewer

- **WHEN** the user opens an image generated with «Padre Anselmo» as its
  reference
- **THEN** the viewer shows «References · Padre Anselmo» with the model and
  the cost
