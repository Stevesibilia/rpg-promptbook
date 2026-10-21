# asset-board Specification

## Purpose

TBD - created by archiving change asset-board. Update Purpose after archive.

## Requirements

### Requirement: Board view

The rail's Images and music entry SHALL open `/projects/<id>/board` for an
adventure or one-shot, following
[docs/mockups/board.html](../../../docs/mockups/board.html): the heading
«Images and music», the lead «Image prompts for scenes, PCs, NPCs and
handouts; music for each scene. For the table and the CueBard export.»,
«How matching works», «Export for CueBard…» and «Add files…», then the
category tabs. The Scenes tab SHALL show one row per `### S…` of the
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

### Requirement: The halves of a row

Each scene row SHALL have an «Images · Midjourney» half and a «Music · Suno»
half. The image half SHALL show the scene's `visual:` line read-only (or
«empty») with «Edit in the document», the count of its image prompts and of
those chosen («3 prompts · 1 chosen»), then one block per image prompt in
order, «Prompt 1», «Prompt 2»…, each with its status, its prompt, author and
age, Copy, Edit, a Remove button and its images, and under them «Add image
prompt». The music half SHALL stay as it is: the `mood:` line, one Suno
prompt, its tracks.

#### Scenario: Source line

- **WHEN** S2's appendix row has a `visual:` line and no `mood:` line
- **THEN** the image half shows the `visual:` text and the music half shows
  «mood: empty», each with «Edit in the document»

#### Scenario: Three prompts in a scene

- **WHEN** S1 has three image prompts, the first with a chosen image, the
  second with four images and the third with none
- **THEN** S1's image half reads «3 prompts · 1 chosen» and shows Prompt 1
  Chosen, Prompt 2 Received and Prompt 3 Wanted

### Requirement: Prompts with Copy

Every image prompt, in every category, SHALL show its Midjourney prompt with
one Copy button. The music half SHALL show Title (with «The download's
filename. Used to match tracks.»), Style and Lyrics, each with its Copy
button, and the line «Instrumental: ON · Weirdness: low · Style Influence:
strong». Copy SHALL put the text on the clipboard and read «Copied» for a
moment.

#### Scenario: Copy the style

- **WHEN** the user presses Copy beside S3's Style
- **THEN** the clipboard holds the style text and the button reads «Copied»

#### Scenario: Copy an NPC's prompt

- **WHEN** the user presses Copy on Padre Anselmo's card
- **THEN** the clipboard holds his Midjourney prompt and the button reads
  «Copied»

### Requirement: Status per half

Each image prompt SHALL have a status derived from its images and never
stored: Wanted (no image), Received (images, none chosen) or Chosen; each
scene's music SHALL have the same status from its tracks. The summary line
and the filters All, Wanted, Received and Chosen SHALL work inside the
active tab: on Scenes the summary SHALL count the scenes, the image prompts
by status and the music by status, and a filter SHALL keep the rows with at
least one image prompt or the music in that state, dimming the rest; on PCs,
NPCs and Handouts the summary SHALL count that tab's prompts by status and a
filter SHALL keep the cards in that state.

#### Scenario: Filter Wanted

- **WHEN** S4 has a prompt with images, a prompt with none, and tracks, and
  the user picks Wanted
- **THEN** S4 shows with its first prompt and its music half dimmed

#### Scenario: Summary

- **WHEN** six scenes hold eight image prompts, three with a chosen image,
  four with images and one with none
- **THEN** the Scenes summary reads «6 scenes · 8 image prompts: 3 chosen, 4
  received, 1 wanted · music …»

#### Scenario: Summary on NPCs

- **WHEN** of six NPCs one has a chosen image, two have images and three have
  none, and the user opens NPCs
- **THEN** the summary reads «6 NPCs · 1 chosen, 2 received, 3 wanted»

#### Scenario: Filter with nothing in it

- **WHEN** no handout is wanted and the user picks Wanted on Handouts
- **THEN** the tab says «No Handouts are wanted.» with «Show all»

### Requirement: Prompts come from Claude

The board SHALL show, while no image prompt in any category has text and no
scene has a music title, the card «Prompts come from Claude» on every tab,
saying that Claude writes Midjourney prompts for the scenes, the PCs, the
NPCs and the handouts and one Suno prompt per scene, with the request «Write
the image and music prompts for the board of «<project title>», with
portraits of the PCs and NPCs and the handouts» and its Copy button, and the
hint naming Settings → Connected apps. A scene with no image prompt SHALL say
«No image prompts yet. Ask Claude, or write one.» with «Add image prompt»; a
scene with no music prompt SHALL say «No Suno prompt yet. Ask Claude, or
write one.» with «Write by hand».

