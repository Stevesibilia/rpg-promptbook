## 1. Server (brief A)

- [x] 1.1 `packages/project/src/row.ts`: `ProjectRow` and `projectRow(summary, dates, campaigns)` with the server's campaign rule, exported from `index.ts`; the server's `toRow` and the web's `api.ts` type use it (`summarize` and `skeletonDocument` are already in the package: nothing else moves) (design D7)
- [x] 1.2 `migrations/004_desktop.sql`: `oauth_clients.first_party`, `oauth_grants.device_name`, scope check widened to `app`, the seeded `promptbook-desktop` client; `sweepUnusedClients` keeps first-party clients (D8)
- [x] 1.3 `oauth/config.ts` `appResource` and scope `app`; authorize validation (app resource and scope only for and always for the first-party client, `device_name` 1 to 80 printable characters); `GET /api/oauth/authorize` answers `first_party`; the approval stores `device_name`; the code exchange issues tokens for the code's resource (D8)
- [x] 1.4 Auth hook: a bearer app token without a cookie sets `req.session` with `via: 'app'` and `grantId`; no origin check for it; consent routes and `POST /api/auth/logout` refuse an app session with 403 `cookie_session_required`; `POST /api/auth/password` with an app session ends every cookie session; the route test's classes updated (D8)
- [x] 1.5 `sync.ts`: `onAuthenticate` accepts the provider `token` as an app access token without the `Origin` check; `SyncContext.grantId`; `closeGrants(grantIds)` called after `DELETE /api/auth/grants/:id`, `POST /api/oauth/revoke` and a revoking reuse (`oauthRoutes` receives `sync`) (D8)
- [x] 1.6 `POST /api/projects` with optional `id` and `state`: 8 MB `bodyLimit`, 5 MB decoded state, shape and `meta.id` check (`invalid_state`), 201 new, 200 same owner, 409 `id_taken` (D9)
- [x] 1.7 Web `AuthorizePage`: for `first_party`, «Signing in Promptbook on this computer…» and the approval with `granted_scope: 'app'` at once; Connected apps shows «Promptbook desktop · <device>» with the access «Desktop app» (D8)
- [x] 1.8 Db tests of D17's server list: seeded client and sweep, app resource and scope rules, first-party approval, `device_name`, bearer REST (app token works, MCP token 401, app token 401 at `/api/mcp`, consent and logout refuse it), `/sync` token auth without `Origin`, MCP token refused, revocation closes sockets (three paths), create with `id`/`state` (validation, size, mismatch, 409, idempotence)
- [x] 1.9 Checks: `npm run typecheck`, `npm test`, `npm run e2e` (connector and sso suites green); hand-back of brief A

## 2. Desktop core (brief B)

- [x] 2.1 Read the CueBard references before the scaffold: `~/Homelab/liveplay/package.json` `build`, `electron/updater.js`, `.github/workflows/build-release.yml` (port, do not import; the updater and the workflow are used in group 4)
- [x] 2.2 Scaffold `packages/desktop` (`promptbook-desktop`): `electron` 44.x, `electron-builder`, `electron-updater` pinned exactly after `npm view`; `scripts/build.mjs` (esbuild main and preload to `dist/*.cjs`, target `node24`; web dist copied to `app/web` without `.br`/`.gz`); root `tsconfig.json` reference; `vitest` setup (D1, D2)
- [x] 2.3 `protocol.ts` and `window.ts`: `promptbook://app` privileged scheme, `protocol.handle` with SPA fallback and the CSP of D2; window flags, navigation guard, `setWindowOpenHandler`, single-instance lock, window title (D2, D3)
- [ ] 2.4 `preload/index.ts` and `ipc.ts`: the `window.promptbook` bridge with the `pb:<area>:<verb>` channels, sender and argument checks; the type from `promptbook-web/src/platform/bridge.ts` (D3)
- [x] 2.5 `store.ts`: one database per account, `device.json`, the six tables, WAL, append on every update, compaction at 500 rows and on quit, Not saved queue retried every 10 s (D4)
- [x] 2.6 `sync.ts`: one socket, a provider per project with the token function, load before attach, origins `remote` / `renderer:<id>` / `main`, forwarding to renderers, stateless messages, `unsynced:<id>` counts (D5)
- [x] 2.7 `auth/loopback.ts` and `auth/tokens.ts`: listener, PKCE, state, `shell.openExternal` or `PROMPTBOOK_E2E` hand-off, the Signed in and failure pages, 5-minute timeout, cancel, reopen; token exchange and refresh, `safeStorage` with the memory-only fallback, sign-out with revoke and optional removal (D8)
- [ ] 2.8 `router.ts`: local routes (projects, bin cache, settings, me, auth config, merged snapshots with `source`, offline user snapshot, local restore and delete), forward with the bearer, 503 `offline`, 401 → signed out; list refresh and bin detection of D10 (D7, D10)
- [x] 2.9 `create.ts`: offline and online create through the same path, upload before attach, retry on reconnect, 409/400 left local (D9)
- [ ] 2.10 `snapshots.ts`: per-project timers by `kv['local_snapshots']`, only on changed text, labels, expiry at start and every 24 h; first-sync progress events (D10, D12)
- [ ] 2.11 Unit tests of D17's desktop list: store, router, loopback against a fake AS, offline create upload, local snapshots
- [ ] 2.12 Checks: `npm run typecheck`, `npm test`, `npm run build -w promptbook-desktop`, the app starts unpackaged against the local stack; hand-back of brief B

