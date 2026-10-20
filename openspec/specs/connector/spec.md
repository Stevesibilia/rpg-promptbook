# connector Specification

## Purpose

The Claude connector: an MCP endpoint with section-scoped tools, the OAuth authorization server that lets Claude sign in as the user, the consent page and Connected apps.

## Requirements

### Requirement: Authorization server metadata

The server SHALL publish OAuth protected resource metadata at
`/.well-known/oauth-protected-resource/api/mcp` and
`/.well-known/oauth-protected-resource`, naming the resource
`<PUBLIC_URL origin>/api/mcp`, its authorization server and the scopes `read`
and `read_write`; and authorization server metadata at
`/.well-known/oauth-authorization-server` with the issuer (the `PUBLIC_URL`
origin), the authorization endpoint `/authorize`, the token, registration
and revocation endpoints under `/api/oauth/`, the code response type, the
authorization code and refresh token grants, S256 only, public clients only,
and support for client ID metadata documents. Both SHALL be readable from any
origin without credentials and SHALL name the configured origin whatever the
request's host.

#### Scenario: Discovery from the endpoint

- **WHEN** a client posts to `/api/mcp` without a token
- **THEN** it gets 401 with a `WWW-Authenticate` header whose
  `resource_metadata` is the protected resource metadata URL, and that
  document names the authorization server whose metadata lists the
  endpoints

### Requirement: Client identification

The server SHALL accept clients registered dynamically (RFC 7591) at
`POST /api/oauth/register` with a name of 1 to 200 characters, at least one
redirect URI and no client secret, and clients identified by an `https:`
client ID metadata document, fetched only from public addresses, without
redirects, at most 64 KB within 5 seconds, whose `client_id` equals its URL,
cached for at most an hour. Redirect URIs SHALL be `https:`, or `http:` on a
loopback host, and SHALL match a registered one exactly, the port of a
loopback URI excepted. Registration SHALL be limited to 30 per address per
15 minutes. Registered clients never approved SHALL be removed after 24
hours.

#### Scenario: Metadata document on a private address

- **WHEN** an authorization request names a client ID URL whose host resolves
  to `10.0.0.5`
- **THEN** the request is refused as an invalid client and nothing is
  fetched from that address

#### Scenario: Registration throttled

- **WHEN** one address registers a 31st client within 15 minutes
- **THEN** the server answers 429 and stores nothing

### Requirement: Consent through the app's sign-in

The authorization endpoint SHALL be the web page `/authorize`, shown only to
a signed-in user; a signed-out user SHALL sign in the usual way, through
single sign-on when it is configured, and come back to the same request. The
page SHALL follow the Authorize view of
[docs/mockups/connector.html](../../../docs/mockups/connector.html):
the client's name, where the request comes from, the signed-in account with
Not you?, a choice between Read your projects and Read and edit your
projects (the widest requested chosen first), Deny and Allow. The request
SHALL be validated before the page shows it: code response type, an S256
challenge, the MCP resource (or, for the first-party client, the app
resource), known scopes, a known client and one of its redirect URIs; an
invalid request SHALL show an error and SHALL NOT redirect. Allow SHALL
record a grant for the signed-in user at the chosen scope, which may not be
wider than requested, and send the browser to the redirect URI with a
single-use code, the state and the issuer. Deny SHALL send it back with
`access_denied` and record nothing. Approving SHALL be refused from another
origin. For the first-party client the page SHALL NOT ask: it SHALL show
«Signing in Promptbook on this computer…», record the grant with the scope
`app` and the device name, and redirect at once.

#### Scenario: Signed out, then consent

- **WHEN** a signed-out user opens a valid `/authorize` request with single
  sign-on configured and signs in through Authentik
- **THEN** the consent page for that same request shows the Authentik
  account

#### Scenario: Wrong resource

- **WHEN** a request names a resource other than `<PUBLIC_URL>/api/mcp`, and
  the client is not the first-party client
- **THEN** the page shows the error and the browser is not redirected

#### Scenario: Read only chosen

- **WHEN** Claude asks for `read read_write` and the user chooses Read your
  projects and presses Allow
- **THEN** the grant has the scope `read`, and the tokens from its code can
  read and cannot write

#### Scenario: Desktop app signs in

- **WHEN** a signed-in browser opens an authorization request from
  `promptbook-desktop` for the app resource with the device name «studio-mac»
- **THEN** the page shows Signing in Promptbook on this computer…, a grant
  with the scope `app` and the device name «studio-mac» is recorded, and the
  browser goes to the loopback redirect URI with a code, without a click

### Requirement: Tokens

The token endpoint SHALL accept only form-encoded requests and SHALL exchange
a code once, within 10 minutes, for the same client, redirect URI and
resource, with a matching PKCE verifier. Access tokens SHALL last one hour and
refresh tokens 30 days; every refresh SHALL rotate the refresh token, and a
refresh token used twice SHALL revoke the whole grant. Codes and tokens SHALL
be random, prefixed `pb_ac_`, `pb_at_` and `pb_rt_`, and stored only as
SHA-256 digests. Revoking either token (RFC 7009) SHALL revoke the grant.
Responses SHALL not be cached.

