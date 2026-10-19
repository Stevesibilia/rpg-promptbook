## Context

`docs/design.md` plans a connector on claude.ai (MCP connector), a brainstorm
log that a new chat reads first (Brainstorm memory), a seed with dated
versions and sources of inspiration (Inspiration), research notes filled by
Claude (Research), Claude's writes as Yjs updates to the same document
(Architecture, Claude's edits) and, from the research, server snapshots by
hand and before every Claude write, with MCP edits scoped to one section.
The agreed mockup is
[docs/mockups/connector.html](../../../docs/mockups/connector.html): Document
with the Claude edit banner and the inspector's Research section,
Inspiration, Research, Brainstorm log, History with Compare, the Authorize
page and Settings, Connected apps.

The owner asked to finish unattended and to sign in to the connector "the
same as the main app, like gdrarchive does". The architect took the
decisions below on the owner's behalf.

### The code today

- **Project document.** `packages/project/src/doc.ts:14-18` defines schema 1:
  `meta` (Y.Map), `document` (Y.Text), `todo` (Y.Array of Y.Map: id, text,
  done, note, due, pos) and `seed` (Y.Array of Y.Map: text, at; append-only,
  the last is current). `SCHEMA = 1` (`model.ts:5`). Readers fall back to
  empty values for anything mistyped (`doc.ts:79-83`). The seed's versions
  already exist (`addSeedVersion`, `doc.ts:241-244`); the projects panel
  edits the seed (`web/src/projects/ProjectPanel.tsx:127-170`) and the
  inspector shows it with a link to that panel
  (`web/src/editor/SeedView.tsx:23`).
- **Summary.** `summarize` (`packages/project/src/summary.ts:40-78`) parses
  adventures and one-shots with `parseAdventure` and counts errors, warnings,
  scenes and words after the front matter; a campaign is not parsed
  (`summary.ts:68`).
- **Format ranges.** `parseAdventure(text, { template })` returns a `Model`
  (`packages/format/src/model.ts:312`) whose `Section` (`:145`), `Scene`
  (`:191`) and `Sheet` (`:272`) carry `range` and `headingRange` with UTF-16
  offsets (`model.ts:7-13`), the same unit `Y.Text` uses. `Problem`
  (`model.ts:33-42`) has a stable `code`, `severity` and `range`. The editor
  defines a scene's span as its heading line to the next scene's heading,
  without the blank lines after it (`web/src/editor/moveScene.ts:16-40`).
  Template section names are Italian (`format/src/template/avventura.ts:31-46`:
  «La vicenda in breve», «Scene», «Indizi», «PNG», «Schede»…); scene ids use
  `S` (`avventura.ts:11`).
- **Sync.** Hocuspocus runs inside Fastify (`server/src/sync.ts:72-134`).
  `onAuthenticate` checks the origin, the session and the project's owner
  (`sync.ts:79-94`); `onLoadDocument` reads `project_docs` (`:96-103`);
  `onStoreDocument` writes the state and the summary through
  `storeProjectDoc` and broadcasts a stateless `stored` message (`:105-133`;
  `projects.ts:150-170`). `liveDocument(id)` returns the in-memory document
  or null (`sync.ts:153-155`), and the export reads
  `sync.liveDocument(id) ?? loadProjectDoc(db, id)`
  (`routes/transfer.ts:84`). Nothing on the server writes to a project
  document today.
- **Direct connections.** `@hocuspocus/server` 4.7.1 has
  `hocuspocus.openDirectConnection(name, context)`
  (`src/Hocuspocus.ts:649-667` in the package): it loads the document through
  `onLoadDocument` or reuses the live one, skips `onAuthenticate`, and
  returns a `DirectConnection` whose `transact(fn)` applies a local
  transaction that every connected client receives, and whose `disconnect()`
  stores at once through `onStoreDocument` (`src/DirectConnection.ts:30-74`).
- **Auth hook.** `authPlugin`'s `onRequest` runs the same-origin check on
  every write first, then resolves the `pb_session` cookie, then requires a
  session on `/api` routes not in `PUBLIC_ROUTES`
  (`server/src/accounts/auth.ts:21-28, 48-55, 83-99`). `isApiUrl` is
  `auth.ts:32`. A test lists every `/api` route and expects 401 without a
  session for each one not public (`test/db/accounts.test.ts:160-180`).
  There is no CORS plugin; the body limit is 1 MB (`app.ts:37`).
- **Configuration.** `PUBLIC_URL` is required and kept as its origin,
  `config.publicOrigin` (`config.ts:46, 111`). `APP_VERSION` gives
  `config.appVersion` (`config.ts:127`).
- **Web build.** `webPlugin`'s not-found handler sends `index.html` for any
  GET outside `/api` (`server/src/web.ts:51-55`), so `/authorize` reaches the
  web app, and `/.well-known/...` reaches a server route once one is
  registered. The homelab ingress sends every path to the server
  (`charts/rpg-promptbook/values-homelab.yaml`, `path: /`, no auth
  middleware).
- **Sign-in round trip.** The sign-in page starts single sign-on with
  `return_to` = path plus query (`web/src/auth/SignInPage.tsx:104`), and the
  server keeps it only when it is at most 2048 printable characters
  (`accounts/oidc.ts:51-56`). Password sign-in renders in place without
  changing the address (`web/src/App.tsx:100-108`).
- **Purge.** No command: `main.ts:25-32` runs `purge` (`projects.ts:207-215`:
  bin, old sign-in failures, expired handshakes) at start and every hour.
- **Project creation** is inline in `POST /api/projects`
  (`routes/projects.ts:57-86`): settings, campaign check, skeleton, to-do
  template, `insertProject`.
- **Web.** Routes `/`, `/bin`, `/settings/:section?`, `/signed-in`,
  `/projects/:id`, and `*` back to `/` (`web/src/App.tsx:113-127`). The rail
  has Projects, Document and Settings (`shell/Shell.tsx:9, 62-88`). Settings
  sections are `SettingsPage.tsx:13-20`. Inspector sections are scene,
  checks, todo, seed, remembered in the browser (`editor/Inspector.tsx:10-14`).
  Stateless messages `stored`, `store-failed` and `deleted` are parsed in
  `sync/state.ts:53-59` and handled in `sync/registry.ts:114-120`. No diff
  library is installed. `E2E_CPU_THROTTLE` slows the signed-in pages
  (`e2e/helpers.ts:4-14`).
- **Dependencies.** `promptbook-format` is a dev dependency of the server
  (`server/package.json`), though `promptbook-project` already imports it at
  run time.

### gdrarchive, the reference

`~/Homelab/gdrarchive` runs a hand-written OAuth 2.1 authorization server for
its MCP endpoint only (`packages/backend/src/routes/oauth.ts`,
`services/oauthTokenService.ts`, `oauthClientService.ts`,
`oauthConfigService.ts`, `oauthGrantService.ts`, `migrations/020_oauth.sql`)
and the endpoint itself (`routes/mcp.ts`, `mcp/server.ts`, `mcp/tools.ts`,
`mcp/errors.ts`), tested by `oauth*.test.ts`, `mcpEndpoint.test.ts`,
`dbtests/oauthCredentials.test.ts`, `e2e/mcp-flow.spec.ts` and
`e2e/oauth-consent.spec.ts`. It is connected to claude.ai today. Its facts
are given where each decision ports them.

`npm view` on 2026-10-19: `@modelcontextprotocol/server` 2.0.0 (published
2026-07-27; latest 2.3.1) depends on `@modelcontextprotocol/core` 2.0.0
exactly; `@modelcontextprotocol/node` 2.0.0 needs `hono` ^4.11.4 as a peer.
gdrarchive pins `server` and `node` at 2.0.0 and uses `diff` ^9.0.0.

## Goals / Non-Goals

**Goals:**

- Claude web and Claude Desktop connect with "Add custom connector" and the
  URL `https://promptbook.siberio.eu/api/mcp`, sign in through Authentik as
  in the app, and can read and write a project.
- A brainstorm ends with a log entry, research notes, inspiration items and
  to-do items saved in the project; a new chat starts by reading the log.
- Claude edits one section at a time, never blindly, never adding errors, and
  every edit can be compared and undone.
- Everything Claude writes merges with open editors and offline edits like
  any other Yjs change.

**Non-Goals:**

- Clipping a URL by hand, topics proposed by the app, an in-app research
  engine, transcript import, image uploads.
- Snapshots on the desktop app (#6 keeps local snapshots apart).
- A general public API, personal API tokens, other OAuth uses.

## Decisions

### 1. Scope

In: the MCP connector (OAuth authorization server and `/api/mcp`), the
`/authorize` consent page, Settings, Connected apps; server snapshots of the
prep document (by hand with a name, automatic before every Claude write of
the document, compare as a unified diff, restore, which first snapshots the
current text); the Claude edit banner with Compare and Undo; the Inspiration
view (seed with dated versions, sources of inspiration); the Research view
(topics added and removed by hand, notes with facts and sources, New, Edit, Delete); the
inspector's Research section; the Brainstorm log view (entries via Claude or
by you, Edit, Delete, open questions to the to-do list); the export of the
new data. The rail of a project: Document, Inspiration, Research, Brainstorm
log, History.

Out, and said so in the proposal: clipping a URL by hand (it needs a server
fetch with SSRF guards); topics proposed by the app; the research engine with
API keys; transcript import; image uploads; the mockup's light and dark
button (the theme stays in Settings, Appearance); the outline's "edited by
Claude" dot and the status bar's "Last snapshot" and "Claude connected"
lines; the A5 booklet; earlier PDF versions.

Why: this is issue #4 plus what moved from #3, and the mockup the owner
agreed. The cut items each need a piece of infrastructure (a safe server
fetch, a keyword extractor, key storage, uploads) that this change does not
otherwise build. Rejected: shipping the connector alone first (the owner
asked for the whole issue, and the views are how the user sees what Claude
wrote).

### 2. Project document: new collections

All prep data except snapshots lives in the project's Yjs document, defined
in `packages/project/src/doc.ts` next to `todo` and `seed`, so it works
offline in the desktop app and merges like the rest. New top-level types,
each a `Y.Array` of `Y.Map`:

```
inspiration     id, kind, text, url, why, by, at
                kind: 'link' | 'quote' | 'image' | 'note'; url '' unless link or image
researchTopics  id, name, state, at
                state: 'open' | 'noted'
researchNotes   id, topic, summary, facts, sources, by, at, editedAt
                facts: string[]; sources: { title, url, accessed }[] (accessed YYYY-MM-DD)
brainstorm      id, at, title, ideas, decisions, rejected, questions, by, todoAdded
                ideas, decisions, questions: string[]; rejected: { idea, why }[]
by: 'user' | 'claude'; at, editedAt: ISO date-time
```

Lists inside an item (`facts`, `sources`, `ideas`…) are plain JSON values set
as a whole: an edit replaces the field, and two clients editing different
fields of one item still merge. Order is by date, never by array position:
inspiration items and log entries newest `at` first, notes newest `editedAt`
first, topics oldest first; ties by id. `seed` stays as it is.

Package functions, each one transaction, in the style of the to-do ones:
`readInspiration`, `addInspirationItem`, `removeInspirationItem`;
`readTopics`, `addTopic` (null when the name is already there),
`setTopicState`; `readNotes`, `saveNote` (create, or update the note whose
topic matches, and set a matching topic to noted), `updateNote`,
`removeNote`; `readLog`, `addLogEntry`, `updateLogEntry`, `removeLogEntry`,
`addQuestionsToTodo` (adds one to-do item per open question at the end and
sets `todoAdded`, in one transaction); and `sameName(a, b)`, the comparison
used for topics and targets: NFD, combining marks removed, lower case,
whitespace collapsed. Readers drop items whose `id` is not a string and fall
back to empty values for the rest, as `doc.ts:79-83` does. Limits, checked by
the writers and by the server's tool schemas: texts 2000 characters (a
summary 10 000), names and titles 200, URLs 2048 and `http:` or `https:`
only, at most 50 items in any list and 30 sources.

