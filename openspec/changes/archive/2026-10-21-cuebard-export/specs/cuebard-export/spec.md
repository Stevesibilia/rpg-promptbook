## ADDED Requirements

### Requirement: CueBard pack

The user SHALL be able to export an adventure, a one-shot or a campaign as a
CueBard pack: a zip named `<name>.cbpack` holding the CueBard project file
`<name>.cuebard` at its root, the exported tracks under `media/` and the
exported images under `media/visuals/`, named `<uuid>_<name>` with the
image's id in the project file. `<name>` SHALL be the project's title made
safe (see Names). The pack SHALL hold no waveforms, no thumbnails, no folder
entries and no text of the prep; it SHALL hold a `left-out.txt` at its root,
one line per item, only when a track or an image was left out for its length
or its bytes. Media SHALL be stored, the project file deflated, and the zip
streamed, never built whole in memory. CueBard at `schemaVersion` 5 SHALL
import it as it is, with nothing in CueBard changed.

#### Scenario: Pack layout

- **WHEN** the user exports «L'Ancora di Sabaoth», whose board has two
  tracks and five images to export
- **THEN** the pack `L'Ancora di Sabaoth.cbpack` holds `L'Ancora di
Sabaoth.cuebard` at its root, two files under `media/`, five under
  `media/visuals/`, and nothing else

#### Scenario: CueBard imports it

- **WHEN** the pack is imported in CueBard («Import project»)
- **THEN** CueBard extracts it into a folder `L'Ancora di Sabaoth`, opens
  its project with no error, plays each cue and shows each image

### Requirement: CueBard project file

The project file SHALL be JSON with `name` the project's title («Untitled»
when empty), `version` «1.0.0», `schemaVersion` 5, `folderPath` empty,
`items` (the cue groups), `cartItems` and `cartOnlyItems` empty,
`visualMedia`, `visualFolders`, `visualDisplayEnabled` true, `theme` cobalt
with no accent colour, and `createdAt` and `lastModified` the time of the
export. Every field CueBard reads at `schemaVersion` 5 without a default
SHALL be present on every item.

#### Scenario: Fields present

- **WHEN** the project file of an exported pack is read
- **THEN** it passes CueBard's `validateProjectStructure`, `checkSchemaCompat`
  answers it as compatible, and every audio item has a finite `duration`
  above 0, an `index`, `endBehavior`, `startBehavior` and `duckingBehavior`

### Requirement: Cue groups and tracks

The project file's `items` SHALL hold one cue group per scene of the
appendix, in its order, named «S1. Title», looping on nothing, starting with
its first cue, expanded, also for a scene with no exported track (an empty
group). Each group SHALL hold the scene's exported tracks, oldest first, each
a looping audio cue with volume 1, in point 0 and out point its length, a one
second fade out when stopped, ducking that stops the others, and the index
of its group and its place in it. A track SHALL be named after the scene's
Suno title, with « (2)», « (3)»… for the second and later tracks of the
scene, or after its file name without the extension when the scene has no
Suno title. A campaign SHALL have no cue groups.

#### Scenario: Groups in the appendix's order

- **WHEN** a project whose appendix has S1 to S6, S3 with no track, is
  exported
- **THEN** the project file has six groups «S1. …» to «S6. …» in that order,
  and S3's group is empty

#### Scenario: Tracks named after the Suno title

- **WHEN** S1's music title is «Dominus Deus Sabaoth» and S1 exports two
  tracks
- **THEN** S1's group holds «Dominus Deus Sabaoth» and «Dominus Deus Sabaoth
  (2)», both looping, with indexes `[0, 0]` and `[0, 1]`

### Requirement: Visual folders and links

