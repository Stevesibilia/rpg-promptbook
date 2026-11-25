## ADDED Requirements

### Requirement: Board wording follows the generation setting

The board SHALL use Midjourney wording only when it knows the account
cannot generate on the board: the server is not set up for image
generation, or the provider chosen in Settings lacks its key or token, or
is Atelier on a server without an Atelier address. Otherwise, including
while the status loads, when it fails and on the desktop offline, it SHALL
use image wording. The wording quoted by other requirements of this spec
(«Images · Midjourney», «Midjourney prompt for…», «Copy it into
Midjourney.») is the Midjourney wording. The image wording SHALL be: the
section label «Images»; the editors' labels «Image prompt for <label>»; the
placeholder «An image prompt for <scene>…»; «No image prompt yet. Ask
Claude, or write one.»; the PCs, NPCs and Handouts tabs ending «a name,
then an image prompt.»; the Add toast «Added <label>.» with nothing after;
and the Claude card naming «image prompts».

#### Scenario: Account with a key

- **WHEN** a user whose OpenRouter key is saved opens a board and adds the
  NPC «Padre Anselmo»
- **THEN** the scene rows' image half is labelled «Images», the Add editor
  is labelled «Image prompt for the new NPC», and the toast reads «Added
  NPC · Padre Anselmo.»

#### Scenario: Account without a key

- **WHEN** a user with no key or token saved opens a board
- **THEN** the scene rows' image half is labelled «Images · Midjourney» and
  adding a prompt says «Copy it into Midjourney.»

## MODIFIED Requirements

### Requirement: What is sent to the model

The text sent SHALL be the prompt's text before its first Midjourney flag
(a space, `--` and a letter), trimmed. A `--no` list SHALL become the
sentence «No <list>.» at the end, its last «, » turned into « or »; every
other flag SHALL be left out. A prompt without flags SHALL be sent as it is,
trimmed. «What is sent» SHALL show that text; for a prompt with flags it
SHALL be open, read «What is sent: flags left out», mark the added sentence
and show the dropped flags struck through.

#### Scenario: A Midjourney prompt with --no

- **WHEN** the user opens Generate on a prompt ending «smoke and grey sky,
  desaturated --ar 3:2 --v 8.1 --no text, letters, modern buildings»
- **THEN** «What is sent» is open and the text sent ends «smoke and grey
  sky, desaturated. No text, letters or modern buildings.»

#### Scenario: A prose prompt

- **WHEN** the user generates from a prompt with no flags
- **THEN** OpenRouter receives the prompt's text unchanged
