## ADDED Requirements

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

## MODIFIED Requirements

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