#### Scenario: New board

- **WHEN** the user opens the board of a project whose appendix has rows and
  no prompts
- **THEN** the Claude card shows with the project's title in the request

### Requirement: Edit a prompt by hand

Edit SHALL open the prompt in place: a text area for an image prompt, with
Name above it for a PC, an NPC or a handout, and the hint «Claude can rewrite
it later.»; or Title, Style and Lyrics with «Suno names the download after
the title.»; then Cancel and Save. Save SHALL overwrite the prompt as the
user's, dated now, and toast «Saved.». Saving an empty image prompt SHALL be
refused with «Write the prompt first: its first words are how its images find
it.»; an empty name SHALL become «New PC», «New NPC» or «New Handout».
Prompts SHALL NOT be versioned.

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

### Requirement: No appendix

When the document has no appendix, or one with no rows, the Scenes tab SHALL
show «No scenes for the board yet» with the example appendix, «Add the
appendix» and «Open the document». Add the appendix SHALL write `## Appendice:
immagini e musica` (or use the one there) and one row per scene with empty
`visual:` and `mood:` lines, and toast «Appendix added with N scenes. Fill in
visual: and mood:, or ask Claude.». The PCs, NPCs and Handouts tabs, «Add
files…», «How matching works» and dropping files SHALL work without an
appendix.

#### Scenario: Add the appendix

- **WHEN** a one-shot with six scenes and no appendix opens the board and the
  user presses Add the appendix
- **THEN** the document ends with the appendix heading and rows S1 to S6, and
  the Scenes tab shows six rows with «visual: empty»

#### Scenario: NPCs without an appendix

- **WHEN** a document has no appendix and the user adds the NPC «Padre
  Anselmo» and drops four images named after his prompt
- **THEN** the NPCs tab shows his card with the four images

### Requirement: Adding files

Files dropped anywhere on the board, or picked with Add files…, SHALL be
added to the project. While files are dragged over the board an overlay SHALL
say «Drop images and tracks», «They find their prompt by filename, in any
category.», «Files that match no prompt, or more than one, wait in
Unmatched.» and the count of images and tracks. Only PNG, JPEG and WebP
images and MP3, M4A, AAC, WAV, Ogg and FLAC tracks SHALL be taken.

#### Scenario: Drop a batch

- **WHEN** the user drags 18 files, 14 images and 4 tracks, over the board
- **THEN** the overlay reads «18 files · 14 images, 4 tracks»

### Requirement: Midjourney images find their prompt

An image named `<user>_<words>_<job uuid>[_<n>].<png|jpg|jpeg|webp>` SHALL go
to the image prompt, in any category, whose text starts with those words,
compared without case, accents, spaces or punctuation. Scene prompts whose
scene has no appendix row and prompts with no text SHALL NOT be matched. With
no such prompt it SHALL go to the Unmatched tray saying «No prompt starts
with "<first words>".»; with two or more it SHALL go to the tray marked
«matches N prompts» with those prompts named.

#### Scenario: Four images to one scene

- **WHEN** the user drops the four files
  `steve_ruined_doctors_office_in_1908_Messina_anatomical_<uuid>_0.png` to
  `…_3.png` and S2's prompt 1 starts «ruined doctor's office in 1908 Messina,
  anatomical…»
- **THEN** the four images are in S2's prompt 1, matched by the prompt's
  first words

#### Scenario: An NPC portrait

- **WHEN** the user drops `steve_portrait_of_an_old_Sicilian_priest_<uuid>_0.png`
  and the NPC Padre Anselmo's prompt starts «portrait of an old Sicilian
  priest in a torn cassock»
- **THEN** the image is on Padre Anselmo's card

#### Scenario: Two prompts start alike

- **WHEN** S4's prompt 2 and the NPC Za' Nina's prompt both start «portrait
  of an old Sicilian fisherwoman singing» and an image with those words is
  dropped
- **THEN** it waits in Unmatched with «matches 2 prompts» and «S4 · prompt 2
  and NPC · Za' Nina. Pick one.»

#### Scenario: Prompt changed in Midjourney

- **WHEN** an image's words start no prompt
- **THEN** it waits in Unmatched with «No prompt starts with "a vast
  cathedral nave flooded".»

### Requirement: Suno tracks find their scene

A track SHALL go to the scene whose music title equals its file name without
the extension and a trailing « (n)», compared without case, accents, spaces
or punctuation; otherwise it SHALL wait in Unmatched with «No track title
"<name>".». Two scenes with the same music title SHALL show a warning on
both rows, and their tracks SHALL wait in Unmatched.

