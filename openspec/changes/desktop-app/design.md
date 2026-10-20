## Context

`docs/design.md` decided offline writing and editing in a desktop app
(Offline, Two shells one frontend, Stack: Electron, electron-builder,
electron-updater from GitHub Releases as CueBard does, projects on disk in
SQLite in the main process, sign-in through the system browser with PKCE and a
loopback redirect, tokens kept with `safeStorage`). The agreed mockups are
[docs/mockups/desktop.html](../../../docs/mockups/desktop.html) (approved
2026-10-20 "as is") and the desktop parts of
[docs/mockups/projects.html](../../../docs/mockups/projects.html): the five
desktop sync states, First sync, and Not saved on disk. Implementers cannot
easily open the mockups, so the section "Mockup in words" below gives every
screen with its exact strings.

The owner answered on 2026-10-20: full release with an owner preview before
the merge; unsigned installers like CueBard; one `v*` tag gives one version
to the server and the app; offline means editing and creating projects;
Linux as AppImage and deb; Mac dmg and zip for arm64 and x64; Windows NSIS
x64. The architect took the decisions below.

### The code today

- **Packages.** npm workspaces `packages/*`, unscoped names
  `promptbook-format`, `promptbook-layout`, `promptbook-project`,
  `promptbook-server`, `promptbook-web` (each `package.json`). Root
  `engines.node` is `>=26` and `.nvmrc` says 26; `npm run typecheck` is
  `tsc -b`, `npm test` runs every workspace's tests, `npm run e2e` is
  `playwright test -c e2e/playwright.config.ts` (root `package.json`).
- **Project package.** `summarize` (`packages/project/src/summary.ts`) and
  `skeletonDocument` (`skeleton.ts`) already live in `promptbook-project` and
  are exported from `index.ts:81-82`; the server imports them
  (`server/src/projects.ts:2-10`). What stays in the server is the list row:
  `ProjectRow` and `toRow` (`server/src/projects.ts:25-83`), the campaign
  join rule in `SELECT` (`:85-95`), `campaignsOf` (`:116-129`) and
  `campaignFor` (`:163-172`). The web client keeps its own copy of
  `ProjectRow` (`web/src/api.ts:22`).
- **Creating a project.** `POST /api/projects` (`routes/projects.ts:33-37`,
  body `createBody` at `:15-23`: category, title, campaignId, system, status,
  seed) calls `createProject` (`projects.ts:187-215`), which builds the doc
  with `createProjectDoc` and `skeletonDocument` and stores it through
  `insertProject` (`:146-158`). The server's body limit is 1 MB
  (`app.ts:41`). No document size limit exists; the WebSocket's
  `maxPayload` is 20 MB (`sync.ts:196`).
- **Auth hook.** `authPlugin`'s `onRequest` (`accounts/auth.ts:110-127`)
  returns early for `OAUTH_ROUTES` (`:36-44`), runs `assertSameOrigin`
  (`:75-82`), resolves the `pb_session` cookie into `req.session`
  (`Session = { tokenHash, user }`, `accounts/sessions.ts:12-16`), and
  requires a session on every `/api` route outside `PUBLIC_ROUTES`
  (`:21-28`) through `requireSession` (`:99-102`), which every session route
  calls. `POST /api/auth/logout` and `POST /api/auth/password` use
  `session.tokenHash` (`routes/auth.ts:58-90`). The route test lists every
  `/api` route and expects 401 without a session for each one neither public
  nor OAuth (`test/db/accounts.test.ts:158-190`).
- **Sync.** `SyncContext = { userId, sessionHash }` (`sync.ts:22-25`).
  `onAuthenticate` (`:79-94`) refuses any `Origin` but the public origin
  (`:80`), checks the session and the project's owner; Hocuspocus hands it
  the provider's `token` too, unused today. `closeSessions` (`:139-144`)
  closes the sockets of ended sessions with 4401; `closeProject` sends
  `deleted` and closes with 4404. `accept` (`:169-189`) builds the context
  from the cookie's session.