#### Scenario: Refresh token reused

- **WHEN** a refresh token is exchanged, then the same token is presented
  again
- **THEN** the second request is refused and every token of that grant stops
  working

#### Scenario: Code spent

- **WHEN** a code is exchanged a second time
- **THEN** the request is refused with `invalid_grant`

### Requirement: Connected apps

Settings SHALL have a Connected apps section listing the user's grants with
the app's name and site, the access (Read only, or Read and edit), when it was
approved and last used, and Revoke, which after a confirm deletes the grant
so its tokens stop working at once. A grant of the first-party desktop client
SHALL show as «Promptbook desktop · <device name>» with the access «Desktop
app», and revoking it SHALL also close its sync connections. The section
SHALL show how to connect Claude: the connector URL `<PUBLIC_URL>/api/mcp`
with Copy, and the steps Settings → Connectors → Add custom connector, paste
the URL, sign in and Allow. A user SHALL see and revoke only their own
grants.

#### Scenario: Revoked app stops

- **WHEN** the user revokes Claude in Connected apps
- **THEN** Claude's next MCP call gets 401

#### Scenario: Lost computer revoked

- **WHEN** the user revokes «Promptbook desktop · studio-mac» while that
  computer is syncing
- **THEN** its sync connection closes, its next request gets 401, and it
  shows Sign in to sync

### Requirement: MCP endpoint

`POST /api/mcp` SHALL serve the Model Context Protocol over Streamable HTTP,
stateless, with JSON responses, using `@modelcontextprotocol/server` and
`@modelcontextprotocol/node` 2.0.0. It SHALL accept only a bearer access
token issued for this resource and SHALL ignore cookies; it SHALL answer 421
to a Host header other than `PUBLIC_URL`'s host, 405 to other methods, and
accept bodies up to 1 MB. It SHALL be callable from any origin without
credentials. Tools SHALL act as the user who approved the grant, on that
user's projects only, never on a project in the bin. Tools that change data
SHALL require the `read_write` scope and SHALL answer an insufficient scope
error naming it otherwise. Errors SHALL come back as tool errors with a code
and a message a model can act on, never a stack trace.

#### Scenario: Cookie is not a credential

- **WHEN** a request to `/api/mcp` carries the user's session cookie and no
  bearer token
- **THEN** it gets the same 401 as a request with nothing

#### Scenario: Read scope cannot write

- **WHEN** a client with a `read` grant calls `add_todo`
- **THEN** the call fails with `insufficient_scope` and the to-do list is
  unchanged

### Requirement: Tools

The endpoint SHALL offer `list_projects`, `get_project`, `create_project`,
`get_outline`, `read_document`, `replace_section`, `add_scene`, `list_todo`,
`add_todo`, `get_inspiration`, `add_inspiration_item`, `list_research`,
`get_research_note`, `save_research_note`, `add_research_topic`,
`get_brainstorm_log`, `add_brainstorm_entry`, `get_board` and
`set_scene_prompts`, with input schemas, descriptions and annotations. No tool
SHALL write the seed, tick or remove to-do items, or delete anything. The
descriptions SHALL tell Claude to read a project's brainstorm log first in a
new chat. Everything a tool writes SHALL be marked as Claude's where the data
has an author, and SHALL reach the project's open editors without a reload.

#### Scenario: Brainstorm entry saved

- **WHEN** Claude calls `add_brainstorm_entry` with a title, two ideas, a
  rejected idea with why and an open question
- **THEN** the project's brainstorm log has that entry first, via Claude,
  dated now

#### Scenario: Project created

- **WHEN** Claude calls `create_project` with the title «La fiera di
  Randazzo» and the category one-shot
- **THEN** a draft one-shot exists with the user's one-shot skeleton and
  to-do template and no seed

#### Scenario: Board tools listed

- **WHEN** a client lists the endpoint's tools
- **THEN** the list holds `get_board` as a read tool and `set_scene_prompts`
  as a write tool, beside the other seventeen

### Requirement: Section-scoped edits

`read_document` SHALL return the whole prep document, or one target's text,
with the SHA-256 of that text. A target SHALL be a template section's name,
a scene id such as `S3`, or a sheet's name, compared case and accent
insensitive; for a campaign, a `##` or `###` heading's text.
`replace_section` SHALL replace one target's text, heading included, only
when the hash sent equals the hash of the target's current text, and only
when the new text starts with a heading of the same level (for a scene, the
same id). Problems found by the checks SHALL never refuse an edit: for an
adventure or a one-shot, the result SHALL report the document's errors and
warnings before and after the edit and the problems in the edited text, as
information. For a campaign no check SHALL run. `add_scene` SHALL append a
scene with the next id at the end of the «Scene» section, reported the same
way. Every change to the prep document by a tool SHALL first store a
snapshot of the text it replaces, and SHALL apply as a Yjs change to the live
document so open editors see it at once.

#### Scenario: Section changed since read

- **WHEN** Claude reads S3, the user then types in S3, and Claude calls
  `replace_section` with the hash it read
