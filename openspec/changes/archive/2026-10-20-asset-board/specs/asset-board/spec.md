## ADDED Requirements

### Requirement: Board view

The rail's Images and music entry SHALL open `/projects/<id>/board` for an
adventure or one-shot, following
[docs/mockups/board.html](../../../docs/mockups/board.html): the heading
«Images and music», the lead «One row per scene, from the document's
appendix. For the table and the CueBard export.», «How matching works» and
«Add files…», then one row per `### S…` of the appendix, in its order.

#### Scenario: Rows from the appendix

- **WHEN** the user opens the board of «L'Ancora di Sabaoth», whose appendix
  has rows S1 to S6
- **THEN** six rows show, each with its id and title and «Open the scene in
  the document»

#### Scenario: Rows follow the document

- **WHEN** the user renames S4's appendix row in the Document view and opens
  the board
- **THEN** the S4 row shows the new title and keeps its prompts and files

### Requirement: The halves of a row

Each row SHALL have an «Image · Midjourney» half and a «Music · Suno» half.
Each half SHALL show the scene's `visual:` or `mood:` line read-only (or
«empty») with «Edit in the document», the prompt, its author and age («by
Claude · 5 min ago», «edited by you · yesterday»), Edit, and the files.

#### Scenario: Source line

- **WHEN** S2's appendix row has a `visual:` line and no `mood:` line
- **THEN** the image half shows the `visual:` text and the music half shows
  «mood: empty», each with «Edit in the document»

### Requirement: Prompts with Copy

The image half SHALL show the Midjourney prompt with one Copy button. The
music half SHALL show Title (with «The download's filename. Used to match
tracks.»), Style and Lyrics, each with its Copy button, and the line
«Instrumental: ON · Weirdness: low · Style Influence: strong». Copy SHALL put
the text on the clipboard and read «Copied» for a moment.

#### Scenario: Copy the style

- **WHEN** the user presses Copy beside S3's Style
- **THEN** the clipboard holds the style text and the button reads «Copied»

### Requirement: Status per half

Each half SHALL show a status derived from its files and never stored:
Wanted (no file of that kind for the scene), Received (files, none chosen)
or Chosen. A summary line SHALL count scenes and each half's states, and the
filters All, Wanted, Received and Chosen SHALL keep the rows with at least
one half in that state, dimming the other half.

#### Scenario: Filter Wanted

- **WHEN** S2 has images and no tracks and the user picks Wanted
- **THEN** S2 shows with its image half dimmed

#### Scenario: Summary

- **WHEN** of six scenes two have a chosen image, three images received and
  one none
- **THEN** the summary reads «6 scenes · images 2 chosen, 3 received, 1
  wanted · music …»

### Requirement: Prompts come from Claude

While no row has an image prompt or a music title, the board SHALL show the
card «Prompts come from Claude» with the request «Write the image and music
prompts for the board of «<project title>»» and its Copy button, and the
hint naming Settings → Connected apps. Each half without a prompt SHALL say
«No Midjourney prompt yet. Ask Claude, or write one.» (or Suno) with «Write
by hand».

#### Scenario: New board

- **WHEN** the user opens the board of a project whose appendix has rows and
  no prompts
- **THEN** the Claude card shows with the project's title in the request

### Requirement: Edit a prompt by hand

Edit and Write by hand SHALL open the prompt in place: a text area for the
image prompt with «Claude can rewrite it later.», or Title, Style and Lyrics
with «Suno names the download after the title.», then Cancel and Save. Save
SHALL overwrite the prompt as the user's, dated now, and toast «Saved.».
Prompts SHALL NOT be versioned.

#### Scenario: Save

- **WHEN** the user edits S2's image prompt and presses Save
- **THEN** the row shows the new prompt «edited by you · just now» and the
  toast says «Saved.»

#### Scenario: Cancel

- **WHEN** the user changes S2's style and presses Cancel
- **THEN** the style is unchanged and nothing is written

### Requirement: No appendix

When the document has no appendix, or one with no rows, the board SHALL show
«No scenes for the board yet» with the example appendix, «Add the appendix»
and «Open the document». Add the appendix SHALL write `## Appendice: immagini
e musica` (or use the one there) and one row per scene with empty `visual:`
and `mood:` lines, and toast «Appendix added with N scenes. Fill in visual:
and mood:, or ask Claude.»

#### Scenario: Add the appendix

- **WHEN** a one-shot with six scenes and no appendix opens the board and the
  user presses Add the appendix
- **THEN** the document ends with the appendix heading and rows S1 to S6, and
  the board shows six rows with «visual: empty»

### Requirement: Adding files

