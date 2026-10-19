## Context

The design is in [docs/design.md](../../../docs/design.md) ("Local-first",
"Stack", "Projects and prep documents", "To-do list") and the agreed UI in
[docs/mockups/projects.html](../../../docs/mockups/projects.html), approved by
the owner on 2026-10-19 together with four decisions: a plain, unchecked
campaign skeleton; the desktop app needs the server once (#6); one note
becomes one project and is never merged; deleting moves to a bin for 30
days.

The repository has one package, `packages/format` (`promptbook-format`),
which exports TypeScript source (`"exports": { ".": "./src/index.ts" }`) with
`.js` suffixes in its imports, built for `moduleResolution: bundler`. Node
cannot run that source directly, so every consumer either bundles it or runs
under a TypeScript loader.

The server conventions come from gdrarchive (`~/Homelab/gdrarchive`,
`packages/backend`), read on 2026-10-19: Fastify 5, plain `pg` with
hand-rolled SQL migrations, Argon2id with `@node-rs/argon2`, server-side
sessions keyed by a SHA-256 of the cookie token, an Origin check instead of
CSRF tokens, a database-backed sign-in throttle, `TEST_DATABASE_URL` for
tests. Promptbook ports those patterns, not the code wholesale: there is no
email, no roles, no sign-up, no OIDC and no API tokens here.

This change has to run locally for the owner before #3 and #6 exist.

## Goals / Non-Goals

**Goals:**

- One Yjs document per project, its shape defined in one package used by
  server, web and later desktop.
- A server that stores, syncs and summarises projects, with local accounts.
- The projects screen from the mockup, working in a browser against that
  server, with live sync between tabs.
- Markdown import through the converter, and a lossless export.
- `docker compose up` gives a working app with sample projects.

**Non-Goals:**

- The desktop app, storage on the device, OIDC, sign-in through the system
  browser (#6). The design must not block them: nothing here may assume the
  browser is the only client.
- The editor's live preview, outline and checks (#3). The project page is a
  plain CodeMirror bound to the Yjs text, to be replaced.
- Inspiration items, research notes, brainstorm log, connector (#4); assets;
  snapshots and history; homelab deployment (Helm chart, registry); an
  editable document template.

## Decisions

### 1. Three new packages

- `packages/project` (`promptbook-project`): the Yjs document shape and every
  function that reads or changes it, the skeletons, the default settings, the
  summary, import preparation and export. Pure TypeScript, no Node-only or
  DOM-only imports, exports source like `promptbook-format`. Depends on
  `yjs`, `promptbook-format`, `fractional-indexing`, `yaml` (amended at
  review of groups 1 and 2: the skeleton writes front matter with `yaml`'s
  stringify so titles with a colon are quoted, and `prepareImport` reads the
  converted front matter with it).
- `packages/server` (`promptbook-server`): Fastify, Postgres, Hocuspocus,
  REST API, command line.
- `packages/web` (`promptbook-web`): React, Vite, React Router.

Why a separate `project` package: the desktop app (#6) and the connector (#4)
need the same document shape offline and on the server; putting it in the
server or the web package would force a copy. Names stay unscoped
(`@promptbook` belongs to another project).

### 2. Yjs document shape (schema 1)

Root types of a project's `Y.Doc`:

- `meta` (`Y.Map`): `schema` (1), `id` (uuid), `title`, `category`
  (`campaign` | `adventure` | `one-shot`), `status` (`draft` |
  `in-progress` | `complete`), `campaignId` (uuid or null), `system`
  (string, may be empty), `createdAt` (ISO).
- `document` (`Y.Text`): the prep document, Markdown.
- `todo` (`Y.Array<Y.Map>`): each item `id` (uuid), `text`, `done`
  (boolean), `note` (string, may be empty), `due` (`YYYY-MM-DD` or null),
  `pos` (fractional index string). Order is `pos`, then `id`.
- `seed` (`Y.Array<Y.Map>`): append-only versions, `text` and `at` (ISO).
  The current seed is the last element.

Why `pos` instead of moving array elements: a move in a `Y.Array` is a delete
plus an insert, so a concurrent rename of the moved item would be lost.
Changing one `pos` key merges like any other field. Rejected: `Y.Text` for
item text (overkill for one line; last writer wins per field is fine).

Why the metadata lives in the document and not only in Postgres: the desktop
app must change status, campaign and to-do offline (#6). The server's
`projects` row is a summary derived from the document, never the source.

The title, category and campaign are app metadata; the front matter
(`titolo`, `formato`, `campagna`) belongs to the printed document. The
skeleton writes both at creation; afterwards they are independent, and the
list shows `meta.title`. Rejected: deriving the list title from the front
matter, which would make a campaign's or a broken document's title depend on
parsing. The editor (#3) may add a hint when they differ.

`category` is set at creation and never changed by the UI. Invalid values
met while summarising (an unknown status, a `campaignId` that is not a
campaign of the same user, a campaign with a campaign) are summarised as
`draft` and stand-alone; the document is not rewritten. An unknown category
reads as `adventure` (amended at review of groups 1 and 2); the server never
writes the `category` column from a summary, only at creation, since the
category is fixed. The server passes every campaign of the user, in the bin
or not, to `summarize` when it stores a row, so a link to a campaign in the
bin survives an edit, and the list query treats such a link as stand-alone,
because the children's summaries are not recomputed when their campaign is
deleted or restored (amended at review of group 3).

### 3. `promptbook-project` API

- `createProjectDoc(input) → Y.Doc` with `input = { id, title, category,
status, campaignId, system, seed?, todo: string[], document }`.
- Readers: `readMeta(doc)`, `readTodo(doc)` (sorted), `currentSeed(doc)`,
  `seedVersions(doc)`.
- Writers, each one `doc.transact`: `setTitle`, `setStatus`, `setCampaign`,
  `addTodo(doc, text, { after? })`, `updateTodo(doc, id, patch)`,
  `moveTodo(doc, id, { before?, after? })`, `removeTodo`, `addSeedVersion`.
- `skeletonDocument(category, { title, system, campaignTitle, author,
copyright, licence })`: adventure and one-shot from
  `templates.avventura` (front matter keys in the template's order, then
  every section of the template in order with an empty body,
  `### S1. Prima scena` under the scenes section (the format needs a name
  after the id), the appendix); campaign from the fixed skeleton in the
  spec. `formato` is `avventura` or `one-shot`.
- `defaultSettings()`: the to-do templates and empty defaults from the
  spec, a fresh object on every call so no caller can change the shared
  defaults (amended at review of groups 1 and 2).
- `summarize(doc, { campaigns }) → Summary`: the fields of the projects row
  (decision 6). Words: whitespace-separated tokens containing a letter, in
  the document after the front matter.
- `prepareImport(note, { fileName, campaigns })` → `{ title, category | null,
campaignId | null, system, text, report, isAdventureNote, imageRefs }`, using
  `convertNote`; `system` is the converted front matter's `sistema`, empty
  when absent (amended at review of group 3). An adventure note has front matter in the original, a
  converted front matter key other than `titolo`, or a `### S<n>.` heading.
  Image references: Markdown image links and `<img src>` whose target is a
  relative path.
- `exportProject(doc, { campaignTitle }) → Record<string, string>` with
  `document.md`, `todo.md`, `seed.md`, `project.json`. Folder name: the title
  with `/\\:*?"<>|` replaced by `-`, made unique within one zip with ` (2)`.

### 4. Server stack and runtime

Fastify 5, `@fastify/cookie`, `@fastify/static` (serves the web build with an
SPA fallback), `@fastify/websocket` for the sync endpoint, `@fastify/helmet`
for security headers (no nginx in front, unlike gdrarchive: design.md asks
for one container), `pg`, `@node-rs/argon2`, `zod` for request bodies and
configuration, `fflate` for zips.

Runtime: development with `tsx watch src/main.ts`; the image bundles the
server with esbuild into `dist/main.js` and `dist/cli.js`, inlining the
workspace packages and leaving npm dependencies external. Why: Node 26 strips
types but does not rewrite `.js` import suffixes to `.ts`, so the format
package's source cannot run as is; bundling also keeps the image small.
Rejected: `tsx` in production (loader in the hot path), compiling every
package to `dist` (`emitDeclarationOnly` is set repo-wide for the type
check).

Configuration, validated with zod at start, failing with a message naming
the variable: `DATABASE_URL` (required), `PUBLIC_URL` (required, the origin
used for Origin checks and shown in the UI), `PORT` (3000),
`SESSION_TTL_HOURS` (720), `TRUST_PROXY_HOPS` (0), `PROMPTBOOK_ADMIN_USERNAME`,
`PROMPTBOOK_ADMIN_PASSWORD`, `WEB_DIST` (path of the web build; unset in
development, where Vite serves the web), `TEST_DATABASE_URL` (tests only).

### 5. Database

Hand-rolled migrations as in gdrarchive: `packages/server/migrations/NNN_name.sql`,
applied in order at start and by `cli.js migrate`, each in a transaction,
recorded in `_migrations(name, applied_at)`. `001_init.sql`:

```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  display_name text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index users_username_key on users (lower(username));

create table sessions (
  token_hash text primary key,
  user_id uuid not null references users on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user_idx on sessions (user_id);

create table login_failures (
  id bigserial primary key,
  username text not null,
  ip inet not null,
  at timestamptz not null default now()
);
create index login_failures_at_idx on login_failures (at);

create table user_settings (
  user_id uuid primary key references users on delete cascade,
  settings jsonb not null,
  updated_at timestamptz not null default now()
);

create table projects (
  id uuid primary key,
  owner_id uuid not null references users on delete cascade,
  title text not null,
  category text not null check (category in ('campaign','adventure','one-shot')),
  status text not null check (status in ('draft','in-progress','complete')),
  campaign_id uuid,
  system text not null default '',
  seed text not null default '',
  todo_done int not null default 0,
  todo_total int not null default 0,
  next_due date,
  scenes int,
  words int,
  errors int,
  warnings int,
  created_at timestamptz not null default now(),
  edited_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index projects_owner_idx on projects (owner_id) where deleted_at is null;

create table project_docs (
  project_id uuid primary key references projects on delete cascade,
  state bytea not null,
  updated_at timestamptz not null default now()
);
```

`campaign_id` has no foreign key on purpose: it mirrors the document, which
may name a campaign in the bin or one that is gone.

### 6. Sync with Hocuspocus

One `Hocuspocus` instance inside the Fastify process, without its own HTTP
server; `GET /sync` is a `@fastify/websocket` route that hands the socket to
`hocuspocus.handleConnection`. The document name is the project id.
With Hocuspocus 4.7.1, `handleConnection` takes the socket, a Fetch `Request`
built from the upgrade and the context, and the route forwards the socket's
messages to `handleMessage`, its close to `handleClose` and its pongs to
`touch` (amended in group 3).

- `onAuthenticate`: reject unless the upgrade's `Origin` equals the
  `PUBLIC_URL` origin, the session cookie resolves to a session, and the
  project exists, belongs to the session's user and has no `deleted_at`. Put
  `{ userId, sessionHash }` in the connection context.
- `onLoadDocument`: apply `project_docs.state`.
- `onStoreDocument` (Hocuspocus debounce 2 s, max 10 s, and on last
  disconnect): in one transaction write the state
  (`Y.encodeStateAsUpdate`) and the summary columns from `summarize`, and set
  `edited_at`. On failure, broadcast the stateless message
  `{"type":"store-failed"}`; after every successful store,
  `{"type":"stored"}` (amended in group 3: decision 9's list refresh needs
  it). A failed store is tried again after 5 s, since Hocuspocus keeps the
  document in memory but stores again only on the next edit, and a quiet tab
  would otherwise stay on Not saved (amended at review of group 3).
- Closing: a helper `closeConnections(predicate)` walks the open documents'
  connections and closes those matching a session hash (sign-out, password
  change) or a project id (delete). Sign-out and password change close the
  whole WebSocket with code 4401, since one socket carries one cookie and the
  provider then reconnects into an authentication failure; delete first
  broadcasts `{"type":"deleted"}` on the document, then closes that
  document's connections.

REST routes that change a document (create, import) build the `Y.Doc` with
`promptbook-project` and insert the state directly; no route edits an open
document. Status, campaign, title and to-do changes come from clients
through sync only.

Rejected: y-websocket's server (no auth hooks or persistence model of its
own; Hocuspocus is what design.md chose), a separate sync process (one
container).

### 7. REST API

All under `/api`, JSON, protected unless marked public:

- `POST /auth/login` (public), `POST /auth/logout`, `GET /auth/me` (public:
  answers `{ user: null }` without a session), `PATCH /auth/me`
  (`displayName`), `POST /auth/password` (`current`, `next`).
- `GET /projects` (summaries not in the bin), `GET /projects?bin=1`,
  `POST /projects` (create from `{ category, title, campaignId, system,
status, seed }` with the user's templates), `DELETE /projects/:id` (to the
  bin, closes its connections), `POST /projects/:id/restore`.
- `POST /import` with `{ notes: [{ text, fileName, title, category,
campaignId }] }`, body limit 20 MB: converts each note on the server and
  creates the projects; answers the created summaries and reports.
- `GET /projects/:id/export` and `GET /export`: `application/zip`.
- `GET /settings`, `PUT /settings` (zod-validated, whole object).
- `GET /health` (public).

Not found and not owned answer the same 404. Unknown routes under `/api`
answer 404 JSON; everything else falls back to the web app's `index.html`.

A purge runs at start and every hour: delete projects with `deleted_at`
older than 30 days, and `login_failures` older than a day.

### 8. Accounts

Ported from gdrarchive's `passwordService`, `sessionService`, auth plugin and
`loginThrottleService`, adapted to usernames. Argon2id `memoryCost: 19456,
timeCost: 2, parallelism: 1`; a fixed dummy hash is verified for unknown
usernames so timing matches. Cookie `pb_session`. The Origin check runs in
an `onRequest` hook for POST, PUT, PATCH and DELETE, including sign-in.

Command line (`cli.js`, also `npm run cli -w promptbook-server -- …`):
`migrate`, `user:create <username> [--display-name]` (password from
`PROMPTBOOK_PASSWORD` or a prompt), `user:password <username>`, and
`seed <username>` (decision 10).

### 9. Web client

React 19, Vite, React Router, `@hocuspocus/provider`, CodeMirror 6 with
`@codemirror/lang-markdown` and `y-codemirror.next`, fonts from
`@fontsource/*` (Barlow 400/500/600, Barlow Condensed 600/700, Spectral
400/600/italic, IBM Plex Mono 400/500). Styles: the mockup's CSS tokens moved
to `src/styles/tokens.css`, plain CSS per component; no CSS framework. API
calls through a small `api.ts` fetch wrapper with `credentials: 'include'`
and a 401 handler, as in gdrarchive. The project list is fetched from
`GET /api/projects` and refreshed when a stored message arrives or every 10
seconds while the page is visible.

Sync connections: one `HocuspocusProvider` per project the user has open
(the selected row's panel, the project page), kept in a small registry that
also computes the pill's state:

- Sign in to sync: the provider reported an authentication failure.
- Not saved: a `store-failed` stateless message without a later `stored`.
- Reconnecting: the provider is disconnected.
- Syncing: connected with unsynced changes.
- Synced: otherwise. Worst state wins across providers.

Development: Vite on its own port with a proxy for `/api` and `/sync`
(`ws: true`) to the server on 3000, and `PUBLIC_URL` set to Vite's origin so
the Origin checks pass.

### 10. Local stack and sample data

Root `Dockerfile`, multi-stage on `node:26-alpine`: build the web with Vite
and bundle the server with esbuild, then a runtime stage with production
dependencies, `dist/`, `migrations/` and the web build at `WEB_DIST`. Root
`compose.yaml`: `postgres:18-alpine` with a named volume and a health check,
and `app` on `${PROMPTBOOK_PORT:-8090}:3000`, `PUBLIC_URL`
`http://localhost:${PROMPTBOOK_PORT:-8090}` unless `.env` sets `PUBLIC_URL` to
reach the stack from the LAN (amended in group 4), the admin variables from a
`.env` file (`.env.example` committed, `.env` ignored).

`seed <username>` creates, for that user, the projects of the mockup: the
campaigns «Blacksad - Il Continentale», «Cronaca del Gabbiano» and
«Apocrypha» (complete); the adventures «Il ballo dei Lorenzetti» (draft) and
«Pioggia su Kenmore Street» (complete) in Blacksad and «Le ali di Ca'
Malamocco» in Cronaca del Gabbiano; the one-shot «L'Ancora di Sabaoth» with
`packages/format/fixtures/l-ancora-di-sabaoth.converted.md` as its document;
and a draft one-shot imported from `packages/format/fixtures/esempio.md`
through `prepareImport`, titled «L'Ancora di Sabaoth (esempio del modello)»,
since the template's example is the same adventure. To-do states and seeds as in the mockup. It refuses
to run when the user already has projects.

### 11. Tests

- `promptbook-project`: vitest, pure; two `Y.Doc`s exchanging updates for the
  merge cases.
- `promptbook-server`: vitest against a real Postgres from
  `TEST_DATABASE_URL` (name must end in `_test`; global setup recreates it
  and migrates; `beforeEach` truncates). Sync tests start the app on a random
  port and connect two `HocuspocusProvider`s with the `ws` package.
- End to end: Playwright in `e2e/` at the root against the compose stack
  (`E2E_PORT`, default 8091; project name `promptbook-e2e`; `down -v`
  afterwards unless `KEEP_STACK=1`), covering sign-in, create, tick in two
  contexts, import, export, bin and restore, sign out in another tab.
- CI: the `check` job gets a `postgres:18-alpine` service and
  `TEST_DATABASE_URL`; a new `e2e` job builds the stack and runs Playwright.
  `check` stays the required check; making `e2e` required is the owner's
  call.

## Risks / Trade-offs

- [Hocuspocus's API for closing chosen connections, or for running inside
  Fastify's WebSocket route, differs from what decision 6 assumes] → report
  it with the version and what exists; do not fork or patch Hocuspocus.
- [`@node-rs/argon2` has no prebuilt binary for `node:26-alpine` on arm64]
  → report it; do not switch to a JavaScript hash without asking.
- [Summarising parses the whole document on every store] → the format
  package parses Sabaoth in under 150 ms; stores are debounced. If a store
  takes over 500 ms, say so in the hand-back with the measurement.
- [The list is polled, so it lags a store by up to 10 s] → accepted for one
  user; the panel shows changes at once through sync.
- [Metadata and front matter can disagree after edits] → accepted (decision
  2); #3 may add a hint.
- [Assets are not imported] → reported per note; assets come with the asset
  board.

## Migration Plan

New packages and a new database; nothing to migrate. To try it locally:
copy `.env.example` to `.env`, `docker compose up -d --build`, then
`docker compose exec app node dist/cli.js seed <username>`, then open
`http://localhost:8090`.

## Open Questions

None. Homelab deployment gets its own issue once the owner has tried the
local stack.
