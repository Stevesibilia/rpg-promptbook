## Why

`docs/design.md` decided offline writing and editing in a desktop app for Mac,
Linux and Windows; the browser stays online only. Today every edit needs the
server: the web client keeps a project only while its tab is open, and a
dropped connection shows Reconnecting with changes held in the tab. Issue
[Stevesibilia/rpg-promptbook#6](https://github.com/Stevesibilia/rpg-promptbook/issues/6)
holds the desktop app, split from #2 when the web client shipped first.

The owner approved the mockup
[docs/mockups/desktop.html](../../../docs/mockups/desktop.html) as is, with
the desktop parts of
[docs/mockups/projects.html](../../../docs/mockups/projects.html) (sync
states, first sync, Not saved on disk), and answered the open points on
2026-10-20: a full release with an owner preview before the merge; unsigned
installers, as CueBard ships them; one `v*` tag gives one version to the
server and the app; offline means editing and creating projects; Linux as
AppImage and deb, Mac as dmg and zip for arm64 and x64, Windows as an NSIS
installer for x64. The architect took the remaining decisions; they are in
the design.

## What Changes

- **Desktop app:** a new workspace `packages/desktop` (Electron 44, main and
  preload in TypeScript bundled with esbuild, electron-builder,
  electron-updater). The window shows the web client's own build, served from
  a privileged `promptbook://app/` protocol; the renderer does no network.
- **Main process owns data and network:** every project of the account is
  stored on disk in SQLite (`node:sqlite`, one database per account) and kept
  in sync in the background with one Hocuspocus provider per project, open
  or not. Tokens never reach the renderer.
- **Offline:** edit any project and create new ones with no server; a project
  made offline is uploaded with its id and Yjs state on reconnect. Quitting
  and relaunching offline keeps everything.
- **Sign-in through the system browser:** the server's OAuth 2.1
  authorization server from #4 gains a first-party native client
  `promptbook-desktop` and an app resource `<origin>/api` with scope `app`;
  a signed-in browser skips the consent page. REST accepts the app's bearer
  token, and `/sync` accepts it as the Hocuspocus token. Revoking the grant
  in Connected apps ("Promptbook desktop · <computer>") closes its sockets.
- **Desktop UI** from the mockup: sign-in, waiting for the browser, sign-in
  failed, the browser tab's page, first sync, the desktop sync states (On
  this device only, Not saved on disk, Sign in to sync), actions that "Need
  the server" while offline, History with server and device snapshots,
  Settings → This device, the sign-out dialog with optional removal, and the
  update strip.
- **Local snapshots:** taken on the device every hour (or 15 minutes, or
  off), listed in History next to the server's.
- **Updates:** electron-updater from GitHub Releases on Windows and AppImage
  (download, then Restart now); Mac and deb builds are told a new version
  exists and open the release page.
- **Release pipeline:** a tag `v*` on `main` also builds the installers on
  GitHub Actions and creates the GitHub Release with them; pull requests
  build an unpacked Linux app as a dry run.
- **Web client platform seam:** `packages/web/src/platform/` routes every
  network and browser-only call through one interface, so one web build
  serves the browser and the desktop app. The browser's behaviour does not
  change.

Out of scope: code signing and notarisation; the mockup's "goes to the server
when you are back online" for snapshots saved offline (they stay on the
device); asset uploads queued offline (no assets exist yet); the scene in a
window of its own (`docs/design.md`, UI); mobile and iPad;
changes to token lifetimes, MCP tools or scopes; Inspiration-view
follow-ups; any chart change other than the new migration running at start.

## Capabilities

### New Capabilities

- `desktop-app`: the Electron app: window and renderer isolation, sign-in
  through the browser, tokens, the local store, background sync of every
  project, first sync, offline create, the desktop sync states, actions that
  need the server, local snapshots, Settings → This device, sign-out and
  updates.

### Modified Capabilities

- `accounts`: REST accepts a bearer app access token as its grant's user,
  outside the same-origin rule.
- `connector`: the first-party desktop client and the app resource; the
  consent page approves the first-party client without asking; Connected
  apps names the computer and revoking closes its sync connections.
- `project-sync`: `/sync` accepts an app access token; a project can be
  created with a given id and Yjs state.
- `projects`: the desktop app reads and writes the document and builds list
  rows through the shared package.
- `projects-screen`: the desktop shell follows `desktop.html`; Settings gains
  This device on the desktop, and Sync and storage loses the device fields
  there.
- `snapshots`: History on the desktop lists server and device snapshots with
  a Source column, a filter and an offline line.
- `deployment`: a release tag also builds the desktop installers and creates
  the GitHub Release.

## Impact

- `packages/desktop` (new, `promptbook-desktop`): `src/main/`, `src/preload/`,
  build script, electron-builder configuration, unit tests; depends on
  `promptbook-project` and on the built `promptbook-web`.
- `packages/project`: the list row shape (`ProjectRow`) and the
  summary-to-row mapping move here from the server, so main builds the same
  rows.
- `packages/server`: migration `004_desktop.sql` (`oauth_clients.first_party`,
  `oauth_grants.device_name`, the `app` scope, the seeded client); the auth
  hook accepts bearer app tokens; `/sync` token auth and `closeGrants`;
  `POST /api/projects` with `id` and `state`; the authorize and token routes
  learn the app resource.
- `packages/web`: `src/platform/`, an IPC-backed sync registry, the desktop
  screens and states, History sources, Settings → This device.
- New dependencies, pinned exactly at the version `npm view` gives when the
  work starts: `electron` 44.x, `electron-builder`, `electron-updater`,
  `esbuild` (already used by the server) in `packages/desktop`.
- CI: `.github/workflows/desktop.yml` (new); the e2e job runs the
  `_electron` suite under xvfb. `docs/deploy-homelab.md`: the GitHub Release
  is made by the workflow.
- No new server environment variable. The app reads `PROMPTBOOK_E2E`,
  `PROMPTBOOK_USER_DATA` and `PROMPTBOOK_SERVER` for tests and development.
  Release `v0.5.0`.
