## MODIFIED Requirements

### Requirement: Tools

The endpoint SHALL offer `list_projects`, `get_project`, `create_project`,
`get_outline`, `read_document`, `replace_section`, `add_scene`, `list_todo`,
`add_todo`, `get_inspiration`, `add_inspiration_item`, `list_research`,
`get_research_note`, `save_research_note`, `add_research_topic`,
`get_brainstorm_log`, `add_brainstorm_entry`, `get_board`,
`set_scene_prompts`, `add_image_prompt`, `update_image_prompt` and
`remove_image_prompt`, with input schemas, descriptions and annotations. No
tool SHALL write the seed, tick or remove to-do items, or delete anything,
except `remove_image_prompt`, which removes an image prompt and never a
file. The descriptions SHALL tell Claude to read a project's brainstorm log
first in a new chat. Everything a tool writes SHALL be marked as Claude's
where the data has an author, and SHALL reach the project's open editors
without a reload.

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
- **THEN** the list holds twenty-two tools: `get_board` as a read tool,
  `set_scene_prompts`, `add_image_prompt` and `update_image_prompt` as write
  tools, and `remove_image_prompt` as a destructive write tool

### Requirement: Board tools

`get_board` SHALL answer, for an adventure or one-shot, one entry per
appendix row with the scene id, title, `visual:` and `mood:` lines, its image
prompts in order and its music (title, style, lyrics, who wrote it and when,
status and track count); the PCs, the NPCs and the handouts; the scene
prompts whose scene has no appendix row; the number of unmatched files; and
the duplicate music titles. Each image prompt SHALL carry its id, category,
scene id or name, number, text, who wrote it and when, status, image count
and chosen file. For a campaign it SHALL answer the error `no_board`. On a
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

### Requirement: Writing a scene's prompts

`set_scene_prompts` SHALL need edit access and take a project id, a scene id,
and an image prompt, a music title, style and lyrics, or both. The image
prompt SHALL replace the text of the scene's first image prompt, creating it
when the scene has none. It SHALL refuse a scene id with no appendix row
(`unknown_scene`) and texts over the limits, and nothing else: problems in
the document SHALL NOT refuse it. It SHALL overwrite the fields it is given,
marked as Claude's and dated now, and SHALL store no snapshot: prompts are
not versioned.

#### Scenario: Prompts written

- **WHEN** Claude calls `set_scene_prompts` for S2 with an image prompt and a
  music title, style and lyrics
- **THEN** the board's S2 row shows prompt 1 and the music prompt «by Claude
  · just now» without a reload, and History lists no new snapshot

#### Scenario: Only the image

- **WHEN** Claude calls `set_scene_prompts` for S3 with an image prompt only,
  and S3 has two image prompts
- **THEN** S3's prompt 1 is replaced, its prompt 2 and its music prompt are
  unchanged

#### Scenario: Scene not in the appendix

- **WHEN** Claude calls `set_scene_prompts` for S9, which has no appendix row
- **THEN** the tool answers `unknown_scene` and nothing is written

#### Scenario: Document with errors

- **WHEN** the document has two errors and Claude calls `set_scene_prompts`
  for S1
- **THEN** the prompts are written

#### Scenario: Duplicate title

- **WHEN** Claude sets the music title «Ordini del Re» on S4 while S3 has it
- **THEN** the prompts are written and the answer carries a warning naming S3

### Requirement: Board tool descriptions

The board tools' descriptions SHALL give the prompt rules: Midjourney prompts
in English, subject first, then setting, lighting, style and mood, ending
`--ar 16:9 --v 8.1` for scenes, `--ar 2:3 --v 8.1` for PC and NPC portraits,
and the prop's own ratio for handouts; each image prompt starting with words
no other prompt starts with, since the downloads find their prompt by their
first words; Suno prompts in English with 4 to 7 style descriptors, lyrics
of meta tags ending `[End]`, instrumental unless asked; and a music title
unique in the project, since it becomes the download's filename that
matches the track. The server instructions SHALL name the four image
categories and the tools that write them.

#### Scenario: Rules in the description

- **WHEN** a client reads `add_image_prompt`'s description
- **THEN** it names `--ar 16:9`, `--ar 2:3` and that each prompt must start
  with its own words

#### Scenario: Music rules

- **WHEN** a client reads `set_scene_prompts`' description
- **THEN** it names `[End]` and that the title must be unique in the project

## ADDED Requirements

### Requirement: Adding an image prompt

`add_image_prompt` SHALL need edit access, count as a write and store no
snapshot. It SHALL take a category (`scene`, `pc`, `npc` or `handout`), a
scene id for a scene prompt or a name for the others, and the prompt, and
append it to its scene or category, marked as Claude's and dated now. It
SHALL refuse a campaign (`no_board`) and a scene id with no appendix row
(`unknown_scene`). A prompt whose first words are another prompt's SHALL be
written with a warning naming that prompt.

#### Scenario: NPC added

- **WHEN** Claude calls `add_image_prompt` with the category `npc`, the name
  «Padre Anselmo» and a prompt
- **THEN** the board's NPCs tab shows his card «by Claude · just now» without
  a reload, and the answer holds the new prompt's id

#### Scenario: Second shot of a scene

- **WHEN** Claude calls `add_image_prompt` with the category `scene`, the
  scene S1, which has one prompt, and a prompt
- **THEN** S1 shows Prompt 1 and Prompt 2

#### Scenario: Same first words

- **WHEN** Claude adds the NPC Za' Nina with a prompt starting «portrait of
  an old Sicilian fisherwoman singing» while S4's prompt 2 starts the same
- **THEN** the prompt is written and the answer warns that its downloads may
  match both

### Requirement: Changing or removing an image prompt

`update_image_prompt` and `remove_image_prompt` SHALL need edit access, count
as writes and store no snapshot. `update_image_prompt` SHALL take a prompt id
and a new text, a new name (not for a scene prompt), or both.
`remove_image_prompt` SHALL take a prompt id, remove the prompt and send its
images to the Unmatched tray, deleting no file. An id that names no prompt
SHALL answer `unknown_prompt`.

#### Scenario: Prompt removed

- **WHEN** Claude calls `remove_image_prompt` on S1's prompt 2, which has four
  images
- **THEN** S1 keeps its other prompts, the four images wait in Unmatched, and
  the answer says 4 images moved to Unmatched

#### Scenario: Read scope

- **WHEN** a client with a `read` grant calls `remove_image_prompt`
- **THEN** the call fails with `insufficient_scope` and the prompt stays
