## ADDED Requirements

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

## MODIFIED Requirements

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
