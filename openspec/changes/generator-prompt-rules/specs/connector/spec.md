## ADDED Requirements

### Requirement: Image prompt rules follow the generation setting

The server SHALL give each account a prompt style: `generator` when the
image provider chosen in its Settings has its key or token saved, readable,
and usable by this server; `midjourney` otherwise. `get_board` SHALL answer
`imageRules` with the style and the rules for it. The generator rules SHALL
ask for natural prose in English, quoted text for words in the image,
exclusions as a sentence, and no flags except a final `--ar` of 16:9, 3:2,
1:1 or 2:3. The Midjourney rules SHALL be those of today. The style SHALL be
read at every call, so a key saved or deleted takes effect at the next one.

#### Scenario: Account that generates on the board

- **WHEN** an account whose OpenRouter key is saved calls `get_board`
- **THEN** `imageRules.style` is `generator` and its rules name `--ar 2:3`
  and do not name `--v`

#### Scenario: Account without a key

- **WHEN** an account with no key or token saved calls `get_board`
- **THEN** `imageRules.style` is `midjourney` and its rules name
  `--ar 16:9 --v 8.1`

#### Scenario: Key deleted

- **WHEN** the account deletes its key and calls `get_board` again
- **THEN** `imageRules.style` is `midjourney`

## MODIFIED Requirements

### Requirement: Board tool descriptions

The board tools' descriptions SHALL give the shared core of the image prompt
rules (English, most important first, concrete words, no quality tokens, one
idea per prompt) and SHALL say that the rest follows the account's
generation setting and is read from `get_board`'s `imageRules`. They SHALL
give the Suno rules: prompts in English with 4 to 7 style descriptors,
lyrics of meta tags ending `[End]`, instrumental unless asked; and a music
title unique in the project, scenes and General together, since it becomes
the download's filename that matches the track. The server instructions
SHALL name the five image categories, the General music prompts and the
tools that write them, say that image prompts follow the rules in
`imageRules`, and say that a campaign's board has no scenes: General, PCs,
NPCs and Handouts, and General music for the whole campaign.

#### Scenario: Rules in the description

- **WHEN** a client reads `add_image_prompt`'s description
- **THEN** it names `imageRules` and `get_board`, and no `--v`

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
For an account of the `midjourney` style, a prompt whose first words are
another prompt's SHALL be written with a warning naming that prompt. For an
account of the `generator` style, a prompt with flags other than `--ar`
SHALL be written with a warning that they are left out of what is sent.

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

- **WHEN** an account with no key saved adds the NPC Za' Nina with a prompt
  starting «portrait of an old Sicilian fisherwoman singing» while S4's
  prompt 2 starts the same
- **THEN** the prompt is written and the answer warns that its downloads may
  match both

#### Scenario: Midjourney flags on a generating account

- **WHEN** an account whose OpenRouter key is saved adds a prompt ending
  `--ar 2:3 --v 8.1`
- **THEN** the prompt is written and the answer warns «Flags other than --ar
  are left out of what is sent: --v 8.1. Say it in words instead.», and no
  first-words warning is given
