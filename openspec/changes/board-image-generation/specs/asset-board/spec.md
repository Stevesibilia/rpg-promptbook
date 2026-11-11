## MODIFIED Requirements

### Requirement: The halves of a row

Each scene row SHALL have an «Images · Midjourney» half and a «Music · Suno»
half. The image half SHALL show the scene's `visual:` line read-only (or
«empty») with «Edit in the document», the count of its image prompts and of
those chosen («3 prompts · 1 chosen»), then one block per image prompt in
order, «Prompt 1», «Prompt 2»…, each with its status, its prompt, author and
age, Copy, Edit, Generate, a Remove button and its images, and under them
«Add image prompt». The music half SHALL stay as it is: the `mood:` line, one
Suno prompt, its tracks.

#### Scenario: Source line

- **WHEN** S2's appendix row has a `visual:` line and no `mood:` line
- **THEN** the image half shows the `visual:` text and the music half shows
  «mood: empty», each with «Edit in the document»

#### Scenario: Three prompts in a scene

- **WHEN** S1 has three image prompts, the first with a chosen image, the
  second with four images and the third with none
- **THEN** S1's image half reads «3 prompts · 1 chosen» and shows Prompt 1
  Chosen, Prompt 2 Received and Prompt 3 Wanted

### Requirement: Image viewer

Opening an image SHALL show the viewer: the image in its own shape, «2 of 4»
with previous and next (also ← and →) through its prompt's images, the scene
and title or the category and name, the file name, Prompt, Size, Dimensions,
Matched by, Added, Status («Chosen for this prompt», «Another image is
chosen», «None chosen yet»), the strip of the prompt's images, «Choose for
this prompt» (or «✓ Chosen · click to unchoose»), «Move to another prompt…»
with every other prompt grouped by category, and Remove. Esc SHALL close it.
For a generated image, Matched by SHALL give way to Source «Generated», Model
with the model's full name, and Cost in dollars with three decimals, or
«unknown» when OpenRouter reported none.

#### Scenario: Move

- **WHEN** the user moves the second image of S3's prompt 1 to the NPC Turi
  from the viewer
- **THEN** it shows on Turi's card and the toast says «Moved to NPC · Turi.»

#### Scenario: A generated image

- **WHEN** the user opens an image of S1's prompt 2 generated with GPT Image
  2.6 Sunburst at a cost of $0.033
- **THEN** the viewer shows Source «Generated», Model «GPT Image 2.6
  Sunburst» and Cost «$0.033», and no Matched by

## ADDED Requirements

### Requirement: Generate on every image prompt

Every image prompt with text, in every category, SHALL have a **Generate**
button after Copy and Edit. It SHALL open the panel «Generate images» with:
the two models as cards, «GPT Image 2.6» («Best detail and text», «≈ $0.04 ·
53 s per image») and «Nano Banana 2.1» («Fast draft», «≈ $0.04 · 17 s per
image»); «Images» from 1 to 4; «Shape» among 16:9, 3:2, 1:1 and 2:3 with
where its default comes from; «What is sent»; and a footer with the
estimated price and the resolution («About $0.08 · 1K»), Cancel and «Generate
N». The panel SHALL start from the user's defaults for Generate and keep the
last model and count chosen for the rest of the page session. The shape
SHALL default to the prompt's `--ar` when it is one of the four, else the
nearest of them by ratio, else 16:9 for a scene, 2:3 for a PC or an NPC and
1:1 for a handout. A prompt with no image SHALL read «No images yet. Generate
them, or drop downloaded files here.»

#### Scenario: Defaults

- **WHEN** the user's defaults are GPT Image 2.6 and 2 images, and the user
  presses Generate on S2's prompt 1, whose text has no flags
- **THEN** the panel shows GPT Image 2.6 chosen, 2 images, 16:9 with «default
  for Scenes», and «About $0.08 · 1K»

#### Scenario: An NPC's portrait

- **WHEN** the user presses Generate on Capitano Donato's card in NPCs
- **THEN** the panel opens with the shape 2:3 and «default for NPCs»

#### Scenario: Last choice kept

