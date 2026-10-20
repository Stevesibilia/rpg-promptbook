## MODIFIED Requirements

### Requirement: A project is one Yjs document

Each project SHALL be one Yjs document holding everything the user edits: its
metadata, its seed, its to-do list, its prep document, its sources of
inspiration, its research topics and notes, its brainstorm log, its board's
prompts and choices, and the list of its images and tracks. The document's
shape SHALL be defined once, in the `promptbook-project` package, and used by
the server, the web client and the desktop app. The shape SHALL carry a
schema version. The row the projects list shows SHALL also be defined in that
package, so the server and the desktop app build the same row from a
document's summary. Snapshots of the prep document SHALL live on the server,
outside the document, and on the desktop app also in its local store. The
bytes of images and tracks SHALL live outside the document, in the server's
file store and on the desktop app's disk.

#### Scenario: Shape read by every client

- **WHEN** the server creates a project and the web client opens it
- **THEN** both read the title, category, status, seed, to-do items and
  document text through the same package functions

#### Scenario: Older document read

- **WHEN** a project created before this change is opened
- **THEN** its inspiration items, research, brainstorm log, board and file
  list read as empty and nothing else changes

#### Scenario: Same row offline

- **WHEN** the desktop app, offline, ticks a to-do item of a project with 5
  of 9 items done
- **THEN** its projects list shows 6/9, and once synced the server's list
  shows the same row

#### Scenario: Board edits merge

- **WHEN** the desktop app, offline, writes S3's image prompt while Claude
  writes S3's music prompt, and the app comes back online
- **THEN** S3 holds both prompts