- **OAuth (from #4).** `oauthConfig` (`oauth/config.ts:24-34`) has one
  resource, `${origin}/api/mcp`; scopes are `read` and `read_write` only
  (`:38-51`), and `oauth_grants.scope` has a check constraint for those two
  (`migrations/003_connector.sql:28`); `oauth_clients.kind` is `registered`
  or `metadata_document` (`:11`). `sweepUnusedClients`
  (`oauth/clients.ts:511-519`) deletes registered clients older than 24 hours
  with no grant. Loopback redirect URIs match with the port ignored
  (`clients.ts:72-103`). The authorize validation refuses any resource but
  the MCP one with `invalid_target` (`routes/oauth.ts:147-151`); the code
  exchange always issues tokens for `oauth.resource` (`:339-341`) and the
  refresh keeps the token's resource (`:359-361`). `verifyAccessToken`
  (`oauth/tokens.ts:288`) checks the token's resource for equality.
  Revocation goes through `revokeByTokenValue` (`:255`), `revokeForReuse`
  (`:202`) and `revokeGrant` (`grants.ts:58-63`); `oauthRoutes` receives
  `{ config, db }` only (`routes/oauth.ts:123`), so it cannot close sockets
  today. Lifetimes: code 10 minutes, access 1 hour, refresh 30 days
  (`tokens.ts:14-19`).
- **Security headers.** `headersPlugin` (`web.ts:10-30`): helmet's default
  CSP with `connect-src 'self' <ws origin>`, `script-src 'self'
'wasm-unsafe-eval'`, `img-src 'self' data: blob:`, and
  `upgrade-insecure-requests` on HTTPS. The web build carries `.br` and
  `.gz` copies served with `preCompressed` (`web.ts:43-48`).
- **Web client, network.** `api.ts` `request()` calls `fetch(path, init)`
  (`:133`); `exportUrl` and `exportAllUrl` are plain links (`:204-205`,
  used at `ProjectPanel.tsx:102` and `SettingsPage.tsx:435`). The sync
  registry is a singleton `registry` with one `HocuspocusProviderWebsocket`
  to `socketUrl()` = `ws(s)://${location.host}/sync`
  (`sync/registry.ts:37-60`), a provider per open project, and stateless
  messages handled at `:110-120`; hooks `useSync`, `useProjectDoc`,
  `useDocValue` (`sync/hooks.ts`). Awareness is not used: the editor binds
  with `yCollab(text, null, { undoManager })` (`editor/Editor.tsx:60`).
- **Web client, browser-only uses.** `location.host` or `location.origin`
  at `shell/SyncPill.tsx:88` and `:138`, `settings/SettingsPage.tsx:426`,
  `connect/ConnectedApps.tsx:19`, `shell/Shell.tsx:152`,
  `auth/SignInPage.tsx:62`, `:75`, `:104`; the sign-in popup at
  `shell/SignInDialog.tsx:59`; the PDF as a blob link
  (`editor/EditorPage.tsx:37-42`), saved through an `<a download>`
  (`:100-106`) and printed in a new tab (`:109-122`).
- **Sync states.** `syncStates = ['signed-out', 'not-saved',
'reconnecting', 'syncing', 'synced']` (`sync/state.ts:5`), labels at
  `:67-73`; stateless events `store-failed`, `stored`, `deleted`,
  `snapshot` (`:53-65`).
- **Settings.** Sections To-do templates, Document templates, Author and
  licence, Account, Connected apps, Sync and storage, Appearance
  (`settings/SettingsPage.tsx:14-22`); routes in `App.tsx:115-128`
  (`/settings/:section?`).
- **Consent page.** `connect/AuthorizePage.tsx:34-66` reads the request with
  `api.consentRequest`, and Allow posts `api.approve` and follows
  `redirect_to`.
- **E2E.** One Playwright project `chromium` (`e2e/playwright.config.ts`);
  the compose stack `promptbook-e2e` with the password app on 8091, account
  `e2e` / `e2e-password-0123`, service `app` (`e2e/stack.ts`); CI runs it in
  the `e2e` job of `.github/workflows/ci.yml`.
- **Release.** `mirror.yml` refuses a tag not on `main`
  (`git merge-base --is-ancestor`) and pushes it to GitLab, whose pipeline
  deploys. `docs/deploy-homelab.md:68-81` tells the architect to create the
  GitHub Release by hand with generated notes.

### CueBard, the reference

`~/Homelab/liveplay` ships CueBard the same way: `electron/updater.js`
(electron-updater with `autoDownload = false`, `autoInstallOnAppQuit =
true`, and on macOS a check of the GitHub latest-release API instead,
because Squirrel.Mac refuses unsigned updates), the `build` block of its
`package.json` (`publish: github`, `win` nsis x64, `mac` dmg and zip, `linux`
AppImage, deb and rpm x64), and `.github/workflows/build-release.yml` (a
matrix over windows-latest, ubuntu-latest and macos-latest, artifacts
uploaded, `scripts/update-manifests.js` merging two `latest-mac.yml`, then
one release job). Read them before writing the scaffold and the workflow;
port, do not import.

### Prototype measured by the architect (2026-10-20)

`electron@44.9.1` (npm latest that day) runs Node 24.22.0;
`require('node:sqlite')` gives a working `DatabaseSync` inside the Electron
binary, with a blob round trip of a `Uint8Array`; the global `WebSocket` is a
function. Main therefore needs no native module and no WebSocket package.

## Goals / Non-Goals

**Goals:**

- Sign in once with the server (single sign-on or password, in the system
  browser); after the first sync the app works with no server for as long as
  needed.
- Every project of the account is on disk and kept in sync in the
  background, whether its window is open or not.
- Edit and create projects offline; quit and relaunch offline; on reconnect
  everything reaches the server and merges with edits made elsewhere.
- Installers for Mac, Windows and Linux built and published by one tag, with
  updates on the platforms that can take them.
- The browser client and its e2e behave exactly as before.

**Non-Goals:**

- Code signing, notarisation, Mac in-app updates.
- Uploading snapshots saved offline to the server.
- Asset uploads (none exist yet), mobile, iPad.
- Changing token lifetimes, MCP tools or scopes, or the chart.

## Decisions

### D1. A new workspace `packages/desktop`

Package `promptbook-desktop` (unscoped, like the others; never
`@promptbook`), `private: true`, version `0.0.0` in the repository (set from
the tag in CI, D16). Electron 44.x, electron-builder and electron-updater,
pinned exactly at the versions `npm view` gives when the work starts. Main
and preload are TypeScript, bundled by esbuild (as the server is) into
`dist/main.cjs` and `dist/preload.cjs`, target `node24`, format `cjs`,
`electron` external. Layout:

```
packages/desktop/
  package.json            # main: dist/main.cjs; build: electron-builder (D15)
  scripts/build.mjs       # esbuild main + preload; copies the web dist (D2)
  build/icon.png          # 1024×1024 "P" logo (D15)
  src/main/index.ts       # app lifecycle, single instance lock
  src/main/protocol.ts    # promptbook://app (D2)
  src/main/window.ts      # BrowserWindow and its guards (D3)
  src/main/store.ts       # node:sqlite store (D4)
  src/main/sync.ts        # providers per project (D5)
  src/main/router.ts      # REST over IPC (D7)
  src/main/create.ts      # offline create and upload (D9)
  src/main/snapshots.ts   # local snapshots (D12)
  src/main/auth/loopback.ts, auth/tokens.ts   # sign-in and tokens (D8)
  src/main/updater.ts     # updates (D14)
  src/main/ipc.ts         # handlers behind the bridge (D3)
  src/preload/index.ts    # contextBridge: window.promptbook
  test/                   # vitest
```

The bridge's TypeScript type lives in `packages/web/src/platform/bridge.ts`;
`promptbook-desktop` imports it as a type from `promptbook-web` (a dev
dependency, since it copies the web build anyway), so the two sides cannot
drift.

Why: the stack `docs/design.md` chose. Rejected: electron-vite or Forge (a
second build tool beside esbuild and Vite).

### D2. The renderer is the web build, on a privileged protocol

`scripts/build.mjs` runs after `npm run build -w promptbook-web` and copies
`packages/web/dist` into `packages/desktop/app/web`, leaving out every `.br`
and `.gz` file. Main registers, before `app.ready`:

```ts
protocol.registerSchemesAsPrivileged([
  {
    scheme: "promptbook",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
```

and then `protocol.handle('promptbook', …)`: only host `app`; a path that
names a file under `app/web` answers it with its content type; anything else
answers `index.html` (the SPA fallback); a path that escapes the folder
answers 404. Every answer carries this CSP, the server's (helmet's defaults
plus `web.ts`'s directives) with `connect-src 'self'` only and no
`upgrade-insecure-requests`:

```
default-src 'self'; base-uri 'self'; font-src 'self' https: data:;
form-action 'self'; frame-ancestors 'self'; img-src 'self' data: blob:;
object-src 'none'; script-src 'self' 'wasm-unsafe-eval';
script-src-attr 'none'; style-src 'self' https: 'unsafe-inline';
connect-src 'self'
```

The window loads `promptbook://app/`.

Why: the renderer does no network at all (D3), so `'self'` is enough, and
the PDF worker's WASM fetch and the module workers need a standard, secure
origin. Rejected: loading the server's URL in the window (no offline);
`file://` (module workers, WASM fetch and absolute `/assets/` URLs break).

### D3. Main owns all data and all network

`BrowserWindow` with `contextIsolation: true`, `sandbox: true`,
`nodeIntegration: false`, `webSecurity: true`, the preload
`dist/preload.cjs`, the native window frame and title (`Promptbook`, or
`<project title> · Promptbook` on a project page, from `document.title`).
`will-navigate` and `will-redirect` refuse every URL outside
`promptbook://app/`; `setWindowOpenHandler` opens `http:` and `https:` URLs
with `shell.openExternal` and denies everything (always `{ action: 'deny'
}`). A single-instance lock focuses the open window on a second launch.

The preload exposes one typed object with `contextBridge.exposeInMainWorld(
'promptbook', bridge)`; every call is an `ipcRenderer.invoke` on a channel
`pb:<area>:<verb>`, every event an `ipcRenderer.on` with a returned
unsubscribe. The bridge (`PromptbookBridge`):

```ts
info(): Promise<DeviceInfo>            // pb:device:info  { os, version, serverOrigin, dataFolder, … }
request(path, init): Promise<BridgeResponse>   // pb:api:request (D7)
sync: { open(id), update(id, update), release(id), syncNow(),
        onUpdate(cb), onStatus(cb), onStateless(cb) }    // pb:sync:* (D5)
auth: { start(server), reopen(), cancel(), signOut({ remove }), onState(cb) }  // pb:auth:* (D8)
device: { showDataFolder(), setLocalSnapshots(mode), usage() }   // pb:device:* (D12, D13)
updates: { check(), restart(), openRelease(), onState(cb) }      // pb:updates:* (D14)
files: { openPdf(bytes, name), save(source, name) }              // pb:files:* (D6)
```

Main checks every IPC message's `senderFrame.url` starts with
`promptbook://app/` and validates its arguments (project ids are UUIDs,
paths start with `/api/`).

Why: tokens stay in main and `safeStorage`; sync goes on for every project
whatever the renderer does; a compromised page cannot read a token or open a
socket. Rejected: `nodeIntegration`; a token handed to the renderer for
direct fetches (the same token then lives in two places).

### D4. Local store: `node:sqlite` in main, one database per account

`<userData>/accounts/<id>/promptbook.sqlite`, where `<id>` is the first 16
hex characters of `sha256(serverOrigin + '\n' + userId)`, plus
`<userData>/device.json` (`{ "server": "<origin>", "lastAccount": "<id>" }`).
`<userData>` is Electron's (`~/Library/Application Support/Promptbook`,
`%APPDATA%\Promptbook`, `~/.config/Promptbook`), or `PROMPTBOOK_USER_DATA`
when set (tests). `DatabaseSync` with `journal_mode = WAL`, `synchronous =
NORMAL`, `foreign_keys = ON`, migrated by `user_version`. Tables, exact
names:

```sql
create table docs (
  project_id text primary key,
  state blob not null,          -- Y.encodeStateAsUpdate of the compacted doc
  updated_at integer            -- ms since epoch
);
create table doc_updates (
  seq integer primary key autoincrement,
  project_id text,
  update blob not null,         -- one Yjs update, as received or made
  origin text not null,         -- 'remote' | 'renderer:<webContentsId>' | 'main'
  created_at integer
);
create table projects (
  id text primary key,
  summary text not null,        -- JSON: the ProjectRow (D7)
  server_edited_at text,        -- editedAt as the server last listed it
  deleted_at text,              -- set when binned on the server (D10)
  created_local integer not null default 0,
  uploaded integer not null default 1
);
create table snapshots (
  id text primary key,
  project_id text,
  created_at integer,
  kind text,                    -- 'hourly' | 'user' | 'restore'
  label text,
  text text not null,
  words integer
);
create table server_cache (
  key text primary key,         -- 'settings' | 'me' | 'auth-config' | 'projects-bin'
                                -- | 'snapshots:<projectId>' | 'snapshot:<projectId>:<sid>'
  value text not null,          -- the server's JSON answer
  fetched_at integer
);
create table kv (key text primary key, value text);
-- kv keys: 'refresh_token' (safeStorage, base64), 'signed_in_at', 'user',
--          'local_snapshots' ('hourly' | 'quarter' | 'off'), 'unsynced:<projectId>'
```

Every update, local or remote, is appended to `doc_updates` in the same tick
it is applied. A project's rows are compacted into `docs` (state of the
in-memory doc, then the rows deleted, in one transaction) when it has more
than 500 rows, and for every project on quit (`before-quit`, awaited). A
doc is loaded as `docs.state` plus its `doc_updates` in `seq` order.

A failed write (`SQLITE_FULL`, an I/O error) puts that project in Not
saved: the update stays in memory in a per-project queue, retried every
10 s and on the next update; once a write succeeds the queue is flushed and
the state clears.

Why `node:sqlite` and not `better-sqlite3` (a departure from
`docs/design.md`, Stack): no native module to rebuild per OS and Electron
version; the prototype shows it works in Electron 44. One database per
account keeps two accounts on one computer apart and makes "remove the
projects from this computer" one folder deletion. Rejected: IndexedDB in the
renderer (data tied to the renderer's origin and lifetime, main could not
sync closed projects); one file per project (no transactions across a
project's rows and the list).

### D5. Sync in main, every project, all the time

`src/main/sync.ts`: one `HocuspocusProviderWebsocket` to
`${serverOrigin.replace(/^http/, 'ws')}/sync` (global `WebSocket`,
`maxDelay: 5_000` as the web), and one `HocuspocusProvider` per project in
the local `projects` table that is not deleted and is uploaded, open in a
window or not. Each project's `Y.Doc` is loaded from SQLite before its
provider attaches. `token` is a function returning the current access token
(refreshed before expiry, D8).

- Updates applied by the provider (origin is the provider) are stored with
  origin `remote` and sent to every renderer that has the project open
  (`pb:sync:update`).
- A renderer's update arrives on `pb:sync:update`, is applied with origin
  `renderer:<webContentsId>`, stored, and sent to the other renderers with
  the project open, never back to its sender.
- `pb:sync:open(id)` answers the doc's full state
  (`Y.encodeStateAsUpdate`) and the project's status; the renderer applies
  it to a fresh `Y.Doc`.
- Stateless messages `stored`, `deleted`, `snapshot`, `store-failed` are
  forwarded to the renderer as they arrive (`pb:sync:stateless`).
- `kv['unsynced:<id>']` counts local updates not yet acknowledged; it is
  reset when the provider reports synced with no unsynced changes, and
  survives a relaunch, so "N changes on this device" is right offline after
  a restart.
- Awareness is not used: the web binds the editor without it
  (`Editor.tsx:60`); main never sets awareness state.

Why: offline edits merge by Yjs alone on reconnect; a project edited on the
web while closed on the desktop is up to date when opened offline later.
Rejected: providers only for open projects (a project opened offline would
be stale); a provider in the renderer (needs the token there).

### D6. The web client's platform seam

`packages/web/src/platform/`:

- `index.ts`: `export const platform: Platform`, chosen once at start by the
  presence of `window.promptbook`; `main.tsx` awaits `platform.init()`
  before rendering, so `serverOrigin` is known synchronously after.
- `web.ts`: the browser implementation, exactly today's behaviour.
- `desktop.ts`: the bridge-backed one.
- `bridge.ts`: `PromptbookBridge` and its payload types (D3).
- `desktopRegistry.ts`: the IPC-backed sync registry (D5).

```ts
interface Platform {
  kind: "web" | "desktop";
  serverOrigin: string; // location.origin on web; the configured server on desktop
  init(): Promise<void>;
  request(path: string, init: RequestInit): Promise<Response>; // api.ts request()
  openSync(): SyncRegistry; // web: today's Hocuspocus registry; desktop: IPC-backed
  startSignIn(): void; // web: today's SignInDialog popup; desktop: bridge.auth.start
  openPdf(bytes: Uint8Array, name: string): Promise<void>; // web: new tab; desktop: temp file + shell.openPath
  download(source: string | Blob, name: string): Promise<void>; // web: <a download>; desktop: save dialog
}
```

`SyncRegistry` is the current class's public API (`open`, `release`,
`subscribe`, `getSnapshot`, `docStatus`, `syncNow`, the stored and snapshot
listeners); `registry` becomes `platform.openSync()`'s instance so the hooks
and components do not change. Every place listed in "The code today" under
browser-only uses goes through the seam: `location.host`/`origin` read
`platform.serverOrigin` (shown as its host where the host is shown), the
export links and the PDF save call `platform.download`, the PDF print calls
`platform.openPdf`, the sign-in dialog's popup calls `platform.startSignIn`.
`AuthorizePage` and the browser sign-in pages are never shown on the desktop.
One web build serves both shells; the browser's behaviour and the existing
e2e do not change.

