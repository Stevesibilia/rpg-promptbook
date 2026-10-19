## MODIFIED Requirements

### Requirement: A project is one Yjs document

Each project SHALL be one Yjs document holding everything the user edits: its
metadata, its seed, its to-do list, its prep document, its sources of
inspiration, its research topics and notes, and its brainstorm log. The
document's shape SHALL be defined once, in the `promptbook-project` package,
and used by the server, the web client and later the desktop app. The shape
SHALL carry a schema version. Snapshots of the prep document SHALL live on
the server, outside the document.

#### Scenario: Shape read by every client

- **WHEN** the server creates a project and the web client opens it
- **THEN** both read the title, category, status, seed, to-do items and
  document text through the same package functions

#### Scenario: Older document read

- **WHEN** a project created before this change is opened
- **THEN** its inspiration items, research and brainstorm log read as empty
  lists and nothing else changes
