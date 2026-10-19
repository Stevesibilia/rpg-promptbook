## 1. Project package

- [x] 1.1 `packages/project` (`promptbook-project`, private, exports `./src/index.ts`), `tsconfig.json` and a test project referenced from the root `tsconfig.json`; dependencies `yjs`, `fractional-indexing`, `promptbook-format`
- [x] 1.2 Document shape (design decision 2) with `createProjectDoc`, the readers and the writers of decision 3
- [x] 1.3 `skeletonDocument` for the three categories and `defaultSettings`
- [x] 1.4 `summarize`, including the fallbacks for invalid status and campaign
- [x] 1.5 `prepareImport` (title, category, campaign, adventure-note rule, image references) and `exportProject`
- [x] 1.6 Tests: concurrent edits on two docs (tick versus add, rename versus move, two fields of one item); skeleton of an adventure in a campaign parses with no `meta.`, `section.` or `scene.id.` errors; summary of the Sabaoth fixture; import of Sabaoth and of a shopping list; export then re-import is byte-identical for an imported note

## 2. Server foundation and accounts

- [x] 2.1 `packages/server` (`promptbook-server`): Fastify app factory, zod configuration (decision 4), `tsx` dev script, esbuild bundle script producing `dist/main.js` and `dist/cli.js`
- [x] 2.2 `pg` pool and helpers, migration runner, `001_init.sql` as in decision 5
- [x] 2.3 Accounts (decision 8): password hashing, sessions, `pb_session` cookie, protected-by-default hook with a public list, Origin check, sign-in throttle, admin from the environment at start
- [x] 2.4 Routes `/api/auth/*`, `/api/settings`, `/api/health`; static web build with SPA fallback and JSON 404 under `/api`; `@fastify/helmet` with a CSP allowing same-origin WebSocket
- [x] 2.5 Command line: `migrate`, `user:create`, `user:password`
- [x] 2.6 Database tests (`TEST_DATABASE_URL`, `_test` guard): every scenario of the `accounts` spec, settings round trip, admin variables ignored once an account exists
- [x] 2.7 CI: `postgres:18-alpine` service and `TEST_DATABASE_URL` in the `check` job; `npm test` runs the server's database tests

## 3. Sync and projects API

- [x] 3.1 Hocuspocus in Fastify at `/sync` (decision 6): authentication with Origin, session, ownership and bin checks; load and store with the summary in one transaction; `store-failed` and `stored` stateless messages; `closeConnections`
- [x] 3.2 Projects routes: list, bin list, create from templates, delete closing connections, restore; hourly purge
- [x] 3.3 `POST /api/import` and the two export routes
- [x] 3.4 Sign-out and password change close that session's or the other sessions' connections
- [x] 3.5 `seed <username>` (decision 10)
- [x] 3.6 Tests with two providers: two-client merge, offline edits merged on reconnect, refused without session, refused from a foreign origin, closed on delete and on sign-out, restart keeps edits, summary follows a tick, store failure and recovery messages, another user's project answers 404, purge after 30 days, import and export routes
- [x] 3.7 Root `Dockerfile`, `compose.yaml`, `.env.example` (decision 10); `docker compose up -d --build` then `seed` works on a clean volume; a `npm run build -w promptbook-server` step in the CI `check` job

## 4. Web client

- [x] 4.1 `packages/web` (`promptbook-web`): Vite, React, React Router, fonts, tokens from the mockup, `api.ts`, dev proxy for `/api` and `/sync`
- [x] 4.2 Shell: top bar, rail, status bar, theme; sign-in page and the sign-in dialog used by the banner
- [x] 4.3 Provider registry and the sync pill, panel and banner (decision 9)
- [x] 4.4 Projects list with search, tabs, chips, grouping, sort, remembered filters, bin link and bin view
- [x] 4.5 Project panel bound to the Yjs document: title, status, campaign, seed, to-do (tick, add, rename, drag, note, due date, delete), document facts, export, delete with confirmation
- [x] 4.6 New project dialog with the live preview
- [x] 4.7 Import dialog: files, folder and drop, paste, per-note rows with the report, import button count
- [x] 4.8 Settings page, all six sections
- [x] 4.9 Project page with the plain CodeMirror editor bound to `document`
- [x] 4.10 Component tests where logic lives (sync state reduction, list filtering and grouping)

## 5. End to end, docs and hand-back

- [x] 5.1 Playwright in `e2e/` against the compose stack (decision 11), one test per scenario named there
- [ ] 5.2 CI job `e2e`
- [ ] 5.3 `README.md`: how to run the local stack, the seed, development mode, tests
- [ ] 5.4 Preview for the owner: stack up from the working tree with the seed, the URL, the username and password, and the pages to look at; wait for the owner's word before the last commit of the group
- [ ] 5.5 Checks: `npm run typecheck`, `npm test` with Postgres, Playwright, Prettier on changed Markdown; literal results in the hand-back