#### Scenario: Second take

- **WHEN** the user drops `dominus deus sabaoth (1).mp3` and S5's title is
  «Dominus Deus Sabaoth»
- **THEN** the track is in S5 as a second take

#### Scenario: Same title twice

- **WHEN** S3 and S4 both have the title «Ordini del Re»
- **THEN** both rows warn that the title is used twice, and a track named
  `ordini del re.mp3` waits in Unmatched

### Requirement: Files already in the project

A file whose content is already in the project SHALL be skipped and counted
as already here; the file on the user's disk SHALL never be touched.

#### Scenario: Same batch twice

- **WHEN** the user drops the same 14 files a second time
- **THEN** nothing is added and the result line says the 14 are already here

### Requirement: Result of a drop

After a drop the board SHALL show the line «N files added: M matched, K to
assign.» followed by the files per scene («S3: 4 images, 2 tracks») and per
PC, NPC or handout («NPCs · Padre Anselmo: 4 images»), each a link to its
tab, and «New files are marked.», with a button to dismiss it; the new files
SHALL carry the mark «new» until the next drop or until the board is left,
and a tab holding a new file SHALL show a dot.

#### Scenario: Batch result

- **WHEN** 18 files are dropped and 15 match S3, S5 and Padre Anselmo
- **THEN** the line reads «18 files added: 15 matched, 3 to assign.» with the
  counts for S3, S5 and «NPCs · Padre Anselmo», the 15 files are marked new,
  and the Scenes and NPCs tabs show a dot

### Requirement: Unmatched tray

