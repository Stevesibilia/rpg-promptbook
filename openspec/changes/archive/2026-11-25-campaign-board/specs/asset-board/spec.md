## ADDED Requirements

### Requirement: Campaign board

A campaign SHALL have a board with the tabs «General», «PCs», «NPCs» and
«Handouts», in that order, and no Scenes tab, opening on General when the
address names no tab. Its document SHALL never be read for an appendix. Its
lead SHALL read «Images and music for the whole campaign, with PCs, NPCs
and handouts. For the table and the CueBard export.» and its status bar
«Campaign · N image prompts · M general music». Every tab SHALL work as on
an adventure.

#### Scenario: Campaign board

- **WHEN** the user opens «Images and music» on the campaign «Kulthos»,
  which has two General images, three General music prompts, four PCs, six
  NPCs and three handouts
- **THEN** the board shows the tabs «General 5», «PCs 4», «NPCs 6» and
  «Handouts 3», General open, and the status bar reads «Campaign · 15 image
  prompts · 3 general music»

#### Scenario: Empty campaign board

- **WHEN** the user opens the board of a campaign with no prompt
- **THEN** it opens on General with the card «Prompts come from Claude» and
  «Nothing general yet», and every tab reads «none yet»

#### Scenario: No scenes on a campaign

- **WHEN** the user opens a campaign's board at `?tab=scenes`
- **THEN** General opens and no «Add the appendix» shows

#### Scenario: Files on a campaign

- **WHEN** the user drops `tema della campagna.mp3` on a campaign whose
  General music prompt is «Tema della campagna»
- **THEN** the track lands on that card, and a track whose title matches no
  General music prompt waits in Unmatched

### Requirement: Campaign wording

On a campaign the board SHALL say «campaign» where an adventure's says
«adventure»: the General hint, the PC, NPC and handout hints, the empty
General tab, and the example name «Copertina della campagna» of a new
General image. Where an adventure's board names scenes, a campaign's SHALL
not: the tray's «Assign to music…», the track menu's «Move to another music
prompt…», and removing a music prompt's «…where you can assign them to
another music prompt.».

#### Scenario: General hint on a campaign

- **WHEN** the user opens General on a campaign with General items
- **THEN** the hint reads «General images and music belong to the whole
  campaign, not to a scene. Their files find them by filename, like the
  others.»

#### Scenario: Assign a track on a campaign

- **WHEN** a track waits in Unmatched on a campaign with the General music
  prompt «Combattimento»
- **THEN** its select reads «Assign to music…» with the one group «General»
  holding «Combattimento»

## MODIFIED Requirements

### Requirement: Board view

The rail's Images and music entry SHALL open `/projects/<id>/board` for an
adventure, a one-shot or a campaign, following
[docs/mockups/board.html](../../../docs/mockups/board.html): the heading
«Images and music», the lead (for an adventure or one-shot «Images and
music for each scene and for the whole adventure, with PCs, NPCs and
handouts. For the table and the CueBard export.»; for a campaign see
Campaign board), «How matching works», «Export for CueBard…» and «Add
files…», then the category tabs. The Scenes tab SHALL show one row per
`### S…` of the appendix, in its order.

#### Scenario: Rows from the appendix

- **WHEN** the user opens the board of «L'Ancora di Sabaoth», whose appendix
  has rows S1 to S6
- **THEN** the Scenes tab shows six rows, each with its id and title and
  «Open the scene in the document»

#### Scenario: Rows follow the document

- **WHEN** the user renames S4's appendix row in the Document view and opens
  the board
- **THEN** the S4 row shows the new title and keeps its prompts and files

#### Scenario: Export from the board

- **WHEN** the user clicks «Export for CueBard…» in the board's header
- **THEN** the dialog «Export for CueBard» opens with the summary of the
  pack

### Requirement: Prompts come from Claude

The board SHALL show, while no image prompt in any category has text, no
scene has a music title and no General music prompt exists, the card
«Prompts come from Claude» on every tab, with the request, its Copy button
and the hint naming Settings → Connected apps. On an adventure or one-shot
it SHALL say that Claude writes Midjourney prompts for the scenes, the PCs,
the NPCs and the handouts, one Suno prompt per scene, and General images
and music for the whole adventure, with the request «Write the image and
music prompts for the board of «<project title>», with portraits of the PCs
and NPCs, the handouts, and general images and music». A scene with no
image prompt SHALL say «No image prompts yet. Ask Claude, or write one.»
with «Add image prompt»; a scene with no music prompt SHALL say «No Suno
prompt yet. Ask Claude, or write one.» with «Write by hand».

#### Scenario: New board

- **WHEN** the user opens the board of a project whose appendix has rows and
  no prompts
- **THEN** the Claude card shows with the project's title in the request

#### Scenario: Only General music

- **WHEN** the project's only prompt is the General music prompt «Tema di
  Sabaoth»
- **THEN** the Claude card does not show

#### Scenario: Campaign card

- **WHEN** the user opens the board of the campaign «Kulthos» with no
  prompt
- **THEN** the card says «Claude reads the campaign and writes General
  images and music for it, like a cover and a main theme, and Midjourney
  prompts for the PCs, the NPCs and the handouts. Ask in a chat on
  claude.ai:» with the request «Write the image and music prompts for the
  board of «Kulthos»: general images and music, portraits of the PCs and
  NPCs, and the handouts»