The project file's `visualFolders` SHALL list «Scenes», «PCs», «NPCs» and
«Handouts», in that order, leaving out a folder with no image. Each exported
image SHALL be a visual of its category's folder. A scene's images SHALL be
named «S1. Title», or «S1. Title», «S1. Title · 2», «S1. Title · 3»… when
the scene exports several, across its prompts in order, and SHALL be linked
to the scene's first exported track; with no exported track they SHALL have
no link. A PC's, an NPC's or a handout's images SHALL be named after the
prompt, with « (2)», « (3)»… for its second and later images, and SHALL have
no link. Visuals SHALL have no link delay and no fades.

#### Scenario: Scene image linked to its track

- **WHEN** S1 exports two images and two tracks
- **THEN** the folder «Scenes» holds «S1. La casa che cede» and «S1. La casa
  che cede · 2», both linked to S1's first track

#### Scenario: Named images

- **WHEN** the NPC «Padre Anselmo» exports two images and the project has no
  handout image
- **THEN** «NPCs» holds «Padre Anselmo» and «Padre Anselmo (2)», with no
  link, and `visualFolders` has no «Handouts»

#### Scenario: Scene with no track

- **WHEN** S3 exports an image and no track
- **THEN** S3's visual has no `linkedCueUuid`

### Requirement: What goes in the pack

Per image prompt shown on the board, the pack SHALL hold its chosen image,
or every image of the prompt when none is chosen. Per scene of the
appendix, it SHALL hold its chosen track, or every track of the scene when
none is chosen. Files in the Unmatched tray, including the images of a
removed prompt and of a prompt whose scene left the appendix, SHALL NOT be
exported. The document's text, research, seed, inspiration, brainstorm log,
music prompts and thumbnails SHALL NOT be exported.

#### Scenario: Chosen file first

- **WHEN** S1's prompt 1 has four images with one chosen, its prompt 2 three
  images with none chosen, and S1 two tracks with none chosen
- **THEN** the pack holds S1's chosen image, the three images of prompt 2
  and both tracks

#### Scenario: Tray left out

- **WHEN** the Unmatched tray holds an image and a track
- **THEN** neither is in the pack

### Requirement: Names in the pack

The pack's, the project file's and every media file's name SHALL be NFC,
with `/ \ : * ? " < > | # %` and control characters replaced by `-`,
trimmed, without trailing dots or spaces, at most 100 characters before the
extension, and a fallback for an empty, `.` or `..` name. Two tracks with one
name, compared without case, SHALL get « (2)», « (3)»… before the
extension. A name whose extension CueBard does not accept for its kind SHALL
get the extension of its file's type. Entry names SHALL be relative, without
backslashes, and carry the zip's UTF-8 flag when not ASCII.

#### Scenario: Unsafe characters

- **WHEN** a track is named `Tema #1 100%.mp3` and the project is titled
  «Notte? 50%»
- **THEN** the pack is `Notte- 50-.cbpack` and the track
  `media/Tema -1 100-.mp3`

#### Scenario: Two names up to case

- **WHEN** S2 exports `Tema.mp3` and S4 exports `tema.MP3`
- **THEN** the pack holds `media/Tema.mp3` and `media/tema (2).MP3`

#### Scenario: Accented name

- **WHEN** a track is named `Città.mp3`
- **THEN** its entry is `media/Città.mp3` with the UTF-8 flag, and CueBard
  extracts it with that name

### Requirement: Stable ids

Every cue group, track and visual SHALL have a lower-case UUID of version 4
layout derived from the project's id, the item's kind and its scene id or
file id, so that the same board exports the same ids. The ids in one pack
SHALL be unique. A track's waveform path SHALL be `<its uuid>.json`.

#### Scenario: Same board, same ids

- **WHEN** a project is exported twice with no change between
- **THEN** both project files have the same ids, names and paths, and
  differ only in `createdAt` and `lastModified`

### Requirement: Track lengths

A track's length SHALL be the one the board recorded. When none was
recorded, the server or the desktop app SHALL read it from the file. A track
whose length still cannot be read SHALL be left out of the pack, listed in
`left-out.txt` and warned about; the export SHALL go on. A length read from a
file SHALL NOT be written to the document.

