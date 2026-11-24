## MODIFIED Requirements

### Requirement: Cue groups and tracks

The project file's `items` SHALL hold one cue group per scene of the
appendix, in its order, named «S1. Title», looping on nothing, starting with
its first cue, expanded, also for a scene with no exported track (an empty
group); then, when at least one track of a General music prompt is
exported, one cue group «General» of the same kind, left out otherwise.
Each scene group SHALL hold the scene's exported tracks, oldest first; the
group «General» SHALL hold, per General music prompt in its order, that
prompt's exported tracks, oldest first. Each track SHALL be a looping audio
cue with volume 1, in point 0 and out point its length, a one second fade
out when stopped, ducking that stops the others, and the index of its group
and its place in it. A track SHALL be named after its scene's or its
General music prompt's Suno title, with « (2)», « (3)»… for the second and
later tracks of that scene or prompt, or after its file name without the
extension when the scene has no Suno title. A campaign SHALL have no cue
groups.

#### Scenario: Groups in the appendix's order

- **WHEN** a project whose appendix has S1 to S6, S3 with no track, and no
  General music is exported
- **THEN** the project file has six groups «S1. …» to «S6. …» in that order,
  S3's group is empty, and there is no group «General»

#### Scenario: Tracks named after the Suno title

- **WHEN** S1's music title is «Dominus Deus Sabaoth» and S1 exports two
  tracks
- **THEN** S1's group holds «Dominus Deus Sabaoth» and «Dominus Deus Sabaoth
  (2)», both looping, with indexes `[0, 0]` and `[0, 1]`

#### Scenario: General group after the scenes

- **WHEN** a project with S1 to S6 has the General music prompts «Tema di
  Sabaoth», exporting its chosen track, and «Tra le macerie», exporting one
  track, and «La scossa» with no track
- **THEN** the seventh group is «General», holding «Tema di Sabaoth» with
  index `[6, 0]` and «Tra le macerie» with index `[6, 1]`

### Requirement: Visual folders and links

The project file's `visualFolders` SHALL list «Scenes», «General», «PCs»,
«NPCs» and «Handouts», in that order, leaving out a folder with no image.
Each exported image SHALL be a visual of its category's folder. A scene's
images SHALL be named «S1. Title», or «S1. Title», «S1. Title · 2», «S1.
Title · 3»… when the scene exports several, across its prompts in order,
and SHALL be linked to the scene's first exported track; with no exported
track they SHALL have no link. A General image's, a PC's, an NPC's or a
handout's images SHALL be named after the prompt, with « (2)», « (3)»… for
its second and later images, and SHALL have no link. Visuals SHALL have no
link delay and no fades.

#### Scenario: Scene image linked to its track

- **WHEN** S1 exports two images and two tracks
- **THEN** the folder «Scenes» holds «S1. La casa che cede» and «S1. La casa
  che cede · 2», both linked to S1's first track

#### Scenario: Named images

- **WHEN** the NPC «Padre Anselmo» exports two images and the project has no
  handout image
- **THEN** «NPCs» holds «Padre Anselmo» and «Padre Anselmo (2)», with no
  link, and `visualFolders` has no «Handouts»

#### Scenario: General images

- **WHEN** the General image prompt «Messina dopo il terremoto» exports its
  chosen image
- **THEN** «General», listed after «Scenes», holds «Messina dopo il
  terremoto» with no link

#### Scenario: Scene with no track

- **WHEN** S3 exports an image and no track
- **THEN** S3's visual has no `linkedCueUuid`

### Requirement: What goes in the pack

Per image prompt shown on the board, the pack SHALL hold its chosen image,
or every image of the prompt when none is chosen. Per scene of the
appendix, and per General music prompt, it SHALL hold its chosen track, or
every track of it when none is chosen. Files in the Unmatched tray,
including the images of a removed prompt and of a prompt whose scene left
the appendix and the tracks of a removed General music prompt, SHALL NOT be
exported. The document's text, research, seed, inspiration, brainstorm log,
music prompts and thumbnails SHALL NOT be exported.

#### Scenario: Chosen file first

- **WHEN** S1's prompt 1 has four images with one chosen, its prompt 2 three
  images with none chosen, and S1 two tracks with none chosen
- **THEN** the pack holds S1's chosen image, the three images of prompt 2
  and both tracks

#### Scenario: Chosen General track

- **WHEN** «Tema di Sabaoth» has two tracks and the second is chosen
- **THEN** the pack holds only the second

#### Scenario: Tray left out

- **WHEN** the Unmatched tray holds an image and a track
- **THEN** neither is in the pack

### Requirement: Stable ids

Every cue group, track and visual SHALL have a lower-case UUID of version 4
layout derived from the project's id, the item's kind and its scene id,
`general` for the group «General», or its file id, so that the same board
exports the same ids. The ids in one pack SHALL be unique. A track's
waveform path SHALL be `<its uuid>.json`.

#### Scenario: Same board, same ids

- **WHEN** a project is exported twice with no change between
- **THEN** both project files have the same ids, names and paths, and
  differ only in `createdAt` and `lastModified`

### Requirement: Export summary dialog

«Export for CueBard…» SHALL open a dialog «Export for CueBard» with a summary
of the pack computed from the project's document as it is: the number of
scene cue groups, whether there is a group General, and the number of
tracks; the number of images per visual folder (Scenes, General, PCs, NPCs,
Handouts); the rule that each prompt and scene gives its chosen file or
every matched file, and that General images are not linked to a track; and
one warning per gap: a scene with no track (its group is empty), a General
music prompt with no track, an image prompt with no image, a track whose
length was not recorded (read from the file at export, left out if
unreadable). It SHALL say where the pack is built: downloaded by the
browser, or built on the device and working offline. «Export» SHALL start
the export and close the dialog; «Cancel», Escape and the ✕ SHALL close it.
With no track and no image to export, the dialog SHALL say «Nothing to
export yet: add files to the board first.» and «Export» SHALL be disabled.

#### Scenario: Warnings

- **WHEN** the user opens «Export for CueBard…» on a board where S4 has no
  track and the NPC «Za' Nina» has no image
- **THEN** the dialog lists «S4. … has no track: its cue group is empty.»
  and «NPC "Za' Nina" has no image.» under «2 warnings»

#### Scenario: General music with no track

- **WHEN** the General music prompt «La scossa» has no track
- **THEN** the dialog lists «General music "La scossa" has no track.»

#### Scenario: Groups line

- **WHEN** six scenes and two General music prompts export nine tracks
- **THEN** the Cue groups line reads «6 scenes · General · 9 tracks»

#### Scenario: Nothing to export

- **WHEN** the user opens «Export for CueBard…» on a board with no files
- **THEN** the dialog says «Nothing to export yet: add files to the board
  first.» and «Export» is disabled

#### Scenario: Toast after the export

- **WHEN** the user clicks «Export» in the browser
- **THEN** the dialog closes and a toast says «Downloading <title>.cbpack.»
