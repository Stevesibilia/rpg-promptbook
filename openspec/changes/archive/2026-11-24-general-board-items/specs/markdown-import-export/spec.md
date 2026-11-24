## MODIFIED Requirements

### Requirement: Board and files in the export

`board.md` SHALL hold a part per category: Scenes, per appendix row in order,
with the scene id and title, its image prompts numbered in order and its
music title, style and lyrics; then General, with its image prompts (name
and prompt) and its music prompts (title, style and lyrics); then PCs, NPCs
and Handouts, each item with its name and prompt; every prompt with who
wrote it and when and the name of its chosen file. The images of a scene's
prompt n SHALL be at `files/scenes/<scene id>/<n>/<original name>`, a
scene's tracks at `files/scenes/<scene id>/music/`, the images of a General
image prompt at `files/general/images/<name>/`, the tracks of a General
music prompt at `files/general/music/<title>/`, the images of a PC, an NPC
or a handout at `files/pcs/<name>/`, `files/npcs/<name>/` or
`files/handouts/<name>/`, and a file in the Unmatched tray at
`files/unmatched/<original name>`. A name taken twice in one folder, or by
two items of one category, SHALL get « (2)», « (3)»… Thumbnails SHALL NOT be
exported. The zip SHALL be streamed, never built whole in memory.

#### Scenario: Files in their scene's folder

- **WHEN** a project whose S1 has two image prompts with four images each,
  one chosen, two tracks, the NPC «Padre Anselmo» with four images and one
  unmatched track is exported
- **THEN** the folder holds `files/scenes/S1/1/` and `files/scenes/S1/2/`
  with four images each, `files/scenes/S1/music/` with two tracks,
  `files/npcs/Padre Anselmo/` with four images, `files/unmatched/` with the
  track, and `board.md` lists S1's two prompts, the music and Padre Anselmo
  with the chosen file

#### Scenario: General files

- **WHEN** a project with the General image «Copertina» (four images) and
  the General music prompt «Tema di Sabaoth» (two tracks) is exported
- **THEN** the folder holds `files/general/images/Copertina/` with four
  images and `files/general/music/Tema di Sabaoth/` with two tracks, and
  `board.md` has a part General listing both

#### Scenario: Board from v0.6 exported

- **WHEN** a project whose board was written before image categories is
  exported before anyone opens it
- **THEN** each scene's single prompt and its images are exported as its
  prompt 1, and the stored document is unchanged

#### Scenario: Large export

- **WHEN** the user exports everything while the projects hold 3 GB of files
- **THEN** the server sends the zip as it reads the files, without holding it
  in memory