- `removeTopic` deletes a topic and leaves its notes.
- Collections are capped (inspiration 500, topics 200, notes 500, brainstorm
  entries 1000); `at` must be an ISO 8601 date; readers skip items that fail
  either, and drop URLs that fail `isWebUrl`.

`SCHEMA` stays 1: the change only adds types; a client that does not know
them leaves them untouched, and readers of an older document see empty
lists. No migration.

Why: the to-do list already lives there (`doc.ts:17`) for the same reasons,
and `docs/design.md` asks for notes "stored like the rest of the project, so
they can be read and edited offline". Rejected: Postgres tables for notes and
the log (no offline, a second sync path); nested `Y.Array`s for facts and
ideas (merging concurrent edits of one list inside one note is not worth the
code; the realistic conflict is two whole edits).

### 3. Section targets

`packages/project/src/targets.ts` turns a document into its targets and finds
one:

- `targetsOf(text, category)`: for an adventure or a one-shot, from
  `parseAdventure`: every section (target: the template's `name`, or the
  heading text of an unknown section), every scene (target: its id, `S3`),
  every sheet (target: its `name`). For a campaign (not parsed, as the
  editor decided): every `##` and `###` ATX heading outside fenced code
  (target: the heading text). Each target has `kind`
  (`section | scene | sheet | heading`), `target`, `title`, `level`, and
  `from`/`to` offsets.
