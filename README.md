# RPG Promptbook

A prep tool for the game master: campaigns, adventures and one-shots go from
brainstorm to table without copy and paste. The adventure is written once, the
Midjourney and Suno prompts come out of it, the downloaded images and tracks
land in their scene, and the PDF for the table and the CueBard project are
built from it.

Status: the server and the web client run locally. The desktop app comes
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
