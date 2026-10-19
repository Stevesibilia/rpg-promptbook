## Context

Accounts today (`openspec/specs/accounts`): local usernames with Argon2id
passwords, no sign-up, the first account from `PROMPTBOOK_ADMIN_USERNAME` and
`PROMPTBOOK_ADMIN_PASSWORD`, `user:create` and `user:password` on the
command line, a session cookie `pb_session` (httpOnly, SameSite=Lax, secure
behind HTTPS), sign-in throttling. The relevant code:

- `packages/server/migrations/001_init.sql`: `users.password_hash text not
null`; `sessions`, `user_settings` and `projects` reference `users` with
  `on delete cascade`.
- `packages/server/src/accounts/auth.ts:21`: `PUBLIC_ROUTES`, the Origin
  check on unsafe methods, the session hook.
- `packages/server/src/routes/auth.ts`: `POST /api/auth/login`,
  `POST /api/auth/logout`, `GET /api/auth/me`, `PATCH /api/auth/me`,
  `POST /api/auth/password`.
- `packages/server/src/accounts/{users,sessions,passwords,throttle}.ts`,
  `packages/server/src/config.ts` (zod), `packages/server/src/cli.ts`
  (`migrate`, `user:create`, `user:password`, `seed`),
  `packages/server/src/main.ts` (`ensureAdmin`, the hourly `purge`).
- Web: `packages/web/src/auth/{SignInPage,SignInForm}.tsx`,
  `packages/web/src/shell/SignInDialog.tsx` (the "Sign in to sync" modal
  opened through `openSignIn` from `Shell.tsx` and `SyncPill.tsx`),
  `packages/web/src/settings/SettingsPage.tsx` section `Account()`,
  `packages/web/src/api.ts` (`me`, `login`; a 401 calls `onUnauthorized`),
  `packages/web/src/App.tsx` (routes `/`, `/bin`, `/settings/:section?`,
  `/projects/:id`, `*` to `/`).

The reference implementation is gdrarchive's
(`~/Homelab/gdrarchive/packages/backend/src/services/oidcService.ts`,
`routes/auth.ts:139-195`, `plugins/auth.ts:302-317`, migrations
`009_auth.sql` and `043_oidc_browser_binding.sql`), with `openid-client` 5.
Its spec: "The system SHALL NOT match an OIDC login to an existing account by
email address" (`~/Homelab/gdrarchive/openspec/specs/auth/spec.md:260`).
cronista does the same in Python. Neither app reads group claims: access is
an Authentik policy binding.

Cluster side: in-cluster applications define their Authentik provider in
their own `infra/terraform/app_<name>.tf` with
`modules/authentik-oidc-app` (outputs `client_id`, `client_secret`,
`issuer_url`) and feed the outputs into a Secret (`kubernetes_cluster/AGENTS.md`,
authentik section). Groups live in `infra/terraform-authentik/groups.tf`;
members are managed in the Authentik UI. The module's `allowed_groups`
looks the group up with a data source at plan time, so the group must be
applied before the application.

## Goals / Non-Goals

**Goals:** sign-in through Authentik as the only way in on the homelab,
accounts created at the first sign-in, a clear way back in when Authentik is
down, the mockup's screens.