- **WHEN** the user picks Nano Banana 2.1 and 4 images on one prompt,
  closes the panel and opens it on another prompt
- **THEN** the panel shows Nano Banana 2.1 and 4 images

#### Scenario: Shape from the prompt

- **WHEN** a prompt ends `--ar 3:2 --v 8.1`
- **THEN** the panel's shape is 3:2 with «from the prompt's --ar»

#### Scenario: Shape near the prompt's

- **WHEN** a scene prompt ends `--ar 21:9`
- **THEN** the panel's shape is 16:9

### Requirement: What is sent to the model

The text sent SHALL be the prompt's text before its first Midjourney flag
(a space, `--` and a letter), trimmed. A `--no` list SHALL become the
sentence «No <list>.» at the end, its last «, » turned into « or »; every
other flag SHALL be left out. A prompt without flags SHALL be sent as it is,
trimmed. «What is sent» SHALL show that text; for a prompt with flags it
SHALL be open, read «What is sent: Midjourney flags left out», mark the added
sentence and show the dropped flags struck through.

#### Scenario: A Midjourney prompt with --no

- **WHEN** the user opens Generate on a prompt ending «smoke and grey sky,
  desaturated --ar 3:2 --v 8.1 --no text, letters, modern buildings»
- **THEN** «What is sent» is open and the text sent ends «smoke and grey
  sky, desaturated. No text, letters or modern buildings.»

#### Scenario: A prose prompt

- **WHEN** the user generates from a prompt with no flags
- **THEN** OpenRouter receives the prompt's text unchanged

### Requirement: Generation runs on the server

Generate SHALL ask the server, which SHALL call OpenRouter once per image,
the images in parallel, and keep going when the page is left. While a job
runs, every device with the board open SHALL show, on that prompt, the
images arrived so far, one placeholder per image still to come, and the line
«Generating i of n with <model> · Ns. It keeps going if you leave this
page.», and Generate SHALL be disabled on that prompt. A job not finished
after 15 minutes SHALL be treated as ended.

#### Scenario: Progress on another device

- **WHEN** the user starts 4 images on S2's prompt 1 in the browser and opens
  the same board in the desktop app
- **THEN** the desktop shows the images already arrived, placeholders for
  the others and the «Generating» line, and the images arrive there by sync

#### Scenario: Leaving the page

- **WHEN** the user starts a job and goes to the document before it ends
- **THEN** the images are on the board when the user comes back

#### Scenario: One job per prompt

- **WHEN** a job runs on a prompt and a second Generate for it reaches the
  server
- **THEN** the server refuses it with 409 `busy` and the first job goes on

### Requirement: Generated images on the board

Each generated image SHALL land on its prompt as a received image, like a
dropped file, marked new on the board that watched it arrive, named
`<label>-<model>-<n>.<ext>`, with its width and height, the model that made
it and the cost OpenRouter reported. Its thumbnail SHALL show the badge «GPT ·
$0.04» or «Nano Banana · $0.04», or «… · cost unknown» when no cost was
reported. A file dropped from Midjourney SHALL get no such badge. When a job
the user started ends without an error, the board SHALL toast «<n> images for
<prompt> · $x.xx».

#### Scenario: Two images arrive

- **WHEN** the user generates 2 images with GPT Image 2.6 on S2's prompt 1
  and OpenRouter reports $0.041 and $0.033
- **THEN** S2's prompt 1 is Received with two images marked new, badged «GPT
  · $0.04» and «GPT · $0.03», and the toast reads «2 images for S2 · prompt 1
  · $0.07»

#### Scenario: Exported like any image

- **WHEN** a board with generated images is exported for CueBard
- **THEN** the pack holds the chosen generated image as it holds a dropped
  one

### Requirement: Generation errors