- Spans: a section from its heading line to `Section.range.end`; a scene as
  `moveScene.ts:16-40` defines it; a sheet from its heading line to
  `Sheet.range.end`; a campaign heading to the next heading of the same or a
  higher level. Trailing blank lines are never part of a span, so a
  replacement keeps the separator. The front matter is not a target.
- `findTarget(text, category, target)`: a scene id matches exactly, case
  insensitive; anything else matches with `sameName`. No match answers
  `unknown_target` with the valid targets; two matches (a section and a sheet
  with one name) answer `ambiguous_target` with both.
- In a campaign, line 0 is front matter only when a closing `---` or `...`
  follows; setext headings bound spans.

Why: the format package already knows every range; the outline in the editor
uses the same model (`web/src/editor/outline.ts`). Putting targets in
`promptbook-project` lets the desktop app reuse them. Rejected: addressing by
line numbers (stale the moment the user types) or by heading text alone
(scene titles change; ids do not).

### 4. Server writes through the live document

`packages/server/src/live.ts`:

```ts
withLiveDocument(sync, projectId, userId, (doc) => T): Promise<T>
```

opens `sync.hocuspocus.openDirectConnection(projectId, { userId,
sessionHash: null })`, runs the function inside `connection.transact`, and
always calls `connection.disconnect()`, which stores the document through
`onStoreDocument` at once (so the summary row and `stored` broadcast follow,
`sync.ts:105-133`). Callers check first that the project is the user's and
not in the bin, since a direct connection skips `onAuthenticate`. Reads use
`sync.liveDocument(id) ?? loadProjectDoc(db, id)`, as the export does.

Every Claude write goes through it: the document text, to-do items,
inspiration items, topics, notes and log entries. Restoring a snapshot from
the web goes through it too. The text is changed with the smallest edit:
common prefix and suffix of the old and new span kept, one delete and one
insert in between, so cursors and concurrent typing elsewhere survive.

- `withLiveDocument` awaits the transaction; an error inside it reaches the
  caller, and the connection is closed either way.

Snapshot creation tells open clients with a stateless message
`{"type":"snapshot","id":…,"kind":…}` on the document
(`document.broadcastStateless`, as `STORED` is sent), which the web adds to
`sync/state.ts` and `sync/registry.ts`.

