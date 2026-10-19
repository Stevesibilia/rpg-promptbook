# RPG Promptbook

A prep tool for the game master: campaigns, adventures and one-shots go from
brainstorm to table without copy and paste. The adventure is written once, the
Midjourney and Suno prompts come out of it, the downloaded images and tracks
land in their scene, and the PDF for the table and the CueBard project are
built from it.

Status: the server and the web client run locally and on the homelab
(see [docs/deploy-homelab.md](docs/deploy-homelab.md)). The desktop app comes
later. See [docs/design.md](docs/design.md).

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
section at a time, the to-do list, the inspiration items, research notes and
the brainstorm log. A new chat about a project starts by reading its
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
  log entries. It never ticks or deletes anything, and never rewrites the
  seed.

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
