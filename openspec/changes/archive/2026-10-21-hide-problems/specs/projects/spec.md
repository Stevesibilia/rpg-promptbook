## MODIFIED Requirements

### Requirement: A project is one Yjs document

Each project SHALL be one Yjs document holding everything the user edits: its
metadata, its seed, its to-do list, its prep document, its sources of
inspiration, its research topics and notes, its brainstorm log, its board's
prompts and choices, the list of its images and tracks, and the problems the
user has hidden. The document's shape SHALL be defined once, in the
`promptbook-project` package, and used by the server, the web client and the
desktop app. The shape SHALL carry a schema version. The row the projects
list shows SHALL also be defined in that package, so the server and the
desktop app build the same row from a document's summary. Snapshots of the
prep document SHALL live on the server, outside the document, and on the
desktop app also in its local store. The bytes of images and tracks SHALL
live outside the document, in the server's file store and on the desktop
app's disk.

#### Scenario: Shape read by every client

- **WHEN** the server creates a project and the web client opens it
- **THEN** both read the title, category, status, seed, to-do items and
  document text through the same package functions

#### Scenario: Older document read

- **WHEN** a project created before this change is opened
- **THEN** its inspiration items, research, brainstorm log, board, file list
  and hidden problems read as empty and nothing else changes

#### Scenario: Same row offline

- **WHEN** the desktop app, offline, ticks a to-do item of a project with 5
  of 9 items done
- **THEN** its projects list shows 6/9, and once synced the server's list
  shows the same row

#### Scenario: Board edits merge

- **WHEN** the desktop app, offline, writes S3's image prompt while Claude
  writes S3's music prompt, and the app comes back online
- **THEN** S3 holds both prompts

#### Scenario: Hides merge

- **WHEN** the desktop app, offline, dismisses a problem in S1 while the
  browser snoozes a problem in S3, and the app comes back online
- **THEN** both problems are hidden on both

### Requirement: Project summary for the list

The server SHALL keep a summary of each project, updated whenever the
project's document is stored: title, category, status, campaign, system, the
current seed, to-do items done and total, and the time of the last edit. For
adventures and one-shots it SHALL also hold the number of scenes, the number
of words and the counts of errors and warnings from parsing the document with
the format package, leaving out the problems the user has hidden at the time
it is stored. A snoozed problem SHALL count again from the next store after
its snooze ends. The project list SHALL be built from the summaries without
loading the documents.

#### Scenario: Summary follows an edit

- **WHEN** a to-do item is ticked in a project with 5 of 9 items done
- **THEN** the list shows 6/9 for that project once the change is stored

#### Scenario: Hidden problems not counted

- **WHEN** the user dismisses one of a project's 3 warnings
- **THEN** the list shows 2 warnings for that project once the change is
  stored