Why: open editors see Claude's text at once, offline clients merge it on
reconnect, and the store path and summary stay the single one
(`docs/design.md`, Claude's edits). Rejected: writing `project_docs`
directly (a live Hocuspocus document would overwrite it on its next store);
a Hocuspocus provider client inside the server (a socket to itself, with
auth to fake).

### 5. Section-scoped edits

`read_document` with a target returns the span's text and `hash`, the
SHA-256 hex of that text in UTF-8 (whole document: the whole text and its
hash). `replace_section(projectId, target, markdown, hash)`:

1. Check the project; open the live document; read the text; find the
   target; refuse `changed_since_read` ("The section changed since you read
   it; read it again.") when the span's hash differs.
2. Check `markdown`: at most 100 000 characters; it must start with a heading
   of the target's level, and for a scene the same id (`### S3. …`);
   trailing blank lines are dropped. Otherwise `invalid_markdown`.
   After building the new text, `findTarget` on it must find the same target
   at exactly the written span (heading kept, no new heading of the same or a
   higher level inside); otherwise `invalid_markdown`. This is what lets
   `after_hash` be computed on the span undo hashes.
   Trailing blanks are trimmed with a linear scan; a heading line longer than
   300 characters is `invalid_markdown`.
3. Build the new text in memory. For an adventure or a one-shot, parse old
   and new; when the new text has more errors, refuse `more_errors` with the
   counts and the new text's problems inside the replaced span (code,
   severity, message, line). Warnings never refuse. A campaign is not
   parsed and no check runs.
4. Insert a `claude` snapshot of the text read in step 1.
5. In one transaction, read the text again; if it changed since step 1,
   delete that snapshot and refuse `changed_since_read`; else apply the
   smallest edit (decision 4).
6. Broadcast the snapshot message and answer `{ target, hash, snapshotId,
errors, warnings, problems }` (the span's new hash, the totals, the
   problems in the span).

`add_scene(projectId, title, markdown)` appends a scene at the end of the
«Scene» section, with id `S<n+1>` where `n` is the highest scene number,
heading `### S<n+1>. <title>`, the body after a blank line; same error check,
snapshot and answer. Adventures and one-shots only. It is simple because
`moveScene.ts` already locates the section's end; it is included because a
brainstorm usually adds scenes, and asking Claude to replace the whole
«Scene» section to add one would put every scene at risk.

Why: `docs/design.md` asks for edits "scoped to one section, never a full
rewrite" and for MCP writes validated before they apply, with the errors
going back to Claude. The hash stops Claude from writing over text it never
saw (the user typing while Claude thinks). Rejected: line-range patches
(fragile); refusing on warnings (drafts are full of them); checking only the
span (a change can break a reference elsewhere, so the whole document is
parsed).

### 6. Snapshots

Server only, in Postgres, in migration `003_connector.sql`:

```sql
create table snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  kind text not null check (kind in ('claude', 'user', 'restore')),
  label text not null,            -- user: the name; claude: the target and title; restore: what was restored
  text text not null,             -- the prep document
  words integer not null,
  tool text,                      -- claude: replace_section | add_scene
  target text,                    -- claude: S3, Scene, Tenente Donato…
  before_section text,            -- claude: the target's text before the edit ('' for add_scene)
  after_hash text,                -- claude: sha-256 of the target's text right after the edit
  grant_id uuid references oauth_grants on delete set null,
  created_at timestamptz not null default now()
);
create index snapshots_project on snapshots (project_id, created_at desc);
```

`words` counts like the summary: after the front matter for an adventure or
a one-shot, the whole text for a campaign. Retention: `claude` and `restore`
30 days, `user` until deleted; `purge` deletes the expired ones. No snapshot
of the inspiration, research or log: they only grow by Claude's hand, and
each has Delete.

REST, session only, project checked like the other project routes (404 when
not the user's or in the bin):

- `GET /api/projects/:id/snapshots[?kind=claude&limit=1]`: newest first,
  without the text: `id, kind, label, tool, target, words, createdAt,
expiresAt` (null for `user`).
- `POST /api/projects/:id/snapshots` `{ label }` (1 to 200 characters,
  trimmed): a `user` snapshot of the live text; 201.
- `GET /api/projects/:id/snapshots/:sid`: one, with `text`.
- `POST /api/projects/:id/snapshots/:sid/restore`: a `restore` snapshot of
  the current text labelled with the restored one's date and label, then the
  text replaced through the live document; answers the new snapshot.
- `POST /api/projects/:id/snapshots/:sid/undo`: `claude` only; reverts that
  edit's part as decision 13 says; 200 with the restore snapshot, or 409
  `section_changed`.
- `DELETE /api/projects/:id/snapshots/:sid`: `user` only, else 409
  `not_deletable`; 204.
- Restore and undo run `snapshotThenWrite`: read, compute, insert the
  snapshot, then check the text inside the transaction before writing; on a
  moved text the snapshot is deleted and it tries again, up to three times,
  then 409 `document_busy`. A snapshot row is deleted in a `finally` unless
  its write completed. A snapshot of a project with no stored text is refused
  with 409 `no_document`. Labels are cut to 200 characters.
- When `purge` deletes a project after 30 days in the bin, its snapshots of
  every kind go with it.
- Undo of a non-Claude snapshot, or one missing its edit record, answers 409
  `not_undoable`.

Why: history is a server feature in `docs/design.md`; keeping it out of the
Yjs document keeps the document small and its history private to the
server. Rejected: Yjs snapshots or version vectors (restoring them fights
concurrent clients, and garbage collection is off-limits); keeping Claude's
snapshots forever (every write adds a full copy).

### 7. OAuth authorization server, ported from gdrarchive

The same design, with Promptbook names. Everything derives from
`PUBLIC_URL`'s origin: issuer `config.publicOrigin`, resource
`${publicOrigin}/api/mcp`, no new variable.

- **Metadata.** `GET /.well-known/oauth-protected-resource/api/mcp` and
  `GET /.well-known/oauth-protected-resource` (same document: `resource`,
  `authorization_servers: [issuer]`, `scopes_supported: ['read',
'read_write']`, `bearer_methods_supported: ['header']`).
  `GET /.well-known/oauth-authorization-server`: `issuer`,
  `authorization_endpoint` `${issuer}/authorize`, `token_endpoint`
  `/api/oauth/token`, `registration_endpoint` `/api/oauth/register`,
  `revocation_endpoint` `/api/oauth/revoke`, `response_types_supported:
['code']`, `grant_types_supported: ['authorization_code',
'refresh_token']`, `code_challenge_methods_supported: ['S256']`,
  `token_endpoint_auth_methods_supported: ['none']`,
  `revocation_endpoint_auth_methods_supported: ['none']`,
  `scopes_supported`, `client_id_metadata_document_supported: true`,
  `authorization_response_iss_parameter_supported: true`.
- **Clients.** Dynamic registration (RFC 7591) at
  `POST /api/oauth/register`, 8 KB body: `client_name` 1 to 200 characters,
  at least one `redirect_uris` (each up to 2048), `client_uri` and
  `logo_uri` up to 2048, `token_endpoint_auth_method` `none` or absent;
  `client_id` a random UUID; 201 with `no-store`. 30 registrations per
  address per 15 minutes, counted in a table `oauth_registrations (id, ip,
at)` under an advisory lock as `accounts/throttle.ts` does; 429 past it.
  Registered clients older than 24 hours with no grant are swept on each
  registration. Client ID metadata documents: an `https:` client_id with a
  path other than `/` is fetched with gdrarchive's guards (https only; every
  resolved address public, checked at connect time through a custom
  `lookup`, the same IPv4 and IPv6 blocklists; no redirects; status 200
  only; 64 KB; 5 s; `accept: application/json`; `client_id` equal to the
  URL; cached for `max-age` up to 1 hour, none on `no-store`). Redirect URIs:
  `https:`, or `http:` on `127.0.0.1`, `[::1]` or `localhost`, matched
  exactly except for the loopback port.
- **Authorization request** (validated by the consent API, never redirected
  on failure): `response_type=code`, `code_challenge_method=S256` with a
  challenge of at most 256 characters, `resource` equal to the resource
  (else `invalid_target`), scope `read`, `read_write` or both (missing means
  `read`, unknown `invalid_scope`), a known or resolvable client, a
  registered redirect URI.
- **Tokens.** `prefix + base64url(32 random bytes)`: `pb_ac_` code (10
  minutes, single use, spent by one `UPDATE … RETURNING`), `pb_at_` access
  (1 hour), `pb_rt_` refresh (30 days, rotated on every use; a rotated token
  presented again deletes the whole grant). Stored only as SHA-256 hex
  (`hashToken`, `accounts/sessions.ts`). `POST /api/oauth/token`
  form-encoded only (parser registered in its own scope, 8 KB, a repeated
  parameter refused), `authorization_code` and `refresh_token`, RFC 6749
  error shapes, `no-store`; a missing `resource` defaults to the MCP
  resource. `POST /api/oauth/revoke` (RFC 7009) deletes the grant behind
  either token and always answers 200. Expired codes and tokens are swept on
  each token request and by `purge`.
- **Grant.** One approval of one client by one user at one scope; revoking
  deletes it and cascades to its codes and tokens.
- **Tables** in `003_connector.sql`, as gdrarchive's `020_oauth.sql`:
  `oauth_clients (id, client_id unique, kind registered|metadata_document,
client_name, client_uri, logo_uri, redirect_uris jsonb,
metadata_expires_at, created_at)`, `oauth_grants (id, user_id → users
cascade, client_id → oauth_clients cascade, scope read|read_write,
created_at, last_used_at)`, `oauth_codes (id, grant_id cascade, code_hash
unique, redirect_uri, code_challenge, resource, expires_at, spent_at,
created_at)`,
  `oauth_tokens (id, grant_id cascade, kind access|refresh, token_hash
unique, resource, expires_at, rotated_at, created_at)`, with gdrarchive's
  indexes. Users have no disabled flag here: a deleted user's grants go with
  the cascade.
- A replayed authorization code revokes the grant it was issued under. A
  rotated refresh token is treated as reuse only when it comes from the same
  client; otherwise `invalid_grant`. Registrations are counted per address, per
  /64 for IPv6, and refused while more than 1000 registered clients have no
  grant; expired metadata document clients without a grant are swept.
  `client_uri` is kept only when https (http for loopback) and shown as its
  host; `logo_uri` is not stored. The address guard also refuses 2002::/16,
  2001::/32, ::ffff:0:0/96 and 64:ff9b:1::/48.
- A redeemed code is marked `spent_at` in the redeeming statement instead of
  being deleted, and stays until it expires, so a replay finds its grant; as for
  refresh tokens, only a replay by the client the code was issued to revokes.

Code layout: `src/oauth/config.ts`, `clients.ts`, `tokens.ts`, `grants.ts`,
`routes/oauth.ts`. Ported, not imported: gdrarchive is another repository
and its services lean on its own role model.

Why: gdrarchive's server works with claude.ai today and was reviewed and
tested; the owner asked for the same. claude.ai's custom connectors need
discovery, dynamic registration or metadata documents, PKCE and refresh.
Rejected: Authentik as the authorization server for the MCP endpoint (a new
Authentik application and secret, which the owner did not want, and no
dynamic registration there); static API keys (claude.ai custom connectors
expect OAuth).

### 8. Consent page and Connected apps

The authorization endpoint is the web route `/authorize`, inside the app's
sign-in like every page: signed out, the sign-in page shows, and single
sign-on returns to `/authorize` with its query
(`SignInPage.tsx:104`), so the Authentik identity carries over; with
passwords the page signs in in place. No new Authentik application, no new
secret.

Consent API, session only and under the same-origin rule: `GET
/api/oauth/authorize?…` answers `{ client_name, client_host, redirect_host,
loopback_only, requested_scopes }` or the validation error;
`POST /api/oauth/authorize` (JSON: the same parameters plus
`granted_scope`, which must be within the request) creates the grant and the
code and answers `{ redirect_to }` with `code`, `state` and `iss`;
`POST /api/oauth/authorize/deny` answers `{ redirect_to }` with
`error=access_denied`. The page then calls `window.location.assign`, which
the content security policy's `form-action` cannot block.

The page follows the mockup's Authorize view: «Claude wants to use your
Promptbook» with the client's name, «Request from <redirect host>», the
signed-in account with «Signed in through Authentik» (or the password
account) and «Not you?» (sign out, back to this page), «Claude may» with
Read your projects and Read and edit your projects (the widest requested
selected), Deny and Allow, and the footer «<host> · revoke any time in
Settings → Connected apps». A loopback-only client gets gdrarchive's
warning. `logo_uri` is never shown. An invalid request shows «Cannot
connect» with the error and no redirect. The mockup's "Claude is connected"
and "Access denied" screens are replaced by the redirect to the client,
which shows its own result.

The consent page shows the redirect host in bold and labels the client name
«unverified», unless the client id is an https metadata document URL, in which
case it shows that URL's host as the source of the name.

Connected apps (`/settings/apps`, a new Settings section after Account):
`GET /api/auth/grants` (own grants, newest first: `id, client_name,
client_uri, scope, created_at, last_used_at`) and `DELETE
/api/auth/grants/:id` (204, 404 for another user's), session only. The table
shows App (name and the client URI's host), Access (Read only, or Read and
edit), Approved, Last used («never»), and Revoke with a confirm; then «How to
connect Claude» with the URL `${PUBLIC_URL}/api/mcp`, Copy, and the steps of
the mockup.

Why: the owner asked to sign in as in the main app; gdrarchive does exactly
this. Rejected: a server-rendered consent page (a second UI stack); a form
POST that redirects (blocked by `form-action 'self'` in some browsers).

### 9. Routes, cookies, origin, CORS

- `OAUTH_ROUTES` in `accounts/auth.ts`: `POST /api/oauth/register`,
  `POST /api/oauth/token`, `POST /api/oauth/revoke`, `POST`, `GET`, `HEAD`
  and `DELETE /api/mcp`. The `onRequest` hook returns before the same-origin
  check and before reading the cookie for them: the cookie is ignored and a
  bearer token is the only credential. The `/.well-known` routes are outside
  `/api`, so public already. The consent and grant routes are ordinary
  session routes.
- `@fastify/cors` with a delegator: `{ origin: true, credentials: false }`
  on `/.well-known/oauth-*`, `/api/mcp`, `/api/oauth/token`,
  `/api/oauth/register` and `/api/oauth/revoke`; no CORS headers anywhere
  else, as today.
- The route test (`test/db/accounts.test.ts:160-180`) learns the new class:
  every `/api` route is public, OAuth, or answers 401 without a session.
- Fastify's default request log has no headers or bodies; the token route
  logs the grant type and the error code only.

Why: as gdrarchive (browser-based MCP clients send `Origin`, and the token
endpoint is called cross-site by design). The same-origin rule protects the
cookie; these routes do not read it.

### 10. MCP endpoint

`@modelcontextprotocol/server` 2.0.0 and `@modelcontextprotocol/node` 2.0.0
pinned exactly (with `@modelcontextprotocol/core` 2.0.0 through them, and
`hono` for the node adapter's peer), as gdrarchive; 2.3.1 is out, and moving
is a later change with its own test run.

`POST /api/mcp`, 1 MB body: Host checked with the SDK's
`validateHostHeader` against `PUBLIC_URL`'s host name (421
`host_not_allowed`); `Authorization: Bearer` checked against
`oauth_tokens` (access, not expired, resource equal); without a valid token
401 with `WWW-Authenticate: Bearer
resource_metadata="<issuer>/.well-known/oauth-protected-resource/api/mcp"`,
plus `error="invalid_token"` when a token was sent. `last_used_at` on the
grant updated at most once a minute. A fresh `McpServer({ name:
'promptbook', version: config.appVersion }, { capabilities: { tools: {} }
})` per request, built by `createMcpHandler(…, { responseMode: 'json' })`
and served with `toNodeHandler` after `reply.hijack()`, passing the parsed
body; stateless (no session id). `GET`, `HEAD` and `DELETE` answer 405 with
`Allow: POST`.

Tool results are `{ content: [{ type: 'text', text: JSON }] }`; errors are
`isError: true` with a text message and `structuredContent: { error: {
code, message, field?, scope_required? } }`, as gdrarchive's
`mcp/errors.ts`. Unexpected errors are logged and answered as
`internal_error` without details.

Why: the SDK and settings gdrarchive runs against claude.ai; stateless JSON
mode needs no session store and fits one container. Rejected: the older
`@modelcontextprotocol/sdk` package; SSE streaming (no tool here runs long).

### 11. Tools

Every tool acts as the grant's user; a project that is not theirs or is in
the bin is `not_found`. Write tools need `read_write`; with `read` they
answer `insufficient_scope` with `scope_required: 'read_write'` and a line
saying to reconnect with edit access. Annotations as gdrarchive: `title`,
`readOnlyHint`, `idempotentHint`, `openWorldHint: false`, and
`destructiveHint` true only for `replace_section`.

| Tool                   | Scope      | Input                                                               | Output                                                                                                                                                                          |
| ---------------------- | ---------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_projects`        | read       | `category?`, `status?`                                              | id, title, category, status, campaign, to-do done/total, scenes, errors, warnings, edited                                                                                       |
| `get_project`          | read       | `projectId`                                                         | meta, status, category, campaign, system, current seed, to-do items with progress, counts (scenes, words, errors, warnings, items, topics, notes, entries), last log entry date |
| `create_project`       | read_write | `title`, `category`, `campaignId?`                                  | the new project's id and row; draft, skeleton and to-do from the user's templates, no seed                                                                                      |
| `get_outline`          | read       | `projectId`                                                         | targets (kind, target, title) with errors and warnings per target; `checked: false` for a campaign                                                                              |
| `read_document`        | read       | `projectId`, `target?`                                              | text and hash, of the target or the whole document                                                                                                                              |
| `replace_section`      | read_write | `projectId`, `target`, `markdown`, `hash`                           | decision 5                                                                                                                                                                      |
| `add_scene`            | read_write | `projectId`, `title`, `markdown`                                    | decision 5, with the new id                                                                                                                                                     |
| `list_todo`            | read       | `projectId`                                                         | items (text, done, note, due) and progress                                                                                                                                      |
| `add_todo`             | read_write | `projectId`, `items` (1 to 20 texts)                                | the items added at the end; Claude never ticks or removes items                                                                                                                 |
| `get_inspiration`      | read       | `projectId`                                                         | the seed's versions with dates (current last) and the items                                                                                                                     |
| `add_inspiration_item` | read_write | `projectId`, `kind`, `text`, `url?`, `why`                          | the item, by Claude                                                                                                                                                             |
| `list_research`        | read       | `projectId`                                                         | topics with state; note headers (id, topic, by, dates, number of sources)                                                                                                       |
| `get_research_note`    | read       | `projectId`, `noteId` or `topic`                                    | the note                                                                                                                                                                        |
| `save_research_note`   | read_write | `projectId`, `topic`, `summary`, `facts`, `sources`                 | created or updated (matched by topic); the matching topic set to noted                                                                                                          |
| `add_research_topic`   | read_write | `projectId`, `names` (1 to 20)                                      | the topics added, duplicates skipped and named                                                                                                                                  |
| `get_brainstorm_log`   | read       | `projectId`, `limit?` (default 10, at most 50)                      | entries newest first                                                                                                                                                            |
| `add_brainstorm_entry` | read_write | `projectId`, `title`, `ideas`, `decisions`, `rejected`, `questions` | the entry, by Claude, dated now                                                                                                                                                 |

No tool writes the seed: Claude reads it and never rewrites it
(`docs/design.md`, Inspiration). No tool deletes anything. Descriptions say,
in `list_projects`, `get_project` and `get_brainstorm_log`: "At the start of
a new chat about a project, read its brainstorm log first"; in
`add_brainstorm_entry`: write one entry at the end of a brainstorm, with
ideas, decisions, rejected ideas with why, and open questions; in
`replace_section`: read the section first, send the hash you read, keep the
heading, the template's field names stay in Italian. The same lines go in
the server's `instructions`. Input schemas are zod 4 objects with the limits
of decision 2; unknown keys are refused and named. Creating a project from
Claude moves `createProject` out of `routes/projects.ts:57-86` into
`projects.ts`, shared by the route and the tool.

A grant may make 120 write calls per 10 minutes (`rate_limited` with
`retry_after`); a project keeps at most 200 Claude snapshots, the oldest
removed first. `add_scene`'s description lists the scene fields the template
requires.

Why: the list the architect agreed, plus `add_scene` (decision 5). Rejected:
a generic `apply_patch` or `write_document` (a full rewrite is what the
research warns against); delete tools (deleting is the user's, in the app).

### 12. Web: rail, routes, views

Routes under the project: `/projects/:id` (Document), `/projects/:id/inspiration`,
`/projects/:id/research` (`?note=<id>` selects one), `/projects/:id/log`,
`/projects/:id/history` (`?compare=<snapshotId>` opens Compare). One
`ProjectPage` keeps the document open across them and renders the view.
`Shell`'s `RailItem` gains `inspiration`, `research`, `log`, `history`; the
rail shows Projects, Document, Inspiration, Research, Brainstorm log and
History, then Settings at the bottom, the project entries disabled with no
project open as Document is today. The top bar gains a History button on
every project view; the ⌘K hint and PDF stay on Document. Views other than
Document have no outline or inspector and use the wide centre pane.

The views follow the mockup (specs `inspiration`, `research`,
`brainstorm-log`, `snapshots`). Edits go through the `promptbook-project`
writers on the open document. The seed is edited in the Inspiration view
(also still in the projects panel), and the inspector's Seed links there.
`/settings/apps` is Connected apps; `/authorize` is outside the shell, a page
of its own.

A note made or edited by hand refuses an empty topic and a topic another note
has («A note on «X» exists already.», with Open it); a new note is a draft in
the browser until Done. The Inspiration add row shows an Address field for
Link and Image link (http or https only); the first field is then an optional
title, the address standing in when it is empty.

Why: the mockup's rail and views. Rejected: the mockup's Projects button at
the rail's bottom (the projects screen spec placed it first; nothing gains
from moving it).

### 13. Claude edit banner

In the Document view, the web asks for the newest `claude` snapshot
(`GET …/snapshots?kind=claude&limit=1`) on opening and on each `snapshot`
message. The banner shows when it exists and is newer than the one this
device last dismissed (`localStorage` key
`promptbook.claudeEdit.<projectId>`, the snapshot's id and date): «Claude
edited <label> at <time> · Compare · Undo», the hint «Undo puts back what
Claude replaced», and ✕. Compare opens History's Compare for that snapshot.

Undo reverts only Claude's edit, not the whole document (architect's
decision after review: a whole-document restore would drop whatever the user
typed elsewhere after the edit). A `claude` snapshot also stores
`before_section` (the target's text before the edit, empty for `add_scene`)
and `after_hash` (SHA-256 of the target's text right after the edit).
The writer computes `after_hash` as `textHash` of the span `findTarget`
returns on the new text, the same span undo hashes; `add_scene` stores the new
scene's id as target, `''` as `before_section`, and inserts the scene as
`\n\n### Sn. …` after the last scene.
`POST …/snapshots/:id/undo` finds the target in the current text: when its
hash equals `after_hash`, it stores a `restore` snapshot of the current text,
puts `before_section` back in place of the target (or removes the added
scene) through the live document, and answers 200; otherwise it answers 409
`section_changed` and changes nothing. Undo asks «Undo Claude's edit?» («What
Claude wrote is saved as a snapshot first.»); on 409 the banner says «This
part changed after Claude's edit. Use History to restore the whole
document.» with a link to History. Undo and ✕ both dismiss the banner.

Why: the mockup; the snapshot is the record of the edit, so no new state is
needed. Rejected: undoing through Yjs's UndoManager (it tracks local
changes only, and Claude's arrive as remote).

### 14. Inspector Research and topic matching

`packages/web/src/research/match.ts`, pure: `wordsOf(text)` (runs of
`\p{L}` or `\p{N}`, NFD with marks removed, lower case, length four or
more, as a set) and `notesFor(sceneText, notes, limit)` (notes whose topic
shares a word, by number of shared words, then newest edit; each with the
words matched). The inspector's Research section (`SectionId` gains
`research`, closed by default) reads the scene under the cursor from the
analysis, as This scene does; the Research view uses the same function for
«mentioned in». Adventures and one-shots only.