- **THEN** the call fails with `changed_since_read` and the text is the
  user's

#### Scenario: Edit adding an error is written and reported

- **WHEN** Claude replaces S3 with text that has no read-aloud callout
- **THEN** the edit is written, and the result lists the new error and the
  error counts before and after

#### Scenario: Scene added before its appendix row

- **WHEN** Claude adds a scene with `add_scene` while the appendix has no row
  for it, then adds the row with `replace_section`
- **THEN** both edits are written, the first result reports the missing
  row, and the second reports it gone

#### Scenario: Edit seen live

- **WHEN** the project is open in the editor and Claude replaces S3 with a
  valid text and the right hash
- **THEN** the editor shows the new S3 without a reload, and History lists a
  Claude snapshot holding the text from before the edit

#### Scenario: Unknown target

- **WHEN** Claude reads the target «S9» in a document with five scenes
- **THEN** the call fails with `unknown_target` and lists the valid targets

### Requirement: First-party desktop client

The server SHALL hold one first-party client, `promptbook-desktop` («Promptbook
desktop»), a public client with the redirect URI
`http://127.0.0.1/callback` (any port), created by a migration and never
removed by the sweep of unused clients. Besides the MCP resource, the server
SHALL issue tokens for an app resource, `<PUBLIC_URL origin>/api`, with the
scope `app`, to first-party clients only; a first-party client SHALL get
only that resource and scope. App tokens SHALL be accepted on REST and on
`/sync` and refused at `/api/mcp`; MCP tokens SHALL be refused on REST and on
`/sync`. An authorization request from the first-party client SHALL carry a
device name of 1 to 80 characters, stored with the grant. Token lifetimes,
rotation and revocation SHALL be the ones of the Tokens requirement.

#### Scenario: Seeded client survives the sweep

- **WHEN** the sweep of unused clients runs on a server where nobody ever
  signed in with the desktop app
- **THEN** `promptbook-desktop` is still registered

#### Scenario: App token at the MCP endpoint

- **WHEN** a client calls `/api/mcp` with an app access token
- **THEN** it gets 401 with the `WWW-Authenticate` challenge

#### Scenario: Another client asks for the app resource

- **WHEN** a dynamically registered client asks for the resource
  `<PUBLIC_URL>/api`
- **THEN** the authorization request is refused and nothing is issued

### Requirement: Board tools

`get_board` SHALL answer, for an adventure or one-shot, one row per appendix
row with the scene id, title, `visual:` and `mood:` lines, the image prompt,
the music title, style and lyrics, who wrote each and when, each half's
status and file count, the number of unmatched files, and the duplicate
music titles. For a campaign it SHALL answer the error `no_board`.

#### Scenario: Board read

- **WHEN** Claude calls `get_board` on «L'Ancora di Sabaoth», whose S3 has an
  image prompt and four images, none chosen
- **THEN** the S3 row holds the prompt, its author and date, and the image
  status received with 4 files

#### Scenario: Campaign

- **WHEN** Claude calls `get_board` on a campaign
- **THEN** the tool answers the error `no_board`

### Requirement: Writing a scene's prompts

`set_scene_prompts` SHALL need edit access and take a project id, a scene id,
and an image prompt, a music title, style and lyrics, or both. It SHALL
refuse a scene id with no appendix row (`unknown_scene`) and texts over the
limits, and nothing else: problems in the document SHALL NOT refuse it. It
SHALL overwrite the fields it is given, marked as Claude's and dated now,
and SHALL store no snapshot: prompts are not versioned.

#### Scenario: Prompts written

- **WHEN** Claude calls `set_scene_prompts` for S2 with an image prompt and a
  music title, style and lyrics
- **THEN** the board's S2 row shows both prompts «by Claude · just now»
  without a reload, and History lists no new snapshot

#### Scenario: Only the image

- **WHEN** Claude calls `set_scene_prompts` for S3 with an image prompt only
- **THEN** S3's image prompt is replaced and its music prompt is unchanged

#### Scenario: Scene not in the appendix

- **WHEN** Claude calls `set_scene_prompts` for S9, which has no appendix row
- **THEN** the tool answers `unknown_scene` and nothing is written

#### Scenario: Document with errors

- **WHEN** the document has two errors and Claude calls `set_scene_prompts`
  for S1
- **THEN** the prompts are written

#### Scenario: Duplicate title

- **WHEN** Claude sets the music title «Ordini del Re» on S4 while S3 has it
- **THEN** the prompts are written and the answer carries a warning naming S3

### Requirement: Board tool descriptions

The board tools' descriptions SHALL give the prompt rules: Midjourney prompts
in English, subject first, then setting, lighting, style and mood, ending
`--ar 16:9 --v 8.1`, one prompt per scene; Suno prompts in English with 4 to
7 style descriptors, lyrics of meta tags ending `[End]`, instrumental unless
asked; and a music title unique in the project, since it becomes the
download's filename that matches the track.

#### Scenario: Rules in the description

- **WHEN** a client reads `set_scene_prompts`' description
- **THEN** it names `--ar 16:9 --v 8.1`, `[End]` and that the title must be
  unique in the project
