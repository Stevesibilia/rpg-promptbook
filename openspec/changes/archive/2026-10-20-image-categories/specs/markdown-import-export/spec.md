## MODIFIED Requirements

### Requirement: Export as a Markdown folder

The user SHALL be able to export one project, or every project not in the
bin, as a zip. Each project SHALL be a folder named after its title with
`document.md` (the prep document as stored), `todo.md` (a GFM task list with
notes and due dates), `seed.md` (every seed version, newest first, with its
date), `inspiration.md` (the sources of inspiration with kind, text, URL,
why, who and date), `research.md` (the topics with their state, then each
note with summary, facts and sources), `brainstorm-log.md` (the entries,
newest first, with their ideas, decisions, rejected ideas and why, and open
questions), `board.md` (the image prompts of the scenes, the PCs, the NPCs
and the handouts, each scene's music prompt, and the chosen files), the
images and tracks under `files/`, and `project.json` (id, title, category,
status, campaign title, system, dates and schema version). Snapshots SHALL
NOT be exported. Export SHALL lose no text the user wrote.

#### Scenario: Round trip of the document

- **WHEN** a project created by import is exported and its `document.md` is
  imported again
- **THEN** the new project's document is byte-identical to the first one's,
  since a second conversion makes no edits

#### Scenario: Research in the export

- **WHEN** a project with the note «Colapesce» and two sources is exported
- **THEN** its folder's `research.md` holds the note's summary, facts and
  both sources' titles and URLs

### Requirement: Board and files in the export

`board.md` SHALL hold a part per category: Scenes, per appendix row in order,
with the scene id and title, its image prompts numbered in order and its
music title, style and lyrics; then PCs, NPCs and Handouts, each item with
its name and prompt; every prompt with who wrote it and when and the name of
its chosen file. The images of a scene's prompt n SHALL be at
`files/scenes/<scene id>/<n>/<original name>`, a scene's tracks at
`files/scenes/<scene id>/music/`, the images of a PC, an NPC or a handout at
`files/pcs/<name>/`, `files/npcs/<name>/` or `files/handouts/<name>/`, and a
file in the Unmatched tray at `files/unmatched/<original name>`. A name
taken twice in one folder, or by two items of one category, SHALL get «
(2)», « (3)»… Thumbnails SHALL NOT be exported. The zip SHALL be streamed,
never built whole in memory.

#### Scenario: Files in their scene's folder

- **WHEN** a project whose S1 has two image prompts with four images each,
  one chosen, two tracks, the NPC «Padre Anselmo» with four images and one
  unmatched track is exported
- **THEN** the folder holds `files/scenes/S1/1/` and `files/scenes/S1/2/`
  with four images each, `files/scenes/S1/music/` with two tracks,
  `files/npcs/Padre Anselmo/` with four images, `files/unmatched/` with the
  track, and `board.md` lists S1's two prompts, the music and Padre Anselmo
  with the chosen file

#### Scenario: Board from v0.6 exported

- **WHEN** a project whose board was written before image categories is
  exported before anyone opens it
- **THEN** each scene's single prompt and its images are exported as its
  prompt 1, and the stored document is unchanged

#### Scenario: Large export

- **WHEN** the user exports everything while the projects hold 3 GB of files
- **THEN** the server sends the zip as it reads the files, without holding it
  in memory
