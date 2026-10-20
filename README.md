# RPG Promptbook

A prep tool for the game master: campaigns, adventures and one-shots go from
brainstorm to table without copy and paste. The adventure is written once, the
Midjourney and Suno prompts come out of it, the downloaded images and tracks
land in their scene, and the PDF for the table and the CueBard project are
built from it.

Status: the server and the web client run locally and on the homelab
(see [docs/deploy-homelab.md](docs/deploy-homelab.md)); the desktop app for
Mac, Windows and Linux keeps every project on the computer and works offline.
See [docs/design.md](docs/design.md).

The name comes from theatre: the promptbook is the stage manager's master copy
of the script, with every cue for lights and sound. Here it holds the GM's prep
and the cues that go to CueBard.

RPG Promptbook is the full name (repo, README, downloads); inside the app it
is just Promptbook.

## Run it locally

You need Docker with Compose. Copy the example settings, start the stack,
then fill an account with the sample projects:

```sh
cp .env.example .env
docker compose up -d --build
docker compose exec app node dist/cli.js seed steve
```

Open `http://localhost:8090` and sign in with `PROMPTBOOK_ADMIN_USERNAME` and
`PROMPTBOOK_ADMIN_PASSWORD` from `.env`. The first start creates that account;
`seed` refuses to run for an account that already has projects.

To open the app from other devices on the LAN, set `PUBLIC_URL` in `.env` to
this machine's LAN address, for example `http://192.168.1.20:8090`, and use
that address everywhere. The app accepts changes and sync only from that
origin.
On macOS with OrbStack, published ports listen on localhost only, so LAN
access also needs OrbStack's `docker.expose_ports_to_lan` setting or a TCP
relay from the LAN address to `127.0.0.1`.

`docker compose down` stops the stack and keeps the data; `down -v` removes it.

## Desktop app

The desktop app keeps every project of your account on the computer, syncs
them with the server in the background, and lets you edit and create projects
with no connection. Download it from the
[latest release](https://github.com/Stevesibilia/rpg-promptbook/releases/latest).
The installers are not signed, so each system warns the first time:

- **Mac** (`RPG-Promptbook-<version>-mac-arm64.dmg` for Apple silicon,
  `-mac-x64.dmg` for Intel): open the disk image and drag Promptbook to
  Applications. The first time macOS refuses to open it; go to System
  Settings → Privacy & Security, press Open Anyway next to the message about
  Promptbook, and confirm. The Mac app cannot update itself: when a new
  version is out it says so, and Download opens the release page.
- **Windows** (`RPG-Promptbook-<version>-win-x64.exe`): SmartScreen says
  "Windows protected your PC"; press More info, then Run anyway. Updates
  download by themselves and install when you restart the app.
- **Linux**: the AppImage (`-linux-x86_64.AppImage`, make it executable and
  run it) updates itself like Windows; the deb package
  (`sudo apt install ./RPG-Promptbook-<version>-linux-amd64.deb`) is told of
  new versions and you install them by hand.

Sign in once: the app opens the server's sign-in page in your browser (single
sign-on or password) and comes back by itself. After the first sync it needs
no connection for as long as you like; changes go to the server when it is
back. The projects live in `~/Library/Application Support/Promptbook` on a
Mac, `%APPDATA%\Promptbook` on Windows and `~/.config/Promptbook` on Linux
(Settings → This device shows the folder). Sign out from the sync status or
from This device: the projects stay on the computer unless you tick "Also
remove the projects from this computer". The computer shows up in Connected
apps on the web as "Promptbook desktop · <computer name>"; revoking it there
stops its sync.

The app also keeps every image and track of the board on the computer, in
the account's `files` folder inside the data folder, named by their content.
They download in the background after the first sync and the board shows
them offline. Files dropped on the board offline wait there, marked "on this
device", and upload when the server is back. This device counts them, and
signing out with removal says how many are not uploaded yet.

## Images and music

Each adventure and one-shot has a board, **Images and music** in the rail,
with image prompts in four categories, one tab each:

- **Scenes:** one row per scene of the appendix "Appendice: immagini e
  musica" at the end of the prep document, with its `visual:` and `mood:`
  lines; any number of Midjourney prompts per scene (one shot each), and one
  Suno prompt (title, style, lyrics). A document without the appendix gets
  one from the board's **Add the appendix**.
- **PCs**, **NPCs** and **Handouts:** project-wide lists, each item a name
  and a Midjourney prompt. They work without the appendix.

