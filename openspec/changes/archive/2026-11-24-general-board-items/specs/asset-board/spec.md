## ADDED Requirements

### Requirement: General tab

The board SHALL have a tab «General», after Scenes, holding images and music
that belong to the whole adventure and to no scene. It SHALL show a section
«Images · Midjourney» with «N images · M chosen», one card per General image
prompt (a name and a Midjourney prompt, as a PC's card) and the add card
«Add image»; then a section «Music · Suno» with «N music prompts · M
chosen», one card per General music prompt and the add card «Add music
prompt»; then the hint «General images and music belong to the whole
adventure, not to a scene. Their files find them by filename, like the
others.». With no General item it SHALL show «Nothing general yet», what
General is for, «Add image», «Add music prompt» and the hint that Claude can
write them too. «Add image» SHALL work as «Add NPC», toasting «Added General
· <name>. Copy it into Midjourney.»; an empty name SHALL become «New image».

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

### Requirement: General music prompts

The board SHALL hold any number of General music prompts, each a Suno
prompt with Title, Style and Lyrics, who wrote it and when, its tracks and
at most one chosen track. Each card SHALL show the title as its name, its
status, Remove, the parts with their Copy buttons and «The download's
filename. Used to match tracks.» under Title, the line «Instrumental: ON ·
Weirdness: low · Style Influence: strong», the author and age, Edit, and its
tracks as a scene's music half shows them. «Add music prompt» SHALL open a
card «New music prompt» with Title, Style and Lyrics, «Suno names the
download after the title.», Cancel and Add; Add SHALL refuse an empty title
with «Write the title first: it is how its tracks find it.» and otherwise
append the prompt as the user's and toast «Added General · <title>. Copy it
into Suno.». Nothing SHALL be written before Add.

#### Scenario: Add a music prompt

- **WHEN** the user presses Add music prompt, writes the title «La scossa»,
  a style and lyrics, and presses Add
- **THEN** the Music section shows the card «La scossa», Wanted, and the
  toast says «Added General · La scossa. Copy it into Suno.»

#### Scenario: Title missing

- **WHEN** the user presses Add on a new music prompt with no title
- **THEN** nothing is written and the toast says «Write the title first: it
  is how its tracks find it.»

#### Scenario: Copy a General title

- **WHEN** the user presses Copy beside the title of «Tema di Sabaoth»
- **THEN** the clipboard holds «Tema di Sabaoth» and the button reads
  «Copied»

### Requirement: Removing a General music prompt

Each General music prompt SHALL have a Remove button that asks «Remove this
music prompt?», «General · <title> leaves the board.» and «Its N tracks move
to Unmatched, where you can assign them to a scene or another music
prompt.» (or «It has no tracks yet.»), then removes the prompt and toasts
«Music prompt removed. N tracks in Unmatched.» (or «Music prompt
removed.»). Its tracks SHALL wait in Unmatched with «Its prompt was
removed.»; no file SHALL be deleted. A removal SHALL win over an edit of the
same prompt made at the same time on another device.

#### Scenario: Remove a music prompt with tracks

- **WHEN** the user removes «Tema di Sabaoth», which has two tracks, and
  confirms
- **THEN** its card leaves the board, the two tracks wait in Unmatched with
  «Its prompt was removed.», and the toast says «Music prompt removed. 2
  tracks in Unmatched.»

#### Scenario: Removed while edited elsewhere

- **WHEN** the user removes «La scossa» on the web while the desktop app,
  offline, edits its style, and the app comes back online
- **THEN** «La scossa» stays removed on both

## MODIFIED Requirements

### Requirement: Board view

The rail's Images and music entry SHALL open `/projects/<id>/board` for an
adventure or one-shot, following
[docs/mockups/board.html](../../../docs/mockups/board.html): the heading
«Images and music», the lead «Images and music for each scene and for the
whole adventure, with PCs, NPCs and handouts. For the table and the CueBard
export.», «How matching works», «Export for CueBard…» and «Add files…», then
the category tabs. The Scenes tab SHALL show one row per `### S…` of the
appendix, in its order.

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

### Requirement: Status per half

Each image prompt SHALL have a status derived from its images and never
stored: Wanted (no image), Received (images, none chosen) or Chosen; each
scene's music and each General music prompt SHALL have the same status from
its tracks. The summary line and the filters All, Wanted, Received and
Chosen SHALL work inside the active tab: on Scenes the summary SHALL count
the scenes, the image prompts by status and the music by status, and a
filter SHALL keep the rows with at least one image prompt or the music in
that state, dimming the rest; on General the summary SHALL count the images
by status and the music by status, and a filter SHALL keep the cards of
either section in that state; on PCs, NPCs and Handouts the summary SHALL
count that tab's prompts by status and a filter SHALL keep the cards in
that state.

#### Scenario: Filter Wanted

- **WHEN** S4 has a prompt with images, a prompt with none, and tracks, and
  the user picks Wanted
- **THEN** S4 shows with its first prompt and its music half dimmed

#### Scenario: Summary

- **WHEN** six scenes hold eight image prompts, three with a chosen image,
  four with images and one with none
- **THEN** the Scenes summary reads «6 scenes · 8 image prompts: 3 chosen, 4
  received, 1 wanted · music …»

#### Scenario: Summary on General

- **WHEN** General holds three images (one chosen, one received, one wanted)
  and three music prompts (one chosen, one received, one wanted)
- **THEN** the summary reads «3 images: 1 chosen, 1 received, 1 wanted · 3
  music: 1 chosen, 1 received, 1 wanted» and the filter Wanted shows 2

#### Scenario: Summary on NPCs

- **WHEN** of six NPCs one has a chosen image, two have images and three have
  none, and the user opens NPCs
- **THEN** the summary reads «6 NPCs · 1 chosen, 2 received, 3 wanted»

#### Scenario: Filter with nothing in it

- **WHEN** no handout is wanted and the user picks Wanted on Handouts
- **THEN** the tab says «No Handouts are wanted.» with «Show all»

### Requirement: Prompts come from Claude

The board SHALL show, while no image prompt in any category has text, no
scene has a music title and no General music prompt exists, the card
«Prompts come from Claude» on every tab, saying that Claude writes
Midjourney prompts for the scenes, the PCs, the NPCs and the handouts, one
Suno prompt per scene, and General images and music for the whole
adventure, with the request «Write the image and music prompts for the
board of «<project title>», with portraits of the PCs and NPCs, the
handouts, and general images and music» and its Copy button, and the hint
naming Settings → Connected apps. A scene with no image prompt SHALL say «No
image prompts yet. Ask Claude, or write one.» with «Add image prompt»; a
scene with no music prompt SHALL say «No Suno prompt yet. Ask Claude, or
write one.» with «Write by hand».

#### Scenario: New board

- **WHEN** the user opens the board of a project whose appendix has rows and
  no prompts
- **THEN** the Claude card shows with the project's title in the request

#### Scenario: Only General music

- **WHEN** the project's only prompt is the General music prompt «Tema di
  Sabaoth»
- **THEN** the Claude card does not show

### Requirement: Edit a prompt by hand

Edit SHALL open the prompt in place: a text area for an image prompt, with
Name above it for a General image, a PC, an NPC or a handout, and the hint
«Claude can rewrite it later.»; or Title, Style and Lyrics with «Suno names
the download after the title.» for a scene's music or a General music
prompt; then Cancel and Save. Save SHALL overwrite the prompt as the
user's, dated now, and toast «Saved.». Saving an empty image prompt SHALL be
refused with «Write the prompt first: its first words are how its images find
it.»; saving a General music prompt with an empty title SHALL be refused
with «Write the title first: it is how its tracks find it.»; an empty name
SHALL become «New image», «New PC», «New NPC» or «New Handout». Prompts
SHALL NOT be versioned.

#### Scenario: Save

- **WHEN** the user edits S2's prompt 1 and presses Save
- **THEN** the block shows the new prompt «edited by you · just now» and the
  toast says «Saved.»

#### Scenario: Cancel

- **WHEN** the user changes S2's style and presses Cancel
- **THEN** the style is unchanged and nothing is written

#### Scenario: Rename an NPC

- **WHEN** the user edits Turi's card, changes the name to «Turi Lo Presti»
  and presses Save
- **THEN** the card is titled «Turi Lo Presti» and keeps its prompt and
  images

#### Scenario: Retitle a General music prompt

- **WHEN** the user edits «Tra le macerie», changes the title to «Tra le
  rovine» and presses Save
- **THEN** the card is titled «Tra le rovine», keeps its tracks, and the
  toast says «Saved.»

### Requirement: Suno tracks find their scene

A track SHALL go to the scene, or to the General music prompt, whose music
title equals its file name without the extension and a trailing « (n)»,
compared without case, accents, spaces or punctuation; otherwise it SHALL
wait in Unmatched with «No track title "<name>".». A title held by two or
more scenes or General music prompts SHALL show the warning «Title used
twice» on each of them, and its tracks SHALL wait in Unmatched with
«Several music prompts have the track title "<title>".».

#### Scenario: Second take

- **WHEN** the user drops `dominus deus sabaoth (1).mp3` and S5's title is
  «Dominus Deus Sabaoth»
- **THEN** the track is in S5 as a second take

#### Scenario: A General track

- **WHEN** the user drops `tra le macerie.mp3` and the General music prompt
  «Tra le macerie» exists
- **THEN** the track is on that card as its first take

#### Scenario: Same title twice

- **WHEN** S3 and S4 both have the title «Ordini del Re»
- **THEN** both rows warn that the title is used twice, and a track named
  `ordini del re.mp3` waits in Unmatched

#### Scenario: Same title in a scene and in General

- **WHEN** S1's title and a General music prompt's title are both «Cinque e
  venti»
- **THEN** S1's row and the General card warn that the title is used twice,
  and `cinque e venti.mp3` waits in Unmatched

### Requirement: Result of a drop

After a drop the board SHALL show the line «N files added: M matched, K to
assign.» followed by the files per scene («S3: 4 images, 2 tracks») and per
General item, PC, NPC or handout («NPCs · Padre Anselmo: 4 images»,
«General · Tra le macerie: 1 track»), each a link to its tab, and «New files
are marked.», with a button to dismiss it; the new files SHALL carry the
mark «new» until the next drop or until the board is left, and a tab
holding a new file SHALL show a dot.

#### Scenario: Batch result

- **WHEN** 18 files are dropped and 15 match S3, S5 and Padre Anselmo
- **THEN** the line reads «18 files added: 15 matched, 3 to assign.» with the
  counts for S3, S5 and «NPCs · Padre Anselmo», the 15 files are marked new,
  and the Scenes and NPCs tabs show a dot

#### Scenario: A General track in the batch

- **WHEN** a drop holds `tra le macerie (1).mp3` and «Tra le macerie» is a
  General music prompt
- **THEN** the line names «General · Tra le macerie: 1 track» and the
  General tab shows a dot

### Requirement: Unmatched tray

The tray «Unmatched» SHALL hold files with no prompt or scene, files whose
prompt was removed, and files of a scene with no appendix row, pinned
above the tab's content on every tab, with «N files», «Their names match no
prompt or track title, or more than one prompt.», «Match again» and «How
matching works». Each file SHALL show its name, its kind and the reason
(«Its prompt was removed.» for a removed prompt's image or a removed General
music prompt's track), «Assign to prompt…» for an image (every prompt
grouped by Scenes, General, PCs, NPCs and Handouts; for an image matching
several prompts, those first under «Its name matches») or «Assign to scene
or music…» for a track (the scenes, then the General music prompts), and
Remove. Match again SHALL assign each tray file that now matches exactly one
prompt, scene or General music prompt.

#### Scenario: Assign by hand

- **WHEN** the user assigns an unmatched image to the NPC Padre Anselmo
- **THEN** it leaves the tray, shows on his card marked new, and the toast
  says «Assigned to NPCs · Padre Anselmo.»

#### Scenario: Assign a track to General music

- **WHEN** the user assigns the unmatched track `untitled track.mp3` to the
  General music prompt «La scossa»
- **THEN** it leaves the tray, shows on that card marked new, and the toast
  says «Assigned to General · La scossa.»

#### Scenario: Assign an ambiguous image

- **WHEN** the user opens «Assign to prompt…» on an image marked «matches 2
  prompts» and picks «NPCs · Za' Nina» from «Its name matches»
- **THEN** it leaves the tray, shows on Za' Nina's card marked new, and the
  toast says «Assigned to NPCs · Za' Nina.»

#### Scenario: Scene dropped from the appendix

- **WHEN** S6's appendix row is deleted while S6 has a prompt with four
  images and two tracks
- **THEN** the six files wait in Unmatched with «Scene S6 is not in the
  appendix.» and S6's prompts are kept, not shown, until the row returns

### Requirement: How matching works

«How matching works», in the header and in the tray, SHALL open the popover
«How files find their prompt» with the Midjourney rule (any category:
Scenes, General, PCs, NPCs or Handouts), the Suno rule (the track title of
a scene or of a General music prompt), «Two matches» (including that a
track title used twice, in scenes or General, warns on both and its tracks
wait in Unmatched) and «Other files» as in the mockup, the examples built
from the project's own first scene prompt, first General, PC, NPC or
handout prompt, first scene music title and first General music title when
it has them.

#### Scenario: Help from the tray

- **WHEN** the user presses How matching works in the Unmatched tray
- **THEN** the popover opens at the top of the board

#### Scenario: General example

- **WHEN** the project has the General music prompt «Tema di Sabaoth» and
  the user opens the popover
- **THEN** the Suno rule shows `tema di sabaoth.mp3` going to «General ·
  Tema di Sabaoth»

### Requirement: Choosing a file

Each image SHALL have a round badge that chooses it for its prompt or, when
chosen, unchooses it; each track SHALL have Choose, or «✓ Chosen» to
unchoose. One image per image prompt and one track per scene or General
music prompt at most SHALL be chosen, and the prompt's other images SHALL
dim.

#### Scenario: Choose an image

- **WHEN** the user presses the badge of the second image of S3's prompt 1
- **THEN** that prompt's status is Chosen and its other three images dim,
  and S3's other prompts are unchanged

#### Scenario: Choose a General track

- **WHEN** the user presses Choose on the second take of «Tema di Sabaoth»
- **THEN** that card's status is Chosen and its first take reads Choose

### Requirement: Tracks

Each track SHALL show Play (Pause while it plays, one track at a time), its
file name, «Take n», its duration, Choose, and a small menu with «Move to
another scene or music…» (the scenes, then the General music prompts) and
«Remove», the image viewer's actions. Playing SHALL stream the file with
seeking.

#### Scenario: Play and seek

- **WHEN** the user plays S1's first take and moves to its middle
- **THEN** the track plays from there and any other track stops

#### Scenario: Move a track

- **WHEN** the user picks Move to another scene or music… on S3's second
  take and chooses S4
- **THEN** the track shows in S4 and the toast says «Moved to S4 · Torre Faro
  e la canzone.»

#### Scenario: Move a track to General music

- **WHEN** the user moves S2's track to the General music prompt «Tra le
  macerie»
- **THEN** the track shows on that card and the toast says «Moved to General
  · Tra le macerie.»

### Requirement: Narrow windows

Below 760 px of width the board SHALL hide the rail and the status bar, keep
the five tabs in one row, scrolling it sideways when they do not fit, stack
each row's halves, show the General, PC, NPC and handout cards one per
line, show two landscape images per line (four portrait ones), keep the
tray in the flow, and always show the choose badges; below 900 px the viewer
SHALL put its details under the image.

#### Scenario: Phone

- **WHEN** the board opens on a 390 px wide screen
- **THEN** the tabs sit in one row, the halves stack and landscape images
  show two per line

### Requirement: Image categories

The board SHALL hold any number of image prompts in five categories shown as
tabs «Scenes», «General», «PCs», «NPCs» and «Handouts», in that order. Each
tab SHALL show its number of prompts (on General, image and music prompts
together) and a second line: «none yet», «N wanted», «N received» or «all
chosen». The active tab SHALL be kept in the address. Only Scene prompts
SHALL be tied to a scene; General, PCs, NPCs and Handouts SHALL be
project-wide, each item a name and a Midjourney prompt. Music SHALL be one
Suno prompt per scene, plus any number of General music prompts.

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
