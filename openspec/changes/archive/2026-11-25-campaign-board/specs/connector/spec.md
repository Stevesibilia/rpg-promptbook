## MODIFIED Requirements

### Requirement: Board tools

`get_board` SHALL answer, for an adventure, a one-shot or a campaign, one
entry per appendix row with the scene id, title, `visual:` and `mood:`
lines, its image prompts in order and its music (title, style, lyrics, who
wrote it and when, status and track count); the General image prompts, the
PCs, the NPCs and the handouts; the General music prompts, each with its
id, title, style, lyrics, who wrote it and when, status, track count and
chosen track; the scene prompts whose scene has no appendix row; the number
of unmatched files; and the duplicate music titles across scenes and
General. Each image prompt SHALL carry its id, category, scene id or name,
number, text, who wrote it and when, status, image count, chosen file,
whether images are being generated for it and the error of its last
generation, if it ended with one. A campaign has no appendix: its scenes
and its scene prompts outside the appendix SHALL be empty. On a project not
yet converted from a single prompt per scene it SHALL answer the converted
board without writing anything.

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

- **WHEN** Claude calls `get_board` on the campaign «Kulthos», which has the
  General image «Copertina della campagna» and the NPC «Padre Anselmo»
- **THEN** the tool answers its board with no scenes, the General image and
  the NPC with their ids

#### Scenario: A generation in progress

- **WHEN** Claude calls `get_board` while images are being generated on S3's
  first prompt
- **THEN** that prompt reads `generating` true, and after the job ends it
  reads false with one more file or with `generationError` set

### Requirement: Writing a scene's prompts

`set_scene_prompts` SHALL need edit access and take a project id, a scene id,
and an image prompt, a music title, style and lyrics, or both. The image
prompt SHALL replace the text of the scene's first image prompt, creating it
when the scene has none. It SHALL refuse a campaign (`not_an_adventure`),
a scene id with no appendix row (`unknown_scene`) and texts over the
limits, and nothing else: problems in the document SHALL NOT refuse it. It
SHALL overwrite the fields it is given, marked as Claude's and dated now,
and SHALL store no snapshot: prompts are not versioned.

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

#### Scenario: Scene prompts on a campaign

- **WHEN** Claude calls `set_scene_prompts` on a campaign
- **THEN** the tool answers `not_an_adventure`, saying a campaign has no
  scenes and naming the General, PC, NPC and handout categories and
  `add_music_prompt`, and nothing is written

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
image categories, the General music prompts and the tools that write them,
and say that a campaign's board has no scenes: General, PCs, NPCs and
Handouts, and General music for the whole campaign.

#### Scenario: Rules in the description

- **WHEN** a client reads `add_image_prompt`'s description
- **THEN** it names `--ar 16:9`, `--ar 2:3` and that each prompt must start
  with its own words

#### Scenario: Music rules

- **WHEN** a client reads `set_scene_prompts`' or `add_music_prompt`'s
  description
- **THEN** it names `[End]` and that the title must be unique in the project

#### Scenario: Campaigns in the instructions

- **WHEN** a client reads the server instructions
- **THEN** they say that a campaign's board has no scenes and holds General,
  PCs, NPCs and Handouts and General music

### Requirement: Adding an image prompt

`add_image_prompt` SHALL need edit access, count as a write and store no
snapshot. It SHALL take a category (`scene`, `general`, `pc`, `npc` or
`handout`), a scene id for a scene prompt or a name for the others, and the
prompt, and append it to its scene or category, marked as Claude's and
dated now. It SHALL refuse the category `scene` on a campaign
(`not_an_adventure`) and a scene id with no appendix row (`unknown_scene`).
A prompt whose first words are another prompt's SHALL be written with a
warning naming that prompt.

#### Scenario: NPC added

- **WHEN** Claude calls `add_image_prompt` with the category `npc`, the name
  «Padre Anselmo» and a prompt
- **THEN** the board's NPCs tab shows his card «by Claude · just now» without
  a reload, and the answer holds the new prompt's id

#### Scenario: General image added

- **WHEN** Claude calls `add_image_prompt` with the category `general`, the
  name «Copertina» and a prompt
- **THEN** the board's General tab shows its card «by Claude · just now»

#### Scenario: General image on a campaign

- **WHEN** Claude calls `add_image_prompt` on the campaign «Kulthos» with
  the category `general`, the name «Copertina della campagna» and a prompt
- **THEN** the campaign's board shows its card on General «by Claude · just
  now» without a reload

#### Scenario: Scene prompt on a campaign

- **WHEN** Claude calls `add_image_prompt` on a campaign with the category
  `scene`
- **THEN** the tool answers `not_an_adventure` and nothing is written

#### Scenario: Second shot of a scene

- **WHEN** Claude calls `add_image_prompt` with the category `scene`, the
  scene S1, which has one prompt, and a prompt
- **THEN** S1 shows Prompt 1 and Prompt 2

#### Scenario: Same first words

- **WHEN** Claude adds the NPC Za' Nina with a prompt starting «portrait of
  an old Sicilian fisherwoman singing» while S4's prompt 2 starts the same
- **THEN** the prompt is written and the answer warns that its downloads may
  match both

### Requirement: General music prompt tools

`add_music_prompt`, `update_music_prompt` and `remove_music_prompt` SHALL
need edit access, count as writes and store no snapshot, on an adventure, a
one-shot or a campaign. `add_music_prompt` SHALL take a project id, a
title, a style and lyrics, append a General music prompt marked as Claude's
and dated now, and answer its id; it SHALL refuse an empty title and texts
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

#### Scenario: Music prompt on a campaign

- **WHEN** Claude calls `add_music_prompt` on the campaign «Kulthos» with
  the title «Tema della campagna», a style and lyrics
- **THEN** the campaign's General tab shows its card «by Claude · just now»
  without a reload

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
