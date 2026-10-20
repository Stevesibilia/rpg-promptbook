## MODIFIED Requirements

### Requirement: Tools

The endpoint SHALL offer `list_projects`, `get_project`, `create_project`,
`get_outline`, `read_document`, `replace_section`, `add_scene`, `list_todo`,
`add_todo`, `get_inspiration`, `add_inspiration_item`, `list_research`,
`get_research_note`, `save_research_note`, `add_research_topic`,
`get_brainstorm_log`, `add_brainstorm_entry`, `get_board` and
`set_scene_prompts`, with input schemas, descriptions and annotations. No tool
SHALL write the seed, tick or remove to-do items, or delete anything. The
descriptions SHALL tell Claude to read a project's brainstorm log first in a
new chat. Everything a tool writes SHALL be marked as Claude's where the data
has an author, and SHALL reach the project's open editors without a reload.

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
- **THEN** the list holds `get_board` as a read tool and `set_scene_prompts`
  as a write tool, beside the other seventeen

## ADDED Requirements

### Requirement: Board tools

`get_board` SHALL answer, for an adventure or one-shot, one row per appendix
row with the scene id, title, `visual:` and `mood:` lines, the image prompt,
the music title, style and lyrics, who wrote each and when, each half's
status and file count, the number of unmatched files, and the duplicate
music titles. For a campaign it SHALL answer the error `no_board`.

#### Scenario: Board read

- **WHEN** Claude calls `get_board` on «L'Ancora di Sabaoth», whose S3 has an
  image prompt and four images, none chosen
- **THEN** the S3 row holds the prompt, its author and date, and the image
  status received with 4 files

#### Scenario: Campaign

- **WHEN** Claude calls `get_board` on a campaign
- **THEN** the tool answers the error `no_board`

### Requirement: Writing a scene's prompts

`set_scene_prompts` SHALL need edit access and take a project id, a scene id,
and an image prompt, a music title, style and lyrics, or both. It SHALL
refuse a scene id with no appendix row (`unknown_scene`) and texts over the
limits, and nothing else: problems in the document SHALL NOT refuse it. It
SHALL overwrite the fields it is given, marked as Claude's and dated now,
and SHALL store no snapshot: prompts are not versioned.

#### Scenario: Prompts written

- **WHEN** Claude calls `set_scene_prompts` for S2 with an image prompt and a
  music title, style and lyrics
- **THEN** the board's S2 row shows both prompts «by Claude · just now»
  without a reload, and History lists no new snapshot

#### Scenario: Only the image

- **WHEN** Claude calls `set_scene_prompts` for S3 with an image prompt only
- **THEN** S3's image prompt is replaced and its music prompt is unchanged

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
`--ar 16:9 --v 8.1`, one prompt per scene; Suno prompts in English with 4 to
7 style descriptors, lyrics of meta tags ending `[End]`, instrumental unless
asked; and a music title unique in the project, since it becomes the
download's filename that matches the track.

#### Scenario: Rules in the description

- **WHEN** a client reads `set_scene_prompts`' description
- **THEN** it names `--ar 16:9 --v 8.1`, `[End]` and that the title must be
  unique in the project
