# accounts Specification

## Purpose

How RPG Promptbook signs the game master in: local accounts without sign-up, sessions, protection of requests, sign-in throttling and account settings.

## Requirements

### Requirement: Local accounts without sign-up

The server SHALL hold local accounts with a unique username (compared without
case), a display name and a password hashed with Argon2id. There SHALL be no
sign-up page. An account SHALL be created either at server start, when no
account exists and `PROMPTBOOK_ADMIN_USERNAME` and
`PROMPTBOOK_ADMIN_PASSWORD` are set, or with the server's command line
(`user:create`, `user:password`). Passwords SHALL have at least 12
characters.

#### Scenario: First start with the admin variables

- **WHEN** the server starts on an empty database with
  `PROMPTBOOK_ADMIN_USERNAME=steve` and a 14-character password
- **THEN** the account `steve` exists and can sign in

#### Scenario: Variables ignored once an account exists

- **WHEN** the server restarts with different admin variables and an account
  already exists
- **THEN** no account is created or changed

### Requirement: Sign in and sign out

Signing in with a correct username and password SHALL create a server-side
session and set an `httpOnly`, `SameSite=Lax` session cookie, `Secure` when
the request came over HTTPS. The cookie SHALL hold a random token; the
database SHALL store only its SHA-256 hash. A session SHALL last 30 days
unless `SESSION_TTL_HOURS` says otherwise. A wrong username and a wrong
password SHALL give the same answer, in about the same time. Signing out
SHALL delete the session.

#### Scenario: Wrong password

- **WHEN** the user signs in with a wrong password
- **THEN** the answer is «Wrong username or password.» and no cookie is set

#### Scenario: Sign out

- **WHEN** the user signs out
- **THEN** the session is deleted and the next API request answers 401

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

### Requirement: Sign-in throttling

The server SHALL count failed sign-ins over 15 minutes and refuse further
attempts for that window after 10 failures for one username or 30 from one
IP address, with the same message as a wrong password plus a hint to wait.

#### Scenario: Too many failures

- **WHEN** an account has 10 failed sign-ins in 15 minutes
- **THEN** the 11th attempt is refused even with the right password, and
  succeeds once the window has passed

### Requirement: Account settings

A signed-in user SHALL be able to change their display name, and change
their password by giving the current one. Changing the password SHALL end
every other session of that user.

#### Scenario: Password change

- **WHEN** the user changes the password in one browser while signed in on
  another
- **THEN** the other browser's next request answers 401 and its open projects
  show Sign in to sync

### Requirement: Single sign-on through OpenID Connect

The server SHALL sign the game master in through an OpenID Connect provider
when `OIDC_ISSUER`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` are all set,
with the authorization code flow and PKCE, and SHALL identify an account only
by the pair of the token's issuer and subject, never by email address or
username. The first sign-in of an identity SHALL create its account, with no
password. Setting only some of the three variables SHALL be a configuration
error.

#### Scenario: First sign-in

- **WHEN** someone completes the provider's sign-in for the first time
- **THEN** the server creates an account keyed by the issuer and subject,
  with the username from `preferred_username` and the display name from
  `name`, opens a session and returns them to the page they started from

#### Scenario: Returning sign-in

- **WHEN** the same identity signs in again
- **THEN** the server opens a session for the account created the first time,
  whatever its email or username at the provider has become

#### Scenario: An existing username

- **WHEN** the first sign-in's `preferred_username` is already the username of
  another account
- **THEN** the new account gets that username with the first free suffix
  `-2`, `-3`… and the other account is untouched

#### Scenario: A sign-in started in another browser

- **WHEN** a callback arrives with a state that was not started in this
  browser, has expired or was already used
- **THEN** no session is opened and the sign-in page shows "Sign-in was
  cancelled or took too long. Try again."

### Requirement: Password sign-in only without single sign-on

While single sign-on is configured, the server SHALL refuse
`POST /api/auth/login` and `POST /api/auth/password` with 403
`password_sign_in_off`, and SHALL refuse to start with
`PROMPTBOOK_ADMIN_USERNAME` or `PROMPTBOOK_ADMIN_PASSWORD` set. A public
`GET /api/auth/config` SHALL say which sign-in the server offers.

#### Scenario: Password with single sign-on on

- **WHEN** single sign-on is configured and a client posts a username and
  password to `/api/auth/login`
- **THEN** the server answers 403 `password_sign_in_off` and opens no session

#### Scenario: Single sign-on turned off

- **WHEN** the server starts without the OIDC variables
- **THEN** `GET /api/auth/config` answers `{ "signIn": "password" }` and local
  accounts sign in with their passwords as before

### Requirement: Account deletion from the command line

The server's command line SHALL offer `user:delete <username>`, which deletes
the account with its sessions, settings and projects, bin included. It runs
in its own process, so a sync connection still open in the server ends at
its next reconnect, which finds no session.

#### Scenario: Deleting the old local account

- **WHEN** `user:delete steve` runs on a server whose account `steve` has two
  projects in the bin
- **THEN** the account, its sessions and both projects are gone, and the
  command prints what it removed