Why: the owner's rule (four letters, case and accent insensitive, three at
most); four letters skip «del», «nel», «una». Rejected: matching the note's
body (too many hits on common words).

### 15. Diff

`diff` 9.0.0 (jsdiff, BSD-3-Clause), pinned exactly in `promptbook-web`, the
library gdrarchive already uses: `structuredPatch(old, new, …, { context: 3
})` turned by a pure helper (`web/src/history/diff.ts`) into rows (`context`,
`add`, `del`, `gap`, with old and new line numbers) and the added and
removed line counts. Computed in the browser from the snapshot's text and
the current text.

Why: Myers diff in linear space; a hand-written LCS is quadratic in memory
on a 3000-line document. Rejected: computing diffs on the server (the
browser has both texts).

### 16. Export

`exportProject` (`packages/project/src/export.ts`) adds `inspiration.md`
(each item: kind, text, URL, why, who, date), `research.md` (topics with
state, then each note with summary, facts and sources) and
`brainstorm-log.md` (entries newest first, the four parts). Snapshots are not
exported.

Why: the export requirement says it "SHALL lose no text the user wrote", and
these now hold text the user wrote.

### 17. Tests

- **project** (unit): every new reader and writer, `sameName`, mistyped
  values, `addQuestionsToTodo` atomic; `targetsOf` and `findTarget` on the
  Sabaoth fixture and on a campaign skeleton (sections, scenes, sheets,
  headings, unknown, ambiguous, trailing blank lines); export files.
