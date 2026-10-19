## 1. Server: configuration, schema, command line

- [x] 1.1 `openid-client` 6.8.8 in `promptbook-server`; `Config.oidc` and its errors (design decision 2)
- [x] 1.2 `002_oidc.sql` (decision 3); `purge` deletes expired `oidc_logins`
- [x] 1.3 `user:delete` (decision 6)
- [x] 1.4 Tests: config combinations; migration on a database holding a password account; `user:delete` with projects in the bin

## 2. Server: sign-in

- [x] 2.1 `accounts/oidc.ts` and `routes/oidc.ts`: start, callback, browser binding, errors (decisions 1 and 4)
- [x] 2.2 `findOrCreateOidcUser` (decision 5)
- [x] 2.3 `GET /api/auth/config`, `me` additions, `PUBLIC_ROUTES`, 403 `password_sign_in_off`
- [x] 2.4 Tests against an in-process issuer: first sign-in, returning sign-in with changed email and username, username suffix, wrong browser, replayed and expired state, `access_denied`, provider down, bad signature and nonce, `return_to` filtering, password routes refused, config answers
- [x] 2.5 Hand-back of brief A

## 3. Web

- [x] 3.1 `api.ts`, `SignInPage.tsx`, error messages (decision 7)
- [x] 3.2 `SignInDialog.tsx` new window, route `/signed-in`, `BroadcastChannel`
- [x] 3.3 Settings, Account for single sign-on accounts
- [ ] 3.4 Tests: sign-in page in both modes and each error; the dialog closing on the broadcast; the Account section in both modes

## 4. Chart, pipeline, preview, docs

- [ ] 4.1 Chart values and deployment (decision 8); `helm lint` and `helm template` with both values files, and a render with both modes on that fails
- [ ] 4.2 `.gitlab-ci.yml` `prepare-secrets`
- [ ] 4.3 e2e: the suite still passes in password mode; one test of the sign-in page in oidc mode against the in-process issuer if it fits the stack, else say so
- [ ] 4.4 Preview for the owner: the compose stack with a local test issuer, reachable on the LAN; URL and steps in a status note; wait for the owner's go
- [ ] 4.5 `docs/deploy-homelab.md` (single sign-on, turning it off, `user:delete`), `docs/design.md` (auth line, "no linking"); Prettier on them
- [ ] 4.6 Checks and hand-back of brief B

## 5. Cluster and release (architect)

- [ ] 5.1 MR: group `Promptbook`; applied; the owner joins it
- [ ] 5.2 MR: Authentik application and Secret; applied
- [ ] 5.3 Pull request, CI green, merge; tag `v0.2.0`; GitLab pipeline green
- [ ] 5.4 `user:delete steve`; the owner's first sign-in; a password sign-in refused; archive; close #17
