# RPG Promptbook design

Written 2026-10-17 from a planning conversation. Decisions marked **decided**
came from the user; everything else is a proposal.

## The problem

Today an adventure goes through five tools by hand:

1. Brainstorm with Claude (web or Desktop).
2. Save the result to Joplin through the Joplin MCP, as one note or a notebook
   of notes. The MCP is slow.
3. Ask Claude for Midjourney prompts, paste them into Midjourney, download the
   images, add them to the visuals of a CueBard project.
4. Ask Claude for Suno prompts, paste them into Suno, download the tracks, add
   them to the CueBard project.
5. Turn the Joplin note into a PDF for the table with the `impagina-avventura`
   skill.

The copy and paste in steps 2–4 adds nothing. Joplin's one real advantage is
that its app works offline.

## Decisions

| Topic         | Decision                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gdrarchive    | **Decided:** independent app. Prep comes before play, and not everything prepared ends up in gdrarchive. Players with gdrarchive access must not see prep.                                                                                                                                                                                                           |
| Users         | Proposed: the game master only. Players have no accounts, so no spoiler can leak through permissions.                                                                                                                                                                                                                                                                |
| Offline       | **Decided:** offline writing and editing in a desktop app for Mac, Linux and Windows. The browser does not need to work offline.                                                                                                                                                                                                                                     |
| PDF           | **Decided:** Typst's WASM build, in the browser today and offline in the desktop app later.                                                                                                                                                                                                                                                                          |
| Source format | **Decided:** Markdown (CommonMark + GFM) with YAML front matter and callouts for boxes, checked against a closed grammar.                                                                                                                                                                                                                                            |
| Hosting       | **Decided:** homelab cluster.                                                                                                                                                                                                                                                                                                                                        |
| CueBard       | **Decided:** `.cbpack` export only. CueBard must not depend on this app.                                                                                                                                                                                                                                                                                             |
| Import        | **Decided:** Markdown import (a file, a folder, or pasted text), run through the converter. Joplin: no bulk migration; adventures are pasted in later when needed.                                                                                                                                                                                                   |
| Brainstorm    | **Decided:** keep the memory of brainstorming chats in the app (see below).                                                                                                                                                                                                                                                                                          |
| Category      | **Decided:** every project is a campaign, an adventure or a one-shot.                                                                                                                                                                                                                                                                                                |
| Status        | **Decided:** draft, in progress, complete.                                                                                                                                                                                                                                                                                                                           |
| To-do list    | **Decided:** a customizable to-do list per project (see below).                                                                                                                                                                                                                                                                                                      |
| Inspiration   | **Decided:** a dedicated field for the original idea or inspiration (see below).                                                                                                                                                                                                                                                                                     |
| Research      | **Decided:** a way to research the web about the topics of the inspiration (see below).                                                                                                                                                                                                                                                                              |
| Name          | **Decided:** RPG Promptbook; Promptbook inside the app. A promptbook is the stage manager's master copy of the script, with every cue. Repo `Stevesibilia/rpg-promptbook` (public), local folder `~/Homelab/rpg-promptbook`. The `rpg-` prefix sets it apart from webgptorg/promptbook, an AI tool that also owns the npm scope `@promptbook`: never use that scope. |
| Repo          | **Decided:** public GitHub repo, for the Electron builds and updates (see Stack).                                                                                                                                                                                                                                                                                    |
| Stack         | **Decided:** PostgreSQL; sign-in through OIDC (Authentik on the homelab), local password accounts only with it off. The rest is proposed under Stack.                                                                                                                                                                                                                |

## Architecture (proposal)

### Local-first

Each project lives on the device first and syncs to the server when there is a
network.

