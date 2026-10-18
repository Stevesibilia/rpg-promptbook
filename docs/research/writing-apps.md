# Writing apps as inspiration for Promptbook

Researched 2026-10-18 for the "Analysis of writing apps" item in
[design.md](../design.md). GM tools (World Anvil, LegendKeeper, Kanka, Notion,
Foundry journals and so on) are a separate analysis and are not covered here.

Every feature and price below comes from a source listed at the end. Most come
from official pages. **[3P]** marks a fact from a third party. **[unverified]**
marks something the sources did not settle.

## How the app list was built

The thread named in design.md
([r/writers 1dk212v](https://www.reddit.com/r/writers/comments/1dk212v/writing_app/))
could not be read with WebFetch: both `www.reddit.com` and `old.reddit.com`
are blocked, and the `.json` endpoint returns 403. Its Atom feed
(`…/writing_app/.rss`) did load with curl, so the thread was read in full.

That thread is small and off target. Posted 2024-06-20, it asks for a diary or
planner app. It has nine comments and three apps: Diarium (a journal), Pluot
(a plot and character planner) and Writer's Companion (a mobile novel
planner). None of them is a serious model for Promptbook; they are covered
briefly at the end.

To get a better list, the r/writers search feed was read the same way, and the
comments of two recent threads were counted (comments that name the app, by
keyword, so the counts are rough):

| App         | "Best app to write on" (2026-09-17) | "Google Docs is awful" (2026-09-29) |
| ----------- | ----------------------------------- | ----------------------------------- |
| Scrivener   | 24                                  | 6                                   |
| Obsidian    | 10                                  | 9                                   |
| Google Docs | 5                                   | 17 (the thread's topic)             |
| LibreOffice | 6                                   | 6                                   |
| Ellipsus    | 4                                   | 7                                   |
| Ulysses     | 3                                   | 0                                   |
| Reedsy      | 0                                   | 3                                   |
| Novlr       | 0                                   | 1                                   |

A third thread ("Sharing resources you may not have heard of", 2025-05-25)
added Novlr again. Recurring reasons in the comments: Scrivener for the
corkboard, one-time price and offline use; Obsidian for local Markdown files;
Ellipsus for its anti-AI stance; Google Docs for "it's everywhere", against
slowness on long files and the fear of AI training.

Word, Google Docs and LibreOffice are left out: they are general word
processors with no prep structure. Notion is left to the GM tools analysis,
where design.md already lists it.

The final list is 12 apps: the six asked for (Scrivener, Obsidian, Ulysses,
Novelcrafter, Plottr, Campfire), the three the threads surfaced (Ellipsus,
Novlr, plus iA Writer as the plain-Markdown reference), and the novel tools
with the strongest scene and entity models (Dabble, Bibisco, Manuskript).
Reedsy Studio and LivingWriter were checked and appear under "Also checked".

## What matters for Promptbook

From design.md, the bar each app is measured against:

- Offline writing and editing, not only reading, in a PWA on Mac, iPad and
  phone. Yjs merges edits from two devices and from Claude.
- Markdown as the stored text, with a strict scene template.
- Projects with category, status and a to-do list built from per-category
  templates.
- An MCP connector and a brainstorm log that Claude reads and writes.
- Markdown import now; export to PDF and `.cbpack` later.

## Apps

### Scrivener

**Good for prep.** The binder holds the manuscript, notes and research side by
side. The corkboard shows one card per section; moving a card reorders the
text. The outliner shows synopsis and metadata. Every item can carry a label,
a status ("To Do", "First Draft"), keywords and custom metadata, and smart
collections are saved searches that update themselves. Document templates
cover character or location sheets, but there is no entity database. Per
section snapshots can be compared. Document links exist, with optional
back-link bookmarks **[3P forum]**. No timeline of its own; Aeon Timeline
syncs with it on Mac and Windows.

**Offline and sync.** Fully local. The project is a package of many linked
files. There is no sync service: you put it in Dropbox and follow the official
rules (close it on one machine before opening it on another, wait for Dropbox
to finish, no online-only files). Conflicting copies land in a "Conflicts"
folder to sort out by hand. Google Drive is "strongly discouraged". iOS syncs
through Dropbox only, and only when you tap Sync.

**Format.** Text is RTF inside the `.scriv` package **[3P forum]**. Compile
exports Word, PDF, ePub, plain text, Final Draft, and MultiMarkdown or Pandoc.
"Sync with External Folder" round-trips plain files but flattens the structure
**[3P forum]**. Export is easy; the project itself is not plain text.

**AI.** None of its own. Version 3.4.0 supports Apple Writing Tools, and the
release notes say "Scrivener itself contains no AI". Third-party MCP servers
exist **[3P]**. No 2026 release on the macOS release notes page.

**Platforms and price.** Mac, Windows, iPhone and iPad; no Android, no web.
One-time purchase per platform: Mac US$59.99 on the Mac App Store, iOS
US$23.99. The Windows price could not be read from the store **[unverified]**.

**Borrow.** Corkboard and outliner as two views over the same ordered scenes.
Status, label and keywords on every scene. Snapshots with compare. Saved
filters.

**Avoid.** A multi-file package on a generic cloud folder, manual sync, and
conflicts dumped into a folder. This is the problem Yjs is there to remove.

### Obsidian

**Good for prep.** A vault of Markdown files with wikilinks and backlinks.
Bases (core plugin since 1.9.0, May 2025) turns note properties into table,
card, list, map and, since 1.14.0 (September 2026), kanban views, with filters
and formulas; the data stays in the notes' front matter. Canvas is an
infinite board saved as open JSON Canvas files. The Templates plugin fills in
title and date. File recovery keeps local snapshots every few minutes for
seven days, per device. The Longform community plugin orders scenes as notes
listed in an index note's front matter, with word counts and compile. TTRPG
community plugins cover initiative, stat blocks, dice, maps and fantasy
calendars **[3P listings]**.

**Offline and sync.** Fully local files. Obsidian Sync is end-to-end
encrypted. Its conflict rules: Markdown is merged with diff-match-patch,
other files (canvases included) use "last modified wins", and since 1.9.7 a
device can choose "create conflict file" instead. The help page says conflicts
"happen more often when you work offline". Users report merges that duplicate
text **[3P forum]**. Third-party sync (iCloud, Git, Syncthing) is documented
with caveats; using two at once is warned against.

**Format.** Markdown with YAML properties, plus `.canvas` and `.base` files.
Low lock-in apart from Obsidian-flavoured syntax.

**AI.** None built in; community plugins add it **[3P]**. The official CLI
(installer 1.12+) drives the running app: read, create, search, backlinks,
tasks, properties, Bases queries. The CEO publishes agent skills for Obsidian
(`kepano/obsidian-skills`). MCP is community-made: the Local REST API plugin
now ships an MCP endpoint that can patch a note by heading, block or
front-matter key.

**Platforms and price.** Windows, Mac, Linux, iOS, Android; no web app. The
app is free. Sync is US$4/month billed yearly ($5 monthly), Plus $8 ($10).

**Borrow.** Properties as the schema for structured data. Database and kanban
views over them. Backlinks. An MCP that edits one section instead of
rewriting the file. A conflict choice between "merge" and "keep both".

**Avoid.** Text merges that duplicate, last-write-wins for structured data,
snapshots that stay on one device, and core prep features left to plugins of
uneven quality.

### Ulysses

**Good for prep.** A library of sheets in groups and projects. Project
templates arrived in version 41 (September 2026). Goals on a sheet, group or
project, counted in words, characters, pages or reading time, with a deadline
mode that works out a daily quota. "Material" sheets sit next to the text but
stay out of statistics and export **[3P review]**. Keywords and saved filters
**[3P]**. Hourly, daily and weekly local backups. No entity database, no
backlinks, no timeline.

**Offline and sync.** Works offline. The native library syncs through iCloud
only, and the help page says Ulysses "is not able to force a sync". Conflict
handling is not documented **[unverified]**. External folders (Dropbox,
iCloud Drive) work in Markdown mode but lose images, attachments, goals and
some tags, and are not backed up.

**Format.** Proprietary library and "Markdown XL". Export to Markdown,
TextBundle, HTML, ePub, PDF, DOCX; only TextBundle keeps images.

**AI.** Apple Writing Tools, and Siri with onscreen awareness in version 41
(not in the EU). Built-in grammar check. No BYO key, no official MCP; a
community MCP works through the URL scheme **[3P]**.

**Platforms and price.** Mac, iPad, iPhone only. Subscription, US$39.99/year
or $5.99/month.

**Borrow.** Goals with a deadline and a daily pace. Material that lives beside
the scenes but never reaches the export. Project templates.

**Avoid.** A closed store tied to one vendor's sync, with features that
quietly disappear in "open files" mode.

### iA Writer

**Good for prep.** A library of plain Markdown files in folders, with smart
folders and `#hashtags`. Wikilinks (`[[file]]`) on Mac and iOS; no backlinks
documented **[unverified]**. Content Blocks (Mac) transclude other files,
CSVs and images, to assemble one document from parts. Front matter values can
be used as variables. Authorship marks which text a human typed, which came
from AI and which was pasted as a quote, stored in an open "Markdown
Annotations" block at the end of the file. No corkboard, status, to-dos or
timeline.

**Offline and sync.** Local files, iCloud by default or any folder (Dropbox,
OneDrive, Google Drive). On a real iCloud conflict it asks which versions to
keep. Version history depends on iCloud or the cloud provider.

**Format.** Plain Markdown. Export to Markdown, HTML, PDF, Word. Near zero
lock-in.

**AI.** No generator. The stated position is AI as a dialogue partner, not a
ghost writer. No MCP or BYO key found **[unverified]**.

**Platforms and price.** Mac US$49.99, Windows $29.99, iPhone and iPad
$49.99, one-time; major upgrades may be paid. Android was withdrawn in 2024.
No web app.

**Borrow.** Authorship marks: show which parts of a scene Claude wrote,
stored as data next to the Markdown rather than in it.

**Avoid.** Leaving version history to the operating system or the cloud
provider.

### Novelcrafter

**Good for prep.** The Plan has three views over acts, chapters and scenes:
a drag-and-drop grid, a matrix and a one-page outline. The matrix shows codex
entries, POV, labels or subplots against scenes. The codex holds characters,
locations, objects, lore, subplots and "other", with custom fields, tags,
relations and images; the types themselves are fixed. Names and aliases are
detected in the text automatically, case-insensitive by default, with plural
matching and an exclusion list against false hits. Each entry has a mentions
tab and a heatmap. "Progressions" add dated changes to an entry, anchored to a
scene. A series codex shares entries across books. Scene labels, snippets for
notes and to-dos, templates.

**Offline and sync.** Online only. The FAQ says offline mode is planned, no
date. A September 2025 update says several open tabs are not supported and
can lose data. No offline entry in the 2026 changelog.

**Format.** Imports Word, Markdown and Pages. Exports Word or Markdown,
optionally with codex, chats and snippets.

**AI.** Bring your own key only: Anthropic, OpenAI, OpenRouter, Google AI
Studio, Mistral, Groq, local Ollama or LM Studio, or any OpenAI-compatible
API. Each codex entry has one of four context rules: always include, include
when detected (default), don't include when detected, never include. Chat can
use the outline, the scene or the whole novel as context. No MCP found.

**Platforms and price.** Web app, installable from Chrome, Edge or Safari. No
native mobile app. Subscription: US$4, $8, $14 or $20 per month; AI features
start at $8.

**Borrow.** Per-entry context rules for what the AI reads. Alias detection
with an exclusion list. A matrix of entries against scenes. A world codex
shared across a campaign's adventures.

**Avoid.** Online only, data loss with several tabs, and a fixed list of
entity types.

### Plottr

**Good for prep.** A drag-and-drop timeline of plotlines against chapters,
with scene cards; the outline is generated from it. A story bible for
characters and places with unlimited custom fields. Series view across books.
30+ plot templates plus scene and character templates, and your own. Tags
used for statuses, POV and items.

**Offline and sync.** Two products. Desktop Plottr is file-based and syncs by
hand through a cloud folder. Plottr Pro is cloud-based with real-time
collaboration; its offline mode is a beta (V2 in March 2025, conflict dialog
reworked in March 2026), and the pricing page lists "Work Offline" and "Coming
Soon" in different places. The mobile apps were withdrawn.

**Format.** Exports to Word and Scrivener; imports Scrivener and Word
(the Word import is seen only in search results **[unverified]**). No
Markdown, JSON or CSV export documented.

**AI.** Every plan is advertised as "No AI".

**Platforms and price.** Windows and Mac; Pro adds a browser app. Plottr
US$60/year or $150 lifetime; Pro $9.99/month, $99/year or $599 lifetime.

**Borrow.** A grid of threads against scenes. A series-level bible. Structure
templates.

**Avoid.** Splitting offline and cloud into two products, and an offline mode
that stays in beta for years.

### Campfire

**Good for prep.** Eighteen modules: manuscript, characters, timeline, maps,
calendar, encyclopedia, magic, languages, locations, arcs, relationships,
items, species, cultures, religions, systems and more. A free-form timeline
canvas and custom fictional calendars. Index-card view of the manuscript with
word goals and custom progress statuses. Ten plot templates. Entity sheets are
built from movable panels, and panels can be hidden. Project linking for
series and shared worlds (details **[unverified]**).

**Offline and sync.** Only the desktop app works offline; browser and mobile
need a connection. When an element was edited both online and offline, you
choose which version to keep.

**Format.** DOCX export of selected elements, PDF and EPUB of the manuscript,
and a project backup file of unknown format **[unverified]**. No Markdown.

**AI.** No AI feature or statement found **[unverified]**.

**Platforms and price.** Browser, free Mac and Windows apps, and a mobile app
with fewer modules. Free tier with hard caps (for example 10 characters, 20
timeline events). All modules US$12/month (discounted from $19); single
modules by subscription or lifetime. Annual $99 and lifetime $336
**[3P]**.

**Borrow.** Custom progress statuses on scene cards. Entity types beyond
characters and places (factions, items, religions) if Promptbook ever gets
entities.

**Avoid.** Offline on one platform only, whole-element "pick a version"
conflicts, and feature sprawl into many modules.

### Dabble

**Good for prep.** Books, chapters and scenes; only scenes hold text. A plot
grid with plot lines as columns and rows tied to scenes; moving a scene asks
whether its plot points move too, and the current scene's points show in a
sidebar while writing. Manual `@mentions` of characters, scenes and notes that
follow renames. Templates for scenes, chapters, characters and whole
projects, shareable by link. Labels with 16 colours. Word goals with
deadlines. Real-time co-authoring since 3.0.0 (July 2026).

**Offline and sync.** The closest model to Promptbook. Every keystroke is
written to local storage first, then only the change is sent to the server
over a live connection; each device holds a full copy. Concurrent edits are
merged, not overwritten; the algorithm is not documented. 2026 releases route
all tabs through one shared store with one elected tab holding the
connection, resume on reconnect instead of re-syncing, and send changes that
cannot be saved locally to the server as "held changes". Private windows do
not save locally, and a red alert shows when a local save fails. A cloud icon
shows sync status. An older help article says offline merges "err on the side
of saving too much" (seen in search results only **[unverified]**).

**Format.** Imports DOCX, Markdown, HTML, RTF. Exports DOCX, Google Docs,
Markdown and a shareable web page; PDF through print. Notes and plot grid
have no structured export **[unverified]**.

**AI.** No AI features. Work is not used to train AI; any future AI will be
opt-in.

**Platforms and price.** Desktop apps for Windows, Mac and Linux. iPhone,
iPad and Android only as a PWA from the home screen. Subscription US$19, $29
or $49 per month; lifetime $699.

**Borrow.** The sync design: local write first, change-only sync, one tab
holding the connection, a visible sync icon, a loud warning when the device
cannot save. The plot grid tied to scenes. Project templates.

**Avoid.** A merge that can leave duplicate text to clean up, and planning
data with no export.

### Ellipsus

**Good for prep.** Document-centred. Each document has a main text and
drafts, which are branches; a draft can be compared with the main text and
merged into it. An outline is built from the headings automatically. Twenty
starter templates, one of them "TTRPG: World Building and Lore". Comments and
version history (30 days free, unlimited on Plus). No entity database, links,
timeline or task tracking found **[unverified]**.

**Offline and sync.** The company describes its engine as CRDT plus Git-like
version control. The Android app works offline. In the browser, "it is not
currently possible to open or edit documents or drafts offline"; edits are
only buffered locally ("Saved Locally") until the server takes them. Clearing
site data can erase unsynced work, and Firefox users must allow persistent
storage. iOS and desktop apps are "coming soon".

**Format.** Imports DOCX and Markdown; exports DOCX, PDF, Markdown and more.
Export covers the main text only, not drafts, and bulk export is not possible.

**AI.** Explicitly against it: it "will never integrate or use generative AI".

**Platforms and price.** Browser and Android. Free plan; Plus US$6/month,
owned after 24 months, or $99 one-time.

**Borrow.** Drafts as branches of a scene with a compare view. An outline
derived from headings. A sync indicator with a clear "saved on this device,
not yet on the server" state.

**Avoid.** Calling it offline when the browser cannot open a document cold.
Single-document export.

### Novlr

**Good for prep.** A planning grid released 2026-09-04 on every plan: columns
are manuscript sections, rows are threads (A plot, B plot, a POV, clues). A
cell note is linked to its section and appears in the notes sidebar when that
section is open. Notes for research and world-building, no typed entities.
Goals, version history, comments.

**Offline and sync.** Web app. Work is stored in the browser and synced on
reconnect, "as long as you've opened the app with an active internet
connection". Long offline sessions are not recommended. A native offline app
is only a roadmap request.

**Format.** Imports DOCX, ODT, RTF and Scrivener; no Markdown. Exports DOCX,
EPUB, PDF, ODT, RTF.

**AI.** No generative AI "and there never will be"; the top plan includes the
ProWritingAid proofreader.

**Platforms and price.** Web. Free (2 projects), US$8 or $16/month billed
yearly, lifetime $499.

**Borrow.** Thread notes that surface beside the scene they belong to. For a
GM the rows could be NPCs, clues or factions.

**Avoid.** Offline that needs the app opened online first.

### Bibisco

**Good for prep.** Chapters and scenes with scene revisions. Typed entities:
characters (with an interview questionnaire), locations, objects and groups
(families, factions). A timeline whose events link to scenes and entities.
Mind maps of relations. Version 5.0 (January 2026) added "copy tags from
previous scene" and a global rename of entity names. A red, yellow, green
status on chapters, scenes and entities **[3P, 2016; current UI
unverified]**. Many of these (timeline, mind maps, objects, groups, search)
are only in the paid Supporters Edition.

**Offline and sync.** Desktop app, data on the computer as a JSON project
file plus images. Putting it in a cloud folder risks "conflicting copies or
lost changes". The paid "Everywhere" sync warns when a device is behind and
lets you choose which version to keep; there is no merge. Android and iOS
apps since mid-2026, without sync on the free tier.

**Format.** Exports PDF, DOCX, TXT; EPUB in Supporters. Imports only its own
archives. No Markdown found.

**AI.** None found **[unverified]**.

**Platforms and price.** Windows, Mac, Linux, Android, iOS. Community free
(GPL-3.0); Supporters US$69 one-time; Everywhere $3.49/month or $29.99/year.

**Borrow.** Groups as an entity type (factions). Copying the previous
scene's tags into a new scene.

**Avoid.** "Pick which version to keep" sync, and import that only reads the
app's own archives.

### Manuskript

**Good for prep.** Open-source Scrivener-like tool. Summary (snowflake method,
from one sentence to a page), characters with goal, conflict and epiphany
fields, plots with resolution steps and templates (Try/Fail, three acts,
hero's journey), a world tree with a fantasy starter set, an outliner with
index cards. Every outline item has a status and a label from lists the user
defines.

**Offline and sync.** Desktop only, no cloud. The project can be a folder of
small plain-text files, designed so you can put it under git.

**Format.** Plain text, XML and OPML on disk. Import and export of HTML, ePub,
ODT, DOCX and more through pandoc. No lock-in.

**AI.** None found **[unverified]**.

**Platforms and price.** Free, GPL-3.0. Linux and Windows builds; macOS only
from source for 0.17.0 (June 2025, a bug-fix release). Describes itself as
"still in development".

**Borrow.** User-defined status and label lists. A plain-text folder layout
that git can diff.

**Avoid.** A stalled desktop app with no sync.

## Also checked

- **Reedsy Studio.** Web only, no offline ("Not yet"), offline planned as a
  paid feature. Boards and notes with attributes, relationships and pinned
  notes beside the text. No AI, and no training on your work. Free core, paid
  add-ons.
- **LivingWriter.** Chapters and scenes, story elements with "appears in" and
  relations, a to-do list, notes with statuses, built-in AI. Web, iOS,
  Android, Windows, Mac. Offline not stated **[unverified]**; price only from
  third parties **[3P]**.
- **Pluot** (from the original thread). Character and story planner for
  Android and Chromebook: scenes, characters, locations, storylines, custom
  items, JSON export, cloud sync on Pro.
- **Diarium** (original thread). A journal app with sync through the user's
  own cloud. Not a prep model.
- **Writer's Companion** (original thread). An iOS novel planner with goals,
  chapters and world-building items; last updated 2022.

## What the field shows

- **Nobody does a cold-start offline browser app.** Novelcrafter and Reedsy
  are online only. Ellipsus and Novlr buffer edits in the browser but cannot
  open a document offline. Dabble comes closest, and on iOS it is a PWA too.
  Apps with real offline (Scrivener, Ulysses, iA Writer, Obsidian, Bibisco,
  Manuskript) are native or desktop.
- **Conflict handling is weak almost everywhere.** Scrivener drops copies in a
  folder. Bibisco and Campfire ask you to pick a version. iA Writer asks too.
  Obsidian merges text but can duplicate it, and uses last-write-wins for
  everything else. Dabble merges but warns you may have to clean up. Only
  Ellipsus claims a CRDT, and only behind a server.
- **Markdown round-trip is rare.** iA Writer and Obsidian store Markdown.
  Novelcrafter, Dabble and Ellipsus import and export it. Everyone else is
  DOCX, RTF or a closed format.
- **No app ships a first-party MCP or agent API.** Novelcrafter is the only
  one with BYO key. Obsidian has an official CLI and community MCPs. Ellipsus,
  Novlr, Dabble, Plottr and Reedsy say no to generative AI, and the r/writers
  threads lean the same way.
- **Project-level to-dos are almost absent.** Status and labels exist per
  scene (Scrivener, Manuskript, Campfire, Dabble). Only LivingWriter has a
  to-do list, and Novelcrafter calls snippets "notes and to-dos". Promptbook's
  per-category to-do templates have no real precedent.
- **The scene-by-thread grid is everywhere** in novel tools: Plottr, Dabble,
  Novlr, Novelcrafter's matrix. Writers use it to see which plot line touches
  which scene.

## Comparison

| App          | Prep structure                                   | Offline and sync                                | Format and export                      | AI                                 | Platforms                       | Price                                |
| ------------ | ------------------------------------------------ | ----------------------------------------------- | -------------------------------------- | ---------------------------------- | ------------------------------- | ------------------------------------ |
| Scrivener    | Binder, corkboard, outliner, status, labels      | Local; Dropbox by hand; conflicts to a folder   | RTF package; compile to many formats   | None (Apple Writing Tools); 3P MCP | Mac, Win, iOS                   | One-time, Mac $59.99, iOS $23.99     |
| Obsidian     | Links, backlinks, Bases, Canvas, Longform plugin | Local; Sync merges text, LWW for other files    | Markdown, JSON Canvas                  | Plugins; official CLI; 3P MCP      | Mac, Win, Linux, iOS, Android   | Free; Sync $4–8/month                |
| Ulysses      | Sheets, groups, goals with deadline, material    | Local; iCloud only; conflicts undocumented      | Closed library; exports Markdown, DOCX | Apple Writing Tools, Siri          | Mac, iPad, iPhone               | $39.99/year                          |
| iA Writer    | Files, wikilinks, transclusion, authorship marks | Local; iCloud or any folder; pick a version     | Plain Markdown                         | None; marks AI text                | Mac, Win, iOS                   | One-time, $29.99–49.99               |
| Novelcrafter | Plan grid and matrix, codex, alias detection     | Online only                                     | Imports and exports Markdown, DOCX     | BYO key, per-entry context rules   | Web                             | $4–20/month                          |
| Plottr       | Plotline timeline, story bible, templates        | Desktop files or cloud Pro; Pro offline in beta | Word, Scrivener; no Markdown           | None, by policy                    | Mac, Win; web with Pro          | $60/year or $150 lifetime; Pro more  |
| Campfire     | 18 entity modules, timeline, calendars           | Offline on desktop only; pick a version         | DOCX, PDF, EPUB; no Markdown           | None found                         | Web, Mac, Win, mobile (limited) | Free with caps; $12/month; modules   |
| Dabble       | Scenes, plot grid tied to scenes, templates      | Local-first, change sync, merges                | Imports and exports Markdown, DOCX     | None, by policy                    | Win, Mac, Linux, PWA on mobile  | $19–49/month; $699 lifetime          |
| Ellipsus     | Drafts as branches, heading outline, templates   | CRDT; browser cannot open offline; Android can  | Markdown, DOCX, PDF; main text only    | None, by policy                    | Web, Android                    | Free; Plus $6/month or $99           |
| Novlr        | Sections-by-threads grid, notes, goals           | Browser buffer; must open online first          | DOCX, EPUB, PDF; no Markdown           | None, by policy; proofreader       | Web                             | Free; $8–16/month; $499 lifetime     |
| Bibisco      | Scenes, typed entities, timeline, groups         | Desktop local; paid sync, pick a version        | JSON project; PDF, DOCX; no Markdown   | None found                         | Win, Mac, Linux, Android, iOS   | Free; $69 one-time; sync $29.99/year |
| Manuskript   | Snowflake, plots, world tree, status and labels  | Desktop local; git-friendly folder              | Plain text; pandoc exports             | None found                         | Linux, Win (Mac from source)    | Free, GPL                            |

## Ideas to borrow, ranked

Phases are the ones in design.md. "Not in design" means the idea needs a
design change first.

1. **Honest sync state**, from Dabble and Ellipsus: an icon that says synced,
   saved on this device only, or not saved, and a loud alert when local
   storage fails or the browser is private. Offline is the hard requirement,
   so the user must always know where the text is. Phase 1.
2. **Section-level MCP edits**, from Obsidian's Local REST API: Claude reads
   and replaces one scene (`### S3.`), one field or one log entry, never the
   whole document. A small Yjs change merges cleanly with offline edits; a
   whole-document rewrite would not. Phase 1.
3. **Snapshots with compare**, from Scrivener and Ellipsus: a named snapshot
   per project, taken by hand and automatically before each Claude write, kept
   on the server, with a diff view and restore. Yjs merges silently, so this
   is the undo for a bad merge or a bad Claude edit. Phase 1 (not in design).
4. **Scene outline from headings**, from Ellipsus, Scrivener's binder and
   Longform: a sidebar list built from the `### S1. Name` headings, click to
   jump, drag to reorder the Markdown section. The template already has the
   structure; the outline costs little and makes long adventures navigable.
   Phase 1.
5. **Project templates per category**, from Dabble and Ulysses: a new project
   starts with a skeleton prep document as well as the to-do list, both
   copied from the category's template. It extends the to-do template idea
   already decided. Phase 1.
6. **Material kept out of the output**, from Ulysses: the brainstorm log,
   notes and rejected ideas live in the project but never reach the PDF or
   the `.cbpack`. Design already implies it; make it a rule. Phases 1 and 4.
7. **Per-scene status and labels from user-defined lists**, from Scrivener and
   Manuskript: for example "to write", "drafted", "checked", stored in the
   Yjs document, not in the Markdown, so the template stays strict. Shows
   which scenes are left without a to-do item for each. Phase 1 or later (not
   in design).
8. **Authorship marks**, from iA Writer: show which text Claude wrote through
   MCP, kept as Yjs data beside the text. Useful when re-reading a merged
   brainstorm. Phase 5 (not in design).
9. **Context rules for Claude**, from Novelcrafter: mark parts of a project
   (a log entry, a note) as "always give Claude" or "never give Claude", and
   have the MCP's brief tool follow them. Keeps the brief short as a campaign
   grows. Phase 1 brief, rules later (not in design).
10. **Threads-by-scenes grid**, from Plottr, Novlr and Dabble: for a campaign,
    rows are NPCs, clues or factions and columns are scenes or adventures,
    with a note in each cell. Only worth it if campaigns get entities. Later
    (not in design).
11. **Alias detection**, from Novelcrafter: highlight NPC and place names with
    aliases and an exclusion list. Depends on idea 10's entities. Later (not
    in design).
12. **Lossless Markdown export of a whole project**, a gap in the field: one
    folder with the prep document, log and to-do list as Markdown with front
    matter, the mirror of the import already decided. Phase 1 (not in design;
    import is).

## Things to avoid

- **"Pick a version" conflict dialogs** (Scrivener, Bibisco, Campfire, iA
  Writer). Yjs exists to make them unnecessary; keep every piece of state,
  to-do list and asset statuses included, inside the Yjs document.
- **Last-write-wins for structured data** (Obsidian for canvases and
  settings). The to-do list and the asset board must be Yjs types, not a JSON
  blob saved whole.
- **Offline that needs a recent online visit** (Novlr, the Ellipsus browser,
  Novelcrafter with no offline at all). Test a cold start in airplane mode on
  the iPad as part of phase 1.
- **Whole-document rewrites that merge into duplicates** (Obsidian
  diff-match-patch, Dabble's "saving too much"). The MCP must send small
  edits; see idea 2.
- **Lossy export** (Ulysses external folders, Ellipsus without drafts, Dabble
  and Reedsy without notes). Whatever the app holds must leave it as Markdown.
- **Closed import** (Bibisco reads only its own archives). Markdown in, any
  folder.
- **Feature sprawl** (Campfire's 18 modules, word-count streaks and sprints).
  A GM prepares a session, not a novel; skip word goals.
- **Fixed entity types** (Novelcrafter), if entities ever come.
- **Core features left to plugins** (Obsidian). Promptbook is one user's
  tool; build the few features it needs into the app.

## Sources

Reddit (read through the Atom feeds):

- [r/writers: Writing App (2024-06-20)](https://www.reddit.com/r/writers/comments/1dk212v/writing_app/)
- [r/writers: This sub when you ask what's the best app to write on (2026-09-17)](https://www.reddit.com/r/writers/comments/1wj4646/this_sub_when_you_ask_whats_the_best_app_to_write/)
- [r/writers: 9 Reasons Google Docs is an awful tool for writers (2026-09-29)](https://www.reddit.com/r/writers/comments/1wtbhwr/9_reasons_google_docs_is_an_awful_tool_for_writers/)
- [r/writers: Sharing resources you may not have heard of (2025-05-25)](https://www.reddit.com/r/writers/comments/1kv4ett/sharing_resources_you_may_not_have_heard_of/)

Scrivener:

- [Scrivener overview](https://www.literatureandlatte.com/scrivener/overview)
- [Scrivener macOS release notes](https://www.literatureandlatte.com/scrivener/release-notes?os=macOS)
- [Using Scrivener with Dropbox](https://scrivener.tenderapp.com/help/kb/features-and-usage/using-scrivener-with-dropbox)
- [Google Drive advisory](https://scrivener.tenderapp.com/help/kb/cloud-syncing/google-drive-advisory)
- [Dropbox syncing with iOS](https://scrivener.tenderapp.com/help/kb/ios/dropbox-syncing-with-ios)
- [Syncing Scrivener projects to the cloud (blog, 2026)](https://www.literatureandlatte.com/blog/syncing-scrivener-projects-to-the-cloud)
- [Scrivener store](https://www.literatureandlatte.com/store/scrivener)
- [Scrivener 3 on the Mac App Store](https://apps.apple.com/us/app/scrivener-3/id1310686187)
- [Forum: backtracking document links](https://forum.literatureandlatte.com/t/is-there-a-way-to-backtrack-document-links-e-g-find-which-docs-have-linked-to-another-doc-within-scrivener/131816)
- [Forum: plain text](https://forum.literatureandlatte.com/t/plain-text/32637)
- [Forum: external folder round trip with Markdown](https://forum.literatureandlatte.com/t/sync-folder-a-question-about-the-round-trip-with-markdown/152941)
- [scrivener-mcp (Glama listing)](https://glama.ai/mcp/servers/writerslogic/scrivener-mcp)
- [Aeon Timeline: sync with Scrivener](https://www.aeontimeline.com/guides/sync-with-scrivener)

Obsidian:

- [Obsidian 1.9.0 changelog (Bases)](https://obsidian.md/changelog/2025-05-21-desktop-v1.9.0/)
- [Obsidian changelog](https://obsidian.md/changelog/)
- [Bases help](https://obsidian.md/help/bases)
- [Canvas help](https://obsidian.md/help/plugins/canvas)
- [Templates help](https://obsidian.md/help/plugins/templates)
- [File recovery help](https://obsidian.md/help/plugins/file-recovery)
- [Sync troubleshooting and conflicts](https://obsidian.md/help/sync/troubleshoot)
- [Sync plans](https://obsidian.md/help/sync/plans)
- [Obsidian Sync](https://obsidian.md/sync)
- [Sync your notes across devices](https://obsidian.md/help/sync-notes)
- [Obsidian CLI](https://obsidian.md/help/cli)
- [Obsidian pricing](https://obsidian.md/pricing)
- [Obsidian download](https://obsidian.md/download)
- [Obsidian about](https://obsidian.md/about)
- [Longform plugin](https://github.com/kevboh/longform)
- [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills)
- [Local REST API plugin (with MCP)](https://github.com/coddingtonbear/obsidian-local-rest-api)
- [Forum: robust sync conflict resolution](https://forum.obsidian.md/t/robust-sync-conflict-resolution/93544)
- [javalent TTRPG plugins](https://plugins.javalent.com/)
- [TTRPG plugins roundup (obsidianstats)](https://www.obsidianstats.com/posts/2026-08-11-ttrpg-plugins)
- [Obsidian AI plugins (dsebastien)](https://www.dsebastien.net/obsidian-ai-plugins/)

Ulysses:

- [Ulysses library help](https://help.ulysses.app/en_US/the-library)
- [Ulysses releases](https://ulysses.app/releases/)
- [Ulysses 41 (9to5Mac)](https://9to5mac.com/?p=1069852)
- [Ulysses goals](https://help.ulysses.app/goals)
- [Ulysses 19 review (MacStories)](https://www.macstories.net/reviews/ulysses-19-brings-cursor-support-external-folders-material-sheets-and-more/)
- [Organizing writing in Ulysses (The Sweet Setup)](https://thesweetsetup.com/how-to-organize-your-writing-in-ulysses/)
- [Ulysses backups](https://blog.ulysses.app/backup/)
- [Ulysses synchronization issues](https://help.ulysses.app/synchronization-issues)
- [Ulysses external folders](https://help.ulysses.app/troubleshooting/456789-external-folders)
- [Ulysses export](https://help.ulysses.app/export)
- [Ulysses home](https://ulysses.app/)
- [Ulysses pricing](https://ulysses.app/pricing/)
- [Ulysses community MCP (aibase)](https://mcp.aibase.com/server/1574493239556448316)

iA Writer:

- [Organize the library](https://ia.net/writer/support/library/organize)
- [Wikilinks](https://ia.net/writer/support/library/wikilinks)
- [Content Blocks](https://ia.net/writer/support/library/content-blocks)
- [Metadata](https://ia.net/writer/support/editor/metadata)
- [Authorship](https://ia.net/writer/support/editor/authorship)
- [iA Writer 7](https://ia.net/topics/ia-writer-7)
- [Cloud storage](https://ia.net/writer/support/library/cloud-storage)
- [iCloud help](https://ia.net/writer/support/help/icloud)
- [Versions and backups](https://ia.net/writer/support/help/versions-and-backups)
- [iA Writer](https://ia.net/writer)
- [iA Writer pricing](https://ia.net/writer/pricing)
- [Android FAQ](https://ia.net/writer/support/help/faq/faq-android)

Novelcrafter:

- [Features](https://www.novelcrafter.com/features)
- [The plan interface](https://www.novelcrafter.com/help/docs/plan/the-plan-interface)
- [Planning with the matrix](https://www.novelcrafter.com/help/docs/plan/planning-with-the-matrix)
- [Codex types](https://www.novelcrafter.com/help/docs/codex/codex-types)
- [Codex aliases](https://www.novelcrafter.com/help/docs/codex/aliases)
- [Codex tracking and AI context](https://www.novelcrafter.com/help/docs/codex/codex-tracking)
- [Progressions](https://www.novelcrafter.com/help/docs/codex/progressions-additions)
- [Series codex](https://www.novelcrafter.com/help/docs/codex/series-codex)
- [Changelog](https://www.novelcrafter.com/changelog)
- [FAQ: offline mode](https://www.novelcrafter.com/help/faq/general/can-i-use-nc-in-ofline-mode)
- [Community update, September 2025](https://www.novelcrafter.com/blog/2025-09-community-update)
- [Import](https://www.novelcrafter.com/help/categories/import#section-docs)
- [Export a novel](https://www.novelcrafter.com/help/docs/export/novel)
- [AI connections](https://www.novelcrafter.com/help/categories/ai-connections#section-docs)
- [Web app FAQ](https://www.novelcrafter.com/help/faq/general/web-app)
- [Pricing](https://www.novelcrafter.com/pricing)

Plottr:

- [Features](https://plottr.com/features/)
- [Plottr vs Plottr Pro](https://plottr.com/?p=45922)
- [Changelog](https://plottr.com/changelog/)
- [Pricing](https://plottr.com/pricing/)
- [Exporting](https://docs.plottr.com/article/66-exporting)
- [Import from Word](https://docs.plottr.com/article/122-import-from-word-into-plottr)
- [Mobile app notice](https://docs.plottr.com/article/117-mobile-new-mobile-app-incoming-please-read)

Campfire:

- [Pricing and modules](https://www.campfirewriting.com/pricing)
- [Story planner](https://www.campfirewriting.com/story-planner)
- [Panels tutorial](https://www.campfirewriting.com/learn/panels-tutorial)
- [Panel visibility tutorial](https://www.campfirewriting.com/learn/panel-visibility-tutorial)
- [Project linking tutorial](https://campfirewriting.com/learn/project-linking-tutorial)
- [FAQ](https://www.campfirewriting.com/faq)
- [Apps](https://www.campfirewriting.com/apps)
- [Campfire pricing (chapter.pub)](https://blog.chapter.pub/campfire-pricing/)
- [Campfire review (Kindlepreneur)](https://kindlepreneur.com/campfire-review/)

Dabble:

- [How Dabble organizes your story](https://www.dabblewriter.com/docs/planning-story-notes/how-dabble-organizes-your-story)
- [Plot grid](https://www.dabblewriter.com/docs/planning-story-notes/using-the-plot-grid)
- [Mentions](https://www.dabblewriter.com/docs/planning-story-notes/mentions)
- [Templates](https://www.dabblewriter.com/docs/planning-story-notes/using-templates)
- [Labels](https://www.dabblewriter.com/docs/planning-story-notes/labels)
- [Goals and progress](https://www.dabblewriter.com/docs/goals-progress/)
- [Release notes](https://www.dabblewriter.com/docs/reference/release-notes/)
- [How sync works](https://www.dabblewriter.com/docs/apps-sync-offline/how-sync-works)
- [Sync status icons](https://www.dabblewriter.com/docs/apps-sync-offline/sync-status-icons)
- [How Dabble works offline (older help)](https://help.dabblewriter.com/en/articles/5491370-how-does-dabble-work-offline)
- [Import](https://www.dabblewriter.com/docs/import-export-printing/import-your-manuscript)
- [Export](https://www.dabblewriter.com/docs/import-export-printing/export-your-manuscript)
- [Desktop app](https://www.dabblewriter.com/docs/apps-sync-offline/install-desktop-app)
- [Install on mobile](https://www.dabblewriter.com/docs/apps-sync-offline/install-on-mobile)
- [Pricing](https://www.dabblewriter.com/pricing)

Ellipsus:

- [Documents and drafts](https://help.ellipsus.com/support/solutions/articles/205000067235-understanding-documents-and-drafts)
- [Compare and merge drafts](https://help.ellipsus.com/support/solutions/articles/205000067239-compare-and-merge-drafts)
- [Outlines](https://help.ellipsus.com/support/solutions/articles/205000067307-outlines)
- [Templates](https://help.ellipsus.com/support/solutions/articles/205000067260-templates)
- [Can I use Ellipsus offline?](https://help.ellipsus.com/support/solutions/articles/205000068037-can-i-use-ellipsus-offline-)
- [Sync issues and unsaved changes](https://help.ellipsus.com/support/solutions/articles/205000067323-sync-issues-unsaved-changes)
- [Creating and importing documents](https://help.ellipsus.com/support/solutions/articles/205000067236-how-to-create-a-document)
- [Exporting](https://help.ellipsus.com/support/solutions/articles/205000067275)
- [Open beta announcement](https://ellipsus.com/blog/ellipsus-open-beta)
- [What's new](https://ellipsus.com/blog/whats-new)
- [Generative AI stance](https://ellipsus.com/generative-ai)
- [Download](https://ellipsus.com/download)
- [Plus](https://ellipsus.com/plus)

Novlr:

- [Planning tool release](https://roadmap.novlr.org/changelog/new-release-the-planning-tool)
- [Changelog](https://roadmap.novlr.org/changelog)
- [Can I use Novlr offline?](https://help.novlr.org/en/article/can-i-use-novlr-offline-ctck05/)
- [Offline app request](https://roadmap.novlr.org/features/posts/offline-app)
- [Import a project](https://help.novlr.org/en/article/how-do-i-import-an-existing-project-into-novlr-sa02kl/)
- [About (AI stance)](https://www.novlr.org/about)
- [Pricing](https://novlr.org/pricing)
- [Writing studio](https://novlr.org/writing-studio)

Bibisco:

- [Features](https://bibisco.com/writer-software-bibisco-features/)
- [Community vs Supporters editions](https://bibisco.com/docs/differences-between-community-and-supporters-editions/)
- [bibisco 5 release notes](https://bibisco.com/docs/bibisco-5-release-notes/)
- [FAQ](https://bibisco.com/bibisco-faq/)
- [Projects directory structure](https://bibisco.com/docs/projects-directory-structure/)
- [Saving projects on a cloud drive](https://bibisco.com/docs/how-to-save-projects-on-a-cloud-drive/)
- [bibisco Everywhere setup](https://bibisco.com/docs/how-to-set-up-bibisco-everywhere/)
- [bibisco Everywhere](https://bibisco.com/bibisco-everywhere/)
- [Import FAQ](https://docs.bibisco.com/faq/im-trying-to-import-a-doc-docx-odt-tx-file-as-a-project-but-i-get-invalid-archive.-what-can-i-do)
- [Download and prices](https://bibisco.com/novel-writing-software-download/)
- [bibisco on GitHub](https://github.com/andreafeccomandi/bibisco)
- [bibisco review (opensource.com, 2016)](https://opensource.com/life/16/9/bibisco-tool-novelists)

Manuskript:

- [Manuskript home](https://www.theologeek.ch/manuskript/)
- [Manuskript on GitHub](https://github.com/olivierkes/manuskript)
- [Overview of panes](https://github.com/olivierkes/manuskript/wiki/Overview-of-Manuskript-Panes)
- [Open plain-text file format](https://www.theologeek.ch/manuskript/2016/03/31/open-plain-text-file-format/)
- [Manuskript 0.17.0](https://www.theologeek.ch/manuskript/2025/06/30/manuskript-0-17-0/)
- [Releases](https://github.com/olivierkes/manuskript/releases)
- [Download](https://www.theologeek.ch/manuskript/download/)

Also checked:

- [Reedsy Studio](https://reedsy.com/studio)
- [Reedsy Studio: plan a book](https://reedsy.com/studio/plan-a-book)
- [Reedsy Studio: write a book (offline answer)](https://reedsy.com/studio/write-a-book)
- [Reedsy Studio pricing](https://reedsy.com/studio/pricing/)
- [LivingWriter](https://livingwriter.com)
- [LivingWriter downloads](https://livingwriter.com/en/downloads)
- [LivingWriter review (Kindlepreneur)](https://kindlepreneur.com/living-writer-review)
- [Pluot](https://pluot.app/)
- [Diarium](https://diariumapp.com)
- [Writer's Companion on the App Store](https://apps.apple.com/us/app/writers-companion/id1556248258)
