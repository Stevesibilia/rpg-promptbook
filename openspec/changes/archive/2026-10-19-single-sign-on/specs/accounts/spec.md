## ADDED Requirements

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