- **Sync:** one [Yjs](https://yjs.dev) document per project. Yjs merges edits
  made on two devices, or by the user and Claude, without a "choose a version"
  dialog.
- **Two shells, one frontend** (proposal):
  - **Desktop app** (Electron) for Mac, Linux and Windows, from the first
    release: the offline one. Projects are stored on disk, not in browser storage, and
    sync with the server when online. Electron because CueBard already solved
    building, releasing and auto-updating an Electron app.
  - **Browser:** online only, for any other device (iPad, phone, another
    computer). No offline promise.
  - **iPad or phone offline**, if ever needed: wrap the same frontend with
    Capacitor. Not planned.
- **Server:** Fastify (like gdrarchive) plus Hocuspocus, the Node sync server
  for Yjs, persisting to Postgres. Images and audio on a persistent volume,
  named by their SHA-256 (built 2026-10-20, #26); object storage can replace
  it behind the same interface.
- **Auth:** single sign-on through OpenID Connect, Authentik on the homelab,
  like gdrarchive and cronista (decided 2026-10-19, #17). The account is the
  provider's identity, keyed by issuer and subject and created at its first
  sign-in. **No linking:** an identity never attaches to an existing local
  account, by email or by username. While single sign-on is on, passwords are
  refused; turning it off in the deployment brings back local password
  accounts, the way in when Authentik is down.
- **Claude's edits:** the MCP server applies changes as Yjs updates to the same
  document, so they merge with offline edits on reconnect. Built 2026-10-19
  (#4): the server writes through a direct connection to its live Hocuspocus
  document, so open editors see Claude's text at once and the usual store
  path saves it.

Works offline in the desktop app: writing, the to-do list, the asset board.
Queued until online: image and audio uploads. Claude needs a connection anyway.
The PDF is built in the app, so it works offline too.

### Editor

A Markdown source editor (CodeMirror 6 with `y-codemirror.next`) and live
preview, not gdrarchive's WYSIWYG editor:

- MDXEditor, gdrarchive's editor, has no Yjs binding.
- The adventure template is strict (`### S1. Nome`, bold field names,
  `visual:`/`mood:` lines). With Markdown as the stored text, the PDF script,
  the asset board and the `.cbpack` export read it directly, with no lossy
  conversion.

### Source format (decided 2026-10-18, from [source-format.md](research/source-format.md))

The format is not the problem; today's script is: it guesses structure from
conventions and silently drops what does not match. In Sabaoth, S5's "Se il
tempo stringe" is merged into another field, "→ Schede: Sabaoth" prints as raw
text and Sabaoth gets no threat box.

- **Stored text:** CommonMark plus GFM (tables, task lists), YAML front matter
  for the header (title, system, format, duration, players, setting, timing,
  tab label, author, copyright, licence), and one extension: Obsidian-style callouts for typed boxes:
  `> [!leggi]` read-aloud (one per scene), `> [!documento] Title` handout,
  `> [!riquadro] Title` box, `> [!riquadro|laterale] Title` side column.
  Callouts render as boxes in Obsidian and stay readable in any editor.
- **Closed, validated grammar:** sections, scene fields and callout types come
  from a closed list. Scenes keep `### S1. Name`, which gives each scene a
  stable id. Threat sheets get separate keys (Grado, Natura, Ferite,
  Afflizioni, …) instead of prose. The parser never guesses: anything it
  cannot place is an error or a warning in the editor, and nothing is dropped
  (unknown field, `→ Schede:` that points nowhere, a grade that disagrees with
  its box counts).
- **One TypeScript package** reads the format for every consumer: editor
  lint (`@codemirror/lint`), PDF, asset board, `.cbpack` and MCP. Built on
  `unified`/`remark` and `zod`, with about thirty rules ported from the
  skills' `controlla.py`. MCP writes are validated before they apply, and the
  errors go back to Claude.
- **Migration:** a converter rewrites today's notes (header to front matter,
  first quote of a scene to `[!leggi]`, later ones to `[!documento]`, the
  "Tipo" line to keys) and reports what needs a human.
- **Rejected:** Markdoc and MyST (best validation, but tag noise, closing
  markers Claude can break, poor display elsewhere); Djot, AsciiDoc and Typst
  as source (Claude writes them poorly, other tools don't render them); MDX
  (the document becomes code); a block model like Tiptap or BlockNote (no
  plain text). Generic directives (`:::name{attrs}`) stay in reserve for a box
  that needs attributes a callout cannot carry.
- **Existing projects:** every RPG layout tool found (Homebrewery, BrewVault,
  Quarto, Typst plugins) is Markdown plus one box extension. None models
  scenes, read-aloud or threats, and none validates against a template.
- **Cost:** the format package is the biggest piece (medium); the two
  existing scripts are its specification. Editor and prompting work: small.

### Stack

**Decided:** PostgreSQL; sign-in through OIDC, with local password accounts
only while it is off (see Auth above).
The rest is proposed, reusing what gdrarchive and CueBard already solved:

- **Repo:** a TypeScript monorepo with npm workspaces, like gdrarchive:
  - `format`: the parser and validator (`unified`/`remark`, `zod` 4), shared
    by everything else.
  - `layout`: the Typst template and the JSON model it reads.
  - `server`: the API, sync and MCP.
  - `web`: the frontend, used by the browser and inside the desktop app.
  - `desktop`: the Electron shell.
- **Server:** Node, Fastify 5, plain `pg` with SQL migrations, as in
  gdrarchive. Hocuspocus for Yjs sync, saving to Postgres. The MCP server with
  the same SDK as gdrarchive's connector. Auth code ported from gdrarchive
  (argon2 local passwords, `openid-client` 6 with PKCE). Images and audio as files named by
  their hash on a persistent volume, behind an interface so an S3-compatible
  store can replace it. One container, deployed on the homelab like
  gdrarchive.
- **Web:** React, Vite, React Router, CodeMirror 6 with `y-codemirror.next`
  and `@codemirror/lint`. Typst's WASM build for the preview and the PDF, so
  the browser can make PDFs too while online.
- **Desktop:** Electron, built with electron-builder for Mac, Windows and
  Linux, updated with electron-updater from GitHub Releases, the same pipeline
  as CueBard. Projects stored on disk in SQLite (`node:sqlite`, in the main
  process), assets as files in the app's data folder. Login through the system
  browser (PKCE, loopback redirect); tokens kept with Electron's `safeStorage`.
  Built in #6; the decisions are below under Desktop app.
- **Tests:** vitest; Playwright for the browser and for Electron.
- **Workflow:** openspec and the architect/implementer split, as in gdrarchive.

**Why GitHub:** GitHub Actions has hosted Mac, Windows and Linux runners, and
electron-builder and electron-updater publish to and update from GitHub
Releases natively; CueBard already works this way. On the self-hosted GitLab
the Mac and Windows builds would need runners on your own machines. For a
private repo (not chosen), Actions minutes are limited and Mac minutes count ten times, and
updating from private releases needs a token inside the app; a public repo
avoids both. The server image can still build on GitHub and deploy to the
homelab.

### UI (proposal, mockup to agree before any spec or code)

Mockup: [mockups/editor.html](mockups/editor.html), open it in a browser.
Every UI gets a mockup agreed with the user before it is specified or built.

Agreed 2026-10-18: editor-first layout, markers shown only on the line being
edited, PDF preview beside the editor plus a full-screen review, Emerald look.

Agreed 2026-10-19: the projects screen,
[mockups/projects.html](mockups/projects.html): list with category and
status filters and to-do progress, project panel, new project from a
category template, Markdown import (one note, one project, never merged),
sync indicator, sign-in, settings; deleted projects stay in a bin for 30
days; campaigns get a plain, unchecked skeleton; the desktop app needs the
server once before it works offline.

Agreed 2026-10-19: the connector,
[mockups/connector.html](mockups/connector.html): the project rail, the
Inspiration, Research, Brainstorm log and History views, Compare, the Claude
edit banner, the inspector's Research section, the Authorize page and
Settings → Connected apps.

The main use is editing, so the editor takes most of the screen:

- **Top bar:** project breadcrumb, category, status, the sync indicator, panel
  toggles, focus mode, history (snapshots), export, **PDF**, command palette
  (⌘K).
- **Rail** (left edge, icons): Projects, Document, Inspiration, Research,
  Brainstorm log, History; Settings at the bottom. The project entries are
  off while no project is open. Images and music joins with the asset board.
- **Outline** (left, collapsible, ⌘1): sections and scenes from the headings,
  with error and warning badges; drag to reorder scenes.
- **Editor** (centre, ~70 characters wide): Markdown source with live preview.
  Markers (`**`, `###`, `> [!leggi]`) show only on the line being edited;
  callouts show as coloured boxes; problems get a margin dot and a squiggle
  with a quick fix. Prose in Spectral, the PDF's body font, so the text looks
  like the printed page.
- **Inspector** (right, collapsible, ⌘2), sections that open and close:
  - **This scene:** the template's fields for the scene under the cursor,
    ticked or missing, with insert buttons, plus buttons for read-aloud,
    handout, box, side box, sheet reference, reactions table. This replaces a
    static recap of the template rules; the full syntax is one key away (⌘/),
    and `/` at the start of a line inserts.
  - **Checks:** errors and warnings for the whole document; click to jump.
    A problem can be dismissed or snoozed for a day or a week, and is then
    listed under **Hidden** with Restore; hidden problems are stored in the
    project and left out of every count (#31, the hide-problems change).
  - **To-do:** the list with its progress bar.
  - **Research:** the research notes whose topic shares a word of four
    letters or more with the scene under the cursor (case and accents
    ignored), with a link to open each.
  - **Seed:** the original idea, at a glance.
- **PDF preview:** takes the Inspector's place, beside the editor, and follows
  the cursor's scene. In the desktop app it can also open in its own window,
  for a second screen.
- **PDF review** (full screen, ⌘⇧P or "Review" in the preview): page
  thumbnails with the scene tabs, single page or spread, zoom; layout checks
  (half-empty pages, a scene running long, a missing image); options (paper,
  images, ink saver, pregenerated sheets, template); earlier PDF versions to
  compare; Save PDF and Print. Double-click any text to jump to it in the
  editor; Esc goes back.
- **Focus mode** (⌘.): only the text, the sync indicator and the status bar.
- **Status bar:** current scene, cursor, error and warning counts, words,
  template, last sync.
- **Look:** gdrarchive's Emerald look (Barlow, emerald accent, dark by
  default, light available), so the user's apps feel related.

## Features

### Projects and prep documents

- A project has a **category**: campaign, adventure or one-shot. An adventure
  or a one-shot can stand alone or belong to a campaign.
- A project has a **status**: draft, in progress or complete. The user sets it;
  the app never changes it on its own.
- The project list filters by category and status and shows each project's
  to-do progress (for example 5/9).
- The prep document follows the `enhanced-avventure-rpg` template (rpg-prep
  plugin, `references/modello.md`).
- Markdown import: drop one `.md` or a folder.

### To-do list

Each project has its own checklist of what is left to do.

- **Templates per category.** Settings hold one to-do template for campaigns,
  one for adventures and one for one-shots, edited by the user. A new project
  starts with a copy of its category's template; changing the template later
  does not touch existing projects.
- **Per project.** Add, rename, reorder, delete and tick items freely. An item
  can carry a short note and an optional due date (for example the session
  date).
- **Starting templates** (proposal, editable): for an adventure, "Write the
  scenes", "NPC sheets", "Midjourney prompts", "Images chosen", "Suno prompts",
  "Tracks chosen", "PDF for the table", "CueBard export", "Read through once".
- **Manual only (decided):** items never tick themselves; the user ticks
  them.
- **Through MCP.** Claude can read the list and add items, so a brainstorm can
  end with "add what we left open to the to-do list".
- **Offline.** The list lives in the project's Yjs document, so it works
  offline and merges like the rest.

### Inspiration

Each project keeps the spark it started from, apart from the prep document.

- **Seed:** a Markdown field for the original idea, as first written. It is
  never rewritten by the editor or by Claude; changes are kept as dated
  versions, so the first idea can always be read again.
- **Sources of inspiration:** a list of items under the seed, each a link, a
  quote, an image or a note, with a line on why it matters (a film, a myth, a
  song, a news story, a place).
- **Through MCP:** a brainstorm can start by reading the seed, and Claude can
  add items to the list.
- **Decided:** the seed and the inspiration items stay out of the table PDF
  and the `.cbpack`, like the research notes.

### Research

Research the topics behind the inspiration, for example the 1908 Messina
earthquake and the legend of Colapesce for L'ancora di Sabaoth.

- **Research notes:** each project has a research section. A note holds a
  topic, a summary, the facts worth using at the table and its sources as
  links, with the date. Notes are stored like the rest of the project, so they
  can be read and edited offline once saved.
- **Topics:** the user adds and removes them in the Research view, and Claude
  adds them through MCP. A topic is open until a note on it exists. Topics
  proposed by the app from the seed and the inspiration items are for later.
- **Engine, first (built 2026-10-19, #4):** Claude through the MCP connector.
  In Claude web or Desktop: "research the topics of this project". Claude
  reads the seed and the topics, searches the web with its own search, and
  saves one note per topic with sources. No extra API or cost, and it fits the
  brainstorm flow.
- **Engine, later (proposal, optional):** a **Research** button in the app
  that calls a search API (Brave Search, Tavily or Exa) and a model with the
  user's key, and saves the same kind of notes. Keys stored encrypted in the
  database. Online only.
- **Clip by hand (later):** paste a URL, the app saves its title and an
  excerpt as a note to complete. It needs a server fetch with guards against
  private addresses, so it waits.
- Research notes are prep: they never go into the table PDF or the `.cbpack`
  unless copied into the prep document.

### MCP connector

Its own connector on claude.ai, so a brainstorm in Claude web or Desktop saves
straight into the app. Replaces the Joplin MCP. Built 2026-10-19 (#4); the
README says how to connect it.

- **Endpoint:** `<PUBLIC_URL>/api/mcp`, the Model Context Protocol over
  Streamable HTTP, stateless, with JSON answers.
- **Sign-in:** an OAuth 2.1 authorization server inside the app, ported from
  gdrarchive: dynamic client registration, client ID metadata documents,
  PKCE, refresh tokens that rotate. The consent page, `/authorize`, sits
  behind the app's own sign-in, so the Authentik identity is the one that
  approves. No new Authentik application and no new secret.
- **Access:** read, or read and edit, chosen on the consent page. Settings →
  Connected apps lists the approved apps and revokes them.
- **Tools:** projects, the outline, the prep document by section, the to-do
  list, inspiration, research topics and notes, the brainstorm log, the
  board's prompts. Claude can add and edit; it never ticks a to-do item and
  never rewrites the seed, and the only thing it deletes is an image prompt
  (`remove_image_prompt`, #36), whose images go to the Unmatched tray.
- **Section-scoped edits:** Claude replaces one section, scene or sheet, or
  adds a scene. The edit carries the hash of the text Claude read, so text
  the user changed in between is never overwritten. Checks never refuse an
  edit (#27): the result reports the errors and warnings before and after
  and the problems in the edited text, as information. Problems the user
  hid are left out of the counts and listed marked `hidden` (dismissed, or
  snoozed with its `until`) (#31).

### Brainstorm memory

Claude.ai has no API to read conversations, so the app cannot pull them.

1. **Brainstorm log per project, through MCP** (built 2026-10-19, #4).
   During or after a chat, Claude writes a dated entry: ideas, decisions,
   rejected ideas and why, open questions. A new chat reads the log first,
   like gdrarchive's campaign brief. The Brainstorm log view shows the
   entries, edits them, and turns open questions into to-do items.
2. **Full transcripts, optional, later.** Import the claude.ai data export
   (Settings → Privacy → Export data, a zip by email), pick conversations,
   attach them to a project, search them.

### Snapshots and history

Built 2026-10-19 (#4). The server keeps snapshots of the prep document in
Postgres, outside the Yjs document:

- **By hand,** with a name, from the History view; kept until deleted.
- **Before every Claude edit,** with what Claude replaced; kept 30 days.
- **Before every restore,** so a restore never loses the current text; kept
  30 days.

History compares any snapshot with the current text as a unified diff and
restores it. After a Claude edit the Document view shows a banner with
Compare and Undo. Undo puts back only the part Claude replaced, while that
part is unchanged; otherwise History restores the whole document.

The desktop app also takes local snapshots (Desktop app, below).

### Desktop app

**Built** (2026-10-20, #6; the full design is in the `desktop-app` change of
`openspec/`). `packages/desktop` is an Electron 44 shell whose window shows
the web client's own build, served from a privileged `promptbook://app/`
protocol; the web client reaches the network and the browser only through
`packages/web/src/platform/`, so one build serves both.

- **Main owns data and network.** Every project of the account is on disk
  in SQLite, one database per account under the app's data folder, and kept
  in sync in the background with one Hocuspocus provider per project, open
  or not. The renderer does no network and never sees a token; REST goes
  through a router in main that answers the list, settings and snapshots
  from the store and forwards the rest with the bearer token.
- **`node:sqlite` instead of `better-sqlite3`:** it runs inside Electron's
  Node with no native module to rebuild per operating system and Electron
  version.
- **Sign-in** through the system browser to the server's OAuth authorization
  server (from #4), as a first-party native client with an app resource;
  a signed-in browser skips the consent page, and Connected apps lists the
  computer by name. The refresh token is kept with `safeStorage`, in memory
  only on Linux without a keyring.
- **Offline:** edit any project and create new ones; a project made offline
  is uploaded with its id and Yjs state on reconnect. Local snapshots every
  hour (or 15 minutes, or off), kept on the device and listed in History
  beside the server's.
- **Releases:** a `v*` tag on `main` builds unsigned installers (Mac dmg and
  zip for arm64 and x64 with an ad-hoc signature, Windows NSIS x64, Linux
  AppImage and deb x64) and creates the GitHub Release. Windows and the
  AppImage update themselves; the Mac (Squirrel.Mac refuses unsigned updates)
  and the deb package are told of a new version and open the release page.

### Asset board

Built 2026-10-20 (#26, the OpenSpec change `asset-board`): "Images and music"
in the rail. One row per scene, built from the `visual:`/`mood:` appendix of
the prep document:

- A Midjourney prompt and a Suno prompt per row, written with the rules of the
  `midjourney-prompts` and `suno-prompts` skills, each with a copy button.
- Image prompts in four categories, one tab each (#36, the OpenSpec change
  `image-categories`): Scenes, with any number of prompts per scene; PCs,
  NPCs and Handouts, project-wide lists of a name and a prompt. Music stays
  one Suno prompt per scene.
- A status per image prompt and per scene's music: wanted, received, chosen;
  one chosen image per prompt.
- Claude writes the prompts through the connector (`get_board`,
  `add_image_prompt`, `update_image_prompt`, `remove_image_prompt`,
  `set_scene_prompts`); the user adds, edits and removes them by hand.
  Removing a prompt sends its images to the Unmatched tray. Prompts are not
  versioned.
- Boards from before the categories migrate on every replica: each scene's
  prompt and chosen image become its prompt 1.
- Files are stored once per content, reachable only by their owner, and
  removed 30 days after no document lists them. The desktop app keeps every
  file of every project and works with the board offline.

### Intake by filename

Downloads say what they are:

- Midjourney filenames carry the username, the first words of the prompt and
  the job id, for example
  `<username>_studio_portrait_of_a_thin_wiry_Sicilian_coral__b2f23f24-…_3.png`.
- Suno filenames are the track title (`dominus deus sabaoth.mp3`), and the app
  sets the title in the prompt.

Drop the whole Downloads batch on the board: each image matches its prompt
in any category (Scenes, PCs, NPCs, Handouts), each track its scene.
Unmatched files go to a tray to assign by hand, or to match again once their
prompt or title is written; an image whose name matches two prompts waits
there with those prompts listed first. Built 2026-10-20 (#26), across
categories with #36.

### PDF for the table

`impagina.py` (rpg-prep plugin, `impagina-avventura` skill: Python and
WeasyPrint, fonts included) builds HTML from the template and prints it with
WeasyPrint. It can now include the images.

**Decided:** built in the desktop app, offline, with **Typst** (decided
2026-10-18; see [pdf-engines.md](research/pdf-engines.md)). The parsing
package produces a JSON model; a Typst template, rewritten from `stile.css`
with the same fonts, lays it out; Typst's WASM build compiles it inside the
app. The same template can serve the `impagina-avventura` skill through the
Typst CLI, replacing WeasyPrint. Sabaoth was rendered four ways:
WeasyPrint 13 pages (today), Chromium + Paged.js 14, Chromium + Vivliostyle
14, Chromium alone 18 (tabs, footers and page references lost).

| Option                       | For                                                                                                                                                 | Against                                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chromium + Vivliostyle       | Keeps `stile.css` and the fonts; tabs, footers and "p. N" worked unchanged; released monthly                                                        | AGPL-3.0 (fine for a personal app; CueBard is AGPL too); the floated side column left S5's first page almost empty; pages can shift with Electron's Chromium upgrades |
| Chromium + Paged.js          | Same as above, MIT                                                                                                                                  | Frozen since 0.4.3 (2023); same S5 problem, worse with the grid fix                                                                                                   |
| Typst (WASM, inside the app) | Its own layout engine: byte-identical output on every run and system, 31 pages in 0.2 s, same preview in the app and the browser, single-binary CLI | `stile.css` rewritten as a Typst template (medium); about 30 MB of WASM                                                                                               |

**Author, copyright and licence in the footer** (decided 2026-10-18):

- Front matter keys: `autore` (one or more names), `copyright` (optional, for
  example `© 2026 Stefano Sibilia`) and `licenza` (optional, an SPDX id such as
  `CC-BY-NC-SA-4.0`, or free text for anything else).
- Defaults come from the app settings (author name, default licence) and are
  copied into a new project's front matter, where they can be changed.
- Every page footer shows the author, plus the copyright and the short licence
  name when set, next to today's "Title · scene" and page number. The cover
  repeats them in full, with the licence's link for an SPDX id.
- Validation: an unknown SPDX id is a warning, not an error; free text is
  printed as written.

Target: the same
structure as today (one page per scene, same tabs, footers and references),
not the same page breaks as WeasyPrint.

**Built in the browser first** (2026-10-19, #20): the owner moved the PDF
ahead of the desktop app, so the web client builds it with the
`promptbook-layout` package, which the desktop app will reuse.

- Engine: typst.ts `0.8.0-rc3` (Typst 0.15.0), pinned exactly, in a web
  worker. It loads only when a PDF is first opened on a page: about 8 MB with
  Brotli (29 MB of WASM), kept by the browser for a year. The server allows
  WebAssembly (`'wasm-unsafe-eval'`) and no JavaScript eval.
- The preview and the review draw the pages as SVG; the PDF itself comes
  from the same build. Print… opens the PDF in a new tab, whose viewer
  prints it, rather than a print dialog over the page.
- Print options (paper, ink saver, pregenerated sheets) are kept per project
  on the device, not in the document.
- Later: images in the PDF and the missing-image check (phase 2, with the
  asset board), earlier PDF versions and compare (#4, with snapshots), the A5
  booklet.

Rejected: bundling Python and WeasyPrint (no macOS or Linux builds, no WASM in
v70; native Pango on three systems), Prince (licence cost), pdfmake, react-pdf
and pdf-lib (every style rule becomes code), LaTeX in WASM and Quarto (too
large or slow).

### CueBard export

A `.cbpack` archive that CueBard imports as a ready project, following its
own format at `schemaVersion` 5: CueBard does not depend on Promptbook. CueBard
source is [Stevesibilia/cuebard](https://github.com/Stevesibilia/cuebard)
(`electron/ipc/project.js` builds and reads `.cbpack`). Built 2026-10-21
(#38); the decisions are in the archived OpenSpec change `cuebard-export`.

- **Layout:** a zip `<title>.cbpack` holding `<title>.cuebard` (the project
  file, JSON) at its root, the tracks under `media/`, the images under
  `media/visuals/<uuid>_<name>`, and `left-out.txt` only when something was
  left out. No waveforms (CueBard draws them), no thumbnails, no prep text.
- **What goes in:** per image prompt its chosen image, or every matched one
  when none is chosen; per scene its chosen track, or every matched one. The
  Unmatched tray stays out. One cue group per appendix scene, in order, named
  «S1. Title», its tracks looping and named after the Suno title; visual
  folders «Scenes», «PCs», «NPCs», «Handouts», each scene's images linked to
  its first track. Ids are derived from the project and the file, so the same
  board gives the same pack.
- **Track lengths:** CueBard needs each cue's length. The board's recorded
  length, else one read from the file with `music-metadata`; a track with
  neither is left out and listed.
- **Where:** one planner in `packages/project` (`cuebardPack`); the browser
  downloads `GET /api/projects/:id/cuebard` from the server; the desktop app
  builds the pack in its main process from the files on the computer,
  offline too, and saves it where the save dialog says. Limits as the
  Markdown export: 4 GB and 65,000 entries.
- **UI:** «Export for CueBard…» in the board's header and the projects
  screen's Actions opens a summary with a warning per gap; warnings never
  block the export.

### Send to gdrarchive

Later, optional and one-way: a button on an item (NPC, place, session) pushes
it through gdrarchive's API. Nothing flows back.

## Midjourney and Suno

Checked 2026-10-17:

- **Midjourney** has no official API. Its terms forbid automated tools
  ("You may not use automated tools to access, interact with, or generate
  Assets").
- **Suno** has no public API. A partner program opened in July 2026, invite
  only.
- **[Lala-0x3f/mj-mcp](https://github.com/Lala-0x3f/mj-mcp):** drives the
  user's own account with its login cookies. Ban risk on the user's account,
  abandoned since April 2025. Rejected.
- **[acedatacloud/midjourneymcp](https://github.com/acedatacloud/midjourneymcp)**
  (and SunoMCP, SunoAPI from the same company): a reseller with a REST API,
  paid per call. The user's account is not exposed, but reselling is also
  against Midjourney's terms, so the service can disappear; images don't reach
  the user's gallery and `--p` probably doesn't carry over. The user chose not
  to test it for now.
- **Official APIs** for drafts: Nano Banana or Imagen through Gemini for
  images; ElevenLabs Music or Lyria for music (not checked).

Design: the generator is a choice per asset row. Manual (copy the prompt, drop
the files) is the default; Ace Data or Gemini can be added later without
changing anything else. Their keys would be stored encrypted in the database
and managed from the UI, not in environment variables.

## Phases

1. **Base:** projects with category and status, inspiration (seed and
   items), research notes filled through MCP, to-do list with templates,
   offline sync, Markdown editor, the format package with validation in the
   editor, `.md` import with the converter from today's notes, MCP connector with the
   brainstorm log, desktop app plus browser access.
2. Asset board with prompts and intake by filename. Built 2026-10-20 (#26);
   image prompts in four categories (#36).
3. `.cbpack` export. Built 2026-10-21 (#38): from the browser and, offline,
   from the desktop app.
4. PDF in the desktop app with Typst: template ported from `stile.css`,
   checked against today's PDFs (Sabaoth first).
5. Transcript import, optional generators, in-app research engine, Send to
   gdrarchive.

## From the research (proposals)

The analysis of writing apps and GM tools is done (2026-10-18):
[writing-apps.md](research/writing-apps.md) and
[gm-tools.md](research/gm-tools.md). Reddit could not be read directly, so
what users say is a sample, not a survey.

Main results:

- Nothing found already does Promptbook's pipeline (adventure text → per-scene
  image and music prompts → downloads matched back to scenes → table PDF and
  cue package). Quest Portal comes closest, inside its own online VTT, without
  AI music, PDF or export. The decision to build stands.
- No writing app opens offline in a browser from a cold start; real offline is
  only in native apps. Dabble (device-first saves, PWA on iOS) and LegendKeeper
  (Yjs since 2021, offline except maps) are the closest models to the planned
  sync.
- Conflict handling is weak almost everywhere: "pick a version" dialogs,
  conflict folders, last-write-wins.
- Markdown in and out is rare, and no app ships its own MCP server.
- A to-do list or prep status per project barely exists (only LivingWriter).
- Many writing and GM communities reject generative AI. Not a concern for a
  single-user tool, but nothing in the app should require AI to work.

Decided 2026-10-18 (the user agreed with these takes):

- **Adopted for phase 1:** sync status always visible with an alert on a
  failed local save; first-sync download screen and local snapshots; server
  snapshots by hand and before every Claude write, with compare and restore;
  MCP edits scoped to one section; outline sidebar with drag to reorder
  scenes; category templates that also create a skeleton prep document; full
  export as a Markdown folder plus assets.
- **Adopted for phases 2–3:** GM-only flag and GM note per image; GM-only
  images stay out of the `.cbpack`.
- **Later:** secrets and open threads carried over across a campaign until
  revealed; automatic links for NPC and place names, once projects have
  entities.
- **Covered already:** Obsidian and Notion imports (folder import).
- **Skipped:** the Lazy DM eight-step template (the user's own template
  already covers it; it can be added as a template later); World Anvil import.

The original proposals:

| Idea                                                                                                       | From                          | Phase |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------- | ----- |
| Sync status always visible: synced, saved on this device only, not saved; loud alert if a local save fails | Dabble, Ellipsus              | 1     |
| First-sync "downloading project" screen and local snapshots on the device                                  | LegendKeeper                  | 1     |
| Server snapshots, by hand and automatically before every Claude write, with compare and restore            | Scrivener, Ellipsus           | 1     |
| MCP edits scoped to one section (a `### S3.` scene, a field, a log entry), never a full rewrite            | Obsidian Local REST API       | 1     |
| Outline sidebar from the `### S1. Name` headings, drag to reorder whole scenes                             | Scrivener, Ellipsus, Longform | 1     |
| Category templates start a project with a skeleton prep document as well as the to-do list                 | Dabble, Ulysses               | 1     |
| Optional "Lazy DM" eight-step prep as a template                                                           | Sly Flourish, Strong Start    | 1     |
| Secrets and open threads that carry over from adventure to adventure in a campaign until marked revealed   | Strong Start                  | 1     |
| Full export as a Markdown folder plus assets, always available                                             | LegendKeeper                  | 1     |
| Import Obsidian vaults and Notion's Markdown export (phase 1); World Anvil zips (phase 5)                  | LegendKeeper                  | 1, 5  |
| GM-only vs show-to-players flag and a GM note per image; GM-only images stay out of the `.cbpack`          | Foundry, Roll20               | 2–3   |
| Auto-link names of NPCs and places, once projects have entities                                            | Kanka, World Anvil            | later |

To avoid: "pick a version" dialogs; last-write-wins on the to-do list or the
asset board (they live in the Yjs document, so they merge); offline that needs
a recent online visit; lossy exports; feature sprawl (word goals, a dozen
modules).

## Open questions

None at the moment.

## Sources

- [Midjourney API status (unifically)](https://unifically.com/blogs/midjourney-api)
- [Best Midjourney API tools in 2026 (wireflow)](https://www.wireflow.ai/blog/best-midjourney-api-tools-in-2026)
- [Suno is opening an API partner program (Digital Music News)](https://www.digitalmusicnews.com/2026/07/03/suno-is-opening-an-api-partner-program/)
- [Official Suno API for SaaS builders 2026 (sonilo)](https://sonilo.com/blog/guides/official-suno-api-saas-builders-2026)
