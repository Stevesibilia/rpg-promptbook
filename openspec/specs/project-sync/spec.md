# project-sync Specification

## Purpose

How a project's Yjs document is synced between clients and the server, who may open it, how it is stored, and the sync states the browser shows.

## Requirements

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
session of the project's owner, or with an app access token of the owner's
grant passed as the sync token, and only while the project is not in the
bin. A connection authenticated by the session cookie SHALL come only from
the server's own origin (the upgrade request's `Origin` header SHALL equal
the configured public URL's origin); a connection authenticated by an app
access token SHALL NOT be checked for its origin, since the token is not
ambient. Signing out SHALL close every sync connection opened with that
session, and revoking a grant SHALL close every sync connection opened with
its tokens.

#### Scenario: No session

- **WHEN** a WebSocket connection asks for a project without a session cookie
  or a token
- **THEN** the server refuses it and sends no document content

#### Scenario: Foreign origin

- **WHEN** a page on another origin opens a WebSocket to the server with the
  user's cookie
- **THEN** the server refuses the connection

#### Scenario: Project in the bin

- **WHEN** a project is moved to the bin while it is open in a tab
- **THEN** the server closes that tab's connection and refuses new ones

#### Scenario: Desktop app with its token

- **WHEN** the desktop app connects without a cookie and with no `Origin`
  header, passing an app access token of the owner as the sync token
- **THEN** the server syncs the project

#### Scenario: MCP token refused

- **WHEN** a client passes an access token issued for the MCP endpoint as the
  sync token
- **THEN** the server refuses the connection

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

### Requirement: A project created on a device is uploaded with its state

`POST /api/projects` SHALL accept, besides the fields of a new project, an
optional `id` (a UUID) and an optional `state` (a base64 Yjs update of at
most 5 MB, which needs `id`). With `state`, the server SHALL store that
document as the project's, after checking that it reads as a project whose
`meta.id` equals `id`, and SHALL build its summary from it. An `id` already
used by another user SHALL be refused with 409. The same `id` sent again by
its owner SHALL answer the existing project and change nothing.

#### Scenario: Offline project uploaded

- **WHEN** the desktop app posts `id` and the `state` of a one-shot created
  offline
- **THEN** the server answers 201 with its row, built from that document,
  and the web client lists it

#### Scenario: Retry

- **WHEN** the same owner posts the same `id` and `state` a second time
- **THEN** the server answers 200 with the same project and stores nothing
  new

#### Scenario: Mismatched id

- **WHEN** the posted `state`'s `meta.id` differs from `id`
- **THEN** the server answers 400 `invalid_state` and creates nothing