Why: one frontend, as `docs/design.md` planned. Rejected: a second build of
the web for the desktop (two artefacts to test); `if (window.promptbook)`
scattered through components.

### D7. Desktop REST: a router in main behind `request()`

The renderer's `request(path, init)` becomes `pb:api:request`; main's
`router.ts` answers it. Answers have the server's shapes.

Answered locally, always from the store, refreshed from the server in the
background when online:

- `GET /api/projects`: rows from the local `projects.summary` of projects not
  deleted; `GET /api/projects?bin=1` from `server_cache['projects-bin']`.
  When online the router also lists the server's projects (D10) and updates
  the store.
- `POST /api/projects`: creates locally and uploads (D9).
- `GET /api/settings`, `GET /api/auth/me`, `GET /api/auth/config`: from
  `server_cache`, refreshed when online.
- `GET /api/projects/:id/snapshots` and `GET …/snapshots/:sid`: the server's
  list (forwarded when online, cached under `snapshots:<id>`, and each text
  fetched once cached under `snapshot:<id>:<sid>`) merged with the local
  `snapshots` rows, newest first, each item with `source: 'server' |
'device'`; `?kind=claude&limit=1` filters the merged list. A local
  snapshot answers with `kind` `hourly`, `user` or `restore` and
  `expiresAt` from D12.
- `POST /api/projects/:id/snapshots`: forwarded when online (a server `user`
  snapshot); offline, a local `user` snapshot.
- `POST /api/projects/:id/snapshots/:sid/restore` on a local snapshot: done
  in main on the local doc: a local `restore` snapshot labelled
  `Before restore` first, then the text replaced with the smallest edit (as
  the server's `live.ts` does), applied with origin `main` so it reaches the
  renderers and the server like any edit. `DELETE …/snapshots/:sid` on a
  local `user` snapshot deletes it.

Everything else is forwarded to `${serverOrigin}${path}` with
`Authorization: Bearer <access>` when online, and answered
`503 { "error": "offline", "message": "Needs the server." }` when not. A 401
from the server sets the account to signed out (D11). While offline the UI
shows these actions disabled with the hint "Needs the server": Import
Markdown, the bin and restore from it, Delete, Export (one project and all),
server snapshot Restore, Undo and Delete, the Claude banner's Undo,
Connected apps, Account changes (display name, password), and saving
Settings (templates, author and licence).

The list row: `ProjectRow` and a `projectRow(summary, { createdAt,
editedAt, deletedAt }, campaigns)` helper move to
`packages/project/src/row.ts`, exported from the package; the server's
`toRow` and the web's `api.ts` type use it, and main builds a row from
`summarize(doc, { campaigns })` over the local campaigns, with the server's
campaign rule (a link to a campaign in the bin, gone, or not a campaign
reads as stand-alone). `summarize` and `skeletonDocument` are already in the
package (see "The code today"): nothing else moves.

Why: the components keep calling the same REST paths; offline is a property
of the router, not of every component. Rejected: a local HTTP server in main
(a port any local process can call); rewriting components against IPC.

### D8. Sign-in: the server's OAuth AS with a first-party native client

The authorization server from #4, with the desktop as a first-party native
public client (RFC 8252).

- **Migration `004_desktop.sql`:**
  `alter table oauth_clients add column first_party boolean not null default
false`; `alter table oauth_grants add column device_name text check
(length(device_name) <= 80)`; the scope check of `oauth_grants` widened to
  `('read', 'read_write', 'app')`; and the seeded client:
  `insert into oauth_clients (client_id, kind, client_name, redirect_uris,
first_party) values ('promptbook-desktop', 'registered', 'Promptbook
desktop', '["http://127.0.0.1/callback"]', true) on conflict (client_id)
do nothing`. `sweepUnusedClients` adds `and not c.first_party`.
  `token_endpoint_auth_method` is `none` like every client here.
- **App resource.** `oauthConfig` gains `appResource: `${origin}/api``; scope
  `app` is valid only with the app resource and only for a first-party
  client, and a first-party client may ask only for it (`invalid_scope` or
  `invalid_target` otherwise). The MCP resource and its scopes are unchanged;
  the protected-resource metadata does not list the app resource. The code
  exchange issues tokens for the code's resource (not always
  `oauth.resource`); refresh keeps the token's resource.
- **Consent.** `GET /api/oauth/authorize` answers `first_party: true` for
  the first-party client. `AuthorizePage` then shows "Signing in Promptbook
  on this computer…" and posts the approval at once with
  `granted_scope: 'app'`; no Allow or Deny. The request carries
  `device_name` (`os.hostname()`, cut to 80 characters), validated (1 to 80
  printable characters) and stored on the grant. Signed out, the browser
  shows the usual sign-in first (single sign-on or password) and comes back
  to `/authorize`.
- **Loopback listener** (`auth/loopback.ts`): `http.createServer` on
  `127.0.0.1`, port 0; `code_verifier` 32 random bytes base64url,
  `code_challenge` S256; `state` 16 random bytes base64url; the URL
  `${server}/authorize?response_type=code&client_id=promptbook-desktop&redirect_uri=http://127.0.0.1:<port>/callback&code_challenge=…&code_challenge_method=S256&state=…&resource=${server}/api&scope=app&device_name=…`
  opened with `shell.openExternal`, or, with `PROMPTBOOK_E2E=1`, stored in
  `globalThis.__promptbookAuthorizeUrl` and not opened (D17). Only
  `GET /callback` with the right `state` is accepted; it exchanges the code
  at `/api/oauth/token` (form-encoded, with `resource`) and answers a
  self-contained HTML page in the web client's look (inline CSS, Emerald
  tokens, the "P" logo): "Signed in" and "Signed in to Promptbook on this
  computer. You can close this tab.", with the server's host, the display
  name and the sign-in kind below; on an error (`error` parameter, wrong
  state, failed exchange) a matching page "Sign-in did not finish" and "Go
  back to Promptbook and try again.". The listener closes after one answer,
  after 5 minutes (the app shows Sign-in failed), or on Cancel. "Open the
  browser again" reopens the same URL.
- **Tokens** (`auth/tokens.ts`): access 1 hour and refresh 30 days rotating,
  as today. The access token is in memory only; the refresh token is stored
  in `kv['refresh_token']` as `safeStorage.encryptString(…)` in base64. The
  access token is refreshed 5 minutes before expiry and on a 401; one refresh
  at a time. `invalid_grant` on refresh signs the account out (D11); a
  network failure retries with backoff and leaves the state to the socket.
  When `safeStorage.isEncryptionAvailable()` is false (Linux without a
  keyring) the refresh token is kept in memory only, and This device says
  "Sign-in is not remembered on this computer".