The tray «Unmatched» SHALL hold files with no prompt or scene, files whose
prompt was removed, and files of a scene with no appendix row, pinned
above the tab's content on every tab, with «N files», «Their names match no
prompt or track title, or more than one prompt.», «Match again» and «How
matching works». Each file SHALL show its name, its kind and the reason
(«Its prompt was removed.» for a removed prompt's image), «Assign to
prompt…» for an image (every prompt grouped by Scenes, PCs, NPCs and
Handouts; for an image matching several prompts, those first under «Its name
matches») or «Assign to scene…» for a track, and Remove. Match again SHALL
assign each tray file that now matches exactly one prompt or scene.

#### Scenario: Assign by hand

- **WHEN** the user assigns an unmatched image to the NPC Padre Anselmo
- **THEN** it leaves the tray, shows on his card marked new, and the toast
  says «Assigned to NPCs · Padre Anselmo.»

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
«How files find their prompt» with the Midjourney rule (any category), the
Suno rule, «Two matches» and «Other files» as in the mockup, the examples
built from the project's own first scene prompt, first PC, NPC or handout,
and first music title when it has them.

#### Scenario: Help from the tray

- **WHEN** the user presses How matching works in the Unmatched tray
- **THEN** the popover opens at the top of the board

### Requirement: Choosing a file

Each image SHALL have a round badge that chooses it for its prompt or, when
chosen, unchooses it; each track SHALL have Choose, or «✓ Chosen» to
unchoose. One image per image prompt and one track per scene at most SHALL
be chosen, and the prompt's other images SHALL dim.

#### Scenario: Choose an image

- **WHEN** the user presses the badge of the second image of S3's prompt 1
- **THEN** that prompt's status is Chosen and its other three images dim,
  and S3's other prompts are unchanged

### Requirement: Image viewer

Opening an image SHALL show the viewer: the image in its own shape, «2 of 4»
with previous and next (also ← and →) through its prompt's images, the scene
and title or the category and name, the file name, Prompt, Size, Dimensions,
Matched by, Added, Status («Chosen for this prompt», «Another image is
chosen», «None chosen yet»), the strip of the prompt's images, «Choose for
this prompt» (or «✓ Chosen · click to unchoose»), «Move to another prompt…»
with every other prompt grouped by category, and Remove. Esc SHALL close it.

#### Scenario: Move

- **WHEN** the user moves the second image of S3's prompt 1 to the NPC Turi
  from the viewer
- **THEN** it shows on Turi's card and the toast says «Moved to NPC · Turi.»

### Requirement: Removing a file

Remove SHALL ask «Remove this image?», «Image 2 leaves S3 · <title> · prompt
1.» (for a PC, NPC or handout «Image 2 leaves NPC · <name>.»; for a track
«Remove this track?», «Take 2 leaves S3 · <title>.») with «The file in your
Downloads folder is not touched.», then take the file off the project (a
chosen one leaves its prompt or scene unchosen) and toast «Image removed.»
(or «Track removed.»); from the tray it SHALL remove at once and toast
«Removed <name>.».

#### Scenario: Remove the chosen image

- **WHEN** the user removes the chosen image of S1's prompt 1 and confirms
- **THEN** that prompt's status is Received and the toast says Image
  removed.

#### Scenario: Remove a track

- **WHEN** the user removes S1's second take from its menu and confirms
- **THEN** S1 lists one take and the toast says Track removed.

### Requirement: Tracks

Each track SHALL show Play (Pause while it plays, one track at a time), its
file name, «Take n», its duration, Choose, and a small menu with «Move to
another scene…» and «Remove», the image viewer's actions. Playing SHALL
stream the file with seeking.

#### Scenario: Play and seek

- **WHEN** the user plays S1's first take and moves to its middle
- **THEN** the track plays from there and any other track stops

#### Scenario: Move a track

- **WHEN** the user picks Move to another scene… on S3's second take and
  chooses S4
- **THEN** the track shows in S4 and the toast says «Moved to S4 · Torre Faro
  e la canzone.»

### Requirement: Uploading in the browser

In the browser files SHALL be uploaded as they are added, with «Uploading n
of N», and SHALL appear in the project for other devices only once uploaded.
A failed upload SHALL stay on the board with Retry until the page is closed.

#### Scenario: Upload fails

- **WHEN** the server stops during a drop of 14 files after 9 uploads
- **THEN** 9 files are in the project, 5 show Retry, and Retry once the
  server is back adds them

### Requirement: File upload route

`PUT /api/projects/:id/files/:sha256` SHALL take the raw bytes with their
length, stream them to disk, and keep them only when their SHA-256 is the
one named, answering 201, or 200 when the project already has them. It SHALL
answer 400 `hash_mismatch`, 404 for a project that is not the user's or is
in the bin, 411 without a length, and 413 `file_too_large`.

#### Scenario: Wrong hash

- **WHEN** a client uploads bytes whose SHA-256 is not the one in the path
- **THEN** the server answers 400 `hash_mismatch` and keeps nothing

#### Scenario: Retry

- **WHEN** a client uploads the same file to the same project twice
- **THEN** the second answer is 200 and one copy is kept

### Requirement: File types and limits

The server SHALL decide the type from the first bytes, not from the name or
header: PNG, JPEG and WebP images up to 40 MB, MP3, M4A, AAC, WAV, Ogg and
FLAC tracks up to 80 MB; anything else SHALL be refused with 415
`unsupported_type`. A user's files SHALL fit in the quota, counted once per
content, else 507 `quota`.

#### Scenario: Not an image

- **WHEN** a client uploads a PDF renamed `scene.png`
- **THEN** the server answers 415 `unsupported_type`

#### Scenario: Quota reached

- **WHEN** a user at 19.99 GB of a 20 GB quota uploads a 30 MB image
- **THEN** the server answers 507 `quota` and keeps nothing

### Requirement: File download route

`GET /api/projects/:id/files/:sha256` SHALL serve a file the project has,
only to its owner, with its type, `nosniff`, `Cache-Control: private,
max-age=31536000, immutable`, and byte ranges (206, 416); `HEAD` SHALL answer
the same without the body, so a client skips uploading what the project
links. A file the project does not link SHALL answer 404 even when another
project has it.

#### Scenario: Another user's file

- **WHEN** user B asks user A's project for a file
- **THEN** the server answers 404

#### Scenario: Range

- **WHEN** the audio player asks for bytes 1 000 000 onward of a track
- **THEN** the server answers 206 with those bytes

### Requirement: Unused files are removed

A daily sweep SHALL keep a project's link to a file while the project's
current document lists it, and SHALL drop the link once the document has not
listed it for the grace period (`PROMPTBOOK_FILES_GRACE_DAYS`, default 30).
A file's bytes SHALL be deleted once no project links it. Removing a project
for good SHALL drop its links.

#### Scenario: Removed image collected

- **WHEN** an image was removed from the board 31 days ago and no other
  project lists it
- **THEN** the next sweep deletes its bytes

#### Scenario: Dropped again within the grace period

- **WHEN** the user removes an image and drops the same file again 10 days
  later
- **THEN** the board shows it at once, without uploading it again

#### Scenario: Used by another project

- **WHEN** an image removed 31 days ago from one project is still on another
  project's board
- **THEN** its bytes stay and the other project still shows it

### Requirement: Narrow windows

Below 760 px of width the board SHALL hide the rail and the status bar, keep
the four tabs in one row, stack each row's halves, show the PC, NPC and
handout cards one per line, show two landscape images per line (four
portrait ones), keep the tray in the flow, and always show the choose
badges; below 900 px the viewer SHALL put its details under the image.

#### Scenario: Phone

- **WHEN** the board opens on a 390 px wide screen
- **THEN** the tabs fit in one row, the halves stack and landscape images
  show two per line

### Requirement: Image categories

The board SHALL hold any number of image prompts in four categories shown as
tabs «Scenes», «PCs», «NPCs» and «Handouts». Each tab SHALL show its number
of image prompts and a second line: «none yet», «N wanted», «N received» or
«all chosen». The active tab SHALL be kept in the address. Only Scene
prompts SHALL be tied to a scene; PCs, NPCs and Handouts SHALL be
project-wide, each item a name and a Midjourney prompt. Music SHALL stay one
Suno prompt per scene.

#### Scenario: Tab counts

- **WHEN** the project has four PCs, two of them without images
- **THEN** the PCs tab reads «PCs 4» with «2 wanted»

#### Scenario: Tab kept on reload

- **WHEN** the user opens NPCs and reloads the page
- **THEN** the board opens on NPCs

### Requirement: Several image prompts per scene

«Add image prompt» SHALL open a new block «New prompt» in the scene's stack
with a text area, the hint «Its first words are how its images find it.»,
Cancel and Add; Add SHALL append the prompt to the scene as the user's and
toast «Added S1 · prompt 3. Copy it into Midjourney.»; nothing SHALL be
written before Add, and an empty prompt SHALL be refused with «Write the
prompt first: its first words are how its images find it.».

#### Scenario: Add a second shot

- **WHEN** the user presses Add image prompt under S2's prompt 1, writes a
  prompt and presses Add
- **THEN** S2 shows Prompt 1 and Prompt 2, the second Wanted

### Requirement: PCs, NPCs and Handouts

The PCs, NPCs and Handouts tabs SHALL show one card per item with its name,
status, prompt and images, a last card «Add PC», «Add NPC» or «Add handout»
opening a card with Name and Prompt, Cancel and Add, and the hint «NPCs
belong to the whole adventure, not to a scene.» (PCs, Handouts). A tab with
no items SHALL show «No PCs yet» («No NPCs yet», «No handouts yet»), what
the category is for, its Add button, and the hint that Claude can write them
too.

#### Scenario: Add an NPC

- **WHEN** on an empty NPCs tab the user presses Add NPC, names it «Padre
  Anselmo», writes a prompt and presses Add
- **THEN** the NPCs tab shows his card, Wanted, and the toast says «Added NPC
  · Padre Anselmo. Copy it into Midjourney.»

### Requirement: Removing an image prompt

Each image prompt SHALL have a Remove button that asks «Remove this image
prompt?», «<prompt> leaves the board.» and «Its N images move to Unmatched,
where you can assign them to another prompt.» (or «It has no images yet.»),
then removes the prompt and toasts «Prompt removed. N images in Unmatched.»
(or «Prompt removed.»). Its images SHALL wait in Unmatched with «Its prompt
was removed.»; no file SHALL be deleted.

#### Scenario: Remove a prompt with images

- **WHEN** the user removes S1's prompt 2, which has four images, and
  confirms
- **THEN** S1 shows its other prompts renumbered, the four images wait in
  Unmatched with «Its prompt was removed.», and the toast says «Prompt
  removed. 4 images in Unmatched.»

### Requirement: Existing boards keep their prompts

A board written before image categories SHALL open with each scene's image
prompt as that scene's prompt 1, with its images, its chosen image, its
author and date, and the music unchanged, on the web, in the desktop app
offline, and through the connector. The conversion SHALL run on every
replica without losing an edit made on another. A removed prompt 1 SHALL stay
removed.

#### Scenario: Board from v0.6

- **WHEN** a project whose S3 had one image prompt, four images and the
  second chosen is opened after the update
- **THEN** S3 shows Prompt 1 with that prompt, the four images and the second
  chosen

#### Scenario: Converted on two devices at once

- **WHEN** the desktop app, offline, opens that project and edits S3's
  prompt 1 while the server converted it too, and the app comes back online
- **THEN** S3 has one prompt 1 holding the desktop's edit, on both

#### Scenario: Written later by an older app

- **WHEN** an older app writes S3's image prompt or gives S3 an image after the
  conversion
- **THEN** they join S3's prompt 1, the later prompt text winning; if S3's
  prompt 1 was removed, the images wait in Unmatched with «Its prompt was
  removed.»

#### Scenario: Removed while converted elsewhere

- **WHEN** the user removes S3's prompt 1 on the web while the desktop app,
  offline, had converted the same board, and the app comes back online
- **THEN** S3's prompt 1 stays removed on both, and its images wait in
  Unmatched with «Its prompt was removed.»
