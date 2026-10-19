## ADDED Requirements

### Requirement: Documents sync through the server

The server SHALL sync each project's Yjs document between every client that
has it open, over a WebSocket on the same origin as the web client, with the
Hocuspocus protocol. Edits made in one client SHALL reach the others without
a reload, and concurrent edits SHALL merge without asking the user to choose
a version.

#### Scenario: Two tabs

- **WHEN** the same project is open in two browser tabs and one types a
  sentence in the document while the other ticks a to-do item
- **THEN** within two seconds both tabs show the sentence and the ticked item

#### Scenario: Offline edits in a tab merge on reconnect

- **WHEN** a tab loses the connection, the user keeps typing, and another tab
  edits a different paragraph meanwhile
- **THEN** after the connection comes back both paragraphs hold both edits

### Requirement: Only the owner opens a document

The server SHALL accept a sync connection for a project only with a valid
session of the project's owner, only from the server's own origin (the
upgrade request's `Origin` header SHALL equal the configured public URL's
origin), and only while the project is not in the bin. Signing out SHALL
close every sync connection opened with that session.

#### Scenario: No session

- **WHEN** a WebSocket connection asks for a project without a session cookie
- **THEN** the server refuses it and sends no document content

#### Scenario: Foreign origin

- **WHEN** a page on another origin opens a WebSocket to the server with the
  user's cookie
- **THEN** the server refuses the connection

#### Scenario: Project in the bin

- **WHEN** a project is moved to the bin while it is open in a tab
- **THEN** the server closes that tab's connection and refuses new ones

### Requirement: Documents are stored in Postgres

The server SHALL store each document's Yjs state in Postgres, debounced after
edits and at the latest when the last client disconnects, and SHALL update
the project's summary in the same transaction. A server restart SHALL lose no
stored edit. When storing fails, the server SHALL tell the document's
clients, and tell them again once a later store succeeds.

#### Scenario: Store fails

- **WHEN** the database refuses a store while a project is open
- **THEN** the open tabs show Not saved until a later store succeeds

#### Scenario: Restart

- **WHEN** a user edits a project, closes the tab, and the server restarts
- **THEN** opening the project again shows the edit

### Requirement: Sync state in the browser

The web client SHALL show the sync state of the open projects in the top bar,
with a panel that opens on click. In the browser the states SHALL be:
Synced (every change is on the server), Syncing (changes are being sent or
received), Reconnecting (the connection dropped; changes are only in this
tab), Not saved (the server could not store changes) and Sign in to sync (the
session ended). With several projects open the worst state SHALL show. Not
saved and Sign in to sync SHALL also show a banner under the top bar. Sign in
from the banner or the panel SHALL open a sign-in dialog over the current
page, so unsent changes stay in the tab. The panel SHALL show the server, the
account, the time of the last sync, the projects with unsent changes and a
Sign out button.

#### Scenario: Connection drops

- **WHEN** the server stops while a project is open and the user types
- **THEN** the pill shows Reconnecting with the number of unsent changes, and
  after the server is back it returns to Synced

#### Scenario: Session ends

- **WHEN** the user signs out in another tab while a project is open and
  keeps typing in the first tab
- **THEN** the first tab shows Sign in to sync and the banner, and after
  signing in again through the dialog the typed text reaches the server