## 3. Web client (brief C)

- [ ] 3.1 `src/platform/` (`index.ts`, `web.ts`, `desktop.ts`, `bridge.ts`): `platform.init()` awaited in `main.tsx`; `api.ts` `request()` through `platform.request` (D6)
- [ ] 3.2 Every browser-only use through the seam: `SyncPill.tsx:88`/`:138`, `SettingsPage.tsx:426`/`:435`, `ConnectedApps.tsx:19`, `Shell.tsx:152`, `SignInDialog.tsx:59`, `ProjectPanel.tsx:102`, `EditorPage.tsx` PDF save and print (D6)
- [ ] 3.3 `desktopRegistry.ts`: the IPC-backed `SyncRegistry` with the current public API; `sync/state.ts` gains `local` (order and label of D11); the hooks unchanged (D5, D11)
- [ ] 3.4 Desktop screens: Sign in (label from the server's auth config), In browser, Sign-in failed, First sync with «Start with what is downloaded»; rows not yet downloaded (Mockup in words, D8, D10)
- [ ] 3.5 Desktop sync states: pill, popover (On this device, Show data folder, Sign out…), amber and red strips, status bar, the list's device column and the panel's «On this device» line (D11)
- [ ] 3.6 «Needs the server» on the actions of D7 while offline
- [ ] 3.7 History sources: Source column, All/Server/This device filter, offline line, hint with the link, local save toast (D7, D12)
- [ ] 3.8 Settings → This device at `/settings/device` (desktop only) and Sync and storage's desktop lead; the sign-out dialog with the removal tick and its warning; the update strip, status-bar item and What's new dialog driven by `updates.onState` (D13, D14)
- [ ] 3.9 Unit tests: `overallState` with `local`, platform selection, the desktop registry against a fake bridge, the sign-out dialog's states
- [ ] 3.10 Checks: `npm run typecheck`, `npm test`, `npm run e2e` with the web suite unchanged and green; hand-back of brief C

## 4. Packaging, updates, release pipeline, e2e and docs (brief D)

- [ ] 4.1 `updater.ts` after CueBard's `electron/updater.js`: per-platform flows of D14 (Windows and AppImage download and restart; Mac and deb latest-release API and Download), checks at start, every 6 h and on demand, off when not packaged; unit tests of its decisions
- [ ] 4.2 electron-builder `build` in `packages/desktop/package.json` as D15 (from CueBard's `build`), the generated `build/icon.png`; `electron-builder --dir` works locally on the Mac
- [ ] 4.3 `.github/workflows/desktop.yml` as D16 (from CueBard's `build-release.yml`): pull request dry run on ubuntu, tag build on three OSes with the tag-on-main guard and the version from the tag, one release job with `gh release create --generate-notes --verify-tag` and the uploads; `workflow_dispatch` dry run
- [ ] 4.4 `e2e/desktop.spec.ts` and the `desktop` project in `e2e/playwright.config.ts` (the `chromium` project ignores it): the flow of D17; the CI `e2e` job builds the desktop and runs under `xvfb-run`
- [ ] 4.5 The whole e2e suite green, once normally and once with `E2E_CPU_THROTTLE=3`
- [ ] 4.6 Docs: README (install per OS, Gatekeeper's Open Anyway, SmartScreen, where the data lives, signing out); `docs/design.md` (desktop decisions, `node:sqlite` instead of `better-sqlite3`); `docs/deploy-homelab.md` (the GitHub Release made by the tag workflow); Prettier on the files touched
- [ ] 4.7 Owner preview: the branch's server as a local compose stack (password mode, seeded user) and a locally packaged Mac build (`--dir`, the unpacked `.app`) opened on the owner's Mac against it; give the owner the URLs and the app path, then stop and wait for the owner's go
- [ ] 4.8 Checks (`npm run typecheck`, `npm test`, `npm run e2e`) and hand-back of brief D
