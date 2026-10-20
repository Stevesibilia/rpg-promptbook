## MODIFIED Requirements

### Requirement: Requests are protected by default

Every API route SHALL require a valid session except sign-in, the account
check used by the sign-in page, the health check, and the OAuth routes of
the connector: registration, token, revocation and the MCP endpoint. Those
OAuth routes SHALL ignore the session cookie; the MCP endpoint SHALL require
a bearer access token instead. A request without a session cookie that
carries a bearer access token issued for the app resource
(`<PUBLIC_URL origin>/api`) SHALL act as the user of that token's grant on
every route that requires a session, except the consent routes and sign-out,
which SHALL require a cookie session; any other bearer token SHALL get the
same 401 as no credential. Every other request that changes state SHALL be
refused when it carries an `Origin` header, or without one a `Referer`
header, whose origin is not the configured public URL's origin; a request
with neither header SHALL pass this check, since browsers send `Origin` on
every cross-site write. The OAuth routes and requests authenticated by a
bearer app token SHALL be outside this check, since they are called
cross-site by design or carry no ambient credential, and do not read the
cookie.

#### Scenario: Cross-site form

- **WHEN** a page on another site posts to the delete-project route with the
  user's cookie
- **THEN** the server refuses it and the project stays

#### Scenario: Cross-site consent refused

- **WHEN** a page on another site posts an approval to `/api/oauth/authorize`
  with the user's cookie
- **THEN** the server refuses it and no grant is recorded

#### Scenario: Token endpoint from another origin

- **WHEN** a browser-based client posts to `/api/oauth/token` with an
  `Origin` of another site
- **THEN** the request is handled on its merits, not refused for its origin

#### Scenario: Desktop app lists projects with its token

- **WHEN** the desktop app calls `GET /api/projects` with
  `Authorization: Bearer` and an app access token, and no cookie
- **THEN** the server answers the projects of that token's user

#### Scenario: MCP token on REST

- **WHEN** a client calls `GET /api/projects` with an access token issued
  for the MCP endpoint
- **THEN** the server answers 401

#### Scenario: App token cannot approve consent

- **WHEN** a client posts an approval to `/api/oauth/authorize` with an app
  access token and no cookie
- **THEN** the server refuses it and no grant is recorded
