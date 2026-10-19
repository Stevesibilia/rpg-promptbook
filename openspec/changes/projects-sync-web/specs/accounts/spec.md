## ADDED Requirements

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
check used by the sign-in page, and the health check. Every request that
changes state SHALL be refused when it carries an `Origin` header, or
without one a `Referer` header, whose origin is not the configured public
URL's origin; a request with neither header SHALL pass this check, since
browsers send `Origin` on every cross-site write.

#### Scenario: Cross-site form

- **WHEN** a page on another site posts to the delete-project route with the
  user's cookie
- **THEN** the server refuses it and the project stays

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