- **REST with a bearer token.** The auth hook, when a request has no
  session cookie and has `Authorization: Bearer pb_at_…`, verifies it with
  `verifyAccessToken(db, value, appResource)` and sets `req.session = {
tokenHash: null, grantId, via: 'app', user }`; `Session` gains `via:
'cookie' | 'app'` and `grantId: string | null`, and `tokenHash` becomes
  `string | null`. Bearer requests skip `assertSameOrigin` (a bearer header
  is not ambient). Routes that need a cookie session refuse an app session
  with 403 `cookie_session_required`: the consent routes
  (`GET`/`POST /api/oauth/authorize`, `/deny`) and `POST /api/auth/logout`
  (the desktop signs out through revocation). `POST /api/auth/password` with
  an app session ends every cookie session of the user. An invalid, expired
  or MCP bearer gets 401 like no credential. `/api/mcp` keeps requiring the
  MCP resource, so an app token gets its 401 there.
- **`/sync` with a token.** `onAuthenticate` accepts the provider's `token`
  as an app access token (`verifyAccessToken` with the app resource), sets
  `context.userId` and `context.grantId`, and skips the `Origin` check;
  without a token the cookie path is unchanged. `SyncContext` gains
  `grantId: string | null`. `Sync.closeGrants(grantIds)` closes those
  sockets with 4401, as `closeSessions` does; it runs after
  `DELETE /api/auth/grants/:id`, `POST /api/oauth/revoke` and a refresh or
  code reuse that revokes (`oauthRoutes` receives `sync`). An open socket
  outlives its access token's hour, as a cookie socket outlives a session
  that expires; revocation is what closes it.
- **Connected apps** shows a first-party grant as "Promptbook desktop ·
  <device_name>", with the Access "Desktop app" (not Read only or Read and
  edit), and Revoke works as for any app.
- **Sign out** (`auth.signOut({ remove })`): `POST /api/oauth/revoke` with
  the refresh token (best effort when offline: the token is also forgotten
  locally), clear `kv['refresh_token']`, close the providers; with
  `remove`, delete the account's folder and go to Sign in; without, keep it
  and show Sign in to sync.

Why: one authorization server, already tested, with Authentik behind it, and
no new secret. Rejected: a separate desktop session endpoint (duplicates the
AS); a custom URL scheme redirect (the AS refuses private-use schemes, and
they are hijackable); the cookie in an embedded window (the provider's page
in the app, and no single sign-on session reuse).

### D9. Offline create

`create.ts`: main builds the doc with `createProjectDoc` and
`skeletonDocument` from `promptbook-project`, the cached settings
(`server_cache['settings']`, the built-in defaults when none is cached) and
`id = crypto.randomUUID()`, stores it, and inserts the row with
`created_local = 1, uploaded = 0`. The answer is the new row (201), so the
web's New project dialog works unchanged.

Upload, before the provider attaches, at once when online and on every
reconnect for rows with `uploaded = 0`: `POST /api/projects` with
`{ "id": "<uuid>", "state": "<base64 Y.encodeStateAsUpdate>" }`. The
server:

- accepts a body of up to 8 MB on that route (`bodyLimit`);
- validates `id` (UUID) and `state` (base64 decoding to at most 5 MB; no
  document size limit exists, so 5 MB is the limit); applies it to a fresh
  `Y.Doc`; the doc must read as a project (`readMeta` gives a known
  category and `meta.id === id`), else 400 `invalid_state`;
- when no project has that id: stores it through `insertProject`, which
  summarizes it, and answers 201 with the row;
- when the same owner already has that id (a retry after a lost answer):
  answers 200 with the existing row and leaves its document as it is (the
  provider sends anything newer);
- when another user has that id: 409 `id_taken`.

`id` alone (no `state`) creates from the templates with that id; `state`
without `id` is 400. The other fields of `createBody` are ignored when
`state` is given. On 201 or 200 main sets `uploaded = 1` and attaches the
provider; on 409 or 400 the project stays on this device only, logged, and
the row shows "On this device only" (a UUID collision is not expected). Online
create from the desktop takes the same path, local first then upload at
once, so there is one code path.

Why: the owner wants new projects offline; the id is the document's name
everywhere, so it must be chosen on the device. Rejected: a temporary local
id swapped at upload (every reference to the project would need rewriting).

### D10. First sync

After the first sign-in into an account folder with no projects, main lists
the server's projects and opens a provider for each. The First sync screen
(Mockup in words) shows each project with ✓ once its provider reports
synced, ↓ for the one in progress, and its size (the encoded state's bytes)
once downloaded; the header gives the size downloaded so far. When every
project is synced the app goes to Projects by itself; "Start with what is
downloaded" goes there at once while the rest continue. A project not yet
downloaded shows in the list with the meta "Downloading…" and the device
icon ↓, and does not open (Open disabled, title "Not on this device yet").

Each server listing when online (start, reconnect, every 5 minutes while
connected, and on `stored` messages for unknown projects): a project new on
the server gets a row and a provider; a project of this account missing from
the server's list (binned or purged) and uploaded gets `deleted_at` and
leaves the list, kept in the store; a project back in the list (restored)
loses `deleted_at`. The `deleted` stateless message sets `deleted_at` at
once. Rows deleted more than 30 days ago are removed with their doc,
updates and local snapshots by the daily purge.

### D11. Sync states on the desktop

`sync/state.ts` gains `local`, used only by the desktop registry; the order,
worst first, becomes `signed-out`, `not-saved`, `reconnecting`, `local`,
`syncing`, `synced`. The web never reports `local`; the desktop never
reports `reconnecting`.

| State        | Label (pill)        | When                                                     |
| ------------ | ------------------- | -------------------------------------------------------- |
| `synced`     | Synced              | socket open, every change acknowledged                   |
| `syncing`    | Syncing…            | changes in flight either way                             |
| `local`      | On this device only | offline or the socket is down; N changes on this device  |
| `not-saved`  | Not saved           | a local disk write failed (D4)                           |
| `signed-out` | Sign in to sync     | refresh failed or the grant was revoked; editing goes on |

The popover, strips and status-bar texts are in Mockup in words.

### D12. Local snapshots

`snapshots.ts`: the setting `kv['local_snapshots']`, per device, not in the
server settings: `hourly` "Every hour while editing, keep 7 days" (default),
`quarter` "Every 15 minutes, keep 2 days", `off` "Off". A timer per project
at that interval stores a `hourly` snapshot of the `document` text when the
text changed since that project's last local snapshot, with the label
"Hourly, while editing" (or "Every 15 minutes, while editing") and the
word count as the server counts it (`countWords`). Expiry: `hourly` rows
after 7 or 2 days by the setting at creation; local `restore` rows after 30
days, as on the server; local `user` rows until deleted. Expired rows go at
start and every 24 hours. History lists both sources (D7).

### D13. Settings → This device

A desktop-only Settings section `This device` at `/settings/device`, placed
after Sync and storage; the web's sections are unchanged. On the desktop,
Sync and storage keeps Server and Export everything and loses nothing else
(the Data folder and Local snapshots fields of `projects.html` are in This
device). Contents in Mockup in words; "Show in Finder" / "Show in Explorer"
/ "Show in Files" calls `shell.showItemInFolder` on the database file; the
usage line counts the account folder's bytes, the projects and the local
snapshots.

### D14. Updates

`updater.ts`, after CueBard's `electron/updater.js`. electron-updater with
`publish: github` (`Stevesibilia/rpg-promptbook`), `autoDownload` true on
Windows and AppImage, `autoInstallOnAppQuit = true`; check at start, every
6 hours, and on "Check for updates"; off when `!app.isPackaged`.

- **Windows and AppImage** (`process.platform === 'win32'`, or Linux with
  `process.env.APPIMAGE`): download in the background with the status bar
  "Downloading Promptbook X · N%", then the strip "Promptbook X is ready.
  Restart to update" with Restart now (`quitAndInstall`) and Later (installs
  on quit; the status bar then says "Promptbook X installs when you quit").