Files dropped anywhere on the board, or picked with Add files…, SHALL be
added to the project. While files are dragged over the board an overlay SHALL
say «Drop images and tracks», «They find their scene by filename.», «Files
that match nothing wait in Unmatched.» and the count of images and tracks.
Only PNG, JPEG and WebP images and MP3, M4A, AAC, WAV, Ogg and FLAC tracks
SHALL be taken.

#### Scenario: Drop a batch

- **WHEN** the user drags 14 files, 10 images and 4 tracks, over the board
- **THEN** the overlay reads «14 files · 10 images, 4 tracks»

### Requirement: Midjourney images find their scene

An image named `<user>_<words>_<job uuid>[_<n>].<png|jpg|jpeg|webp>` SHALL go
to the scene whose image prompt starts with those words, compared without
case, accents, spaces or punctuation. With no such scene, or several, it
SHALL go to the Unmatched tray, saying «No prompt starts with "<first
words>".» or «Several prompts start with "<first words>".»

#### Scenario: Four images to one scene

- **WHEN** the user drops the four files
  `steve_ruined_doctors_office_in_1908_Messina_anatomical_<uuid>_0.png` to
  `…_3.png` and S2's prompt starts «ruined doctor's office in 1908 Messina,
  anatomical…»
- **THEN** the four images are in S2, matched by the prompt's first words

#### Scenario: Prompt changed in Midjourney

- **WHEN** an image's words start no scene's prompt
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
assign.» followed by the files per scene («S3: 4 images, 2 tracks · S5: 4
images, 1 track») and «New files are marked.», with a button to dismiss it;
the new files SHALL carry the mark «new» until the next drop or until the
board is left.

#### Scenario: Batch result

- **WHEN** 14 files are dropped and 11 match S3 and S5
- **THEN** the line reads «14 files added: 11 matched, 3 to assign.» with
  the counts for S3 and S5, and the 11 files are marked new

### Requirement: Unmatched tray

Files with no scene, or whose scene has no appendix row, SHALL wait in the
tray «Unmatched», pinned above the rows while the board scrolls, with «N
files», «Their names match no prompt or track title.» and «How matching
works». Each file SHALL show its name, its kind and the reason, «Assign to
scene…» and Remove.

#### Scenario: Assign by hand

- **WHEN** the user assigns an unmatched image to S4
- **THEN** it leaves the tray, shows in S4 marked new, and the toast says
  «Assigned to S4 · Torre Faro e la canzone.»

#### Scenario: Scene dropped from the appendix

- **WHEN** S6's appendix row is deleted while S6 has two tracks
- **THEN** the two tracks wait in Unmatched and S6's prompts are kept

### Requirement: How matching works

«How matching works», in the header and in the tray, SHALL open the popover
«How files find their scene» with the Midjourney, Suno and Other files rules
of the mockup, the examples built from the project's own prompts when it has
them.

#### Scenario: Help from the tray

- **WHEN** the user presses How matching works in the Unmatched tray
- **THEN** the popover opens at the top of the board

### Requirement: Choosing a file

Each image SHALL have a round badge that chooses it for the scene or, when
chosen, unchooses it; each track SHALL have Choose, or «✓ Chosen» to
unchoose. One image and one track at most SHALL be chosen per scene, and the
others SHALL dim.

#### Scenario: Choose an image

- **WHEN** the user presses the badge of S3's second image
- **THEN** S3's image status is Chosen and the other three dim

### Requirement: Image viewer

Opening an image SHALL show the viewer: the image itself, «2 of 4» with
previous and next (also ← and →), the scene, the file name, Size, Dimensions,
Matched by, Added, Status, the strip of the scene's images, «Choose for this
scene» (or «✓ Chosen · click to unchoose»), «Move to another scene…» and
Remove. Esc SHALL close it.

#### Scenario: Move

- **WHEN** the user moves S3's second image to S4 from the viewer
- **THEN** it shows in S4 and the toast says «Moved to S4 · Torre Faro e la
  canzone.»

### Requirement: Removing a file

Remove SHALL ask «Remove this image?», «Image 2 leaves S3 · <title>.» (for
a track «Remove this track?», «Take 2 leaves S3 · <title>.») with «The file
in your Downloads folder is not touched.», then take the file off the
project (a chosen one leaves its scene unchosen) and toast «Image removed.»
(or «Track removed.»); from the tray it SHALL remove at once and toast
«Removed <name>.».

#### Scenario: Remove the chosen image

- **WHEN** the user removes S1's chosen image and confirms
- **THEN** S1's image status is Received and the toast says Image removed.

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

Below 760 px of width the board SHALL hide the rail and the status bar, stack
each row's halves, show two images per line, keep the tray in the flow, and
always show the choose badges; below 900 px the viewer SHALL put its details
under the image.

#### Scenario: Phone

- **WHEN** the board opens on a 390 px wide screen
- **THEN** the halves stack and the images show two per line