- **server, OAuth** (db): gdrarchive's cases ported: metadata (both paths,
  fields, issuer from configuration, CORS preflight from any origin on the
  permissive routes only), authorize refusals (unknown response type, plain
  PKCE, no challenge, wrong resource, bad scope, undeclared redirect URI,
  unknown client), approve (grant at the granted scope, code stored as a
  digest, wider scope refused, cross-origin refused), deny, redirect URI
  rules and loopback ports, public-address table, metadata document fetch
  (cache, mismatch, redirect, oversize, private address), registration
  (stored, throttled, refused), code exchange (refusal table, single use,
  default resource, form only, duplicate parameter), rotation (reuse
  revokes, lost race revokes, eight simultaneous refreshes give one
  winner), revocation, verification, sweep, grants list and revoke
  (owner-scoped, cascade).
- **server, MCP** (db): initialize (name, version, tools only, no session
  id); tools listed with schemas and annotations; 401 forms; cookie alone
  gets 401; Host 421; GET and DELETE 405; each tool on a seeded project;
  every write tool refused with `read`; another user's project
  `not_found`; `replace_section` hash mismatch, wrong heading,
  error-increase refusal with problems, warnings allowed, campaign without
  checks, snapshot stored before the write and deleted when the text moved,
  an open Hocuspocus client receiving the change and the `snapshot`
  message; `add_scene` id; `save_research_note` update by topic.