- **Mac and deb** (Mac builds are unsigned and Squirrel.Mac refuses unsigned
  updates; deb has no updater): a check of
  `https://api.github.com/repos/Stevesibilia/rpg-promptbook/releases/latest`,
  compared with `app.getVersion()` by semver; when newer, the strip
  "Promptbook X is available" with Download (opens the release's
  `html_url`) and Later (the status bar then shows "Promptbook X is
  available" as a link that brings the strip back).
- "What's new" opens a dialog with the release notes (electron-updater's
  `releaseNotes`, or the API's `body`), and "Full release notes on GitHub".

### D15. Packaging

electron-builder configuration in `packages/desktop/package.json` `build`:
`appId: eu.siberio.rpg-promptbook`, `productName: Promptbook`,
`artifactName: RPG-Promptbook-${version}-${os}-${arch}.${ext}`,
`directories.output: release`, `files: ["dist/**", "app/**"]`,
`publish: { provider: github, owner: Stevesibilia, repo: rpg-promptbook }`;
`mac`: targets `dmg` and `zip` for `arm64` and `x64`, `identity: null`,
ad-hoc signature (arm64 needs one; no identity, no notarisation),
`category: public.app-category.productivity`; `win`: `nsis` `x64`; `linux`:
`AppImage` and `deb` `x64`, `category: Office`, `maintainer` from the
repository. Icon `build/icon.png`, 1024×1024, a "P" matching the web favicon
(drawn by a script into the PNG; electron-builder derives `.icns` and
`.ico`).

### D16. Release pipeline: `.github/workflows/desktop.yml`

- `pull_request` to `main` with changes under `packages/**` or the workflow:
  on ubuntu-latest, `npm ci`, build the web and the desktop, then
  `electron-builder --linux --dir --publish never` (unpacked), so packaging
  breaks show on the pull request.
- `push` of tags `v*`: the tag-on-main guard copied from `mirror.yml`; then a
  matrix: macos-latest `--mac --arm64 --x64` (one job, one `latest-mac.yml`
  for both architectures: no native module needs a per-architecture job, so
  CueBard's manifest merge is not needed), windows-latest `--win --x64`,
  ubuntu-latest `--linux --x64`, each with the version set from the tag
  (`npm version "${GITHUB_REF_NAME#v}" --no-git-tag-version -w
promptbook-desktop`) and `--publish never`, uploading the installers,
  `latest.yml`, `latest-mac.yml`, `latest-linux.yml` and the blockmaps as
  artifacts; then one `release` job (`permissions: contents: write`) that
  creates the GitHub Release when it does not exist (`gh release create
"$TAG" --generate-notes --verify-tag`) and uploads every file
  (`gh release upload "$TAG" … --clobber`).
- `workflow_dispatch`: the three OSes as a dry run, artifacts uploaded, no
  release.

`docs/deploy-homelab.md`: the architect no longer creates the GitHub Release
by hand; the tag's desktop workflow does, and the server still deploys from
the GitLab mirror.

### D17. Tests

- **Unit, `packages/desktop`** (vitest, Node, no Electron): the store
  (append, load, compaction at 500 and on close, failed write and retry with
  a fake `DatabaseSync`), the router (local routes, merge of snapshot
  sources, forward with the bearer, 503 offline, 401 → signed out), the
  updater's decisions (per platform and install kind, semver), the loopback
  flow against a fake authorization server (state mismatch, timeout,
  cancel, error page), the offline create upload (201, 200, 409, retry on
  reconnect), local snapshot timing and expiry.
- **Server, db:** the seeded first-party client and that the sweep keeps it;
  the app resource and scope rules at authorize and token; the first-party
  approval; `device_name` stored and listed; bearer REST (an app token works
  on a session route, an MCP token gets 401, an app token gets 401 at
  `/api/mcp`, no origin check for bearer, consent and logout refuse an app
  session); `/sync` token auth (accepted without `Origin`, MCP token
  refused); revocation closes the grant's sockets (Connected apps, revoke
  endpoint, refresh reuse); create with `id` and `state` (validation, size,
  wrong `meta.id`, 409, idempotent 200); the route test's classes still hold.
- **Web unit:** the `local` state in `overallState`, the platform selection,
  the desktop registry against a fake bridge.
- **E2E, `e2e/desktop.spec.ts`**, a Playwright project `desktop` in
  `e2e/playwright.config.ts` (the `chromium` project ignores it), using
  `_electron.launch({ args: ['packages/desktop/dist/main.cjs'], env: {
PROMPTBOOK_E2E: '1', PROMPTBOOK_USER_DATA: <tmp>, PROMPTBOOK_SERVER:
baseURL } })` against the e2e stack (password app on 8091); in CI under
  `xvfb-run` on Linux. Flow: sign in (the test reads
  `__promptbookAuthorizeUrl` with `electronApp.evaluate` and opens it in a
  Playwright browser context signed in as `e2e`; the loopback page shows
  Signed in); first sync; edit a project; `compose('stop', 'app')`; edit,
  and create a project offline; quit and relaunch offline (both still
  there); `compose('start', 'app')`; the server has both edits and the new
  project (checked through the web client); a local snapshot appears in
  History (with a test-only interval of seconds under `PROMPTBOOK_E2E`);
  sign out keeps the data, and sign out with removal removes it.
- The existing web e2e unchanged and green, once normally and once with
  `E2E_CPU_THROTTLE=3`.

### D18. Not touched

Server token lifetimes, MCP tools and scopes, the web client's behaviour in
the browser, the chart (only the migration runs at start), Inspiration-view
follow-ups, mobile.

### Departures accepted in review (brief A, 2026-10-20)

1. **Code exchange without `resource`.** The token endpoint issues for the
   code's resource when the client names none (it used to default to the MCP
   resource). The desktop sends `resource` anyway; MCP clients see no change.
2. **Upload error codes.** Every problem with `state` (base64, over 5 MB
   decoded, not a project, unknown category, `meta.id` mismatch, a summarize
   failure) answers 400 `invalid_state`; a body over 8 MB is Fastify's 413;
   `state` without `id`, or an `id` that is not a lower-case UUID, is 400
   `validation_error`.
3. **Chosen ids in lower case only.** Postgres writes a uuid in lower case,
   so an upper-case id would name the same row and another document.
4. **`id` without `state`** follows the upload's rules: 201 new, 200 for the
   same owner with nothing changed, 409 `id_taken` for another user's id.
5. **Defence in depth.** The token endpoint checks again that the app
   resource goes only to a first-party code; REST, `/sync` and `/api/mcp`
   check the grant's scope (`app` or not) on top of the resource.
6. **Unfinished desktop sign-ins are bounded** (from the security review:
   auto-approval lets any page send a signed-in browser to the desktop's
   authorize URL, each visit leaving a grant). The purge deletes first-party
   grants older than the code lifetime with no `oauth_tokens` row, which also
   clears a desktop grant whose refresh token lapsed unused (it can no longer
   sync); MCP grants are untouched. `POST /api/oauth/authorize` answers 429
   `too_many_requests` to a first-party approval when the user has 10 or more
   first-party grants from the last 10 minutes with no token, counted under a
   per-user advisory lock.
7. **An upload is decoded and summarized once:** `readUploadedState` returns
   the checked `Y.Doc`, `insertProject(tx, owner, doc, { uploaded: true })`
   summarizes it once and turns a summarize error into `invalid_state`.
8. **Connected apps wording with no mockup:** a desktop row's Revoke confirm
   reads "It stops syncing with your projects at once." with "To sync it
   again, sign in from Promptbook on that computer."

Known and accepted: a local process that listens on a loopback port can get
an app token with no click while the browser is signed in (the RFC 8252
trade-off of auto-approval); a password change ends cookie sessions but not
app or MCP grants (production is single sign-on only, which refuses password
changes); Hocuspocus `onTokenSync` is not handled, so a socket keeps its first
token until it closes, and revocation is what closes it.

### Departures accepted in review (brief B, 2026-10-20)

1. **A wrong `state` at the loopback callback** answers the failure page with
   400 and the listener keeps waiting for the right one, so a local page
   probing loopback ports cannot end a real sign-in. An `error` parameter or a
   failed exchange still ends it.
2. **The socket opens only while a provider is attached** (D5 said one socket
   always): Hocuspocus terminates a socket that never authenticates after
   60 s, so an idle socket would flap. With no provider attached, online
   comes from `GET ${server}/api/health` every 10 s.
3. **Local restore label** is `<restored label> · <ISO>`, the server's format,
   which History's `labels.ts` already shows as Before restore.
4. **Bridge additions** for a first read, since events fire only on change:
   `sync.status()`, `auth.state()`, `updates.state()` and the event channels
   `pb:sync:on-update`, `pb:sync:on-status`, `pb:sync:on-stateless`,
   `pb:auth:on-state`, `pb:updates:on-state`
   (`packages/web/src/platform/bridge.ts`).
5. **`isRoutablePath`** also lets `/.well-known/oauth-protected-resource`
   through (Connected apps reads it); every other path must normalise to
   `/api/…` with no dot segments.
6. **Dependencies:** main bundles everything but `electron`, so all deps are
   devDependencies except `electron-updater` (kept in dependencies, as
   CueBard does; bundling it is group 4's call).
7. **`packages/desktop` is `"type": "module"`** (Playwright's TS loader needs
   it); the build outputs are explicit `.cjs`.

Also fixed in brief B, worth knowing for the web side: re-creating a
Hocuspocus provider for the same name on an open socket lets the server read
the old Close after the new provider's first messages and end that session,
so re-attaching reconnects the socket; Close messages queued while offline
are dropped on open, since every provider resyncs fully; `unref()`'d timers
never fire in Electron main while offline, so main uses none. The proof
against the stack is `npm run prove -w promptbook-desktop`
(`test/stack/offline.spec.ts`), with an opt-in scale probe
(`PROMPTBOOK_PROVE_PROJECTS=60`: 62 projects first-synced, main RSS 194 → 222
MB, no reconnect storm).

## Mockup in words

`desktop.html` shows one app window and, for one screen, a browser window.
A Platform switch (Mac, Windows, Linux) changes the title bar (traffic lights
on Mac, ─ ☐ ✕ on the others), the update flow, the shortcut hint (⌘K or
Ctrl K), and these words:

| Word         | Mac                                      | Windows                                     | Linux                |
| ------------ | ---------------------------------------- | ------------------------------------------- | -------------------- |
| the computer | this Mac                                 | this PC                                     | this computer        |
| data folder  | ~/Library/Application Support/Promptbook | C:\Users\Stefano\AppData\Roaming\Promptbook | ~/.config/Promptbook |
| show button  | Show in Finder                           | Show in Explorer                            | Show in Files        |

The window title is "Promptbook", or "<project title> · Promptbook" on a
project (the mockup: "L'Ancora di Sabaoth · Promptbook").

**App frame.** The web client's top bar (logo "P", breadcrumb, the sync
pill, ⌘K, the avatar), the rail (Projects, Document, Inspiration, Research,
Brainstorm log, History, and Settings at the bottom), and the status bar:
left "6 of 12 projects" (or the view, "History · 3 412 words", "Settings")
and "All on this device"; an update item when there is one; right the sync
text. Between top bar and content, two strips can show: the amber sign-out
strip and the blue update strip.

**Projects.** The list of `projects.html` with one more column at the end of
each row: ✓ (title "On this device, synced") or an amber ↑ (title "2
changes waiting to sync"). Heading "Projects", lead "6 of 12 projects",
Import Markdown and New project.

**Sync pill and popover** (desktop states):

| State           | Pill / popover title | Popover line                                                                                   | Pending list                              | Status bar (right)                   |
| --------------- | -------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------ |
| synced          | Synced               | Every change is on the server.                                                                 | none                                      | Synced 12:41 · promptbook.siberio.eu |
| syncing         | Syncing…             | Sending 2 changes, receiving 1.                                                                | «Il ballo dei Lorenzetti ↑ 2», «… ↓ 1»    | Syncing…                             |
| local (amber)   | On this device only  | Offline since 10:05. Everything is saved here and goes to the server when you are back online. | «L'Ancora di Sabaoth 2 changes»…          | Offline · 3 changes on this device   |
| not-saved (red) | Not saved            | The last changes could not be written to disk. They are kept in memory and retried.            | «L'Ancora di Sabaoth 3 changes in memory» | Not saved                            |
| signed-out      | Sign in to sync      | The session ended. (or "You signed out." after a sign-out)                                     | the projects with changes                 | Signed out · sync paused             |

The popover's details: Server (the host), Account ("Stefano · single
sign-on", or "· local account" for a password server, "· signed out" when
signed out), Last sync ("12:41, a minute ago"; "10:05, today" when not
synced), On this device ("12 projects · 38 MB"). Buttons: Sync now (Retry
when Not saved), Show data folder, and Sign out on the right (opens the
sign-out dialog). Signed out: Sign in (goes straight to the browser step)
and Show data folder, then the line "You can keep working: changes stay on
this device until you sign in."; the avatar dims.

**Strips.**

- Signed out (amber): "**Signed out.** Sync is paused. Keep working: changes
  stay on this device until you sign in." and the button "Sign in…".
- Not saved (red, from `projects.html`): "**Not saved.** The last 3 changes
  could not be written to disk (disk full). Free some space; Promptbook keeps
  them in memory and retries." and "Retry now".
- Update (blue), Windows and AppImage: "**Promptbook 0.6.0 is ready.**
  Restart to update." with the link "What's new", the hint "Open projects
  come back as you left them.", the buttons "Restart now" and "Later".
  Before it, the status bar shows a small bar and "Downloading Promptbook
  0.6.0 · 62%". After Later the status bar says "Promptbook 0.6.0 installs
  when you quit".
- Update (blue), Mac (and deb, D14): "**Promptbook 0.6.0 is available.**"
  with "What's new", the hint "Download it, then replace the app in
  Applications." (deb: "Download it, then install the package."), the
  buttons "Download" (with an external-link icon) and "Later". After Later
  the status bar shows the link "Promptbook 0.6.0 is available", which
  brings the strip back.
- "What's new in 0.6.0" dialog: the release notes as a list, the link "Full
  release notes on GitHub" and Close.

**Sign in** (full window, centred card). Brand "Promptbook" over "RPG
Promptbook". Field "Server" prefilled "https://promptbook.siberio.eu"
(`PROMPTBOOK_SERVER` or the last server), hint "Needed once. After the first
sync Promptbook works offline with no time limit." Primary button with an
external-link icon "Continue with single sign-on" (for a password server,
from `GET /api/auth/config`: "Continue in your browser"), foot "Opens the
server's sign-in page in your default browser, then comes back here."

**In browser.** Heading "Finish signing in in your browser", a spinner,
"Promptbook opened promptbook.siberio.eu in your default browser. Come back
here when it says you are signed in.", buttons "Open the browser again"
(toast "Opened promptbook.siberio.eu in your browser again.") and "Cancel"
(back to Sign in).

**Sign-in failed.** A red "!" mark, "Sign-in did not finish", "The browser
window was closed, or it took more than 5 minutes.", buttons "Change server"
(back to Sign in) and "Try again" (primary, the browser step again).

**Browser tab.** The browser window, tab "Promptbook", a centred card:
brand, a green ✓, "Signed in", "Signed in to Promptbook on this computer.
You can close this tab.", foot "promptbook.siberio.eu · Stefano · single
sign-on". The mockup's address bar shows `promptbook.siberio.eu/desktop/signed-in`;
by D8 the page is served by the loopback listener at
`127.0.0.1:<port>/callback`, with the same content.

**First sync** (full window). Brand "Downloading your projects" over "First
sync on this Mac · 4.2 MB", a progress bar, the list of projects with size
and ✓ (done), ↓ (now) or nothing, the button "Start with what is
downloaded", foot "Downloaded projects open at once; the rest keep coming in
the background." When the list completes, Projects opens by itself.

**History** (desktop, two sources). Heading "History", lead "Snapshots of
the prep document. Restoring never loses the current text." Offline only, an
info line with a no-wifi icon: "Offline. Server snapshots are shown as of
10:05; new ones appear when you are back online." The Save snapshot row
("Save snapshot", the field "Name, e.g. before the read-through", the
button "Save snapshot"). A segmented filter "All", "Server", "This device".
The table: columns When, Snapshot, Source, Words, actions. First row Now,
"Current text", its words. Then, newest first: device rows "Hourly, while
editing", meta "kept until 27 Oct", source "This device" (laptop icon,
green); server rows with the chips Claude, You, Restore and the labels
"Before Claude's edit: S3 Il cordone di Donato" (meta "kept until 19 Nov"),
"Saved by you: before playtest" ("kept until you delete it"), "Before
restore" ("made when you restored the snapshot of 14 Oct"), source "Server"
(cloud icon, blue). Each row but Now has Compare and Restore. Hint:
"Server: Claude's snapshots are kept 30 days, yours until you delete them.
This device: every hour while you edit, kept 7 days (Settings → This
device)." with the link to This device. Saving offline adds a device row
"Saved by you: <name>" and the toast "Snapshot saved on this device."
(online: "Snapshot saved."). The mockup's meta "· goes to the server when
you are back online" is not built (proposal, out of scope). Restore asks
"Restore this version?", "The document goes back to the snapshot of <when>:
«<label>».", note "The current text is saved as a snapshot first.", button
Restore; then the toast "Restored the snapshot of <when>. The text before it
is in History as «Before restore»." Compare is connector.html's, with the
Source tag beside the chip, "← History", "Snapshot of <when> → now", the
counts and "Restore this version".