#### Scenario: Length read from the file

- **WHEN** a WAV track's length was not recorded on the board
- **THEN** the pack's cue has the WAV's length, and the document still has
  none

#### Scenario: Length unknown

- **WHEN** a track's bytes give no length
- **THEN** the pack leaves it out, `left-out.txt` lists it with «length
  unknown», and the rest of the pack is exported

### Requirement: Pack limits

A pack whose media pass 4,000,000,000 bytes, or 65,000 entries, SHALL be
refused: the server with 413 `export_too_large`, the desktop app and the
summary dialog with the same message, «This project holds more than 4 GB of
images and tracks for CueBard, more than one pack can take. Choose fewer
files on the board.».

#### Scenario: Too large

- **WHEN** the files a project's pack would hold sum more than 4 GB
- **THEN** the server answers 413 `export_too_large` and the dialog shows
  the message with «Export» disabled

### Requirement: Browser download

In the browser, the pack SHALL come from `GET /api/projects/<id>/cuebard`,
for a signed-in user's project not in the bin (404 otherwise), built from the
open document when a client has it, else the stored one, read migrated and
never written. The server SHALL export only files the project links and
holds; a picked file without its bytes SHALL be left out and listed in
`left-out.txt` with «not on the server».

#### Scenario: Download

- **WHEN** the user exports from the browser
- **THEN** the browser downloads `<title>.cbpack`, and it holds the edit the
  user made a moment ago and not yet stored

#### Scenario: Another user's project

- **WHEN** a user asks for the pack of a project that is not theirs
- **THEN** the server answers 404

### Requirement: Desktop export offline

In the desktop app, the pack SHALL be built in the main process from this
computer's copy of the project and its files and written to the path chosen
in a save dialog, offered `<title>.cbpack`, whether the app is online or
offline. A picked file not on this computer SHALL be fetched first when
online, else left out and listed in `left-out.txt` with «not on this
computer». A project not yet on this computer SHALL be refused with «This
project is not on this computer yet.». A failed export SHALL leave no file.

#### Scenario: Offline export

- **WHEN** the desktop app is offline and the user exports a project whose
  files are on this computer
- **THEN** a save dialog offers `<title>.cbpack`, and the saved pack holds
  every picked file

#### Scenario: Cancelled

- **WHEN** the user cancels the save dialog
- **THEN** nothing is written and no toast shows

### Requirement: Export summary dialog

«Export for CueBard…» SHALL open a dialog «Export for CueBard» with a summary
of the pack computed from the project's document as it is: the number of
cue groups and tracks, the number of images per visual folder, the rule
that each prompt and scene gives its chosen file or every matched file, and
one warning per gap: a scene with no track (its group is empty), an image
prompt with no image, a track whose length was not recorded (read from the
file at export, left out if unreadable). It SHALL say where the pack is
built: downloaded by the browser, or built on the device and working
offline. «Export» SHALL start the export and close the dialog; «Cancel»,
Escape and the ✕ SHALL close it. With no track and no image to export, the
dialog SHALL say «Nothing to export yet: add files to the board first.» and
«Export» SHALL be disabled.

#### Scenario: Warnings

- **WHEN** the user opens «Export for CueBard…» on a board where S4 has no
  track and the NPC «Za' Nina» has no image
- **THEN** the dialog lists «S4. … has no track: its cue group is empty.»
  and «NPC "Za' Nina" has no image.» under «2 warnings»

#### Scenario: Nothing to export

- **WHEN** the user opens «Export for CueBard…» on a board with no files
- **THEN** the dialog says «Nothing to export yet: add files to the board
  first.» and «Export» is disabled

#### Scenario: Toast after the export

- **WHEN** the user clicks «Export» in the browser
- **THEN** the dialog closes and a toast says «Downloading <title>.cbpack.»