### Requirement: Image categories

The board SHALL hold any number of image prompts in five categories shown as
tabs «Scenes», «General», «PCs», «NPCs» and «Handouts», in that order; a
campaign SHALL show only the last four. Each tab SHALL show its number of
prompts (on General, image and music prompts together) and a second line:
«none yet», «N wanted», «N received» or «all chosen». The active tab SHALL
be kept in the address. Only Scene prompts SHALL be tied to a scene;
General, PCs, NPCs and Handouts SHALL be project-wide, each item a name and
a Midjourney prompt. Music SHALL be one Suno prompt per scene, plus any
number of General music prompts.

#### Scenario: Tab counts

- **WHEN** the project has four PCs, two of them without images
- **THEN** the PCs tab reads «PCs 4» with «2 wanted»

#### Scenario: General tab count

- **WHEN** General holds three images and three music prompts, two of the
  six without files
- **THEN** the General tab reads «General 6» with «2 wanted»

#### Scenario: Tab kept on reload

- **WHEN** the user opens General and reloads the page
- **THEN** the board opens on General

### Requirement: General tab

The board SHALL have a tab «General», after Scenes on an adventure and
first on a campaign, holding images and music that belong to the whole
project and to no scene. It SHALL show a section «Images · Midjourney» with
«N images · M chosen», one card per General image prompt (a name and a
Midjourney prompt, as a PC's card) and the add card «Add image»; then a
section «Music · Suno» with «N music prompts · M chosen», one card per
General music prompt and the add card «Add music prompt»; then the hint
«General images and music belong to the whole adventure, not to a scene.
Their files find them by filename, like the others.» («the whole campaign»
on a campaign). With no General item it SHALL show «Nothing general yet»,
what General is for, «Add image», «Add music prompt» and the hint that
Claude can write them too. «Add image» SHALL work as «Add NPC», toasting
«Added General · <name>. Copy it into Midjourney.»; an empty name SHALL
become «New image».

#### Scenario: General tab

- **WHEN** the project has three General images, one with a chosen image,
  and three General music prompts, one with a chosen track, and the user
  opens General
- **THEN** the tab shows the Images section «3 images · 1 chosen» with three
  cards and «Add image», and the Music section «3 music prompts · 1 chosen»
  with three cards and «Add music prompt»

#### Scenario: Empty General tab

- **WHEN** the project has no General item and the user opens General
- **THEN** the tab says «Nothing general yet» with «Add image» and «Add
  music prompt»

#### Scenario: Add a General image

- **WHEN** the user presses Add image, names it «Messina dopo il terremoto»,
  writes a prompt and presses Add
- **THEN** its card shows Wanted and the toast says «Added General · Messina
  dopo il terremoto. Copy it into Midjourney.»

#### Scenario: Empty General tab on a campaign

- **WHEN** the campaign «Kulthos» has no General item and the user opens
  General
- **THEN** the tab says «Images and music for the whole campaign, not tied
  to a scene: establishing shots, a cover, a main theme, ambience, combat
  music.» and «Claude can write them too: ask for "the general images and
  music of «Kulthos»".»

### Requirement: Narrow windows

Below 760 px of width the board SHALL hide the rail and the status bar, keep
its tabs in one row, scrolling it sideways when they do not fit, stack each
row's halves, show the General, PC, NPC and handout cards one per line, show
two landscape images per line (four portrait ones), keep the tray in the
flow, and always show the choose badges; below 900 px the viewer SHALL put
its details under the image.

#### Scenario: Phone

- **WHEN** the board opens on a 390 px wide screen
- **THEN** the tabs sit in one row, the halves stack and landscape images
  show two per line

#### Scenario: Campaign on a phone

- **WHEN** a campaign's board opens on a 390 px wide screen
- **THEN** its four tabs sit in one row and the General cards show one per
  line

### Requirement: How matching works

«How matching works», in the header and in the tray, SHALL open the popover
«How files find their prompt» with the Midjourney rule, the Suno rule,
«Two matches» and «Other files» as in the mockup, the examples built from
the project's own first scene prompt, first General, PC, NPC or handout
prompt, first scene music title and first General music title when it has
them. On an adventure or one-shot the rules SHALL name Scenes, General,
PCs, NPCs and Handouts and the track title of a scene or of a General music
prompt; on a campaign they SHALL name only General, PCs, NPCs and Handouts
and the track title of a General music prompt.

#### Scenario: Help from the tray

- **WHEN** the user presses How matching works in the Unmatched tray
- **THEN** the popover opens at the top of the board

#### Scenario: General example

- **WHEN** the project has the General music prompt «Tema di Sabaoth» and
  the user opens the popover
- **THEN** the Suno rule shows `tema di sabaoth.mp3` going to «General ·
  Tema di Sabaoth»

#### Scenario: Help on a campaign

- **WHEN** the user opens the popover on a campaign
- **THEN** the Midjourney rule reads «…in any category: General, PCs, NPCs
  or Handouts.», the Suno rule «The filename is the track title of a
  General music prompt. A second take gets "(1)".», and no example names a
  scene
