## ADDED Requirements

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
challenge, the MCP resource, known scopes, a known client and one of its
redirect URIs; an invalid request SHALL show an error and SHALL NOT redirect.
Allow SHALL record a grant for the signed-in user at the chosen scope, which
may not be wider than requested, and send the browser to the redirect URI
with a single-use code, the state and the issuer. Deny SHALL send it back
with `access_denied` and record nothing. Approving SHALL be refused from
another origin.

#### Scenario: Signed out, then consent

- **WHEN** a signed-out user opens a valid `/authorize` request with single
  sign-on configured and signs in through Authentik
- **THEN** the consent page for that same request shows the Authentik
  account

#### Scenario: Wrong resource

- **WHEN** a request names a resource other than `<PUBLIC_URL>/api/mcp`
- **THEN** the page shows the error and the browser is not redirected

#### Scenario: Read only chosen

- **WHEN** Claude asks for `read read_write` and the user chooses Read your
  projects and presses Allow
- **THEN** the grant has the scope `read`, and the tokens from its code can
  read and cannot write

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
so its tokens stop working at once. The section SHALL show how to connect
Claude: the connector URL `<PUBLIC_URL>/api/mcp` with Copy, and the steps
Settings → Connectors → Add custom connector, paste the URL, sign in and
Allow. A user SHALL see and revoke only their own grants.

#### Scenario: Revoked app stops

- **WHEN** the user revokes Claude in Connected apps
- **THEN** Claude's next MCP call gets 401

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
`get_brainstorm_log` and `add_brainstorm_entry`, with input schemas,
descriptions and annotations. No tool SHALL write the seed, tick or remove
to-do items, or delete anything. The descriptions SHALL tell Claude to read a
project's brainstorm log first in a new chat. Everything a tool writes SHALL
be marked as Claude's where the data has an author, and SHALL reach the
project's open editors without a reload.

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

### Requirement: Section-scoped edits

`read_document` SHALL return the whole prep document, or one target's text,
with the SHA-256 of that text. A target SHALL be a template section's name,
a scene id such as `S3`, or a sheet's name, compared case and accent
insensitive; for a campaign, a `##` or `###` heading's text.
`replace_section` SHALL replace one target's text, heading included, only
when the hash sent equals the hash of the target's current text, and only
when the new text starts with a heading of the same level (for a scene, the
same id). For an adventure or a one-shot, an edit that raises the document's
error count SHALL be refused with the new problems; warnings SHALL be
reported and allowed. For a campaign no check SHALL run. `add_scene` SHALL
append a scene with the next id at the end of the «Scene» section under the
same check. Every change to the prep document by a tool SHALL first store a
snapshot of the text it replaces, and SHALL apply as a Yjs change to the live
document so open editors see it at once.

#### Scenario: Section changed since read

- **WHEN** Claude reads S3, the user then types in S3, and Claude calls
  `replace_section` with the hash it read
- **THEN** the call fails with `changed_since_read` and the text is the
  user's

#### Scenario: Edit adding an error refused

- **WHEN** Claude replaces S3 with text that drops its scene id
- **THEN** the call fails with `more_errors`, lists the new problem, and the
  document and the snapshots are unchanged

#### Scenario: Edit seen live

- **WHEN** the project is open in the editor and Claude replaces S3 with a
  valid text and the right hash
- **THEN** the editor shows the new S3 without a reload, and History lists a
  Claude snapshot holding the text from before the edit

#### Scenario: Unknown target

- **WHEN** Claude reads the target «S9» in a document with five scenes
- **THEN** the call fails with `unknown_target` and lists the valid targets
