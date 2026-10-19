## 1. Project document and targets (brief A)

- [x] 1.1 `packages/project/src/doc.ts` and `model.ts`: `inspiration`, `researchTopics`, `researchNotes`, `brainstorm` with their types, readers, writers, `sameName` and `addQuestionsToTodo`; exported from `index.ts` (design decision 2)
- [x] 1.2 `packages/project/src/targets.ts`: `targetsOf`, `findTarget` for adventures, one-shots and campaigns (decision 3)
- [x] 1.3 `export.ts`: `inspiration.md`, `research.md`, `brainstorm-log.md` (decision 16)
- [x] 1.4 Unit tests: every reader and writer, mistyped values, an older document, targets on Sabaoth and on a campaign skeleton, export files

## 2. Snapshots and the live write path (brief A)

- [x] 2.1 `migrations/003_connector.sql`: `snapshots`, `oauth_clients`, `oauth_grants`, `oauth_codes`, `oauth_tokens`, `oauth_registrations` (decisions 6, 7); `promptbook-format` moved to `dependencies`
- [x] 2.2 `src/live.ts`: `withLiveDocument` over `openDirectConnection`, smallest text edit, the `snapshot` stateless message (decision 4)
- [x] 2.3 `src/snapshots.ts` and `routes/snapshots.ts`: list, create, get, restore, undo of a Claude edit (decision 13), delete; `purge` removes expired `claude` and `restore` snapshots (decision 6)
- [x] 2.4 `createProject` moved from `routes/projects.ts` into `projects.ts`
- [x] 2.5 Db tests: snapshots API, undo (unchanged part reverted with text typed elsewhere kept; changed part 409), restore with a live Hocuspocus client receiving the text and the message, delete rules, bin, purge; `withLiveDocument` with and without an open client
- [x] 2.6 Checks (`npm run typecheck`, `npm test`) and hand-back of brief A

## 3. OAuth authorization server (brief B)

- [x] 3.1 `src/oauth/config.ts`, `clients.ts` (registration, metadata documents with the address guards, redirect rules, registration throttle, sweep), `tokens.ts` (codes, access, refresh rotation, reuse, revocation, verification, sweep), `grants.ts` (decision 7)
- [x] 3.2 `routes/oauth.ts`: both metadata documents, register, token (form parser in its own scope), revoke, consent `GET`/`POST /api/oauth/authorize` and `/deny`, `GET`/`DELETE /api/auth/grants` (decisions 7, 8)
- [x] 3.3 `accounts/auth.ts`: `OAUTH_ROUTES` skip the origin check and the cookie; `@fastify/cors` with the delegator; the route test's new class (decision 9)
- [x] 3.4 `purge`: expired codes and tokens, old registration counts
- [x] 3.5 Db tests ported from gdrarchive's `oauthMetadata`, `oauthAuthorize`, `oauthClients`, `oauthTokens`, `oauthGrants` and `oauthCredentials` (decision 17)

## 4. MCP endpoint and tools (brief B)

- [x] 4.1 `@modelcontextprotocol/server` and `@modelcontextprotocol/node` pinned at `2.0.0` (check `npm view` first; `hono` for the peer); `routes/mcp.ts` and `src/mcp/server.ts`: host check, bearer, 401 challenge, 405, hijack, JSON mode (decision 10)
- [x] 4.2 `src/mcp/tools.ts` and `errors.ts`: the 17 tools with schemas, descriptions, annotations, scope check, error shape (decision 11)
- [x] 4.3 `replace_section` and `add_scene`: hash, heading rule, parse before and after, snapshot, recheck, apply (decision 5)
- [x] 4.4 Db tests: endpoint guards, each tool, scope refusals, another user's project, hash mismatch, error-increase refusal, warnings allowed, campaign, snapshot before the write and removed on a moved text, a live client receiving the edit
- [x] 4.5 Checks and hand-back of brief B

## 5. Web views (brief C)

- [x] 5.1 Routes `/projects/:id/{inspiration,research,log,history}`; `ProjectPage` keeps the document across views; `Shell` rail and top bar History button (decision 12)
- [x] 5.2 Inspiration view: seed with Edit, Versions and View; items with add row and Delete
- [x] 5.3 Research view: topics, notes list, note detail with Edit, Delete, New note, «mentioned in»
- [x] 5.4 Brainstorm log view: entries, New entry, Edit, Delete, open questions to the to-do list
- [x] 5.5 History view and Compare with `diff` 9.0.0 pinned; `history/diff.ts` (decisions 6, 15)
- [x] 5.6 Claude edit banner; `snapshot` stateless event in `sync/state.ts` and `sync/registry.ts` (decision 13)
- [x] 5.7 Inspector Research section and `research/match.ts`; Seed links to Inspiration (decision 14)
- [x] 5.8 Unit tests: `wordsOf`, `notesFor`, diff rows and counts, banner dismissal
- [x] 5.9 Checks and hand-back of brief C

## 6. Connect, e2e and docs (brief D)

- [x] 6.1 `/authorize` page: request check, account, scope choice, Allow, Deny, errors, loopback warning (decision 8)
- [x] 6.2 Settings, Connected apps at `/settings/apps`: list, Revoke, how to connect with Copy
- [x] 6.3 `e2e/connector.spec.ts`: the full flow of decision 17, History, Inspiration and Research; the whole suite passes, once with `E2E_CPU_THROTTLE=3`
- [x] 6.4 README connector section; `docs/design.md` (rail, connector, snapshots, research engine first through Claude); Prettier on the files touched
- [x] 6.5 Screenshots of every view, the banner, Authorize and Connected apps for the architect (the owner is away)
- [x] 6.6 Checks and hand-back of brief D

## 7. Release (architect)

- [x] 7.1 Pull request, CI green, merge; tag `v0.4.0`; GitLab pipeline green
- [x] 7.2 Live check on promptbook.siberio.eu: `v0.4.0` live, both metadata documents answer with the right issuer and resource, `POST /api/mcp` without a token answers 401 with `resource_metadata`, `/authorize` serves, a registration from a claude.ai origin answers 201 (the unused client is swept after 24 hours). Connecting claude.ai is left to the owner's sign-in
- [x] 7.3 Archive the change; close #4
