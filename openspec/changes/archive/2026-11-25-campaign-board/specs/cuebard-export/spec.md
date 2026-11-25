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
extension when the scene has no Suno title. A campaign has no appendix: its
only cue group SHALL be «General», at index 0, when it exports a General
track, and it SHALL have no cue group otherwise.

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

#### Scenario: Campaign's group

- **WHEN** the campaign «Kulthos» exports the chosen track of «Tema della
  campagna» and the two tracks of «Combattimento», and «Riposo alla
  locanda» has none
- **THEN** the project file's only group is «General», holding «Tema della
  campagna» at `[0, 0]`, «Combattimento» at `[0, 1]` and «Combattimento
  (2)» at `[0, 2]`

#### Scenario: Campaign with no track

- **WHEN** a campaign with General images and no General track is exported
- **THEN** the project file has no cue group and its images are in their
  visual folders

### Requirement: Export summary dialog

«Export for CueBard…» SHALL open a dialog «Export for CueBard» with a summary
of the pack computed from the project's document as it is: the number of
scene cue groups, whether there is a group General, and the number of
tracks; the number of images per visual folder (Scenes, General, PCs, NPCs,
Handouts); the rule that each prompt and scene gives its chosen file or
every matched file (on a campaign: each prompt and music prompt), and that General images are not linked to a track; and
one warning per gap: a scene with no track (its group is empty), a General
music prompt with no track, an image prompt with no image, a track whose
length was not recorded (read from the file at export, left out if
unreadable). It SHALL say where the pack is built: downloaded by the
browser, or built on the device and working offline. «Export» SHALL start
the export and close the dialog; «Cancel», Escape and the ✕ SHALL close it.
With no track and no image to export, the dialog SHALL say «Nothing to
export yet: add files to the board first.» and «Export» SHALL be disabled.
On a campaign the lead SHALL read «A CueBard project: one cue group General
with the campaign's music, and the images in four visual folders.», and
the lines SHALL leave out the scenes and the folder Scenes.

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

#### Scenario: Campaign export

- **WHEN** the user opens «Export for CueBard…» on the campaign «Kulthos»,
  whose General music exports three tracks and whose General, PC, NPC and
  handout prompts export 1, 5, 9 and 5 images
- **THEN** the Cue groups line reads «General · 3 tracks», the Visual
  folders line «General 1 · PCs 5 · NPCs 9 · Handouts 5 images», and the
  dialog says «Your browser downloads Kulthos.cbpack»

#### Scenario: Campaign with no General track

- **WHEN** a campaign exports images and no track
- **THEN** the Cue groups line reads «no General group · 0 tracks»

#### Scenario: Nothing to export

- **WHEN** the user opens «Export for CueBard…» on a board with no files
- **THEN** the dialog says «Nothing to export yet: add files to the board
  first.» and «Export» is disabled

#### Scenario: Toast after the export

- **WHEN** the user clicks «Export» in the browser
- **THEN** the dialog closes and a toast says «Downloading <title>.cbpack.»
