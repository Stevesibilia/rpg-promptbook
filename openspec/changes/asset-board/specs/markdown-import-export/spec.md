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
questions), `board.md` (each scene's image and music prompts and chosen
files), the images and tracks under `files/`, and `project.json` (id, title,
category, status, campaign title, system, dates and schema version).
Snapshots SHALL NOT be exported. Export SHALL lose no text the user wrote.

#### Scenario: Round trip of the document

- **WHEN** a project created by import is exported and its `document.md` is
  imported again
- **THEN** the new project's document is byte-identical to the first one's,
  since a second conversion makes no edits

#### Scenario: Research in the export

- **WHEN** a project with the note «Colapesce» and two sources is exported
- **THEN** its folder's `research.md` holds the note's summary, facts and
  both sources' titles and URLs

## ADDED Requirements

### Requirement: Board and files in the export

`board.md` SHALL hold, per appendix row in order, the scene id and title,
the image prompt, the music title, style and lyrics, each with who wrote it
and when, and the names of the chosen image and track. Each file SHALL be at
`files/<scene id>/<original name>`, and a file in the Unmatched tray at
`files/unmatched/<original name>`; a name taken twice in one folder SHALL get
« (2)», « (3)»… before its extension. Thumbnails SHALL NOT be exported. The
zip SHALL be streamed, never built whole in memory.

#### Scenario: Files in their scene's folder

- **WHEN** a project whose S1 has four Midjourney images and two tracks, one
  of each chosen, and one unmatched track is exported
- **THEN** the folder holds `files/S1/` with six files, `files/unmatched/`
  with the track, and `board.md` naming the two chosen files under S1

#### Scenario: Large export

- **WHEN** the user exports everything while the projects hold 3 GB of files
- **THEN** the server sends the zip as it reads the files, without holding it
  in memory
