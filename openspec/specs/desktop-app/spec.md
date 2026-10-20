# desktop-app Specification

## Purpose

TBD - created by archiving change desktop-app. Update Purpose after archive.

## Requirements

### Requirement: Desktop app for Mac, Windows and Linux

RPG Promptbook SHALL ship a desktop app named Promptbook, built with
Electron from the workspace `packages/desktop`, for Mac (dmg and zip, arm64
and x64), Windows (NSIS installer, x64) and Linux (AppImage and deb, x64).
Its window SHALL show the web client's own build, bundled in the app and
served from `promptbook://app/`, following
[docs/mockups/desktop.html](../../../docs/mockups/desktop.html). After
the first sync the app SHALL work with no server for as long as the user
needs, for every project of the account.

#### Scenario: Opened with no network

- **WHEN** the user, signed in and synced once, opens the app on a computer
  with no network
- **THEN** the projects list shows every project and each opens and can be
  edited

#### Scenario: Window title

- **WHEN** the user opens «L'Ancora di Sabaoth»
- **THEN** the window title reads «L'Ancora di Sabaoth · Promptbook»

### Requirement: The renderer holds no credential and does no network

The app's main process SHALL own the local data, every request to the server
and every token. The window SHALL run with context isolation and the
sandbox, without Node integration, and SHALL reach the main process only
through a narrow bridge `window.promptbook`. Its content security policy
SHALL allow connections to its own origin only. Navigation to anything but
`promptbook://app/` SHALL be refused; links to `http:` or `https:` pages
SHALL open in the system browser and every other new window SHALL be denied.

#### Scenario: A link to a website

- **WHEN** the user follows a source's link in the Research view
- **THEN** it opens in the default browser and the app window stays on
  Promptbook

#### Scenario: No token in the page

- **WHEN** the page's script looks for a token or opens a WebSocket to the
  server
- **THEN** it finds no token, and the connection is refused by the content
  security policy

### Requirement: Sign-in through the system browser

The app SHALL sign in through the server's authorization server as the
first-party client `promptbook-desktop`: a listener on `127.0.0.1` on a
random port, PKCE with S256, a random state, the system browser opened on the
server's `/authorize` with the app resource, scope `app` and the computer's
name. The sign-in screens SHALL follow the mockup's Sign in, In browser,
Sign-in failed and Browser tab: «Continue with single sign-on» (or, for a
password server, «Continue in your browser»), «Finish signing in in your
browser» with «Open the browser again» and «Cancel», and «Sign-in did not
finish» with «Change server» and «Try again». The listener SHALL accept one
callback with the right state, answer a page in the web client's look saying
«Signed in to Promptbook on this computer. You can close this tab.», and give
up after 5 minutes.

#### Scenario: Sign in with single sign-on

- **WHEN** the user presses Continue with single sign-on and signs in
  through Authentik in the browser
- **THEN** the browser tab says Signed in, and the app shows First sync

#### Scenario: Browser already signed in

- **WHEN** the browser already has a session on the server
- **THEN** no consent page is shown: the browser goes straight to Signed in

#### Scenario: Browser closed

- **WHEN** the user closes the browser tab and five minutes pass
- **THEN** the app shows Sign-in did not finish with Try again

### Requirement: Tokens stay in the main process

The access token SHALL be kept in memory only and refreshed before it
expires. The refresh token SHALL be stored encrypted with the operating
system's keychain through `safeStorage`; when that is not available the app
SHALL keep it in memory only and Settings → This device SHALL say «Sign-in is
not remembered on this computer». A refused refresh or a revoked grant SHALL
put the app in Sign in to sync, and editing SHALL go on locally.

#### Scenario: Relaunch

- **WHEN** the user quits and relaunches the app the next day
- **THEN** it syncs without asking to sign in

#### Scenario: Grant revoked from the web

- **WHEN** the user revokes «Promptbook desktop · <computer>» in Connected
  apps on the web
- **THEN** the app shows Sign in to sync and keeps every local change

### Requirement: Projects stored on this computer

The app SHALL store each account's projects in its own SQLite database in the
app's data folder, through `node:sqlite` in the main process. Every Yjs
update, made on this computer or received from the server, SHALL be written
to disk as it is applied, and compacted later. When a write fails, the
project SHALL show Not saved, the update SHALL stay in memory and be retried
every 10 seconds and on the next change, and the state SHALL clear once a
write succeeds.

#### Scenario: Quit offline

- **WHEN** the user edits a project offline, quits, and opens the app again,
  still offline
- **THEN** the edit is there

#### Scenario: Disk full

- **WHEN** the disk fills while the user types
- **THEN** the pill shows Not saved with the red strip «The last 3 changes
  could not be written to disk (disk full)…», and once space is freed the
  changes are written and the state clears

### Requirement: Every project synced in the background

The main process SHALL keep every project of the account in sync with the
server, whether or not it is open in the window, over one WebSocket to the
server's `/sync` authenticated with the app's access token. Changes from the
server SHALL reach an open project without a reload; changes made in the
window SHALL reach the server. Offline changes SHALL merge with changes made
elsewhere when the connection comes back.

#### Scenario: Edited on the web while closed here

- **WHEN** the user edits a project on the web while it is closed in the app,
  then goes offline and opens it in the app
- **THEN** the app shows the web edit

#### Scenario: Offline edits merge

- **WHEN** the app edits a paragraph offline while the web edits another, and
  the app goes back online
- **THEN** both clients show both paragraphs

### Requirement: First sync

