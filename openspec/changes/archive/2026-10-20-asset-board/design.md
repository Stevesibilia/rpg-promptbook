## Context

Phase 2 of `docs/design.md` (Asset board, Intake by filename). The agreed
mockup is [docs/mockups/board.html](../../../docs/mockups/board.html)
(artifact `https://claude.ai/artifact/1Gen9EfkWntxmm6wmj7GUD`), with ten
screens: board, no prompts yet, no appendix, dropping, after a drop with the
Unmatched tray, matching help, image viewer, edit a prompt, desktop offline,
phone width. Implementers cannot easily open it, so "Mockup in words" below
gives every screen with its exact strings.

The owner answered on 2026-10-20: full release `v0.6.0` with an owner
preview before the merge; prompts written by Claude through new connector
tools and editable by hand, so the app needs no AI; files on a persistent
volume on the server, named by hash; the desktop keeps every file of every
project; the volume's backup is decided later with the infrastructure. The
architect's decisions (D1 to D14 of the brief) are expanded below; where they
left a choice to the plan, the choice is made here and marked **Plan
decision**.

### The code today

- **Appendix.** `promptbook-format` parses `## Appendice: immagini e musica`
  (template `avventura`, section role `appendix`,
  `format/src/template/avventura.ts:45-50`; keys `visual` and `mood` at
  `:136`) into `Model.appendix: AppendixRow[]` with `sceneId`, `title`,
  `heading`, `range`, `headingRange`, `visual` and `mood` (`{ text, range }`
  or null) (`format/src/model.ts:295-303`, read by `readAppendixRow` in
  `format/src/parse/sections.ts:218-260`). `checks/appendix.ts` warns
  `appendix.row.missing`, `appendix.row.orphan`, `appendix.title.mismatch`,
  `appendix.key.missing`, and errs `appendix.key.outside`. Adventures and
  one-shots are both parsed with `avventura` (`project/src/summary.ts:71`);
  a campaign has a plain skeleton and no checks
  (`project/src/skeleton.ts:50-55`). Scene ids are never renumbered
  (`web/src/editor/moveScene.ts:16-21`).
- **Project document.** `packages/project/src/doc.ts:30-58`: `meta`,
  `document`, `todo`, `seed`, and from the connector change `inspiration`,
  `researchTopics`, `researchNotes`, `brainstorm`, each a `Y.Array` of
  `Y.Map`; `SCHEMA = 1` (`model.ts:5`); `authors = ['user', 'claude']`
  (`model.ts:57`); `LIMITS` and `CAPS` (`model.ts:127`, `:138`); ids from
  `crypto.randomUUID` (`doc.ts:63`). Export: `exportProject` returns a map of
  text files (`export.ts:111-137`).
- **Server.** Fastify with a global `bodyLimit` of 1 MB (`server/src/app.ts:41`);
  routes registered at `:72-80`. Helmet's CSP with `img-src 'self' data:
blob:` and no `media-src` (`web.ts:13-24`). No file storage exists.
  `purge(db)` (`projects.ts:362-388`) runs at start and hourly
  (`main.ts:9`, `:25-33`). Config by zod from the environment
  (`config.ts:45-59`); no data folder setting. Export builds the whole zip in
  memory with `fflate`'s `zipSync` (`routes/transfer.ts:104-124`).
- **Snapshots.** Postgres `snapshots` (`migrations/003_connector.sql:78-97`):
  `kind in ('claude', 'user', 'restore')` (inline check, so named
  `snapshots_kind_check`), `label`, `text`, `words`, `tool`, `target`,
  `before_section`, `after_hash`. They hold **the prep document's text
  only**. `insertSnapshot` (`snapshots.ts:125`), `snapshotThenWrite`
  (`:200`), `restoreSnapshot` (`:253`), `CLAUDE_SNAPSHOTS_MAX = 200`
  (`:148`). The list route takes `kind` and `limit`
  (`routes/snapshots.ts:22-25`). The web's Claude banner shows the newest
  Claude snapshot (`web/src/claude/banner.ts`, fetched with
  `kind=claude&limit=1`); History titles in `web/src/history/labels.ts:31-36`.
- **MCP.** 17 tools in `TOOL_NAMES` (`server/src/mcp/tools.ts:44-62`),
  `INSTRUCTIONS` (`:65`), a `tool()` wrapper with the scope check in `registerTools`
  (`:106`), 120 writes per grant per 10 minutes (`mcp/quota.ts`). Only
  the two prep-document writes (`replace_section`, `add_scene`) store a
  snapshot (`mcp/edits.ts:190-222`); the other writes go through
  `withLiveDocument` (`live.ts:61`) with none.
- **Desktop.** Per-account SQLite store with `docs`, `doc_updates`,
  `projects`, `snapshots` (text only), `server_cache`, `kv`, migrated by
  `user_version`, `SCHEMA_VERSION = 1` (`desktop/src/main/store.ts:65-105`,
  `:152-160`). `promptbook://app/` served by `protocol.ts` with its own CSP
  (`:15-27`, no `media-src`). Bridge channels `pb:<area>:<verb>` in
  `web/src/platform/bridge.ts:8-41`; `DeviceUsage { bytes, projects,
localSnapshots }` (`:71-76`); IPC argument checks in `main/ipc.ts`
  (`MAX_FILE_BYTES = 200 MB` for saves). First sync from `downloaded` per
  project (`main/sync.ts:67`, `:184`, `:422`). Sign-out with removal deletes
  the account folder (`main/app.ts:435-445`). Router merges snapshot lists
  and applies `limit` (`main/router.ts:280-281`).
- **Web.** Route `/projects/:id/:view?` (`web/src/AppRoutes.tsx:25`);
  `projectViews = ['inspiration', 'research', 'log', 'history']`
  (`project/ProjectView.tsx:13`); rail entries `projectEntries`
  (`shell/Shell.tsx:24-30`); icons `ui/icons.tsx`; views CSS
  `project/views.css`. The editor's parse worker client
  `createAnalysisClient` (`editor/analysis/client.ts:41`). Clipboard with a
  select-for-⌘C fallback outside a secure context
  (`connect/ConnectedApps.tsx:43-46`).
- **Deployment.** Chart `charts/rpg-promptbook`: one replica, **already
  `strategy: Recreate`** (`templates/deployment.yaml:19-20`), pod
  `runAsUser: 65532` with no `fsGroup` (`:39-44`), read-only root, only an
  `emptyDir` at `/tmp` (`:169-174`). `compose.yaml` has only the `postgres`
  volume. The image runs as 65532 on Hummingbird's runtime with
  `WORKDIR /app/packages/server` (`Dockerfile`).
- **Skills.** `midjourney-prompts`: English; `[subject], [setting],
[lighting], [style], [mood] --ar … --v …`, 16:9 for scenes, default
  `--v 8.1`, no junk tokens, one idea per prompt. `suno-prompts`: English;
  Style `[genre], [tempo], [instruments], [texture], [mood]` with 4 to 7
  descriptors; Lyrics field of meta tags closing with `[End]`; instrumental
  by default; "Instrumental: ON · Weirdness: low · Style Influence: strong ·
  Exclude: vocals". The skill has no title: the board adds Title.

