## ADDED Requirements

### Requirement: Generating images through the connector

`generate_image` SHALL start a generation on one image prompt exactly as the
board's Generate does: through the account's provider, with the same checks
and limits, counted together with generations started from the board. It
SHALL take the project, the prompt and, optionally, the model, the count (1
to 4), the shape and how long to wait (0 to 50 seconds, 45 when not given).
A model or count not given SHALL be the account's setting; a shape not given
SHALL be the one the panel would pick for the prompt. The tool SHALL wait
for the job to end or for the wait to pass, SHALL never stop the job, and
SHALL answer the job id, the prompt, the provider, model, count and shape
used, whether the job is finished or running, the images that arrived (name,
width, height, cost and Atelier id), the number that failed and the job's
error. Images it generates SHALL be marked as Claude's. Its description
SHALL say that it spends the user's money. A refusal SHALL carry a code and
a sentence a model can act on, and SHALL start nothing.

#### Scenario: Two images generated

- **WHEN** Claude calls `generate_image` on S2's prompt 1 with count 2 and
  both images arrive within the wait
- **THEN** the answer says finished with two images and their costs, and
  the board shows S2's prompt 1 Received with two images added by Claude

#### Scenario: Defaults

- **WHEN** the account's settings are GPT Image 2.6 and 2 images, and
  Claude calls `generate_image` on a PC prompt with only the two ids
- **THEN** 2 images are generated with GPT Image 2.6 in the shape 2:3

#### Scenario: Still running

- **WHEN** the images have not arrived when the wait passes
- **THEN** the answer says running with the images so far, and the job goes
  on

#### Scenario: No key

- **WHEN** the account has no key or token for its provider
- **THEN** the tool answers the error `no_key` and nothing is started

#### Scenario: Already generating

- **WHEN** a generation is running on that prompt, started from the board
- **THEN** the tool answers the error `busy`

#### Scenario: Read grant

- **WHEN** a client whose grant is read-only calls `generate_image`
- **THEN** the tool answers `insufficient_scope` and nothing is started

### Requirement: Attaching an Atelier image through the connector

`attach_atelier_image` SHALL take a project, an image prompt and the id of
an image in the user's Atelier, download the original from Atelier with the
account's Atelier token, and add it to the prompt as a received image. It
SHALL take the three ids and nothing else: no URL and no image bytes. It
SHALL work whichever provider the account generates through. It SHALL accept
PNG, JPEG and WebP by the file's bytes, within the image size limit and the
account's quota. It SHALL answer the prompt, the Atelier id, the file's
name, type, size, width and height, and whether the same image was already
on the board; attaching the same image again SHALL add nothing. Every
refusal SHALL leave the board as it was and SHALL carry a code and a
sentence a model can act on: `no_atelier_token` without a readable token,
`atelier_unavailable` on a server without an Atelier address,
`atelier_image_not_found` for an id Atelier does not know, `token_rejected`
when Atelier rejects the token, `unsupported_type` for another kind of file,
`quota` when the account's files are full. The token SHALL never appear in
an answer or an error.

#### Scenario: Image attached

- **WHEN** Claude calls `attach_atelier_image` with an NPC prompt and the id
  of a 1024×1536 PNG in the user's Atelier
- **THEN** the answer names the new file, `image/png`, 1024 by 1536, and
  `get_board` shows the prompt with one more file

#### Scenario: Attached twice

- **WHEN** Claude attaches the same Atelier image to the same project again
- **THEN** the answer says it was already there and the board has no new
  file

#### Scenario: No token

- **WHEN** the account has no Atelier token saved
- **THEN** the tool answers `no_atelier_token` with «Add your Atelier API
  token in Promptbook’s Settings first.»

#### Scenario: Unknown image

- **WHEN** the id is not an image Atelier knows
- **THEN** the tool answers `atelier_image_not_found` and the board is
  unchanged

#### Scenario: Unknown prompt

- **WHEN** the prompt id is not an image prompt of the project
- **THEN** the tool answers `unknown_prompt` and Atelier is not called

## MODIFIED Requirements

### Requirement: Tools

The endpoint SHALL offer `list_projects`, `get_project`, `create_project`,
`get_outline`, `read_document`, `replace_section`, `add_scene`, `list_todo`,
`add_todo`, `get_inspiration`, `add_inspiration_item`, `list_research`,
`get_research_note`, `save_research_note`, `add_research_topic`,
`get_brainstorm_log`, `add_brainstorm_entry`, `get_board`,
`set_scene_prompts`, `add_image_prompt`, `update_image_prompt`,
`remove_image_prompt`, `generate_image`, `attach_atelier_image`,
`list_templates`, `get_template`,
`duplicate_template`, `save_template_version`, `delete_template` and
`update_project_template`, with input schemas, descriptions and
annotations. No tool SHALL write the seed, tick or remove to-do items, or
delete anything, except `remove_image_prompt`, which removes an image prompt
and never a file, and `delete_template`, which deletes a document template
no project uses. The descriptions SHALL tell Claude to read a project's
brainstorm log first in a new chat. Everything a tool writes SHALL be marked
as Claude's where the data has an author, and SHALL reach the project's open
editors without a reload.

#### Scenario: Brainstorm entry saved

- **WHEN** Claude calls `add_brainstorm_entry` with a title, two ideas, a
  rejected idea with why and an open question
- **THEN** the project's brainstorm log has that entry first, via Claude,
  dated now

#### Scenario: Project created

- **WHEN** Claude calls `create_project` with the title «La fiera di
  Randazzo» and the category one-shot
- **THEN** a draft one-shot exists with the user's one-shot skeleton and
  to-do template and no seed

#### Scenario: Board tools listed

- **WHEN** a client lists the endpoint's tools
- **THEN** the list holds thirty tools: `get_board` as a read tool, `set_scene_prompts`,
  `add_image_prompt`, `update_image_prompt`, `generate_image` and
  `attach_atelier_image` as write tools, and `remove_image_prompt` as a destructive write tool

### Requirement: Board tools

`get_board` SHALL answer, for an adventure or one-shot, one entry per
appendix row with the scene id, title, `visual:` and `mood:` lines, its image
prompts in order and its music (title, style, lyrics, who wrote it and when,
status and track count); the PCs, the NPCs and the handouts; the scene
prompts whose scene has no appendix row; the number of unmatched files; and
the duplicate music titles. Each image prompt SHALL carry its id, category,
scene id or name, number, text, who wrote it and when, status, image count,
chosen file, whether images are being generated for it and the error of its
last generation, if it ended with one. For a campaign it SHALL answer the error `no_board`. On a
project not yet converted from a single prompt per scene it SHALL answer the
converted board without writing anything.

#### Scenario: Board read

- **WHEN** Claude calls `get_board` on «L'Ancora di Sabaoth», whose S3 has
  two image prompts, the first with four images, none chosen
- **THEN** S3 lists both prompts with their ids, the first with its author
  and date, status received and 4 files

#### Scenario: Campaign

- **WHEN** Claude calls `get_board` on a campaign
- **THEN** the tool answers the error `no_board`

#### Scenario: A generation in progress

- **WHEN** Claude calls `get_board` while images are being generated on S3's
  first prompt
- **THEN** that prompt reads `generating` true, and after the job ends it
  reads false with one more file or with `generationError` set
