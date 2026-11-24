## ADDED Requirements

### Requirement: General music prompt tools

`add_music_prompt`, `update_music_prompt` and `remove_music_prompt` SHALL
need edit access, count as writes and store no snapshot.
`add_music_prompt` SHALL take a project id, a title, a style and lyrics,
append a General music prompt marked as Claude's and dated now, and answer
its id; it SHALL refuse a campaign (`no_board`), an empty title and texts
over the limits. `update_music_prompt` SHALL take a music prompt id and a
new title, style, lyrics or several, refusing an empty title.
`remove_music_prompt` SHALL take a music prompt id, remove the prompt and
send its tracks to the Unmatched tray, deleting no file, and answer how many
tracks moved. An id that names no General music prompt SHALL answer
`unknown_music`. A title that a scene or another General music prompt
already has SHALL be written with a warning naming it.

#### Scenario: Music prompt added

- **WHEN** Claude calls `add_music_prompt` on «L'Ancora di Sabaoth» with the
  title «Tema di Sabaoth», a style and lyrics
- **THEN** the board's General tab shows its card «by Claude · just now»
  without a reload, and the answer holds the new prompt's id

#### Scenario: Title already used

- **WHEN** Claude adds the General music prompt «Ordini del Re» while S3 has
  that title
- **THEN** the prompt is written and the answer warns that the title is also
  S3's

#### Scenario: Music prompt removed

- **WHEN** Claude calls `remove_music_prompt` on «Tema di Sabaoth», which
  has two tracks
- **THEN** the card leaves the board, the two tracks wait in Unmatched, and
  the answer says 2 tracks moved to Unmatched

#### Scenario: Unknown id

- **WHEN** Claude calls `update_music_prompt` with an id that names no
  General music prompt
- **THEN** the tool answers `unknown_music` and nothing is written

## MODIFIED Requirements

### Requirement: Tools

The endpoint SHALL offer `list_projects`, `get_project`, `create_project`,
`get_outline`, `read_document`, `replace_section`, `add_scene`, `list_todo`,
`add_todo`, `get_inspiration`, `add_inspiration_item`, `list_research`,
`get_research_note`, `save_research_note`, `add_research_topic`,
`get_brainstorm_log`, `add_brainstorm_entry`, `get_board`,
`set_scene_prompts`, `add_image_prompt`, `update_image_prompt`,
`remove_image_prompt`, `add_music_prompt`, `update_music_prompt`,
`remove_music_prompt`, `generate_image`, `attach_atelier_image`,
`list_templates`, `get_template`, `duplicate_template`,
`save_template_version`, `delete_template` and `update_project_template`,
with input schemas, descriptions and annotations. No tool SHALL write the
seed, tick or remove to-do items, or delete anything, except
`remove_image_prompt`, which removes an image prompt and never a file,
`remove_music_prompt`, which removes a General music prompt and never a
file, and `delete_template`, which deletes a document template no project
uses. The descriptions SHALL tell Claude to read a project's brainstorm log
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
- **THEN** the list holds thirty-three tools: `get_board` as a read tool,
  `set_scene_prompts`, `add_image_prompt`, `update_image_prompt`,
  `add_music_prompt`, `update_music_prompt`, `generate_image` and
  `attach_atelier_image` as write tools, and `remove_image_prompt` and
  `remove_music_prompt` as destructive write tools

### Requirement: Board tools

`get_board` SHALL answer, for an adventure or one-shot, one entry per
appendix row with the scene id, title, `visual:` and `mood:` lines, its image
prompts in order and its music (title, style, lyrics, who wrote it and when,
status and track count); the General image prompts, the PCs, the NPCs and
the handouts; the General music prompts, each with its id, title, style,
lyrics, who wrote it and when, status, track count and chosen track; the
scene prompts whose scene has no appendix row; the number of unmatched
files; and the duplicate music titles across scenes and General. Each image
prompt SHALL carry its id, category, scene id or name, number, text, who
wrote it and when, status, image count, chosen file, whether images are
being generated for it and the error of its last generation, if it ended
with one. For a campaign it SHALL answer the error `no_board`. On a project
not yet converted from a single prompt per scene it SHALL answer the
converted board without writing anything.

#### Scenario: Board read

- **WHEN** Claude calls `get_board` on «L'Ancora di Sabaoth», whose S3 has
  two image prompts, the first with four images, none chosen
- **THEN** S3 lists both prompts with their ids, the first with its author
  and date, status received and 4 files

#### Scenario: General music read

- **WHEN** Claude calls `get_board` on a project with the General music
  prompt «Tema di Sabaoth», which has two tracks and the second chosen
- **THEN** the General music lists it with its id, status chosen and 2
  tracks

#### Scenario: Campaign

- **WHEN** Claude calls `get_board` on a campaign
- **THEN** the tool answers the error `no_board`

#### Scenario: A generation in progress

- **WHEN** Claude calls `get_board` while images are being generated on S3's
  first prompt
- **THEN** that prompt reads `generating` true, and after the job ends it
  reads false with one more file or with `generationError` set

### Requirement: Board tool descriptions

The board tools' descriptions SHALL give the prompt rules: Midjourney prompts
in English, subject first, then setting, lighting, style and mood, ending
`--ar 16:9 --v 8.1` for scenes and General establishing shots, `--ar 2:3
--v 8.1` for PC and NPC portraits and for a cover, and the prop's own ratio
for handouts; each image prompt starting with words no other prompt starts
with, since the downloads find their prompt by their first words; Suno
prompts in English with 4 to 7 style descriptors, lyrics of meta tags
ending `[End]`, instrumental unless asked; and a music title unique in the
project, scenes and General together, since it becomes the download's
filename that matches the track. The server instructions SHALL name the five
image categories, the General music prompts and the tools that write them.

#### Scenario: Rules in the description

- **WHEN** a client reads `add_image_prompt`'s description
- **THEN** it names `--ar 16:9`, `--ar 2:3` and that each prompt must start
  with its own words

#### Scenario: Music rules

- **WHEN** a client reads `set_scene_prompts`' or `add_music_prompt`'s
  description
- **THEN** it names `[End]` and that the title must be unique in the project

### Requirement: Adding an image prompt

`add_image_prompt` SHALL need edit access, count as a write and store no
snapshot. It SHALL take a category (`scene`, `general`, `pc`, `npc` or
`handout`), a scene id for a scene prompt or a name for the others, and the
prompt, and append it to its scene or category, marked as Claude's and
dated now. It SHALL refuse a campaign (`no_board`) and a scene id with no
appendix row (`unknown_scene`). A prompt whose first words are another
prompt's SHALL be written with a warning naming that prompt.

#### Scenario: NPC added

- **WHEN** Claude calls `add_image_prompt` with the category `npc`, the name
  «Padre Anselmo» and a prompt
- **THEN** the board's NPCs tab shows his card «by Claude · just now» without
  a reload, and the answer holds the new prompt's id

#### Scenario: General image added

- **WHEN** Claude calls `add_image_prompt` with the category `general`, the
  name «Copertina» and a prompt
- **THEN** the board's General tab shows its card «by Claude · just now»

#### Scenario: Second shot of a scene

- **WHEN** Claude calls `add_image_prompt` with the category `scene`, the
  scene S1, which has one prompt, and a prompt
- **THEN** S1 shows Prompt 1 and Prompt 2

#### Scenario: Same first words

- **WHEN** Claude adds the NPC Za' Nina with a prompt starting «portrait of
  an old Sicilian fisherwoman singing» while S4's prompt 2 starts the same
- **THEN** the prompt is written and the answer warns that its downloads may
  match both