### Corrections to the brief's facts

1. **Snapshots hold only the prep document's text**, so "History snapshots
   cover it" (D1), "snapshot before the write like other Claude writes"
   (D7) and "never delete what a snapshot references" (D3) had nothing to
   stand on. The architect ruled (D8): snapshots stay text only, prompts are
   not versioned, and the sweep (D6) looks only at current documents.
2. **Only document writes snapshot today** (`replace_section`,
   `add_scene`); `add_todo`, `add_inspiration_item` and the rest do not.
3. **The chart's strategy is already `Recreate`**; D11 adds the volume and
   `fsGroup` only.
4. **`AppendixRow`** is at `model.ts:295-303`; the template folder is
   `format/src/template/` (singular).
5. **Import takes Markdown notes, not zips**, so "import ignores them"
   (D10) needs no code.
6. **A nested `Y.Map` per scene loses data** when two replicas create it
   concurrently (offline desktop and Claude on the server): Yjs keeps one of
   the two maps under the key. D1 keeps the brief's fields but stores them
   under flat keys.
7. **Midjourney drops apostrophes** in filenames (the mockup's
   `ruined_doctors_office…` for "doctor's"), so the brief's normalisation
   (non-alphanumerics to a space) would miss; D10 compares with every
   non-letter, non-digit removed.

## Goals / Non-Goals

**Goals:**

- One board per adventure or one-shot with a Midjourney and a Suno prompt per
  appendix row, written by Claude through the connector or by hand.
- Drop the whole Downloads batch: each file finds its scene by its name; the
  rest wait in a tray.
- Files stored once per content on the server, reachable only by their
  owner, removed 30 days after no document lists them.
- The desktop works with the board offline, files included.

**Non-Goals** (owner's scope):

- Images in the PDF; a missing-image check; the GM-only flag and GM note per
  image; NPC portrait rows; several image prompts per scene.
- API generators (Gemini, Ace Data); the `.cbpack` export (phase 3).
- Backing up the files volume.
- Also not built: the mockup's top-bar theme toggle and status-bar Claude
  connection item (as in the connector change); versions of the prompts
  (D8).

## Decisions

### D1. Board data in the project's Yjs document

Two new top-level types in `packages/project/src/doc.ts`'s shape, documented
in its header comment. `SCHEMA` stays 1, as in the connector change: older
clients leave unknown types alone, older documents read them as empty.

```
board   Y.Map, keys "<sceneId>/<part>", plain JSON values set whole:
  "S3/image"        { prompt, by, at }
  "S3/music"        { title, style, lyrics, by, at }
  "S3/chosenImage"  file id | null
  "S3/chosenTrack"  file id | null
files   Y.Array of Y.Map:
  id, sha256, thumbSha256, name, kind, mime, size, width, height, duration,
  sceneId, matchedBy, addedAt, addedBy
  kind: 'image' | 'audio'; thumbSha256, width, height null for audio;
  duration (seconds) null for images; sceneId null = Unmatched tray;
  matchedBy: 'prompt' | 'title' | 'hand' | null; by, addedBy: 'user' | 'claude';
  at, addedAt: ISO date-time
```

The brief's fields (`imagePrompt`, `imageBy`, `imageAt`, `musicTitle`, …,
`chosenImage`, `chosenTrack`) are all here, grouped per half under flat keys
(correction 6): two replicas writing different halves of one scene merge;
two writing the same half keep the last, as for any one field.

Module `packages/project/src/board.ts`, each writer one transaction:

```ts
readBoard(doc): Map<string, BoardEntry>   // { image, music, chosenImage, chosenTrack }
readFiles(doc): FileEntry[]               // addedAt, then id
setImagePrompt(doc, sceneId, prompt: string, by: Author, at?: string): void   // '' clears
setMusicPrompt(doc, sceneId, m: { title; style; lyrics }, by: Author, at?): void
addFiles(doc, files: NewFile[]): { added: FileEntry[]; skipped: NewFile[] }    // skips a sha256 already listed
assignFile(doc, fileId, sceneId: string | null, matchedBy = 'hand'): void      // unchooses it in the old scene
removeFile(doc, fileId): void                                                   // unchooses it
chooseFile(doc, sceneId, kind: 'image' | 'audio', fileId: string | null): void
```

