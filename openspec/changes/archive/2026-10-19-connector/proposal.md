## Why

Today a brainstorm with Claude reaches a project by copy and paste, or
through the Joplin MCP, which is slow. `docs/design.md` (MCP connector,
Brainstorm memory, Inspiration, Research) plans Promptbook's own connector on
claude.ai so a chat saves straight into a project, and a new chat starts from
what the last one decided. The connector also needs a safety net, because
Claude edits the prep document: server snapshots before every Claude write,
with compare and restore. Issue #4 holds this work; the snapshots and the
inspector's Research section moved here from #3.

The owner agreed the mockup
[docs/mockups/connector.html](../../../docs/mockups/connector.html) and asked
to finish unattended, signing in to the connector "the same as the main app,
like gdrarchive does". The architect took the remaining decisions on the
owner's behalf; they are listed in the design.

## What Changes

- **Claude connector:** an OAuth 2.1 authorization server for the MCP
  endpoint only, ported from gdrarchive (dynamic client registration, client
  ID metadata documents, PKCE, opaque hashed tokens, rotating refresh
  tokens), and an MCP endpoint at `/api/mcp` (Streamable HTTP, stateless,
  JSON responses) with 17 tools over projects, the prep document, the to-do
  list, inspiration, research and the brainstorm log.
- **Sign-in carries over:** Claude's consent page is a web route,
  `/authorize`, behind the app's own sign-in, so with single sign-on the
  Authentik identity is the one that approves. No new Authentik application,
  no new secret.
- **Section-scoped edits:** Claude reads and replaces one section, scene or
  sheet, guarded by a hash of what it read; an edit that adds errors is
  refused with the new problems. Claude's writes go through the server's live
  Yjs document, so open editors see them at once.
- **Server snapshots** of the prep document: by hand with a name, before
  every Claude write, and before every restore; compare as a unified diff;
  restore. Claude's and restore snapshots are kept 30 days, the user's until
  deleted.
- **Claude edit banner** in the Document view with Compare and Undo.
- **New project views** in the rail: Inspiration (seed with dated versions,
  sources of inspiration), Research (topics, notes with facts and sources),
  Brainstorm log (dated entries, open questions to the to-do list), History
  (snapshots).
- **Inspector Research section:** the notes whose topic shares a word with
  the current scene.
- **Settings, Connected apps:** approved apps, Revoke, and how to connect
  Claude.
- **Export** adds the inspiration, research and brainstorm log files, so it
  still loses no text the user wrote.

Out of scope: clipping a URL by hand (it needs a server fetch with SSRF
guards); topics proposed by the app; the in-app research engine with API
keys; transcript import; image uploads (an Image link item is a URL); the
mockup's light and dark button in the top bar (the theme stays in Settings,
Appearance); the outline's "edited by Claude" dot and the status bar's
connector line from the mockup; earlier PDF versions; the A5 booklet; the
desktop app's local snapshots (#6).

## Capabilities

### New Capabilities

- `connector`: the OAuth authorization server, the consent page, Connected
  apps, the MCP endpoint and its tools, section-scoped edits.
- `snapshots`: server snapshots of the prep document, compare, restore,
  retention, the History view and the Claude edit banner.
- `inspiration`: the Inspiration view, the seed's versions and the sources of
  inspiration.
- `research`: research topics and notes, the Research view and the
  inspector's Research section.
- `brainstorm-log`: the brainstorm log and its view.

### Modified Capabilities

- `editor`: the rail gains Inspiration, Research, Brainstorm log and History;
  the top bar gains History; the inspector gains Research, and its Seed links
  to the Inspiration view.
- `projects`: the project's Yjs document also holds the inspiration items,
  research topics and notes, and the brainstorm log.
- `projects-screen`: the rail's Inspiration, Research and Brainstorm log
  entries appear for an open project; Settings gains Connected apps.
- `accounts`: the OAuth and MCP routes are public to the session check and
  outside the same-origin rule; MCP requires a bearer token instead.
- `markdown-import-export`: the export folder gains `inspiration.md`,
  `research.md` and `brainstorm-log.md`.

## Impact

- `packages/project`: new collections and their readers and writers in
  `doc.ts`; section targets for adventures and campaigns; export files.
- `packages/server`: migration `003_connector.sql` (OAuth clients, grants,
  codes, tokens, registrations, snapshots); `oauth/`, `mcp/` and `snapshots` modules and
  routes; a write path through Hocuspocus's direct connection; `purge`
  removes expired snapshots and OAuth rows; `promptbook-format` moves from
  dev dependency to dependency.
- `packages/web`: routes `/projects/:id/{inspiration,research,log,history}`,
  `/authorize` and `/settings/apps`; the banner; the inspector's Research
  section; the rail.
- New dependencies, pinned exactly: `@modelcontextprotocol/server` 2.0.0 and
  `@modelcontextprotocol/node` 2.0.0 (which brings
  `@modelcontextprotocol/core` 2.0.0 and needs `hono`), as in gdrarchive;
  `@fastify/cors` on the server; `diff` 9.0.0 on the web. Registration is
  throttled in Postgres, as sign-in is, with no rate-limit plugin.
- No new environment variable: the connector uses `PUBLIC_URL`. No chart
  change. Release `v0.4.0`.