**Settings → This device.** The Settings nav with "This device" and a small
"desktop" tag. Heading "This device", lead "Projects live on this Mac and
sync with promptbook.siberio.eu when online." Cards:

1. "Data folder", the read-only path, the button "Show in Finder" (toast
   "Opened the data folder in Finder."); the usage line with a disk icon:
   "**38 MB** 12 projects · 214 local snapshots".
2. "Local snapshots" select: "Every hour while editing, keep 7 days",
   "Every 15 minutes, keep 2 days", "Off"; hint "Taken on this device, next
   to the server's. They show up in History tagged "This device"."
   When sign-in is not remembered (D8), this card group also shows "Sign-in
   is not remembered on this computer".
3. "Version" `0.5.0`, hint (Mac and deb) "New versions are downloaded from
   GitHub: this build cannot update itself." or (Windows, AppImage)
   "Updates download by themselves and install when you restart."; the
   button "Check for updates" (reads "Checking…" while it checks).
4. "Sign out", hint "Signed in as Stefano on promptbook.siberio.eu since 18
   Oct.", the button "Sign out…".

**Sign out dialog.** Title "Sign out?". "Promptbook stops syncing with
promptbook.siberio.eu. Your projects stay on this Mac and you can keep
working on them." A tick box "Also remove the projects from this
computer". Ticked, with changes not on the server, a red box: "**Changes not
yet on the server would be lost.** 3 changes not yet on the server:
L'Ancora di Sabaoth (2), Il ballo dei Lorenzetti (1)." The note under it:
unticked "Sign in again to sync. Nothing is downloaded twice."; ticked with
changes "Cancel, then sync when you are online, to keep them."; ticked with
none "Everything is on the server: signing in again downloads it." Buttons
Cancel and "Sign out" (ticked: "Sign out and remove", red when changes
would be lost). After it, the toast "Signed out. Your projects stay on this
Mac." and the signed-out state, or "Signed out. The projects were removed
from this Mac." and the Sign in screen.

