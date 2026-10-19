## Why

The format package reads an adventure, but there is nowhere to keep one yet.
Before the editor (#3), the connector (#4) or the desktop app (#6) can be
built, projects need a home: a server that stores them, accounts to reach
them, a sync layer that merges edits from several places, and a screen to find
and start them. This change builds that base and makes it runnable locally in
a browser, so the owner can try it before the desktop app exists.

#2 was split with the owner on 2026-10-19: this change is the server and the
web client; the Electron app, sign-in through the system browser and single
sign-on (OIDC) moved to #6.

## What Changes

- **Projects** with a category (campaign, adventure, one-shot), a status
  (draft, in progress, complete), an optional campaign for adventures and
  one-shots, a seed, a to-do list and a prep document. Each project is one Yjs
  document; the server keeps a summary row per project for the list.
- **Templates:** per-category to-do templates and author and licence defaults
  in the user's settings; a skeleton prep document per category (avventura@1
  for adventures and one-shots, a plain skeleton for campaigns).
- **Server** (`packages/server`): Fastify, PostgreSQL with SQL migrations,
  Hocuspocus for Yjs sync over WebSocket, a REST API for the project list,
  creation, the bin, settings, import and export.
- **Local accounts:** username and password, a server-side session cookie, a
  command to create the account. No sign-up page.
- **Web client** (`packages/web`): the projects screen agreed in
  [docs/mockups/projects.html](../../../docs/mockups/projects.html), sign-in,
  settings, the sync indicator for the browser, and a plain document page
  bound to the Yjs document until the editor (#3) replaces it.
- **Markdown import** of files, a folder or pasted text, through the format
  package's converter, one project per note; **export** of a project or of
  everything as a folder of Markdown files in a zip.
- **Local stack:** Docker Compose with Postgres and the server serving the
  web build, plus a seed command that creates an account and sample projects.

Out of scope: the desktop app, offline storage on the device, OIDC (#6); the
editor's live preview and checks (#3); the inspiration and research views,
the connector and the brainstorm log (#4); assets (images and music); deploying
to the homelab.

## Capabilities

### New Capabilities

- `accounts`: local accounts, sign-in and sign-out, sessions, and how the
  account is created.
- `projects`: what a project holds, its category, status, campaign, seed and
  to-do list, the templates a new project starts from, settings, the bin, and
  the summary the list is built from.
- `project-sync`: how a project's document is synced between clients and the
  server, who may open it, how it is stored, and the sync states the browser
  shows.
- `markdown-import-export`: importing notes as projects through the converter,
  and exporting projects as Markdown folders.
- `projects-screen`: the web client's sign-in page, projects list, project
  panel, new-project and import dialogs, settings and document page, as agreed
  in the mockup.

### Modified Capabilities

None. `adventure-format` and `note-conversion` are used as they are.

## Impact

- New workspace packages, unscoped and private: `promptbook-project` (the Yjs
  document shape, templates, import and export, shared by server, web and
  later the desktop app), `promptbook-server`, `promptbook-web`.
- New dependencies: `yjs`, Hocuspocus server and provider, `fastify` and its
  plugins, `pg`, an argon2 binding, `react`, `react-dom`, `react-router`,
  `vite`, CodeMirror 6 with `y-codemirror.next`, a zip library, fonts as npm
  packages; for tests Playwright.
- CI: Postgres as a service for the server tests, and an end-to-end job.
- The first Dockerfile and `compose.yaml` in the repository.
