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
status, campaign title, system, the project's own gdrarchive link when it has
one, dates and schema version). Snapshots SHALL NOT be exported. Export
SHALL lose no text the user wrote. Import SHALL NOT read the gdrarchive link
back.

#### Scenario: Round trip of the document

- **WHEN** a project created by import is exported and its `document.md` is
  imported again
- **THEN** the new project's document is byte-identical to the first one's,
  since a second conversion makes no edits

#### Scenario: Research in the export

- **WHEN** a project with the note «Colapesce» and two sources is exported
- **THEN** its folder's `research.md` holds the note's summary, facts and
  both sources' titles and URLs

#### Scenario: gdrarchive link in the export

- **WHEN** the campaign «Kulthos», linked to gdrarchive, and its adventure
  with no link of its own are exported
- **THEN** Kulthos's `project.json` holds the link's address and label, and
  the adventure's has no `gdrarchive` key