**Projects.html's desktop parts** also apply: the project panel's line "On
this device · synced 12:41" or "On this device · 2 changes waiting".

## Risks / Trade-offs

Report, do not work around:

- **Many providers on one socket in main.** If the Hocuspocus provider in
  Electron main misbehaves with many providers (dozens of projects) on one
  socket (slow first sync, reconnect storms, memory), report with numbers
  (projects, time to first sync, memory) before changing the design.
- **`protocol.handle` with module workers or WASM streaming.** If the PDF
  worker or `WebAssembly.instantiateStreaming` fails under
  `promptbook://app`, report. The fallback, a loopback HTTP server on
  127.0.0.1 serving the web dist, needs the architect's agreement first.
- **Playwright `_electron` under xvfb in CI.** If it cannot run there,
  report; the suite stays local-only only with the architect's agreement.
- **Gatekeeper.** If macOS refuses the ad-hoc signed arm64 build once
  downloaded, document System Settings → Privacy & Security → Open Anyway in
  the README; do not add signing.

Trade-offs:

- **First-party consent skip.** Any local process listening on a loopback
  port could start an authorize request for `promptbook-desktop` and get a
  code from a signed-in browser without a click. That is the native-app
  threat model of RFC 8252; the grant is visible and revocable in Connected
  apps with the computer's name.
- **Node 24 in main.** The repository targets Node 26; main is bundled for
  Node 24 (Electron 44). Code from `promptbook-project` used in main must not
  need Node 26 APIs; the esbuild target catches syntax, the unit tests the
  rest.
- **Unsigned builds.** Mac and deb users update by hand; Windows SmartScreen
  warns on first install. Accepted by the owner.
- **Offline snapshots stay local.** A snapshot saved offline is on the
  device only.

## Migration Plan

`004_desktop.sql` runs at server start like the others: the new columns, the
widened scope check, the seeded client. No document migration. Release
`v0.5.0`: the tag deploys the server through GitLab and builds the
installers and the GitHub Release through `desktop.yml`.

## Open Questions

None.