Every prompt has Copy. Claude writes them through the connector ("write the
image and music prompts for the board of …, with portraits of the PCs and
NPCs and the handouts"); you can add, edit or remove any of them by hand.
Each tab shows how many prompts it has and how many still want images.

Generate in Midjourney and Suno, then drop the whole Downloads batch anywhere
on the board, or use **Add files…**. Each file finds its prompt by its name,
whatever the tab:

- a Midjourney image by the prompt's first words, which Midjourney puts in
  the file name;
- a Suno track by its title, the file name Suno gives it (a second take ends
  in "(1)").

Files that match nothing wait in the Unmatched tray: assign them by hand, or
press **Match again** once their prompt or title is written. An image whose
name matches two prompts (they start with the same words) waits there too,
marked "matches 2 prompts", with those prompts first in its menu: start each
prompt differently to avoid it. Removing a prompt sends its images to the
tray; no file is deleted. Choose one image per prompt and one track per
scene; the viewer and each track's menu move or remove a file. The project's
export holds `board.md` with the prompts, and the files in
`files/scenes/<scene>/<prompt number>/`, `files/scenes/<scene>/music/`,
`files/pcs/<name>/`, `files/npcs/<name>/`, `files/handouts/<name>/` and
`files/unmatched/`.

Boards made before image categories (v0.6) keep everything: each scene's
prompt and chosen image become its prompt 1, on the server, in the desktop
app offline, and through the connector.

## Editor shortcuts

On the Mac, Mod is ⌘; elsewhere it is Ctrl.

| Keys          | Action                                   |
| ------------- | ---------------------------------------- |
| Mod-1         | Toggle the outline                       |
| Mod-2         | Toggle the inspector                     |
| Mod-.         | Focus mode                               |
| Mod-/         | Syntax sheet                             |
| Mod-K         | Command palette                          |
| F8 / Shift-F8 | Next / previous problem                  |
| Alt-↑ / Alt-↓ | Move the scene focused in the outline    |
| `/`           | Insert menu, typed alone at a line start |
| Escape        | Close a dialog, leave focus mode         |

Browsers keep Mod-1 and Mod-2 for switching tabs: there, use the top bar's
buttons or the palette.

## Claude connector

Promptbook is its own connector for Claude on the web and Claude Desktop. In
a brainstorm, Claude reads and writes your projects: the prep document one
section at a time, the to-do list, the inspiration items, research notes, the
brainstorm log, and the board's prompts (`get_board`; `add_image_prompt`,
`update_image_prompt` and `remove_image_prompt` for the image prompts of every
category; `set_scene_prompts` for a scene's music and first image prompt, one
scene at a time). A new chat about a project starts by reading its
brainstorm log.

To connect Claude:

1. In claude.ai open **Settings → Connectors → Add custom connector**.
2. Paste the connector URL, `<PUBLIC_URL>/api/mcp`, for example
   `https://promptbook.siberio.eu/api/mcp`. Settings → Connected apps shows it
   with a Copy button.
3. Sign in to Promptbook the usual way (single sign-on, or your password) and
   press **Allow** on the page that opens.

The page asks which access to give:

- **Read your projects:** Claude reads everything and changes nothing.
- **Read and edit your projects:** Claude also creates projects, edits the
  prep document and adds to-do items, inspiration items, research notes and
  log entries, and writes the board's prompts. It never ticks a to-do item,
  never rewrites the seed, and deletes nothing except an image prompt with
  `remove_image_prompt`, whose images move to the Unmatched tray.

Settings → Connected apps lists every app you allowed, with its access and
when it was last used. **Revoke** cuts it off at once; to use it again,
connect it from claude.ai.

Claude edits one section, scene or sheet at a time, and only the text it has
read. An edit that adds template errors is refused, and Claude gets the
problems back.

Before every edit the server saves a snapshot of the document, kept 30 days.
The Document view then shows a banner: **Compare** opens the change in
History, and **Undo** puts back what Claude replaced while that part is
unchanged.

History also keeps the snapshots you save by hand, until you delete them, and
restores any snapshot. A restore first saves the current text.

## Development

Development needs Node 26 and a Postgres. Run the server and Vite side by
side:

```sh
npm ci
DATABASE_URL=postgres://… PUBLIC_URL=http://localhost:5173 \
  PROMPTBOOK_ADMIN_USERNAME=steve PROMPTBOOK_ADMIN_PASSWORD=… \
  npm run dev -w promptbook-server
npm run dev -w promptbook-web
```

Vite serves the web client on `http://localhost:5173` and passes `/api` and
`/sync` to the server on port 3000. `PUBLIC_URL` must be Vite's address, or
the server refuses the changes. `npm run cli -w promptbook-server -- seed steve`
adds the sample projects.

The desktop app runs the web client's build in Electron. Build both, then
start it against a server:

```sh
npm run build -w promptbook-web
npm run build -w promptbook-desktop
PROMPTBOOK_SERVER=http://localhost:8090 npm start -w promptbook-desktop
```

`PROMPTBOOK_USER_DATA` points it at another data folder. `npx electron-builder
--dir` in `packages/desktop` packages it for this computer into
`packages/desktop/release`; release tags build every installer on GitHub
Actions (`.github/workflows/desktop.yml`).

## Tests

```sh
npm run typecheck
npm test
npm run e2e
```

`npm test` runs every package's tests. The server's database tests run only
with `TEST_DATABASE_URL` set to a Postgres database whose name ends in
`_test`, which they recreate on every run.

`npm run e2e` builds and starts its own stack on port 8091 (`E2E_PORT`), runs
the Playwright tests and removes the stack with its data. Set `KEEP_STACK=1`
to keep it. Install the browser once with `npx playwright install chromium`.
The `desktop` project drives the desktop app from its build, so build the web
client and the desktop app first (see Development); on Linux without a
display run it under `xvfb-run`.