After the first sign-in on a computer the app SHALL show «Downloading your
projects» with each project, a ✓ once it is on this computer, and the size
downloaded, and SHALL open Projects once every project is downloaded. «Start
with what is downloaded» SHALL open Projects at once while the rest go on in
the background; a project not yet downloaded SHALL show as downloading and
SHALL NOT open until it is.

#### Scenario: Start early

- **WHEN** three of seven projects are downloaded and the user presses Start
  with what is downloaded
- **THEN** Projects lists all seven, the three open, and the other four open
  once downloaded

### Requirement: Create and edit offline

The user SHALL be able to create a project while offline from the cached
templates and settings. The app SHALL choose the project's id, keep it on
this computer, and upload it with its id and its Yjs state when the server
is reachable, before syncing it. A project created online SHALL take the same
path.

#### Scenario: New project offline

- **WHEN** the user creates the one-shot «La fiera di Randazzo» offline,
  writes a scene, and the server comes back
- **THEN** the project and the scene are on the server and in the web
  client's list

#### Scenario: Upload retried

- **WHEN** the upload's answer is lost and the app sends it again
- **THEN** the server answers with the same project and nothing is
  duplicated

### Requirement: Sync states on the desktop

The desktop SHALL show the sync pill with the states Synced, Syncing…, On
this device only (offline or the connection is down, with the number of
changes on this computer), Not saved (a disk write failed) and Sign in to
sync, worst first across all projects, with the popover, strips and status
bar texts of the mockups: the popover lists Server, Account, Last sync and On
this device, with Sync now, Show data folder and Sign out; Sign in to sync
shows the amber strip «Signed out. Sync is paused. Keep working: changes stay
on this device until you sign in.» with «Sign in…». The browser's
Reconnecting state SHALL NOT appear on the desktop. The projects list SHALL
show, per project, whether it is synced or has changes waiting.

#### Scenario: Offline

- **WHEN** the server stops and the user makes 3 changes
- **THEN** the pill says On this device only and the status bar «Offline · 3
  changes on this device»; once the server is back it says Synced

#### Scenario: Count survives a restart

- **WHEN** the user makes 3 changes offline, quits and relaunches offline
- **THEN** the status bar still says «Offline · 3 changes on this device»

### Requirement: Actions that need the server

While offline, actions that only the server can do SHALL be shown disabled
with the hint «Needs the server»: Import Markdown, the bin and restoring from
it, deleting a project, export, restoring, undoing and deleting server
snapshots, Connected apps, account changes, and saving settings. Reading the
projects list, settings, the account and the server snapshots last seen
SHALL work offline from what the app last fetched.

#### Scenario: Import offline

- **WHEN** the app is offline and the user looks at Import Markdown
- **THEN** the button is disabled with the hint Needs the server

### Requirement: Local snapshots

The app SHALL take snapshots of a project's prep document on this computer:
by default every hour while it is edited, kept 7 days; or every 15 minutes,
kept 2 days; or never, by the setting Local snapshots in Settings → This
device, kept per computer. A snapshot SHALL be taken only when the text
changed since the last one. A snapshot saved by hand while offline SHALL be
kept on this computer until the user deletes it. History SHALL list them
beside the server's, tagged This device, and restoring one SHALL first save
the current text as a snapshot on this computer.

#### Scenario: Hourly snapshot

- **WHEN** the user edits a project for an hour with the default setting
- **THEN** History lists a This device snapshot «Hourly, while editing» kept
  until 7 days later

#### Scenario: Off

- **WHEN** Local snapshots is Off
- **THEN** no snapshot is taken on this computer

### Requirement: Settings, This device

On the desktop Settings SHALL have a section This device, at
`/settings/device`, holding: the data folder with Show in Finder (Explorer,
Files), the space used, the number of projects and of local snapshots; the
Local snapshots setting; the version with Check for updates; and Sign out….

#### Scenario: Show the data folder

- **WHEN** the user presses Show in Finder on a Mac
- **THEN** Finder opens on the app's data folder

### Requirement: Sign out

Sign out SHALL ask with the dialog «Sign out?»: the app stops syncing and the
projects stay on this computer, unless «Also remove the projects from this
computer» is ticked. When ticked and changes are not yet on the server, the
dialog SHALL warn that they would be lost, name the projects and counts, and
the button SHALL read «Sign out and remove» in red. Signing out SHALL revoke
the app's grant on the server when it is reachable and forget the tokens.
Signing in again with the same account SHALL reuse the projects left on this
computer.

#### Scenario: Sign out and keep

- **WHEN** the user signs out without the tick
- **THEN** the projects still open and can be edited, and the pill says Sign
  in to sync

#### Scenario: Sign out and remove

- **WHEN** the user ticks the box with everything on the server and signs out
- **THEN** the account's data is removed from this computer and the app shows
  Sign in

### Requirement: Updates

The app SHALL check GitHub Releases for a newer version at start, every 6
hours, and on Check for updates. On Windows and in the AppImage it SHALL
download the update in the background, showing the progress in the status
bar, then offer «Promptbook X is ready. Restart to update» with Restart now
and Later, Later installing on quit. On Mac and from the deb package, which
cannot update themselves, it SHALL offer «Promptbook X is available» with
Download, which opens the release page, and Later. What's new SHALL show the
release notes.

#### Scenario: Windows update

- **WHEN** version 0.6.0 is released while 0.5.0 runs on Windows
- **THEN** the status bar shows the download, then the strip offers Restart
  now, and after a restart the app is 0.6.0 with the open projects as they
  were

#### Scenario: Mac update

- **WHEN** version 0.6.0 is released while 0.5.0 runs on a Mac
- **THEN** the strip says Promptbook 0.6.0 is available and Download opens
  the release page in the browser