A failed image SHALL record no cost. When images of a job fail, the prompt
SHALL show OpenRouter's reason in plain words with «Try again», which opens
the panel, and a dismiss button, on every device, until dismissed or until
the next Generate on that prompt: «OpenRouter rejected your key. Check it in
Settings → Image generation.» for 401; «OpenRouter refused: your key has no
credit left. Add credit on openrouter.ai, then try again.» for 402;
«OpenRouter is busy (rate limit). Try again in a minute.» for 429;
«OpenRouter refused this prompt (content policy).» for a moderation refusal;
«OpenRouter did not answer. Try again.» for a timeout, a server error or no
answer. Images of the job that arrived SHALL stay, and the reason SHALL then
read «<f> of <n> images failed: <reason>». When no image arrived the line
SHALL add «Nothing was charged.».

#### Scenario: No credit left

- **WHEN** OpenRouter answers 402 to every image of a job
- **THEN** the prompt shows «OpenRouter refused: your key has no credit left.
  Add credit on openrouter.ai, then try again. Nothing was charged.» with Try
  again, and no cost is recorded

#### Scenario: Some images fail

- **WHEN** 2 of 4 images time out
- **THEN** the two that arrived stay on the prompt and the line reads «2 of 4
  images failed: OpenRouter did not answer. Try again.»

#### Scenario: Not an image

- **WHEN** OpenRouter answers 200 with no image in `data`
- **THEN** that image counts as failed and the others of the job still land

### Requirement: Generate without a key

While the user has no OpenRouter key, Generate SHALL still show, and its panel
SHALL say «Add your OpenRouter key first. Images are billed to your
OpenRouter account.» with «Open Settings → Image generation». While the
server is not configured for image generation, the panel SHALL say «This
server is not set up for image generation.».

#### Scenario: First Generate

- **WHEN** a user without a key presses Generate and then «Open Settings →
  Image generation»
- **THEN** Settings opens on Image generation with the key input

### Requirement: Generate route

The server SHALL answer
`POST /api/projects/:id/image-prompts/:promptId/generate` with `model`
(`gpt` or `nb`), `count` (1 to 4) and `shape` with 202 and the job's id, and
run the job in the background. It SHALL check, in this order: a
session (401); the project is the user's and not in the bin (404); the server
is configured (503 `not_configured`); the user has a key that can be read
(409 `no_key`); the prompt exists and is not removed (404), and has text
(400); no job runs on it (409 `busy`); the user's quota has room for 20 MB
per image (507 `quota`). It SHALL send OpenRouter the model's id, the text of
«What is sent», the shape and the resolution `1K`.

#### Scenario: No key

- **WHEN** a user without a key posts to the generate route
- **THEN** the server answers 409 `no_key` and calls nothing

#### Scenario: Prompt removed

- **WHEN** the prompt was removed before the request
- **THEN** the server answers 404 and starts no job

#### Scenario: What OpenRouter receives

- **WHEN** the user generates 2 images with Nano Banana 2.1 in 3:2
- **THEN** OpenRouter receives two calls with the model
  `google/gemini-nano-banana-2.1`, `aspect_ratio` `3:2` and `resolution`
  `1K`

### Requirement: Spending of a project

Each image asked of OpenRouter SHALL be recorded with its project, prompt,
model, cost and whether it arrived. `GET /api/projects/:id/image-spending`
SHALL answer the number and total cost of the project's images that arrived,
all time, to its owner only. The board's header SHALL show «Generated here: N
images · $x.xx» from it, hidden when N is 0 and while offline. Removing an
image SHALL NOT remove its cost.

#### Scenario: Header total

- **WHEN** the project has three generated images that cost $0.12
- **THEN** the board's header reads «Generated here: 3 images · $0.12»

#### Scenario: Removed image keeps its cost

- **WHEN** the user removes one of those images
- **THEN** the header still reads «Generated here: 3 images · $0.12»

#### Scenario: Nothing generated

- **WHEN** the project has no generated image
- **THEN** the header shows no total

### Requirement: Thumbnails of generated images

A generated image SHALL arrive without a thumbnail and SHALL show the
original scaled until one exists. The first device that shows it on the
board SHALL make its 480 px thumbnail, store it and record it, only if no
other device did first.

#### Scenario: Thumbnail made once

- **WHEN** a generated image arrives while the board is open in two browsers
- **THEN** the image ends with one thumbnail, and both show it