Readers trust nothing (as `doc.ts` does): a file whose `sha256` is not 64
lower-case hex, whose `kind` is unknown or whose `id` is not a string is
skipped; a chosen id that names no file of that scene and kind reads as
null. Limits in `LIMITS`: image prompt 2000 characters, music title 120,
style 1000 (**plan decision**: Suno's style field limit), lyrics 3000, file
name 255; `CAPS.files` 2000 per project. The writers and the MCP schemas
check them.

### D2. Rows and statuses, derived

`boardRows(appendix: AppendixRow[], board, files): BoardRow[]` (pure, in
`board.ts`): one row per appendix row with a `sceneId`, in document order;
`{ sceneId, title, visual, mood, image, music, images, tracks, chosenImage,
chosenTrack, imageStatus, musicStatus, duplicateTitle }`. Status per half:
`wanted` (no file of that kind with this `sceneId`), `received` (files, none
chosen), `chosen`. Never stored. `unmatchedFiles(appendix, files)`: files
with `sceneId` null **or naming a scene with no appendix row** (**plan
decision** for the brief's "entries not in the appendix": their prompts are
kept and not shown; their files go to the tray with the reason "Scene S6 is
not in the appendix.", so no file is ever hidden). `duplicateTitles(rows)`:
music titles whose match key (D10) two rows share.

The web board parses the document with the editor's worker client
(`createAnalysisClient` with `connectWorker`, debounced as the editor),
never on the main thread.

### D3. Server file store behind `BlobStore`

`packages/server/src/files/blobs.ts`:

```ts
interface BlobStore {
  has(sha256: string): Promise<boolean>;
  // Streams `body` to a temporary file while hashing it; refuses past
  // `maxBytes`; on a hash other than `sha256` deletes it and throws
  // HashMismatch; otherwise moves it into place (no-op when present).
  put(sha256: string, body: Readable, opts: { maxBytes: number }): Promise<{ size: number }>;
  get(sha256: string, range?: { start: number; end: number }): Promise<{ stream: Readable; size: number } | null>;
  delete(sha256: string): Promise<void>;
  list(): AsyncIterable<{ sha256: string; mtimeMs: number }>;
}
class FsBlobStore implements BlobStore   // <dataDir>/files/<aa>/<sha256>, temp in <dataDir>/files/tmp/
```

The temporary folder sits on the same volume so the move is a rename. At
start the server creates `<dataDir>/files/tmp`, empties it, and stops with a
`ConfigError` naming `PROMPTBOOK_DATA_DIR` when it cannot write there. S3
can replace `FsBlobStore` later behind the same interface.

`packages/project/src/sniff.ts` (shared with the desktop):
`sniff(head: Uint8Array): { kind: 'image' | 'audio'; mime: string } | null`
from magic bytes: PNG `89 50 4E 47`; JPEG `FF D8 FF`; WebP `RIFF….WEBP`;
MP3 `ID3` or a frame sync `FF Ex/Fx` with layer III; AAC ADTS `FF F1`/`FF F9`;
M4A `….ftyp` with brand `M4A `, `M4B `, `mp42` or `isom` (`audio/mp4`); WAV
`RIFF….WAVE`; Ogg `OggS`; FLAC `fLaC`. Limits: images 40 MB, audio 80 MB.

### D4. Migration `005_files.sql`

```sql
create table files (
  sha256 text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
  size bigint not null check (size > 0),
  mime text not null,
  created_at timestamptz not null default now(),
  created_by uuid references users on delete set null
);
create table project_files (
  project_id uuid not null references projects on delete cascade,
  sha256 text not null references files,
  added_at timestamptz not null default now(),
  -- Set by the sweep when the project's document stopped listing the file,
  -- cleared when it lists it again (D6).
  unreferenced_since timestamptz,
  primary key (project_id, sha256)
);
create index project_files_sha on project_files (sha256);
```

Removing a project for good (bin purge) cascades its `project_files` rows.
The `snapshots` table is not touched.

### D5. File routes

`routes/files.ts`, registered in its own plugin scope with a no-op content
type parser for `application/octet-stream` (the handler reads `req.raw`), so
the global 1 MB limit never buffers a file. Session or app bearer as every
project route; a project that is not the user's or is in the bin is 404
`not_found`.

**`PUT /api/projects/:id/files/:sha256`**, raw bytes:

| Check, in order                                                       | Answer                                    |
| --------------------------------------------------------------------- | ----------------------------------------- |
| `:sha256` not 64 lower-case hex                                       | 400 `validation_error`                    |
| project missing, another user's, or in the bin                        | 404 `not_found`                           |
| no `Content-Length`                                                   | 411 `length_required`                     |
| `Content-Length` over 80 MB                                           | 413 `file_too_large`                      |
| the project already links this `sha256`                               | 200 `{ sha256, size, mime }`, body unread |
| user's total (distinct `sha256` over their projects) + length > quota | 507 `quota`                               |
| first bytes not a known type (D3)                                     | 415 `unsupported_type`                    |
| image over 40 MB                                                      | 413 `file_too_large`                      |
| bytes beyond `Content-Length` or the limit while streaming            | 413 `file_too_large`, nothing kept        |
| computed SHA-256 differs                                              | 400 `hash_mismatch`, nothing kept         |
| stored                                                                | 201 `{ sha256, size, mime }`              |

A file already stored for another project or user is still read and hashed
before it is linked, so knowing a hash never grants a file. The rows
(`files` on conflict do nothing, `project_files`) are written in one
transaction around the move into place.

**`GET /api/projects/:id/files/:sha256`** (and `HEAD`, which Fastify adds):
only when `project_files` links it, else 404. `Content-Type` the stored
`mime`, `Content-Length`, `Accept-Ranges: bytes`, `ETag: "<sha256>"`,
`Cache-Control: private, max-age=31536000, immutable`, `Content-Disposition:
inline`, helmet's `nosniff`; one `Range: bytes=a-b` gives 206 with
`Content-Range`, an unsatisfiable one 416. Streamed from the store. Intake
asks `HEAD` first: 200 means the project still links the file (a removed
file within the grace period, D6), so it is re-linked by adding the entry
again, with no upload.

Config (`config.ts`): `PROMPTBOOK_DATA_DIR` (default `./data`; the image sets
`/data`), `PROMPTBOOK_FILES_QUOTA_GB` (whole number, at least 1, default 20),
`PROMPTBOOK_FILES_GRACE_DAYS` (whole number, at least 1, default 30).

### D6. Sweep

`files/sweep.ts`, `sweepFiles(db, blobs)`, at start and every 24 hours from
`main.ts` (**plan decision**: daily, since it loads documents), apart from
the hourly `purge`:

1. For each project with `project_files` rows: the stored document's
   `readFiles` (`sha256` and `thumbSha256`) is the set it references. Rows in
   the set get `unreferenced_since = null`; rows outside it with a null
   `unreferenced_since` get `now()`; rows whose `unreferenced_since` is older
   than `PROMPTBOOK_FILES_GRACE_DAYS` are deleted.
2. `files` rows with no `project_files` row are deleted with their blob, so
   a file stays while any project links it.
3. Blobs on disk with no `files` row and older than 1 day (a crash between
   move and commit) are deleted; files in `tmp/` older than 1 day too.

An upload whose entry has not reached the stored document yet is marked
unreferenced at most once and cleared at the next sweep, well inside the
grace period. Within the grace period a dropped file is re-linked with no
upload (D5's `HEAD`). The window in which a sweep drops a link at the moment
the same file is dropped again is a second once a day; the file then shows
an empty tile until dropped again.

### D7. Content security policy

The server's helmet directives gain `mediaSrc: ["'self'", 'blob:']`; the
desktop's `CSP` in `protocol.ts` gains `media-src 'self' blob:`. `img-src`
already allows `'self' data: blob:`.

### D8. No board snapshots: prompts are not versioned

Architect's ruling. Snapshots stay text only, exactly as today: no board in
them, no new kind, no snapshot before `set_scene_prompts`, no change to
History, Compare, Restore or the Claude banner. `set_scene_prompts`
overwrites the fields it is given and records `by: 'claude'` and `at`; a
hand Save overwrites and records `by: 'user'` and `at`, and toasts "Saved.".

**Departure from the mockup:** the prompt editor's hint reads "Claude can
rewrite it later." (the mockup adds "History keeps the old text.") and the
toast reads "Saved." (the mockup: "Saved. The old text is in History.").

Why: a snapshot is a whole version of the project, so restoring one that
held the board would also roll back the document text; and prompts are
cheap to rewrite (ask Claude again). Rejected: snapshots that hold the board
with a fourth `edit` kind (more surface in History, the banner and the
desktop store for little value).

### D9. Thumbnails and metadata at intake

In the renderer, for images: `createImageBitmap(file)` gives `width` and
`height`; `createImageBitmap(file, { resizeWidth: 480, resizeQuality:
'high' })` drawn on an `OffscreenCanvas` and `convertToBlob({ type:
'image/webp', quality: 0.8 })` gives the thumbnail (WebKit answers PNG for
WebP: then `image/jpeg` at 0.8). The thumbnail is uploaded as its own blob
before the original; `thumbSha256` names it. For audio, an `Audio` element
on an object URL gives `duration` on `loadedmetadata` (5 s timeout: null).
SHA-256 with `crypto.subtle.digest`; outside a secure context (a LAN preview
over plain HTTP) a pure TypeScript SHA-256 in `packages/project/src/sha256.ts`
(**plan decision**, checked against `node:crypto` on test vectors).

### D10. Matching

`packages/project/src/match.ts`, pure:

```ts
matchKey(s): string   // NFKD, combining marks removed, lower case, every char not \p{L} or \p{N} removed
parseMidjourney(name): { user: string; words: string[]; job: string; n: number | null } | null
  // /^(?<user>[^_]+)_(?<words>.+)_(?<job>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_(?<n>\d+))?\.(png|jpe?g|webp)$/i
parseSuno(name): { title: string; take: number | null } | null
  // extension mp3|m4a|aac|wav|ogg|flac; stem minus a trailing / \((\d+)\)$/
matchFile(name, kind, rows): { sceneId; matchedBy: 'prompt' | 'title' } | { reason: string }
```

- **Midjourney:** the words' key must be a prefix of a row's image prompt
  key (Midjourney truncates mid-word too). Exactly one row: matched by
  `prompt`. When none, the words without their first token, then without the
  first two, are tried, as long as at least 12 key characters remain (a user
  name with underscores, **plan decision**). Reasons, with the first five
  words as written in the name: `No prompt starts with "a vast cathedral
nave flooded".`, `Several prompts start with "…".`
- **Suno:** the stem's key equals one row's music title key: matched by
  `title`; reasons `No track title "untitled track".` and, for a title two
  rows share, `Several scenes have the track title "…".`
- **Anything else:** reason `Not a Midjourney or Suno name.`
- **Already here:** a file whose `sha256` the project lists is skipped and
  counted "already here".

Keys drop spaces and punctuation as well as case and accents (correction 7);
the requirement of exactly one row keeps false matches out.

### D11. Intake (web)

`packages/web/src/board/intake.ts`, one batch at a time, two files in
parallel:

1. Take the dropped or picked `File`s; skip those whose type and extension
   are neither image nor audio (counted as skipped).
2. Read bytes; hash (D9); skip a `sha256` already in `readFiles` (already
   here); `sniff` the head (D3), skip unknown types.
3. Metadata and thumbnail (D9).
4. `platform.putFile` the thumbnail, then the original (D13); in the
   browser each one asks `HEAD` first and is not sent when the project still
   links it (a file removed within the grace period, D6). In the browser the
   status reads `Uploading 3 of 14`.
5. On success, `matchFile` against the rows of that moment and `addFiles` in
   one transaction with `addedBy: 'user'`; the file is marked new.
6. A failed upload stays as a local pending item (not in the document) with
   Retry, until the page closes; nothing blob-less reaches the document from
   the browser.

When the batch ends the result line replaces the progress (strings in
Mockup in words). New marks last until the next batch or until the board is
left (**plan decision**).

### D12. Board UI

- Route `/projects/:id/board`: `projectViews` gains `'board'` with the label
  `Images and music`; `projectEntries` gains `{ item: 'board', label: 'Images
and music', path: '/board', Icon: BoardIcon }` between Research and
  Brainstorm log; `BoardIcon` in `ui/icons.tsx` from the mockup's picture
  and note paths. `Shell` gets the category and leaves the entry out for a
  campaign; `/projects/:id/board` on a campaign redirects to the Document.
- Components in `packages/web/src/board/`: `BoardView.tsx`, `SceneRow.tsx`,
  `ImageHalf.tsx`, `MusicHalf.tsx`, `PromptEditor.tsx`, `Tray.tsx`,
  `Viewer.tsx`, `DropOverlay.tsx`, `MatchHelp.tsx`, `ClaudeCard.tsx`,
  `board.css`; `intake.ts`, `useBoard.ts` (parse, rows, statuses).
- Drop anywhere on the window while the board is open (`dragenter` with
  `Files`, a depth counter, as the mockup's script); not while the empty
  state shows. The overlay counts `dataTransfer.items` by MIME type.
- **Add the appendix:** `appendixEdit(text, model): TextEdit` in
  `packages/project/src/appendix.ts`: with no appendix section, at the end
  of the text `\n## Appendice: immagini e musica\n` then per scene
  `\n### <id>. <title>\n\nvisual:\n\nmood:\n`; with an empty one, the rows
  at its end. Applied to the Y.Text in one transaction. Toast with the scene
  count.
- **Open the scene in the document:** `/projects/:id?scene=S3`; the Document
  view scrolls to the scene's heading and puts the cursor there, as the
  outline's jump does; the parameter is then dropped from the address.
- Copy: `navigator.clipboard.writeText`, with ConnectedApps' fallback outside
  a secure context.
- Tracks: one `<audio>` element for the board, `src = platform.fileUrl(…)`,
  so the browser streams with ranges; playing another track stops the first.
  Each track row has a small menu with "Move to another scene…" and
  "Remove", the image viewer's actions (`assignFile` with `matchedBy:
'hand'`, `removeFile` after the confirm) (architect's ruling).
- Images: thumbnails `loading="lazy"` from `thumbSha256`; the viewer loads
  the original. A file whose blob is not yet available (uploaded later by a
  desktop) shows an empty tile (no text).

### D13. Platform seam additions

```ts
interface Platform {
  …
  // The URL an <img> or <audio> loads a file from: the same path on both,
  // served by the server in the browser and by main's protocol on the desktop.
  fileUrl(projectId: string, sha256: string): string;   // `/api/projects/${id}/files/${sha256}`
  // Stores a file for the project: the browser asks HEAD and PUTs it only on
  // 404 (D5's re-link); the desktop keeps it on disk and queues the upload.
  putFile(projectId: string, sha256: string, bytes: Uint8Array, mime: string):
    Promise<{ mime: string; state: 'uploaded' | 'waiting' }>;
}
```

`Platform.desktop` gains `files`: a store of `FilesStatus { waiting: {
projectId, sha256 }[]; downloading: number; refused: { projectId, sha256,
message }[] }` from the bridge. Bridge additions in `bridge.ts`:
`files.put(projectId, sha256, bytes, mime)` (`pb:files:put`),
`files.status()` (`pb:files:status`), `files.onStatus(cb)`
(`pb:files:on-status`); `DeviceUsage` gains `files` and `fileBytes`.

### D14. Desktop files

- **Folder:** `<userData>/accounts/<id>/files/<aa>/<sha256>`, temporary
  files in `files/tmp/`. Removing the account folder at sign-out removes
  them.
- **Intake** (**plan decision**: bytes over IPC, the renderer never touches
  the file system, and the browser and the desktop share one intake path):
  `pb:files:put` checks the sender, the project id, `sha256` and bytes of at
  most 80 MB, hashes and sniffs them in main, writes the file, inserts the
  upload row, and answers `{ mime, state: 'waiting' }` (or `uploaded` once
  sent when online). The renderer then adds the entry.
- **Store migration 2:**

  ```sql
  create table file_uploads (
    project_id text not null,
    sha256 text not null,
    mime text not null,
    size integer not null,
    added_at integer not null,
    attempts integer not null default 0,
    next_at integer not null default 0,
    refused text,                -- the server's message on 413, 415 or 507
    primary key (project_id, sha256)
  );
  ```

  The local `snapshots` table is not touched.

- **Uploads** (`main/files.ts`): while online, rows whose project is
  uploaded and whose `next_at` has passed, one at a time, `HEAD` then, on
  404, `PUT` with the bearer and a file stream; 200 or 201 deletes the row; 404 (project not yet
  on the server) and network or 5xx errors retry after 10 s doubling to 5
  minutes; 413, 415, 507 set `refused` (the badge's title then reads "The
  server refused this file: <message>"). Survives restarts.
- **Downloads:** after each project's document loads or changes, every
  `sha256` and `thumbSha256` it lists that is not on disk is queued; two at a
  time, `GET` with the bearer and `Range: bytes=<temp size>-` to resume a
  partial temporary file, hash checked, then renamed. 404 retries later.
- **Protocol:** `promptbook://app/api/projects/<id>/files/<sha256>` is
  answered by main before the SPA fallback: only for a local project whose
  document or the upload queue names the `sha256`; from
  disk with `Range` (206, 416) and the type from the entry; not on disk and
  online, fetched once from the server, stored and served; otherwise 404.
  Headers: the CSP, `nosniff`, `Cache-Control: private, max-age=31536000,
immutable`.
- **Local sweep** at start and every 24 hours: blobs no local document or
  upload row names are deleted at once (the server keeps them for its grace
  period, and a file dropped again is stored from the drop's bytes).
- **First sync:** a project's row gets ✓ once its document is downloaded and
  its files are on disk; the sizes count the files; a project opens as soon
  as its document is there.
- **This device:** `usage()` counts the files folder (already inside the
  account folder) and returns `files` and `fileBytes`.
- **Sign-out:** the dialog's count of changes not on the server adds the
  upload rows.

### D15. Connector tools

`src/mcp/board.ts` holds both; `TOOL_NAMES` gains them; `INSTRUCTIONS` gains
"For a board's prompts, read get_board first, then write one scene at a time
with set_scene_prompts."

| Tool                | Scope      | Input                                                                                           | Output                                                                                                                                                                                                |
| ------------------- | ---------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_board`         | read       | `projectId`                                                                                     | `appendix: boolean`; rows `{ sceneId, title, visual, mood, image: { prompt, by, at, status, files }, music: { title, style, lyrics, by, at, status, tracks } }`; `unmatched` count; `duplicateTitles` |
| `set_scene_prompts` | read_write | `projectId`, `sceneId`, `image?: { prompt }`, `music?: { title, style, lyrics }` (one at least) | the row as `get_board` gives it, `warnings` (a shared title)                                                                                                                                          |

Errors (the existing `toToolError` shape): `not_found`, `no_board` (a
campaign), `unknown_scene` (no appendix row with that id),
`insufficient_scope`, `rate_limited`, schema errors for the limits of D1.
Problems in the document never refuse a write (#27's rule).
`set_scene_prompts` overwrites only the fields it is given, with
`by: 'claude'` and `at` now, through `withLiveDocument`, and stores no
snapshot (D8). Annotations:
`get_board` read-only and idempotent; `set_scene_prompts` not read-only,
idempotent, not destructive. Descriptions, in brief:

- `get_board`: "The project's images and music board: one row per scene of
  the appendix, with its visual: and mood: lines, the Midjourney and Suno
  prompts, who wrote them and when, and each half's status (wanted,
  received, chosen). Read it before writing prompts."
- `set_scene_prompts`: "Write one scene's prompts. Image: one Midjourney
  prompt in English from the scene's visual: line, natural description, most
  important first: subject, setting, lighting, style, mood; concrete words,
  no quality tokens (8k, masterpiece); one idea per prompt; end with
  `--ar 16:9 --v 8.1`. Music: Suno, in English, from the mood: line. Title:
  short, unique in the project: Suno names the download after it and the
  board matches the track by it. Style: 4 to 7 descriptors (genre, tempo,
  instruments, texture, mood), dark moods stated emphatically. Lyrics: meta
  tags only for an instrumental ([Intro: …], [Instrumental], [Outro: fade
  out]), always ending with [End]; instrumental unless the user asks for a
  sung song. The user can edit any of it by hand."

### D16. Export

`exportProject` gains `board.md` (per row: `## S1 · La casa che cede`, then
`### Image` with the prompt and "by Claude · <date>" or "by you · <date>",
"Chosen: <name>", then `### Music` with Title, Style, Lyrics in a fenced
block, "Chosen: <name>"), and a list of `{ path, sha256 }` for
`files/<scene id>/<name>` and `files/unmatched/<name>`, names deduplicated
with " (2)" before the extension. `routes/transfer.ts` streams with
`fflate`'s `Zip` (`ZipPassThrough` for files, already compressed;
`ZipDeflate` for the text) into the reply, reading each blob from the store
as it goes. Thumbnails are not exported.

### D17. Deployment

- **Chart:** `values.yaml` `persistence: { enabled: true, storageClass:
ur-default, size: 20Gi, accessMode: ReadWriteOnce, existingClaim: "" }`
  `app.filesQuotaGb: 20` and `app.filesGraceDays: 30`; `templates/pvc.yaml` with
  `helm.sh/resource-policy: keep`; the deployment mounts it (or an
  `emptyDir` when disabled) at `/data`, sets `PROMPTBOOK_DATA_DIR=/data` and
  `PROMPTBOOK_FILES_QUOTA_GB` and `PROMPTBOOK_FILES_GRACE_DAYS`, adds
  `fsGroup: 65532` and `fsGroupChangePolicy: OnRootMismatch` to the pod; both
  settings join `checksum/config`. Strategy stays `Recreate` (correction 3).
- **Image:** a build stage makes an empty `/out/data`; the runtime copies it
  with `--chown=65532:0` to `/data` (a named volume takes the image folder's
  owner) and sets `ENV PROMPTBOOK_DATA_DIR=/data`.
- **Compose:** `app` gains the volume `app-data:/data`.
- **Docs:** `docs/deploy-homelab.md` gains "Files volume": the claim, its
  size, how to see its use (`kubectl exec … du -sh /data/files`), that
  uninstalling keeps it, and "No backup yet: the volume's backup is decided
  later with the infrastructure." Traefik has no body size limit by default,
  so uploads need no ingress change.

### D18. Tests

- **`packages/project`:** `matchKey`; `parseMidjourney` on the mockup's names,
  `design.md`'s `coral__b2f…` example, upper-case extensions, no `_n`, a user
  name with underscores; `matchFile` (one, none, several, apostrophes,
  accents, truncation mid-word, Suno `(1)`, shared title, other names);
  `boardRows` statuses and unmatched (scene missing from the appendix);
  every writer (one transaction, unchoosing on move and remove, skip of a
  known `sha256`, limits); the concurrent-halves merge of correction 6 with two docs; `appendixEdit` (no
  appendix, empty appendix); `sniff` on each type's first bytes; `sha256.ts`
  against `node:crypto`; export files and names.
- **Server, db:** PUT every row of D5's table, idempotent 200, `HEAD` 200
  for a linked file and 404 otherwise, another user's hash needs the bytes,
  quota counted once per content; GET access, 404 for an unlinked file,
  Range 206 and 416, headers; a 60 MB stream with the server's heap measured
  not to grow by the file's size; sweep (a listed file kept,
  `unreferenced_since` set then cleared when listed again, a link dropped
  after the grace period and kept before it, bytes kept while another
  project links them, orphan blobs, tmp); bin purge cascade; `FsBlobStore`
  (put, mismatch, limit, get range, delete, list); config errors including
  the grace period; start refusal on an unwritable data folder.
- **MCP:** both tools, scope refusal, `unknown_scene`, `no_board`, limits,
  write with document errors, an image-only write leaving the music prompt,
  shared-title warning, no snapshot stored, the live client receiving the
  board change, rate limit counting.
- **Desktop unit:** store migration 2, upload queue (retry, 404 wait,
  refusal), download resume, protocol file route (allowed and refused paths,
  Range), local sweep, usage, sign-out count.
- **Web unit:** intake with fake platform (skips, already here, re-link
  without upload, result counts), D9's fallback hash, filters and summary,
  the track menu.
- **E2E browser** (`e2e/board.spec.ts`): Claude sets prompts through MCP as
  `connector.spec.ts` does; the board shows them; `setInputFiles` on Add
  files… with generated PNGs and short MP3/WAV named as Midjourney and Suno
  name them, plus one unmatched; result line; assign from the tray; choose;
  viewer move and remove; a track moved and removed from its menu; edit by
  hand and the «Saved.» toast; remove an image and drop it again (no
  upload); no appendix and
  Add the appendix; export holds `board.md` and the files. Run normally and
  with `E2E_CPU_THROTTLE=3`.
- **E2E desktop** (`e2e/desktop.spec.ts`): stop the server, add files on the
  board, relaunch offline (files there, badge «on this device»), start the
  server, uploads finish, the web client shows them in the same scene; a file
  added on the web appears in the app.

### D19. Briefs and release

Four briefs, as the brief proposed: A (project model, matching, server file
store, migration, sweep, CSP, chart, compose, image), B (connector tools,
export), C (web board, intake, viewer, tray, track menu, edit, seam's web
side, rail), D (desktop files, e2e, owner preview, docs). Release `v0.6.0` after the owner's go.

### Departures accepted in review (brief A, 2026-10-20)

Server file store:

1. The files route scope removes every body parser and adds a `*` no-op, so
   every upload body stays a raw stream whatever its Content-Type; an empty
   Content-Type gets Fastify's own 415.
2. `BlobStore` gains `clearTemp(olderThanMs?)`; `put` takes an optional
   `size` and throws `Incomplete` before the rename; it renames over an
   existing copy (same bytes, fresh mtime).
3. The rows are written in one transaction after the bytes are in place,
   under a per-user and a per-content advisory lock that re-check the bytes
   and the quota. No transaction stays open while a file streams.
4. New answers: 503 `retry` when the sweep removed the bytes before linking;
   GET and HEAD 404 for a linked file missing from disk, and a PUT of it
   uploads it again; a refused PUT drains its bounded body or closes the
   connection; a malformed hash on GET answers 400 `validation_error`; an
   inverted Range is ignored (200).
5. The sweep reads every hash in the raw `files` array (`fileHashes`),
   skips a project with no stored document, runs its delete steps under the
   content lock, and is not awaited at start.
6. Quota in GiB (1024³), matching the chart's `20Gi`; files of projects in
   the bin count.
7. HEAD is an explicit route, since Fastify's automatic HEAD reads the whole
   stream.

Project model:

8. `LIMITS` keys `imagePrompt`, `trackTitle`, `style`, `lyrics`,
   `fileName`; empty prompts delete their key; `addFiles` refuses a whole
   batch past `CAPS.files`; `chooseFile` throws for a file of another scene
   or kind; `unmatchedFiles` returns `{ file, reason }`, with `reason` null
   when the web must run `matchFile` for the intake reason.
9. `appendixEdit` returns `TextEdit | null` (null when the appendix already
   has rows); with no scenes it inserts the heading only.
10. `sniff.ts` also exports `FILE_LIMITS`, `MAX_FILE_BYTES` and
    `SNIFF_BYTES`; `sha256.ts` exports a streaming `Sha256` class.

Deployment:

11. The Dockerfile prepares `/data` in the build stage under `/tmp/out`
    (uid 65532 cannot write the root).

Review: a security subagent found 7 issues, all fixed in brief A (a sweep
racing a re-upload, stalled keep-alive after a refusal, unbounded discarded
bodies, quota overrun by parallel uploads, unknown file kinds ignored by the
sweep, inverted Range, size checked after rename).

For brief D: `e2e/compose.oidc.yaml`'s second app shares the database but
not the volume; give it `app-data` too.

### Departures accepted in review (brief B, 2026-10-20)

1. `exportProject` still returns text files (now with `board.md`); the file
   list comes from `exportBoard(doc)`: `{ markdown, files: { path, sha256 }[] }`.
   `readDocumentBoard(doc)` gives `{ rows, unmatched }` to the tools and the
   export (no rows for a campaign).
2. `tools.ts` hands `board.ts` a toolkit and calls `registerBoardTools`, to
   avoid a circular import.
3. `set_scene_prompts`: image, music or both required (`invalid_input`);
   `image.prompt`, `music.title` (one line) and `music.style` non-empty,
   `lyrics` may be empty; a write never clears a half. `unknown_scene` is
   404 with the valid ids; `no_board` is 400, also for `get_board` on a
   campaign. The shared-title warning names the other scenes.
4. `get_board`: null fields where no prompt exists; counts of images and
   tracks; `appendix` true when the board has a row.
5. `board.md`: prompts, style and lyrics in fenced blocks (longer fences
   when the text holds backticks); "No prompt yet." for an empty half; full
   ISO dates as in `inspiration.md`.
6. Export: files of a scene without an appendix row go to
   `files/unmatched/`; names are made safe for any file system, duplicates
   get " (2)"; a hash is exported only when the project links it (a document
   cannot export another user's file); missing bytes are listed in
   `files-missing.txt`; text deflated, files stored; projects planned one at
   a time; the first chunk is read before the headers go out, so an early
   database error is a 500.
7. A project folder named `.`, `..`, empty or with control characters
   becomes "Untitled" (an older defect that files would have made worse).
8. **Known limit:** the zip writer has no ZIP64. An export over
   4,000,000,000 bytes of files or 65,000 entries answers 413
   `export_too_large` ("Export fewer projects at a time") before sending
   anything. A ZIP64 writer is a follow-up.

### Departures accepted in review (brief C, 2026-10-20)

1. The desktop preload exposes `files.put`, `files.status` and
   `files.onStatus`, and `usage()` returns `files: 0, fileBytes: 0`, marked
   for brief D; until then a desktop upload fails and shows Retry.
2. `ProjectShell.tsx` holds the project views' frame and `project/views.ts`
   the view list, to avoid an import cycle.
3. One intake per project lives for the page's life: a batch keeps going
   when the user leaves the board, its result stays while it runs, and the
   browser asks before closing a tab mid-batch. Every intake stops when the
   desktop account changes.
4. `addedAt` follows drop order (batch start + n ms, "title (1).mp3" after
   "title.mp3"), so takes number as dropped.
5. A music Save needs a title: an empty one is not written and Title gets
   the focus.
6. "Move to another scene…" and "Assign to scene…" act on a pick or Enter,
   never on arrow keys; the viewer ignores keys aimed at form controls.
7. "Edit in the document" opens the scene's heading (`?scene=`).
8. The playing track has a thin seek bar along its row.
9. Copy outside a secure context copies through a hidden textarea (line
   breaks kept), and falls back to selecting the text with "Press ⌘C to copy
   the selected text."
10. Strings added: "Reading the appendix…"; "No files added." and " N not
    added."; "Adding n of N" on the desktop; "This prompt changed while you
    were editing. Save replaces it with yours."; failed-file messages with
    Retry (not for 413, 415, 507) and Dismiss; Matching help's example
    starts "you_"; "—" for an unknown "Matched by".
11. Below 760 px the board hides the rail, the status bar and the top bar's
    category and status controls.

Review: 8 findings (an intake writing to a released desktop document, a
stale confirm in the viewer, selects acting on arrow keys, a duplicate
counted as already here after a failure, a title-less Save, a filter
unmounting an open editor, line breaks lost in the copy fallback, a third
copy of the bytes), all fixed.

Added to brief D: `randomId` falls back to `crypto.getRandomValues` outside
a secure context (a plain-HTTP LAN preview); the Unmatched tray gets "Match
again", which reruns matching on the tray's files and assigns those that
now match exactly one scene.

### Departures accepted in review (brief D, 2026-10-20)

1. `pb:files:put` always answers `{ mime, state: 'waiting' }`; every upload
   goes through the queue.
2. The desktop protocol takes a file's Content-Type from its bytes on disk,
   not from the document (writable by any client; thumbnails carry no MIME).
3. Under the protocol any other `/api/` path answers 404, not the SPA.
4. A file put in this session is served before its entry reaches main.
5. A file not on disk waits for its turn in the download queue (two at a
   time, up to 60 s); during a retry backoff it answers 404 at once.
6. Waiting and refused counts cover images and tracks, not thumbnails.
7. 400 (hash or validation) is a refusal like 413, 415 and 507: no retry.
8. The local sweep drops an upload whose document no longer lists the file
   a day after it was added, and stale temporary files.
9. A file the server does not have yet (404) does not hold a project's
   first-sync ✓; it is retried with backoff. `DesktopProjectStatus` gains
   `filesMissing` and `fileBytes`.
10. The server client takes a body as a function (fresh stream per
    attempt), a 15-minute timeout for transfers and an abort signal.
11. The status bar counts files in offline states only.
12. A picture that failed to load is asked for again when the desktop's
    download count drops.
13. Sizes reach GB; This device reads "… · N images and tracks".
14. The sign-out warning adds "and N files not yet uploaded." (waiting plus
    refused; a file in two projects counts twice).
15. Match again's toasts: "n files found their scene.", "1 file found its
    scene.", "No file found its scene."
16. e2e helpers `e2e/claude.ts` (OAuth and MCP as Claude) and
    `e2e/media.ts` (real PNGs and WAVs with Midjourney and Suno names).
17. The download and upload retry runs 10 s doubling to 5 min.

Review: no security findings; 3 race findings fixed with tests (protocol
requests skipping the download queue, sign-out not waiting for a put in
flight, an unguarded file-system error in the sweep).

Not verified before release: Windows file locks during the sweep or
sign-out, the Linux and Windows packages and the x64 Mac build (CI and the
release build them), real Midjourney and Suno downloads, an 80 MB put over
IPC with a real file.

## Strings not in the mockup

Chosen by the plan, to check at the owner preview: "Scene S6 is not in the
appendix."; `Several scenes have the track title "…".`; "Not a Midjourney or
Suno name."; the result line's " N already here." and " N skipped: not an
image or a track."; the row warning "Another scene has this title, so its
tracks cannot match. Give each scene its own title."; "Retry" on a failed
upload; "The server refused this file: <message>" (desktop badge title);
This device's usage line "**1.3 GB** 12 projects · 214 local snapshots · 140
images and tracks"; the sign-out red box's "and 4 files not yet uploaded";
the track menu's "Move to another scene…" and "Remove", its confirm "Remove
this track?", "Take 2 leaves S3 · L'ordine di Donato." with "The file in your
Downloads folder is not touched.", and the toasts "Moved to S4 · Torre Faro e
la canzone." and "Track removed."; status bar
"Offline · 3 changes on this device · 4 files waiting to upload" when both
wait.

## Mockup in words

The board sits in the project shell (connector.html's top bar, rail and
status bar). Status bar: left "Images and music" and "6 scenes" (or "No
appendix"); right the sync text.

**1 Board.** Heading "Images and music"; lead "One row per scene, from the
document's appendix. For the table and the CueBard export."; on the right
"How matching works" (question icon) and the primary "Add files…" (upload
icon; a file picker, several files, images and audio). Under it the summary
"**6** scenes · images **2** chosen, **3** received, **1** wanted · music …"
and the segmented filter "All 6", "Wanted n", "Received n", "Chosen n" (each
with the count of rows it keeps). Then the rows, each a card: header with the
id chip "S1", the title "La casa che cede" and the link "Open the scene in
the document". Two halves side by side:

- **Image · Midjourney** with a status chip (dot and "Wanted", "Received" or
  "Chosen"). The source line "visual: <text>" with "Edit in the document".
  The prompt box: the prompt in mono, then "by Claude · 5 min ago" (Claude in
  its colour) or "edited by you · yesterday", "Copy", "Edit". Then four
  thumbnails per line, each with a round badge (empty: "Choose this image";
  ✓: "Chosen. Click to unchoose"), its number at the corner, the chosen one
  outlined and the others dimmed; click or Enter opens the viewer.
- **Music · Suno**, same header. "mood: <text>" with "Edit in the document".
  The prompt box in three lines with a Copy each: "Title" with the title and
  the small "The download's filename. Used to match tracks.", "Style",
  "Lyrics" (the tags in a line); then "Instrumental: ON · Weirdness: low ·
  Style Influence: strong", the provenance and "Edit". Then the tracks: Play
  (Pause while playing), the file name with "Take 1", the duration "3:12",
  and "Choose" or "✓ Chosen" (title "Click to unchoose"), then a small "⋯"
  menu (title "More") with "Move to another scene…" (a list of the other
  scenes, as the viewer's select) and "Remove" (not in the mockup; the
  viewer's actions, D12).

A half with a prompt and no files: "No images yet. Drop Midjourney's four
files anywhere on the board." or "No tracks yet. Drop Suno's downloads
anywhere on the board." A half without a prompt: "No Midjourney prompt yet.
Ask Claude, or write one." (or "No Suno prompt yet. …") with "Write by
hand"; the image half then shows four empty slots. A row whose title is
shared shows the warning of "Strings not in the mockup". Under the rows the
hint "Rows follow the appendix. Add or rename a scene there and the board
follows."

**2 No prompts yet.** Above the rows the card with Claude's avatar "C":
"Prompts come from Claude", "Claude reads each scene's `visual:` and `mood:`
lines and writes one Midjourney prompt and one Suno prompt per row. Ask in a
chat on claude.ai:", the request "Write the image and music prompts for the
board of «L'Ancora di Sabaoth»" with "Copy", and the hint "Claude needs the
Promptbook connector, with read and edit access." with the link "Settings →
Connected apps" (`/settings/apps`). Every half shows "Write by hand".

**3 No appendix.** In place of the board a card with the picture icon: "No
scenes for the board yet", "The board makes one row per scene from the
appendix **Appendice: immagini e musica** at the end of the document. This
document has no appendix, or the appendix has no scenes.", the example in
mono (`## Appendice: immagini e musica`, `### S1. La casa che cede`,
`visual: collapsed 1900s Sicilian library at night, …`, `mood: chaotic,
suffocating, low rumbling drones, …`), the primary "Add the appendix" and
"Open the document", and the hint "Add the appendix writes the heading and
one row per scene (S1 to S6) with empty `visual:` and `mood:` lines. Claude
can fill them in." (the range from the document's scenes). Add the appendix
then shows the board with "visual: empty" and "mood: empty" lines and the
toast "Appendix added with 6 scenes. Fill in visual: and mood:, or ask
Claude." "How matching works" and "Add files…" are hidden; dropping does
nothing.

**4 Dropping.** A full-window overlay with a dashed zone: download icon, "Drop
images and tracks", "They find their scene by filename.", the hint "Files
that match nothing wait in Unmatched." and the count "14 files · 10 images,
4 tracks".

**5 After a drop.** A green line: "**14 files added: 11 matched, 3 to
assign.** S3: 4 images, 2 tracks · S5: 4 images, 1 track. New files are
marked." with ✕ to dismiss. New thumbnails carry the badge "new", new tracks
a "new" dot. Above the rows, pinned while scrolling, the amber card
"Unmatched" "3 files" "Their names match no prompt or track title." and the
button "How matching works"; each file: a small thumbnail or a music icon,
the name, the line "Image · No prompt starts with "a vast cathedral nave
flooded"." or "Track · 2:31 · No track title "untitled track".", the select
"Assign to scene…" with "S1 · La casa che cede"…, and "Remove". Assigning
toasts "Assigned to S3 · L'ordine di Donato."; Remove toasts "Removed
<name>." (the name cut at 40 characters with "…"). In the browser, while
uploading, the line reads "Uploading 3 of 14".

**5b Matching help.** A popover under the header: "How files find their
scene" with ✕; "Midjourney": "The filename holds the first words of the
prompt. They pick the scene." and an example name with the words underlined,
"→ S1 · La casa che cede"; "Suno": "The filename is the track title from the
prompt. A second take gets "(1)"." with "dominus deus sabaoth (1).mp3 → S5 ·
Capo Peloro, la terza scossa"; "Other files": "Renamed files, or prompts you
changed in Midjourney or Suno, go to Unmatched. Assign them by hand." The
examples come from the project's first row with a prompt (and with a title);
without one the example lines are left out. Esc or a click outside closes
it.

**6 Image viewer.** A dialog "Image viewer": the image large, ‹ and ›
("Previous (←)", "Next (→)"), the counter "2 of 4". On the side: "S3 ·
L'ordine di Donato", ✕ "Close (Esc)", the file name, then Scene "S3 · …",
Size "2.1 MB · PNG", Dimensions "1456 × 816 px", Matched by "the prompt's
first words" (or "the track title", "you, by hand"), Added "Today 21:38 by
you" (desktop, waiting: "Today 21:38 · on this device"), Status "Chosen for
this scene", "Another image is chosen" or "None chosen yet"; the strip of the
scene's thumbnails (current outlined, chosen ticked); "Choose for this
scene" (primary) or "✓ Chosen · click to unchoose"; the select "Move to
another scene…"; "Remove" (red). Choosing toasts "Chosen for S3."; moving
closes and toasts "Moved to S4 · Torre Faro e la canzone."; Remove asks
"Remove this image?", "Image 2 leaves S3 · L'ordine di Donato.", "The file in
your Downloads folder is not touched.", Cancel and Remove, then "Image
removed.". Under 900 px the side goes under the image.

**7 Edit a prompt.** The image prompt in a text area (label "Midjourney prompt
for S2"), the hint "Claude can rewrite it later.", "Cancel" and "Save". The music one: "Title" (input), "Style" and
"Lyrics" (text areas; Write by hand prefills Lyrics with "[Intro: low
drone] [Instrumental] [Outro: fade out] [End]" on four lines), the hint "Suno
names the download after the title.", Cancel, Save. Save toasts "Saved."
(**departure from the mockup**, D8: its hint adds "History keeps the old
text." and its toast "The old text is in History."; prompts are not
versioned). An empty image prompt or title on Save keeps the
previous text (the mockup's rule); clearing is not offered.

**8 Desktop, offline.** The desktop frame; the pill "On this device only";
under the summary the blue line "**4 files on this computer, uploaded when
you are back online.** Choosing and editing prompts work offline; they sync
too."; the waiting thumbnails carry "on this device" (laptop icon; title "On
this computer. Uploads when you are back online") in place of their number;
the status bar right "Offline · 4 files waiting to upload".

**9 Phone width.** Under 760 px: no rail, no status bar, the lead under the
heading, the buttons full width, halves stacked, two thumbnails per line,
badges always visible, the tray in the flow, the Claude card without the
avatar, the scene link on its own line.

## Risks / Trade-offs

Report, do not work around:

- **Memory and streaming.** An 80 MB upload must never be buffered by the
  server: the no-op parser and `req.raw` keep it a stream; the db test
  measures the heap. If Fastify or a hook buffers it anyway, report before
  raising the pod's 768 Mi limit. The browser holds one file's bytes twice
  (hash and upload) at most two files at a time.
- **Big downloads on the desktop.** "Every file of every project" can be
  gigabytes at first sync; the screen shows it and "Start with what is
  downloaded" still opens projects. A full disk makes downloads fail and
  retry; report if it disturbs the SQLite store's Not saved handling.
- **Prompts are not versioned.** A prompt overwritten by Claude or by hand
  is gone; restoring a snapshot does not bring it back (D8). Accepted:
  prompts are cheap to ask for again.
- **Files after their grace period.** A file removed more than 30 days ago
  is gone from the server unless another project lists it; a desktop that
  still holds it uploads nothing, since no document lists it.
- **Midjourney's filename format.** It is not documented and may change; the
  matcher is one pure function with the observed names as tests, and a miss
  only sends files to the tray.
- **Suno titles.** Two scenes with one title cannot match; the board warns,
  the tool description asks for unique titles.
- **No backup of the volume yet.** A lost volume loses the files; the
  documents keep their entries, which then show empty tiles. The desktop
  copies are the practical backup until the infrastructure decides.
- **Plain-HTTP previews** lack Web Crypto and the clipboard: D9's fallback
  hash and the select fallback cover them.

## Migration Plan

`005_files.sql` runs at start like the others; no document migration
(`SCHEMA` stays 1). The chart creates the claim on the first deploy of
`v0.6.0`; the pod's `fsGroup` makes it writable. Rolling back to `v0.5.0`
leaves the tables and the claim in place, unused, and old clients leave the
new Yjs types alone. Release `v0.6.0` after the owner's preview, as
`docs/deploy-homelab.md` describes.

## Open Questions

None. The architect ruled on board snapshots (D8), the sweep's grace period
(D6) and the track controls (D12) on 2026-10-20.
