## Why

The deployed server at `promptbook.siberio.eu` signs in with local passwords
only, while the owner's other homelab applications sign in through Authentik.
The owner asked on 2026-10-19 for Promptbook to use Authentik too. This is
the single sign-on part of #6, moved to its own issue (#17); the desktop app
stays in #6 and will sign in through the system browser, so it inherits this.

Decided with the owner on 2026-10-19, after the mockup
[docs/mockups/sso.html](../../../docs/mockups/sso.html):

- **No linking.** The account is the Authentik identity: the first sign-in of
  a member of the Authentik group `Promptbook` creates the account, keyed by
  issuer and subject. There is no link or unlink step. (This replaces the
  "Linked … sign in with either" card of `docs/mockups/projects.html`.)
- **Single sign-on only.** While it is configured, the sign-in page offers
  only "Sign in with Authentik" and the server refuses password sign-in.
- **Recovery** when Authentik is down: turn single sign-on off in the
  deployment; password sign-in comes back for local accounts made with the
  server's command line.
- **Access** is limited to the Authentik group `Promptbook`, enforced by
  Authentik.
- **The existing local account `steve`** (two test projects, both in the bin)
  is deleted at deploy, and the deploy stops creating a password account.

## What Changes

- **Server:** OpenID Connect sign-in (authorization code with PKCE) when
  `OIDC_ISSUER`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` are set; accounts
  created at the first sign-in; password sign-in and password change refused
  while it is on; a public `GET /api/auth/config` that tells the web client
  which sign-in to show; `user:delete` on the command line.
- **Web:** the sign-in page and the "Sign in to sync" dialog show "Sign in
  with Authentik" when single sign-on is on, with the error messages of the
  mockup; Settings, Account shows "Signed in through Authentik" instead of the
  password section.
- **Chart and pipeline:** the OIDC settings from values and a Secret written
  by the cluster's Terraform; the admin password variables leave the deploy.
- **Cluster** (architect, `homelab/kubernetes_cluster`): the group
  `Promptbook`, the Authentik application bound to it, and the Secret
  `rpg-promptbook-oidc`.
- **Runbook:** single sign-on, turning it off, `user:delete`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `accounts`: single sign-on through an OpenID Connect provider, account
  creation at the first sign-in, password sign-in only while single sign-on
  is off, account deletion from the command line.

## Impact

- New: `packages/server/migrations/002_oidc.sql`,
  `packages/server/src/accounts/oidc.ts`, `packages/server/src/routes/oidc.ts`,
  their tests; `docs/mockups/sso.html`.
- Changed: server config, auth routes, CLI, purge; web sign-in page, sign-in
  dialog, settings; chart deployment and values; `.gitlab-ci.yml`;
  `docs/deploy-homelab.md`; `docs/design.md`.
- Dependency: `openid-client` 6.8.8 in `promptbook-server`.
- Released as `v0.2.0`.