- **server, snapshots** (db): list, create, get, restore (restore snapshot
  first, text replaced, live client updated), delete only `user`, project
  in the bin 404, `purge` removing expired `claude` and `restore` and
  keeping `user`.
- **web** (unit): `wordsOf`, `notesFor`, the diff rows and counts, the
  banner's dismissal rule.
- **e2e** (`e2e/connector.spec.ts`), like gdrarchive's `mcp-flow`:
  discovery from the 401, both metadata documents, registration, consent in
  the browser (`/authorize`, Allow, code from the redirect to a loopback
  address), token, `tools/call add_brainstorm_entry` then the entry shown in
  an open Brainstorm log view without a reload, `replace_section` on S3 then
  the banner in an open Document view, Undo restores the text; refresh;
  revoke in Connected apps then the next call 401. Also: History save,
  compare, restore; Inspiration add item; Research note create, edit,
  delete. The suite runs once with `E2E_CPU_THROTTLE=3` before each
  hand-back.

### 18. Briefs and release

- **A, document and snapshots:** decisions 2, 3, 16 in `packages/project`;
  migration (snapshot table, and the OAuth tables so the migration is one
  file), snapshots module and REST API, `purge`, `live.ts`, restore,
  `createProject` extraction, `promptbook-format` as a dependency.