**Non-Goals:** linking an identity to an existing account; group or role
claims in the app; RP-initiated logout at Authentik; the desktop app (#6);
more than one identity per account.

## Decisions

### 1. `openid-client` 6, authorization code with PKCE

`openid-client` 6.8.8 (ESM, maintained; gdrarchive's v5 API is gone in v6):
`discovery(new URL(issuer), clientId, clientSecret)` once at the first use,
cached, a failed discovery not cached; `buildAuthorizationUrl` with
`code_challenge_method: 'S256'`, `state`, `nonce`, scope
`openid profile email`; `authorizationCodeGrant` with `pkceCodeVerifier`,
`expectedState`, `expectedNonce`, `idTokenExpected: true`; then
`claims()` for `iss`, `sub`, `preferred_username`, `name`, `email`. The
token's `iss` is stored as returned (Authentik's ends with a slash). Rejected:
a hand-written client (cronista's choice in Python; more surface to test).

### 2. Configuration

`config.ts` gains, all optional:

| Variable             | Meaning                                              |
| -------------------- | ---------------------------------------------------- |
| `OIDC_ISSUER`        | the issuer URL                                       |
| `OIDC_CLIENT_ID`     | the client                                           |
| `OIDC_CLIENT_SECRET` | its secret                                           |
| `OIDC_PROVIDER_NAME` | the button's name, default `single sign-on`          |
| `OIDC_REDIRECT_URI`  | default `<PUBLIC_URL origin>/api/auth/oidc/callback` |

`Config.oidc` is `{ issuer, clientId, clientSecret, providerName,
redirectUri } | null`. The first three set together or not at all, else a
`ConfigError` naming the missing ones. With `oidc` set, a
`PROMPTBOOK_ADMIN_USERNAME` or `PROMPTBOOK_ADMIN_PASSWORD` is a
`ConfigError` ("cannot be used with single sign-on"), so a password account
cannot be created by the deploy by mistake.

### 3. Schema: `002_oidc.sql`

```sql
alter table users alter column password_hash drop not null;
alter table users add column oidc_issuer text, add column oidc_subject text,
  add column email text;
alter table users add constraint users_oidc_pair
  check ((oidc_issuer is null) = (oidc_subject is null));
create unique index users_oidc_identity on users (oidc_issuer, oidc_subject)
  where oidc_issuer is not null;

create table oidc_logins (
  state text primary key,
  browser_hash text not null,
  nonce text not null,
  code_verifier text not null,
  return_to text not null,
  expires_at timestamptz not null
);
```

`email` is for display only and never a lookup key. One identity per account,
so columns on `users` rather than gdrarchive's `oidc_identities` table. A
password account has `password_hash` and no identity; a single sign-on
account has an identity and no password. `purge` (hourly) also deletes
expired `oidc_logins`.

### 4. Routes

In `packages/server/src/routes/oidc.ts`, registered only when `config.oidc`
is set, with the logic in `packages/server/src/accounts/oidc.ts`:

- `GET /api/auth/oidc/start?return_to=<path>`: 32 random bytes as `state`, a
  nonce and a PKCE verifier; a row in `oidc_logins` expiring in 10 minutes;
  a cookie `pb_oidc` with another 32 random bytes (httpOnly, SameSite=Lax,
  secure as `pb_session`, path `/api/auth/oidc`, max age 600 s) whose
  SHA-256 is the row's `browser_hash`; then 302 to the provider.
  `return_to` is kept only if it is a path (starts with `/`, not `//`, no
  `\`), else `/`.
- `GET /api/auth/oidc/callback`: deletes the row by `state` and
  `browser_hash` in one statement (`delete … returning`), clears `pb_oidc`;
  no row, an expired row or `error=access_denied` → 302 `/?sign_in=cancelled`.
  A provider unreachable at discovery or token exchange →
  `/?sign_in=unreachable`. Any other failure (token checks) →
  `/?sign_in=failed`, logged at warn without the token. Success: find the
  account by `(iss, sub)` or create it (decision 5), update `email`, create a
  session as password sign-in does (`createSession`, `setSessionCookie`,
  `last_login_at`), 302 to `return_to`.
- `GET /api/auth/config` (public, always registered):
  `{ signIn: 'oidc', providerName }` or `{ signIn: 'password' }`.
- `POST /api/auth/login` and `POST /api/auth/password` answer 403
  `password_sign_in_off` while `config.oidc` is set, before any password work
  and without counting a throttle failure.
- `GET /api/auth/me` adds `email` and `signIn: 'oidc' | 'password'` (how
  this account signs in) to `user`.

`PUBLIC_ROUTES` gains `GET /api/auth/config`, `GET /api/auth/oidc/start` and
`GET /api/auth/oidc/callback`. Both OIDC routes are GETs, so the Origin
check does not apply; the state, the browser cookie and PKCE protect them.
The browser binding is gdrarchive's (its #61): a callback link sent to
someone else cannot complete in their browser.

### 5. Account creation

`findOrCreateOidcUser(tx, claims)` under
`pg_advisory_xact_lock(hashtextextended('promptbook-oidc|' || iss || '|' || sub, 0))`:
an existing `(iss, sub)` returns that account. Otherwise a new account with
`username` = `preferred_username` trimmed and lowercased (falling back to
`user`), with the first free suffix `-2`, `-3`… when taken (compared without
case, as the unique index does); `display_name` = `name` ??
`preferred_username`; no password. Never a match on email or username.
Its settings row is created the way `createUser` creates one today.

### 6. Command line

`user:delete <username>`: deletes the account in one transaction (the
cascades take sessions, settings and projects, the bin included) and prints
`Deleted "<username>": <n> projects.`. Unknown username: exit 1 with a
message. `user:create` and `user:password` stay, for the password mode.

### 7. Web

- `api.ts`: `config()` for `GET /api/auth/config`; `User` gains `email` and
  `signIn`.
- `SignInPage.tsx`: reads the config. `oidc`: one primary button "Sign in
  with {providerName}" that sets `location.href` to
  `/api/auth/oidc/start?return_to=<current path and search, minus sign_in>`,
  and the footer "promptbook.siberio.eu · accounts come from
  <issuer host>. The first sign-in creates yours." (the host from the
  config: add `issuerHost` to the oidc config answer). `password`: today's
  form, unchanged.
- Errors: `?sign_in=cancelled|unreachable|failed` shows in the `.err` place
  above the button: "Sign-in was cancelled or took too long. Try again.",
  "{providerName} could not be reached. Try again in a minute.", "Sign-in
  failed. Try again."; the parameter is removed with `history.replaceState`.
- `SignInDialog.tsx` ("Sign in to sync", opened when a session ends in a
  page with unsent changes): in `oidc` mode its button opens the start URL
  with `return_to=/signed-in` in a new window (`window.open`), so the page
  with the unsent changes stays. A route `/signed-in` shows "You are signed
  in. You can close this window." and posts `signed-in` on a
  `BroadcastChannel('promptbook-auth')`; the dialog listens, calls
  `api.me()`, closes and lets sync resume. If `window.open` returns null, the
  dialog says "Allow pop-ups for this site, or sign in again from a new tab."
- Settings, Account: for `signIn: 'oidc'` the password button is gone, the
  lead is "Your account comes from {providerName}. Players have no
  accounts.", the display name field has the hint "Taken from
  {providerName} at the first sign-in; change it here if you like.", and a
  line "Signed in through {providerName} · {email}". `password` accounts see
  today's section.

The mockup's states map to: 1 and 2 the sign-in page, 3 the Account section,
4 the password mode. The dialog's new window is not in the mockup; it follows
from keeping unsent changes (the owner's #2 decision) and is shown in the
preview.

### 8. Chart and pipeline

- `values.yaml`: `app.oidc.enabled: false`, `issuer`, `providerName`,
  `secret: rpg-promptbook-oidc` (keys `client-id`, `client-secret`);
  `app.admin.enabled: true` keeps today's `PROMPTBOOK_ADMIN_*` from
  `credentialsSecret` for a password deploy.
- `values-homelab.yaml`: `app.oidc.enabled: true`, `issuer:
https://auth.siberio.eu/application/o/rpg-promptbook/`, `providerName:
Authentik`; `app.admin.enabled: false`.
- `deployment.yaml`: the OIDC variables when `app.oidc.enabled` (client id
  and secret by `secretKeyRef`, `optional: false`); the admin variables only
  when `app.admin.enabled`; rendering fails when both are on. The
  `checksum/config` input gains the oidc values.
- `.gitlab-ci.yml` `prepare-secrets`: only the registry Secret; the
  `rpg-promptbook-credentials` Secret and the `PB_ADMIN_*` check go.
- Turning single sign-on off (runbook): `helm upgrade` with
  `--set app.oidc.enabled=false`, re-run of the deploy, or the variable
  removed from the pod; then `user:create` through `kubectl exec` for a
  password account.

### 9. Cluster (architect)

Two merge requests on `homelab/kubernetes_cluster`, each applied before the
next, because the application's group lookup runs at plan time:

1. `infra/terraform-authentik/groups.tf`: `authentik_group.promptbook`,
   name `Promptbook`. The owner then adds themselves in the Authentik UI.
2. `infra/terraform/app_rpg_promptbook.tf`: `module "rpg_promptbook_sso"`
   (`name = "RPG Promptbook"`, `slug = "rpg-promptbook"`,
   `redirect_uris = ["https://promptbook.siberio.eu/api/auth/oidc/callback"]`,
   `allowed_groups = ["Promptbook"]`, `access_token_validity = "minutes=5"`,
   `launch_url = "https://promptbook.siberio.eu"`), and
   `kubernetes_secret_v1.rpg_promptbook_oidc` in the namespace with
   `client-id` and `client-secret` from the module.

The subject mode stays the module's default (`hashed_user_id`) and must
never change: accounts are keyed by it.

### 10. Release

`v0.2.0`. After the deploy the architect runs `user:delete steve` in the
pod, as the owner decided, and the owner signs in with Authentik for the
first time. The GitLab variables `PB_ADMIN_USERNAME` and `PB_ADMIN_PASSWORD`
are no longer read; the owner may delete them.

## Risks / Trade-offs

- **Locked out when Authentik is down.** Accepted by the owner; the runbook
  says how to turn single sign-on off.
- **A second member of the group gets a second account** with their own
  projects. Accepted: Authentik's group decides who may come in.
- **Fake provider in tests.** `openid-client` must be tested against a real
  HTTP issuer: an in-process issuer on `127.0.0.1` with `jose` (discovery,
  JWKS, authorize redirect, token endpoint signing an ID token), as cronista
  does. `openid-client` refuses plain `http` issuers unless
  `allowInsecureRequests` is passed: pass it only in tests, through an
  option the production code never sets. If that turns out impossible,
  report it rather than weakening the production client.
- **Pop-up blockers** for the dialog's new window: it opens from the click,
  which browsers allow; the fallback message covers the rest.
- **The username suffix** makes an Authentik user `steve` become `steve-2`
  if the old local account still exists at the first sign-in. The release
  deletes `steve` first.