- **B, OAuth and MCP:** decisions 7 to 11; depends on A.
- **C, web views:** decisions 12 to 15; depends on A; can run beside B.
- **D, connect and finish:** the `/authorize` page and Connected apps, the
  e2e suite, README (a connector section: URL, steps, scopes, revoking),
  `docs/design.md` (decisions recorded, rail updated), screenshots of every
  view for the architect (the owner is away); depends on B and C.
- **E, release (architect):** pull request, CI, merge; tag `v0.4.0`; live
  check of both metadata documents and a 401 with `resource_metadata` on
  `promptbook.siberio.eu`; archive; close #4. Connecting claude.ai itself
  needs the owner's sign-in and is left to the owner.

## Risks / Trade-offs

- **Long `/authorize` addresses.** `safeReturnTo` keeps at most 2048
  characters (`accounts/oidc.ts:52`); a client sending a longer query would
  land on `/` after single sign-on and lose the consent. claude.ai's
  requests are well under that; an e2e or unit test checks a realistic one,
  and if a real request exceeds it, raise the limit rather than store the
  request server-side.
- **Undo of an edit the user has touched.** Undo reverts only the part
  Claude edited and only while it is unchanged (decision 13); after that the
  user restores from History. If users hit the 409 often, consider a
  three-way merge later; do not add one in this change.
- **Refusal window.** Between the snapshot insert and the transaction (step
  5 of decision 5) a keystroke anywhere refuses the write with
  `changed_since_read`. The window is one database insert; Claude retries
  after reading again. If it shows in practice, narrow the check to the
  span.
- **Snapshot growth.** Each Claude write stores the whole document. Bounded
  by the 30-day retention; at 100 KB per document and a busy evening of 50
  edits, 5 MB per project per day at worst.
- **SDK 2.0.0 is not the latest.** Pinned for parity with gdrarchive's
  tested code; the legacy protocol fallback answers SSE frames even in JSON
  mode (gdrarchive's tests show both eras work).
- **A grant acts as the user on every project.** As in gdrarchive; scopes
  are read or read and edit, not per project.

## Migration Plan

`003_connector.sql` runs at start like the others. No document migration
(decision 2). No new environment variable or chart change. Release as
`v0.4.0`.

## Open Questions

None.
