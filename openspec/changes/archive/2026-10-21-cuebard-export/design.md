## Context

Issue #38: export a project as a CueBard `.cbpack`, phase 3 of
[docs/design.md](../../../docs/design.md) ("CueBard export"). The board it
reads is the one of the `asset-board` (#26, `v0.6.0`) and `image-categories`
(#36, `v0.7.0`) changes. The mockup is
[docs/mockups/board.html](../../../docs/mockups/board.html), screens 10
(Export for CueBard), 10b (Nothing to export) and 10c (Export, desktop
offline), and the projects screen's Actions entry in
[docs/mockups/projects.html](../../../docs/mockups/projects.html). It is
being drawn alongside this change; "The dialog in words" below gives its
strings as drafted, and the architect reconciles them with the agreed mockup
before brief B.

CueBard is [Stevesibilia/cuebard](https://github.com/Stevesibilia/cuebard),
read at commit `f55135e`. Its contract, as the code gives it:

- **Archive** (`electron/lib/file-types.js:5-15`, `electron/ipc/project.js`
  `importArchive`): `.cbpack` (or `.lpa`), extracted into a new folder named
  after the archive's base name, refused when that folder exists; the project
  file is looked for only at the zip's root (`.cuebard` or `.liveplay`); one
  opens it, several ask which.
- **Extractor** (`electron/lib/extract-archive.js`, yauzl 2.10.0): refuses
  absolute names, drive letters, backslashes and anything leaving the
  folder; writes regular files and folders only; caps the uncompressed total
  at max(20 × the archive, 1 GiB); opens each file `wx`, so two entries with
  one name (on a case-insensitive disk, one name up to case) abort the
  import; removes the folder on any failure. Names are CP437 unless the
  entry's UTF-8 flag (bit 11) is set.
- **Open** (`app/composables/useProject.ts:173-272`): `JSON.parse`, then
  `validateProjectStructure` (`name` a non-empty string, `items` an array,
  `app/utils/migrations.ts:140-150`), `checkSchemaCompat` (refuses
  `schemaVersion` above 5), `runMigrations` (only below 5), `normalizeProject`
  (defaults only `theme`, `cartItems`, `cartOnlyItems`,
  `visualDisplayEnabled`), `folderPath` overwritten with the folder, the
  waveforms loaded or drawn with ffmpeg when missing
  (`useProject.ts:291-357`), `validateVisualMediaLinks` (clears a
  `linkedCueUuid` that names no cue, with a warning).
- **At `schemaVersion` 5 nothing else gets a default.** An audio item needs
  every field it plays with: `duration` is never recomputed (missing, the
  player computes NaN); `endBehavior`, `startBehavior` and `duckingBehavior`
  are read unguarded; `index` is stored, not recomputed. `visualMedia` is
  iterated unguarded (`useVisualMedia.ts:87`). Unknown keys are kept.
- **Media URLs:** a track loads as `'file:///' + folderPath + '/media/' +
mediaFileName`, unencoded: `#`, `?` and `%` in the folder's or the file's
  name break it.
- **Types:** `app/types/project.ts` (`Project` `:160-176`, `AudioItem`
  `:41-68`, `GroupItem` `:78-84`, `VisualMediaItem` `:26-38`). The best
  template for a whole project is `scripts/take-screenshots.mjs`
  (`audioItem` `:98-123`, `emptyProject` `:125-150`).

### Owner decisions (2026-10-21, fixed)

- **O1** Contents: per image prompt, the chosen image; with no choice, every
  matched image of that prompt. Per scene, the chosen track; with no choice,
  every matched track of that scene. The Unmatched tray is never exported.
- **O2** Where: the browser downloads the pack from the server (a streamed
  route, like the Markdown export); the desktop app builds it itself in the
  main process from its own file store, offline, streamed to the path chosen
  in a save dialog.
- **O3** Visual folders: one per category, named «Scenes», «PCs», «NPCs»,
  «Handouts». Scene images are named after their scene («S1. Title») and
  linked to that scene's track.
- **O4** A full release this session, with no owner LAN preview.

Below, D1 to D3 are the owner's (O1 to O3); the architect's proposals A1 to
A12 are the decisions marked (architect), A1 as D4, A2 as D5, A9 as D6, A3
as D7, A4 as D8, A6 as D9, A5 as D10, A7 as D11, A8 as D12, A10 as D13, A12
as D16, A11 as D18; those marked (plan) are the plan's. Where the plan
filled a gap inside an architect's decision it says **plan decision**, with
the reason.

### The code today

- **Board.** `packages/project/src/board.ts`: `FileEntry` (`:64-90`, with
  `name`, `kind`, `mime`, `size`, `duration` in seconds or null, `sceneId`
  for tracks, `promptId` for images); `readFiles` (`:210`); `PromptRow` and
  `BoardRow` (`:655-680`: `sceneId`, `title`, `prompts`, `music`, `tracks`
  oldest first, `chosenTrack`); `boardRows` (`:699`, one row per appendix row
  with a scene id, first one kept); `namedPrompts` (`:732`); `unmatchedFiles`
  (`:770`); `readDocumentBoard(doc)` (`:804`, `{ rows, named,
outsideAppendix, unmatched }`, no rows for a campaign). Appendix rows are
  `### S1. Title` (`format/src/parse/sections.ts:218-252`): `row.sceneId`
  `S1`, `row.title` the title without the id. `migratedView(doc)`
  (`board-migration.ts:139-149`) reads a pre-#36 board without writing.
  `sha256Hex` (`sha256.ts:104`) is pure JavaScript.
- **Markdown export.** `packages/project/src/export.ts`: `fileSafe` (`:113`)
  and `freeName` (`:122`), not exported; `exportBoard` (`:171-242`) on
  `migratedView`; `ExportFile { path, sha256 }`. Server
  `packages/server/src/routes/transfer.ts`: `ZIP_BYTES_MAX` 4e9 and
  `ZIP_ENTRIES_MAX` 65,000 (`:38-40`), `attachment()` (`:61-66`), `plan()`
  (`:112-140`: the live document or the stored one, through `migratedView`;
  only files the project links in `project_files`), `zipChunks()`
  (`:149-200`: fflate `Zip`, `ZipPassThrough` for media streamed from
  `blobs.get(sha).stream`, `files-missing.txt`), `send()` (`:204-211`, the
  first chunk read before the answer is committed), `checkFits()`
  (`:216-229`, 413 `export_too_large`), `GET /api/projects/:id/export`
  (`:231-239`). fflate `^0.8.3` is a server dependency only.
- **Desktop.** `packages/desktop/src/main/files.ts`: `Files` keeps every
  file at `<account>/files/<aa>/<sha256>` (`blobPath`), `onDisk` sizes
  (`:117`), `serve` (`:594`: allowed check, a download in its turn when
  online), `allowed` (`:644`); `SyncEngine.doc(id)` and `isDownloaded(id)`
  (`main/sync.ts:209-213`). `main/ipc.ts`: `handle()` checks the sender;
  `pb:files:save` (`:165-181`) buffers a whole server answer (30 s timeout,
  503 offline, renderer bytes capped at 200 MB), so it cannot carry a pack.
  The main process is bundled by esbuild to CommonJS
  (`scripts/build.mjs`). No application menu.
- **Web.** Channels in `platform/bridge.ts:8-46`, the files bridge
  `:251-262`, preload `packages/desktop/src/preload/index.ts:51-57`;
  `Platform.download(source, name)` (`web.ts:110-115`, `desktop.ts:158-160`).
  Board header `board/BoardView.tsx:158-195` (`row acts`: «How matching
  works», «Add files…»). Projects panel Actions
  `projects/ProjectPanel.tsx:120-135` (`DownloadLink` to `exportUrl`, inside
  `NeedsServer`). `ui/Modal.tsx`, `ui/Toast.tsx`. The browser probe
  (`board/probe.ts:47-67`) records a track's length from an `Audio` element,
  null when the browser cannot decode it or it takes too long.
- **Tests.** `packages/project/test` (`export.test.ts`, `helpers.ts`
  `project()`, `fixture()`); `packages/server/test/db/export-files.test.ts`
  (`app.inject`, `unzipSync`, 413 `:265-277`, streamed memory `:279+`);
  `packages/desktop/test/unit`; `e2e/board.spec.ts:269-295` (export, unzip),
  `e2e/media.ts` (PNG and WAV), `e2e/desktop.spec.ts`.

### Corrections to the brief's facts

None found against the CueBard clone. Two additions:

1. **The archive's name is part of every media URL.** CueBard extracts into
   a folder named after the archive and loads `file:///<folder>/media/…`
   unencoded, so the archive's name needs the same safe characters as the
   entries (D12).
2. **fflate sets the UTF-8 flag itself.** fflate 0.8.3's streaming `Zip.add`
   sets bit 11 when a name's UTF-8 bytes outnumber its characters
   (`esm/index.mjs:2089-2091`, `wzh` `:1900`), so a non-ASCII name reaches
   yauzl as UTF-8. Tested, not assumed (D19).

## Goals / Non-Goals

**Goals:**

- One click gives a `.cbpack` that CueBard imports and plays as it is: cue
  groups per scene, looping tracks, images in four folders, scene images
  linked to their track.
- The same pack from the browser and from the desktop app, offline included.
- The same board gives the same pack: names and ids are stable.
- The user sees what goes in, and every gap, before exporting.

**Non-Goals:**

- The prep's text, research, seed, inspiration, brainstorm log, the music
  prompts' text, thumbnails, the Unmatched tray (D18).
- CueBard's cart, waveforms, hotkeys, a theme of our own.
- Merging a new export into a CueBard project already edited there.
- Writing anything back to the document (lengths read from files are not
  stored).

## Decisions

### D1. What goes in (owner, O1)

Per image prompt shown on the board: its chosen image; with none chosen,
every image of the prompt, oldest first. Per scene with an appendix row: its
chosen track; with none chosen, every track of the scene, oldest first.
"Matched" means filed under the prompt or scene, by name or by hand. Files in
the Unmatched tray, which includes the images of prompts whose scene left the
appendix and of removed prompts, are never exported. A track left out for
its length (D10) or its bytes (D14, D15) is listed, never silently dropped.

### D2. Where the pack is built (owner, O2)

- **Browser:** the server builds and streams it, `GET
/api/projects/:id/cuebard` (D14).
- **Desktop:** main builds it from `Files` and its own copy of the document,
  and streams it to the path the save dialog gave, online or offline (D15).
  It never asks the server, so it is not behind «Needs the server».

### D3. Visual folders (owner, O3)

`visualFolders` lists, in this order and only when non-empty, «Scenes»,
«PCs», «NPCs», «Handouts». Each image's `folder` is its category's folder.
Scene images are named after the scene and linked to its track (D9).

### D4. One shared planner (architect)

A pure module `packages/project/src/cuebard.ts`, exported from `index.ts`,
used by the server, the desktop's main process and the web dialog. It reads
`readDocumentBoard(migratedView(doc))` and `readMeta(doc)`; it never writes
the document. The format lives here only and is tested once; the callers
stream bytes.

```ts
export const CUEBARD_FOLDERS = {
  scene: "Scenes",
  pc: "PCs",
  npc: "NPCs",
  handout: "Handouts",
} as const;

export interface CuebardEntry {
  path: string; // in the zip: media/<name> or media/visuals/<uuid>_<name>
  sha256: string; // the bytes in the file store
  fileId: string;
  kind: "audio" | "image";
  size: number; // FileEntry.size; callers check the real size (D13)
}

export type CuebardWarning =
  | { kind: "no-track"; sceneId: string; label: string } // label "S1. Title"
  | {
      kind: "no-image";
      category: ImageCategory;
      label: string;
      number: number | null;
      name: string | null;
    }
  | {
      kind: "no-duration";
      sceneId: string;
      label: string;
      fileId: string;
      fileName: string;
    }
  | { kind: "missing"; fileId: string; fileName: string; label: string }; // bytes not available (D14, D15)

export interface CuebardSummary {
  groups: number; // cue groups (scenes)
  tracks: number; // tracks in the project file
  images: Record<ImageCategory, number>; // images per folder
  bytes: number; // sum of the entries' sizes
  empty: boolean; // no track and no image: nothing to export
  warnings: CuebardWarning[]; // in board order: scenes, then PCs, NPCs, Handouts
}

export interface CuebardOptions {
  now: string; // ISO date-time for createdAt and lastModified
  durations?: ReadonlyMap<string, number>; // file id → seconds read from the file (D10)
  missing?: ReadonlySet<string>; // file ids whose bytes are not available
}

export interface CuebardPack {
  fileName: string; // "<name>.cbpack"
  projectFile: { path: string; json: string }; // "<name>.cuebard", JSON.stringify(project, null, 2) + "\n"
  entries: CuebardEntry[]; // the media, in project-file order
  summary: CuebardSummary;
}

export function cuebardPack(doc: Y.Doc, opts: CuebardOptions): CuebardPack;
export function cuebardUuid(
  projectId: string,
  kind: "group" | "track" | "visual",
  key: string,
): string;
export function cuebardFileName(title: string): string; // "<name>.cbpack", the same name cuebardPack gives
export function needsDuration(doc: Y.Doc): FileEntry[]; // the tracks D1 picks whose duration is null
```

**Invariant (plan decision):** names (D12) and ids (D11) are assigned over
everything D1 picks, before anything is left out for its length or its bytes,
so `durations` and `missing` only remove items and never rename the others.
Why: the same file keeps its name across exports and across the three
callers, and a caller may plan twice (D14) without the entries moving.

Each item left out for its length or its bytes is removed from the project
file and from `entries`, and listed in `summary.warnings`. A visual whose
scene's first track is left out links to the next exported track of that
scene, or to none.

### D5. Pack layout (architect)

```
<name>.cbpack                      zip, store for media, deflate for text
├── <name>.cuebard                 the project file (D6), first entry
├── media/<track name>             each exported track (D8)
├── media/visuals/<uuid>_<name>    each exported image (D9), as CueBard's own import names them
└── left-out.txt                   only when something was left out (D14, D15)
```

No folder entries (the extractor makes them), no waveforms, no thumbnails.
`<name>` is `cuebardFileName(title)` without its extension (D12). CueBard
extracts into a folder `<name>`. `left-out.txt` is not a project file to
CueBard (`isProjectFile` reads the extension); one line per item, «<label>:
<file name> (<reason>)», reasons «length unknown» and «not on the server» or
«not on this computer» (**plan decision**, as the Markdown export's
`files-missing.txt`: the browser cannot read a streamed answer's details, and
the pack carries its own account).

### D6. Project file (architect)

```json
{
  "name": "<project title, or Untitled>",
  "version": "1.0.0",
  "schemaVersion": 5,
  "folderPath": "",
  "items": [<groups, D7>],
  "cartItems": [],
  "cartOnlyItems": [],
  "visualMedia": [<visuals, D9>],
  "visualFolders": [<D3>],
  "visualDisplayEnabled": true,
  "theme": { "mode": "cobalt", "accentColor": "" },
  "createdAt": "<now>",
  "lastModified": "<now>"
}
```

`name` is the project's title as it is (CueBard shows it; only file names
need safe characters). Keys in this order, two-space JSON and a final
newline, so a test compares text.

### D7. Cue groups (architect)

One `GroupItem` per board row, in appendix order, also for a scene with no
exported track (empty `children`), so CueBard's cue list reads in the scene
order:

```json
{ "uuid": "<cuebardUuid(projectId, 'group', sceneId)>", "index": [g],
  "displayName": "S1. Title", "color": "#3300FF", "type": "group",
  "children": [<tracks, D8>], "isExpanded": true,
  "startBehavior": { "action": "play-first" }, "endBehavior": { "action": "nothing" } }
```

`displayName` is `${sceneId}. ${title}` (the appendix heading's own form).
`color` `#3300FF` is CueBard's group default (**plan decision**: A3 named
none). A campaign has no rows: `items` is `[]` and only the named folders are
filled.

### D8. Tracks (architect)

```json
{ "uuid": "<cuebardUuid(projectId, 'track', fileId)>", "index": [g, c],
  "displayName": "<D12>", "color": "#6b7280", "type": "audio",
  "mediaFileName": "<name>", "mediaPath": "media/<name>", "waveformPath": "<uuid>.json",
  "inPoint": 0, "outPoint": <duration>, "duration": <duration>, "volume": 1,
  "endBehavior": { "action": "loop" }, "startBehavior": { "action": "nothing" },
  "duckingBehavior": { "mode": "stop-all", "duckFadeIn": 0.25, "duckFadeOut": 1 },
  "customActions": [], "fadeOutDuration": 1, "playFade": 0, "stopFade": 0, "crossFade": 0 }
```

Looping, because the board's tracks are scene ambience. `index` is the
group's position and the track's position among the exported tracks.
`duration` in seconds, as recorded or read (D10), never rounded.
`displayName`: the scene's music title (trimmed) when there is one, with
« (2)», « (3)»… for the second and later exported tracks of the scene; else
the file's name without its extension.

### D9. Visuals (architect)

```json
{
  "uuid": "<cuebardUuid(projectId, 'visual', fileId)>",
  "displayName": "<below>",
  "mediaFileName": "<uuid>_<name>",
  "mediaPath": "media/visuals/<uuid>_<name>",
  "mediaType": "image",
  "folder": "Scenes",
  "linkedCueUuid": "<first exported track of the scene>",
  "linkDelay": 0,
  "fadeIn": 0,
  "fadeOut": 0
}
```

- **Scenes:** per row in appendix order, its prompts in order, each prompt's
  exported images oldest first. `displayName` «S1. Title» when the scene
  exports one image, else «S1. Title», «S1. Title · 2», «S1. Title · 3»…
  across all its prompts (**plan decision**, reading A6 as A4's rule: the
  first unnumbered). `linkedCueUuid` is the scene's first exported track;
  with no exported track the key is absent (CueBard's type has it optional;
  JSON has no `undefined`).
- **PCs, NPCs, Handouts:** each category's prompts in order; `displayName`
  the prompt's name (trimmed, «Untitled» when empty), « (2)», « (3)»… for its
  second and later images; no `linkedCueUuid`.
- Order of `visualMedia`: Scenes, PCs, NPCs, Handouts.

### D10. Track lengths (architect)

CueBard never recomputes `duration`. The planner uses `FileEntry.duration`
when it is a finite number above 0; else `opts.durations.get(fileId)`; else
the track is left out with a `no-duration` warning. The server and the
desktop fill `durations` before the final plan: for each track
`needsDuration(doc)` returns, they read its bytes with
[`music-metadata`](https://github.com/borewit/music-metadata) **11.16.1**,
pinned exactly (`parseStream(stream, { mimeType, size }, { duration: true,
skipCovers: true })` on the server, `parseFile(path, { duration: true,
skipCovers: true })` on the desktop) and keep `format.duration` when finite
and above 0. A reader that throws or answers nothing leaves the track out;
the export goes on.

Why `music-metadata`: pure JavaScript (no native module, so nothing to
rebuild for Electron or the Hummingbird image), reads every format the board
accepts (MP3, M4A, AAC, WAV, Ogg, FLAC), from a stream or a file. 11.16.1 is
the last 11.x (2026-09-24, Node ≥ 18, ESM); every 12.x is less than three
weeks old (12.2.3 published 2026-10-18) and asks Node ≥ 22. Rejected:
ffprobe (a native binary in the image and in three installers), a reader of
our own (one per container format).

The web dialog runs the planner with no `durations`, so a track with no
recorded length shows as a warning that the export will read it from the
file (D16).

### D11. Deterministic ids (architect)

`cuebardUuid(projectId, kind, key)`: `sha256Hex` of the UTF-8 text
`promptbook/cuebard/<projectId>/<kind>/<key>`, its first 32 hex digits, with
digit 13 set to `4` and digit 17 to `8`, `9`, `a` or `b` (its two high bits
`10`), as `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`, lower case. Keys: the
scene id (`group`), the file id (`track`, `visual`). Why: the same board
gives the same pack, tests compare whole files, and a later re-export can
match items CueBard already holds. It passes CueBard's own
`/^[0-9a-f-]{8,36}$/i`. The planner still checks uniqueness and throws on a
collision (it would need two equal SHA-256 prefixes).

### D12. Names (architect)

`cuebardSafe(name)` (internal): NFC-normalised; `/ \ : * ? " < > | # %` and
control characters become `-`; trimmed; trailing dots and spaces dropped;
cut to 100 characters before the extension (**plan decision**: Windows paths
stay under 260 with CueBard's folder in front); empty, `.` or `..` become the
fallback.

- **Pack and project file:** `cuebardFileName(title)` is
  `cuebardSafe(title, 'Untitled') + '.cbpack'`; the project file is the same
  stem plus `.cuebard`.
- **Tracks:** `cuebardSafe(file.name, 'track')`, unique within `media/` with
  « (2)», « (3)»… before the extension, compared case-insensitively (the
  extractor's `wx` on a case-insensitive disk), as CueBard's own import
  does.
- **Images:** `<uuid>_` + `cuebardSafe(file.name, 'image')`; the uuid keeps
  them unique.
- **Extension (plan decision):** when a name's extension is not one CueBard
  plays or shows for its kind (`.mp3 .wav .ogg .flac .m4a .aac`; `.jpg .jpeg
.png .gif .webp`), the one of its sniffed MIME type is appended
  (`audio/mpeg` `.mp3`, `audio/mp4` `.m4a`, `audio/aac` `.aac`, `audio/wav`
  `.wav`, `audio/ogg` `.ogg`, `audio/flac` `.flac`, `image/png` `.png`,
  `image/jpeg` `.jpg`, `image/webp` `.webp`). Why: CueBard's dialogs and
  visual import filter by extension.

Why replace `#` and `%` too: CueBard builds `file:///` URLs without encoding
(Context).

### D13. Limits (architect)

As the Markdown export: fflate's `Zip` has no ZIP64, so a pack past
4,000,000,000 bytes or 65,000 entries would be silently corrupt. The server
sums the real sizes of the entries' hashes from `files` (one row per entry,
a hash used twice counts twice) and answers 413 `export_too_large` with «This
project holds more than 4 GB of images and tracks for CueBard, more than one
pack can take. Choose fewer files on the board.»; the desktop sums the sizes
on disk and refuses with the same message. The dialog refuses past 4 GB from
`summary.bytes` before asking (D16). `ZIP_BYTES_MAX` and `ZIP_ENTRIES_MAX`
move to `routes/zip.ts` (D14) unchanged; the desktop holds its own copy of
the two numbers with a comment pointing at the server's.

### D14. Server route (plan)

`packages/server/src/routes/zip.ts` (new): `attachment`, `send`,
`ZIP_BYTES_MAX`, `ZIP_ENTRIES_MAX` and a `zipWriter()` holding the queue,
`flush` and the text and stored entries, moved out of `transfer.ts`, whose
behaviour and tests do not change. `packages/server/src/files/duration.ts`
(new): `trackDuration(stream, mime, size): Promise<number | null>` over
`music-metadata`.

`packages/server/src/routes/cuebard.ts` (new), registered in `app.ts` beside
`transferRoutes`:

`GET /api/projects/:id/cuebard`, session required; 404 as the Markdown
export for a project not the user's or in the bin. Then:

1. The document: `sync.liveDocument(id) ?? loadProjectDoc(db, id)`, through
   `migratedView` inside the planner.
2. `missing`: the files D1 picks whose hash the project does not link in
   `project_files`, or that `blobs.has` does not find.
3. `durations`: `trackDuration` on each `needsDuration(doc)` track not
   missing.
4. `cuebardPack(doc, { now, durations, missing })`; the limits (D13) on its
   entries.
5. `send(reply, pack.fileName, chunks)`: the project file (deflate), each
   entry (`ZipPassThrough` from `blobs.get(sha).stream`), then
   `left-out.txt` when `summary.warnings` holds a `no-duration` or `missing`.
   `Content-Type: application/zip`, `Content-Disposition` with the pack's
   name.

A blob that disappears between step 2 and its turn (the sweep) aborts the
stream; the zip has no central directory and CueBard refuses it as broken
rather than opening a project that names a file it lacks. Logged as the
Markdown export logs missing files.

Rejected: a summary route (the dialog computes it from the same planner over
the live document, D16); writing the project file last (step 2 makes it
unnecessary, and a first entry shows the pack's name in any zip listing).

### D15. Desktop export (plan)

- **Channel:** `filesExportCuebard: 'pb:files:export-cuebard'` in
  `platform/bridge.ts`, following the `pb:<area>:<verb>` rule, under the
  files area that already holds `pb:files:save` (**plan decision**, rather
  than a new `cuebard` area). Bridge:
  `files.exportCuebard(projectId: string, name: string): Promise<CuebardSaved>`
  with `interface CuebardSaved { saved: boolean; leftOut: number }`; preload
  forwards it.
- **Handler** in `main/ipc.ts`: `projectId()` and `fileName()` check the
  arguments; `dialog.showSaveDialog` with `defaultPath` the name and a filter
  «CueBard pack» `cbpack`; cancelled answers `{ saved: false, leftOut: 0 }`.
- **Builder** `packages/desktop/src/main/cuebard.ts` (new):
  `exportCuebard(deps: { engine; files }, projectId: string, target: string, now?: string): Promise<CuebardSaved>`.
  The project must be downloaded (`engine.isDownloaded`), else it throws
  «This project is not on this computer yet.». `missing` from
  `files.localPath`; `durations` from `parseFile`; the limits (D13); then
  fflate's `Zip` written to `<target>.part` through a `createWriteStream`
  that waits for `drain`, renamed to `target` once `zip.end()` flushed; the
  part removed on any failure. Answers `leftOut`, the count of `no-duration`
  and `missing` warnings.
- **`Files.localPath(projectId, sha256): Promise<string | null>`** (new, in
  `main/files.ts`): the path on disk when `allowed` and present; when online
  and not present, waits for its download in its turn as `serve` does; else
  null.
- Dependencies: `fflate` ^0.8.3 and `music-metadata` 11.16.1 as
  devDependencies of `promptbook-desktop`, bundled by esbuild as every other
  main dependency. `music-metadata` is ESM; esbuild's CommonJS output must
  carry it (risk below).

Rejected: the renderer building the zip (the bytes would cross IPC, and
`pb:files:save` caps them at 200 MB); `pb:files:save` with an `/api/` path
(needs the server, buffers the whole answer).

### D16. UI (architect)

- **Board header:** «Export for CueBard…» (`tb line sm`,
  `aria-haspopup="dialog"`) between «How matching works» and «Add files…»,
  shown whenever the board has loaded.
- **Projects screen:** «Export for CueBard…» in the panel's Actions, under
  «Export as a Markdown folder…», for every category; not inside
  `NeedsServer` (works offline on the desktop).
- **Dialog** (one component, `packages/web/src/export/CuebardDialog.tsx`,
  over `ui/Modal.tsx`): the summary computed when it opens, by
  `cuebardPack(doc, { now })` on the live document (**plan decision**, no
  extra route: the counts are the board the user sees, offline too, and the
  planner is the same code the server and the desktop run). States:
  - **Summary:** lead, «Cue groups» and «Visual folders» lines, the rule
    line, the warnings list, the line saying where it is built, «Cancel» and
    «Export» (focused).
  - **Nothing to export** (`summary.empty`): the lead and «Nothing to export
    yet: add files to the board first.»; «Export» disabled, «Cancel»
    focused.
  - **Too large** (`summary.bytes` above 4 GB): the 413's message; «Export»
    disabled.
  - **Export:** the browser starts the download
    (`platform.exportCuebard`) and closes the dialog with the toast
    «Downloading <name>.»; the desktop closes the dialog on its save dialog,
    then toasts «Saved <name>.», «Saved <name>. N files were left out; the
    pack's left-out.txt lists them.» when `leftOut` > 0, nothing when
    cancelled, or the error's message.
- **Platform:** `exportCuebard(projectId: string, title: string): Promise<CuebardSaved>`
  on `Platform` (`platform/index.ts`); `web.ts` downloads
  `cuebardUrl(projectId)` (`api.ts`, `/api/projects/<id>/cuebard`) and
  answers `{ saved: true, leftOut: 0 }`; `desktop.ts` calls the bridge with
  `cuebardFileName(title)`.

### D17. The dialog in words (plan, from the mockup as drafted)

Title «Export for CueBard» with ✕. Lead «A CueBard project: one cue group
per scene, with its tracks, and the images in four visual folders.» A
definition list: «Cue groups» «**6** scenes · **5** tracks» (`1 track`);
«Visual folders» «Scenes **8** · PCs **4** · NPCs **3** · Handouts **2**
images». The rule «Each prompt and scene gives its chosen file, or every
matched file when nothing is chosen. The Unmatched tray stays out.» Then,
when there are any, «N warnings» («1 warning») over a list, one per
`summary.warnings` item:

- `no-track`: «**S4. Title** has no track: its cue group is empty.»
- `no-image`, scene: «**S1. Title**, prompt 2, has no image.»; named: «NPC
  "Za' Nina" has no image.» (PC, NPC, Handout).
- `no-duration`: «**S3. Title**: the length of "name.mp3" is not recorded;
  the export reads it from the file, or leaves the track out.» (**plan
  decision**: the mockup's draft says «is unknown, so it is left out.», true
  only when the file cannot be read; D10.)

Where: browser «Your browser downloads **<name>.cbpack**»; desktop «Built on
this device, works offline.». The architect replaces these with the agreed
mockup's strings where they differ, keeping D10's meaning for `no-duration`.

### D18. What is left out (architect)

The document's text, research, seed, inspiration, the brainstorm log, the
music prompts' text and style, thumbnails, the Unmatched tray, CueBard's
cart and hotkeys. Why: CueBard plays cues and shows images; the prep travels
by the Markdown export and the PDF.

### D19. Tests (plan)

- **`packages/project/test/cuebard.test.ts`:** a fixture with S1 (two image
  prompts, one with a chosen image of four, one with three and none chosen;
  two tracks, none chosen, one with a null duration), S2 (a chosen track of
  two, no image prompt), S3 (no track), a PC with two images, an NPC with
  none, a handout with one, an image and a track in the tray, an image of a
  prompt whose scene left the appendix. Checks: the whole project file as
  text against an expected one; groups, indexes, children; display names
  with « (2)» and « · 2»; links (S1's visuals to its first exported track,
  S3's absent); folders and their order, an empty one left out; the tray and
  the hidden prompt's image absent; `durations` filling a null; `missing`
  removing an entry and relinking a visual to the next track, other names
  unchanged (D4's invariant); warnings in order; `empty`; `bytes`; a
  campaign with named prompts only; a legacy (v0.6) board read migrated and
  left untouched; names with `#`, `%`, `?`, `/`, `..`, a control character,
  `Città.mp3` (NFC), two tracks `Tema.mp3` and `tema.MP3`, a name with no
  extension; `cuebardUuid`'s layout, stability and uniqueness over the
  fixture; `cuebardFileName` for an empty title and a long one.
- **`checkCuebardPack(zip: Uint8Array): string[]`** in
  `packages/project/src/cuebard-check.ts`, exported from `index.ts`, used by
  the server, desktop and e2e tests (e2e already imports workspace
  packages): it reads the zip's local and central headers itself and
  answers the problems found, none for a good pack. It applies CueBard's
  rules: exactly one project
  file at the root, `.cuebard`; every entry name relative, no backslash, no
  drive letter, no `..`, no duplicate up to case, none of `#?%`; JSON with
  `name` a non-empty string, `items` an array, `schemaVersion` 5, every
  field of D6 to D9 present with its type; uuids unique across items and
  visuals; every `mediaPath` an entry; every `linkedCueUuid` an audio item;
  `duration` finite and above 0; the UTF-8 flag (bit 11 at offset 6 of the
  local header) set for a non-ASCII name; every entry stored or deflated.
  Its own unit test feeds it broken packs, one rule each.
- **`packages/server/test/db/cuebard.test.ts`:** the route over
  `app.inject`, each pack passing `checkCuebardPack`. Cases: a board with files
  (WAV with its length null, read by `music-metadata`), a track whose bytes
  cannot be timed (left out, in `left-out.txt`), a file the project does not
  link (left out), another user's project (404), the 413 with the sizes
  forced as the Markdown test does, the streamed memory check, the
  `Content-Disposition` name, the live document's unsaved edit in the pack.
- **`packages/desktop/test/unit/cuebard.test.ts`:** `exportCuebard` with a
  stub engine and a `Files` over a temporary folder, offline: the pack
  written and passing `checkCuebardPack`; a file not
  on disk left out and counted; a project not downloaded refused; a failed
  write leaving no file and no `.part`. `ipc` arguments checked.
- **Web unit:** the dialog's lines and warnings from a summary, the empty
  and too-large states, the toasts.
- **E2E browser** (`e2e/board.spec.ts`): the existing board with files
  (generated PNGs and WAVs, one chosen image, one chosen track); «Export for
  CueBard…» shows the counts and a warning for a scene with no track;
  «Export» downloads `<title>.cbpack` (`page.waitForEvent('download')`),
  unzipped and checked with `checkCuebardPack`, the chosen image alone for
  its prompt, the chosen track alone for its scene, the tray's file absent;
  the projects screen's Actions entry opens the same dialog. Normal and
  `E2E_CPU_THROTTLE=3`.
- **E2E desktop** (`e2e/desktop.spec.ts`): offline, with
  `dialog.showSaveDialog` stubbed through `electronApp.evaluate`, «Export
  for CueBard…», «Built on this device, works offline.», Export, the saved
  file checked as above.

### D20. Briefs and release (plan)

Two briefs. **A:** the planner, the server route, their tests (D4 to D14,
D19's project and server parts). **B:** the desktop export, the web bridge
and platform, the dialog and its two entries, e2e, docs (D15 to D17, D19's
desktop, web and e2e parts). Then the architect's proof with CueBard itself
(tasks, group 6) and release `v0.8.0` without an owner preview (O4).

## What is not touched

- **The document and its shape:** no new key, `SCHEMA` stays 1, nothing
  written on export (lengths read from files are not stored).
- **The Markdown export:** output, route and tests unchanged; only its zip
  helpers move to `routes/zip.ts`.
- **File store, sweep, upload queue, the desktop's store:** read only.
- **CueBard:** no change; the pack follows its format at `f55135e`.

## Risks / Trade-offs

Report it, do not work around it:

- **CueBard refuses or misplays the pack.** If the architect's proof (tasks,
  group 6) finds CueBard rejecting the archive, refusing the project file, a
  cue that does not play, a NaN length or a visual not linked, report the
  exact message and the field; do not add fields CueBard's code does not
  read.
- **Non-ASCII names.** fflate sets the UTF-8 flag by itself (Context,
  addition 2). If the server test finds bit 11 unset for `Città.mp3`, or
  CueBard extracts a mangled name, report it; do not transliterate names.
- **Length unknown.** If `music-metadata` 11.16.1 answers no length for a
  format the board accepts (an M4A without a duration box, a VBR MP3 without
  a header), report the format with a sample; the track is left out and
  listed, never given a guessed length.
- **`music-metadata` in Electron's main.** It is ESM; esbuild bundles it into
  `main.cjs`. If the bundle fails or the module needs a top-level await or a
  Node API Electron's Node lacks, report it before reaching for another
  library.
- **A blob swept mid-export** aborts the browser's download (D14). Rare (the
  sweep keeps linked files 30 days); accepted.
- **The user renames the pack** in the desktop's save dialog or after the
  download with `#`, `%` or `?`: CueBard's folder then breaks its own URLs.
  Out of our hands; the default name is safe.
- **Two exports into one folder:** CueBard refuses to extract over an
  existing folder of the same name. Its own message says so; accepted.
- **The summary and the pack can differ** in the browser: the dialog plans
  over the live document without reading files, the server plans over the
  same document with the lengths it reads and the files it holds. The
  differences are exactly the `no-duration` and `missing` items, listed in
  `left-out.txt`.

## Accepted departures (brief A, reviewed by the architect)

Brief A (groups 1 and 2, `43db48e`, `d116329`) departed from the decisions
above as follows. Each was accepted; where a decision and this list
disagree, this list wins.

- **Shared helpers.** `cuebardFiles(doc)` returns every file D1 picks, in
  project-file order (`needsDuration` filters it); `cuebardLeftOut(pack,
missingReason)` writes `left-out.txt`, so the server (`'not on the
server'`) and the desktop (`'not on this computer'`) share one format.
  `checkCuebardPack` reads the zip with fflate, now a dependency of
  `promptbook-project`; the web bundle does not grow (tree-shaken).
- **`summary.empty`** means nothing picked at all, whatever `durations` or
  `missing` say: the server reads lengths from the files. With no
  durations, the dialog's track count leaves out tracks with no recorded
  length (they appear as `no-duration` warnings), so it can be lower than
  the pack's.
- **D12 names**, from a security review: the stem is also cut to 150 UTF-8
  bytes; Windows device names (`CON`, `AUX`…) get a `_` prefix; leading dots
  are stripped; duplicates compare under NFKC with an upper-then-lower case
  fold; `visuals` is reserved among track names; an extension is `.` plus 1
  to 10 ASCII letters or digits; a duplicate file id in the document keeps
  its first entry.
- **Texts clipped.** Scene titles, prompt names, music titles, file names in
  warnings and the project name are clipped to the board's `LIMITS`, so the
  project file cannot grow without bound. A scene with an empty title is
  labelled with its id alone.
- **D13 and D14 limits.** The route checks the size twice: on every picked
  file it holds before reading any length, then on the final entries plus
  three times the characters of the project file and `left-out.txt`. A
  file's size and type come from the server's `files` row, never the
  document; only `audio/*` is parsed, each content once; parsing stops when
  the client has gone. The route plans on a frozen copy of the live
  document, so the files checked against the project's links are the ones
  streamed.
- **Warnings order.** Within a scene or category, prompt by prompt, then
  the scene's music. A track with no Suno title is named after its file
  without the extension.

Not done, and accepted: one export per user at a time. The worst case per
request is bounded by the 4 GB limit.

## Accepted departures (brief B, reviewed by the architect)

Brief B (groups 3 to 5) departed from the decisions above as follows. Each
was accepted; where a decision and this list disagree, this list wins.

- **Test hook.** `PROMPTBOOK_E2E_NO_KEYRING=1`, honoured only with
  `PROMPTBOOK_E2E=1`, makes the desktop's secret store report no encryption,
  so the Mac runs the sign-in path Linux CI takes. CI does not set it.
- **Part file.** The desktop writes `.<name>.<uuid>.part` beside the target,
  opened `wx`, then renames it (D15 said `<target>.part`): a user's file of
  that name is never touched, and two exports cannot swap parts.
- **Early refusal on the desktop.** It checks the document's own sizes
  against the limits before fetching anything, then the files' real sizes.
  Lookups of missing files run in parallel, one per content.
- **Save path.** A path without `.cbpack` gets it (CueBard imports only that
  extension); if that file exists already, the export is refused rather
  than overwrite a file the dialog never asked about.
- **Strings beyond D17:** "<name>.cbpack exists already: export again and
  choose another name.", "<name>.cbpack is being saved already.", "Signed
  out: the CueBard pack was not saved.", "The CueBard pack could not be
  written. Check the folder and the free space, then try again.", and the
  `missing` warning "<label>: "<file>" is not available, so it is left
  out." Raw Node errors never reach the toast.
- **Sign-out mid-export.** `Files.reading(work)` lets `close()` abort and
  wait for an export, so sign-out stops reading the account folder.
  `serve()` now goes through `Files.localPath` with unchanged behaviour.
- **The dialog follows the document while open** (D16 said computed when
  it opens), and refuses past 65,000 entries as well as past 4 GB.
- **Toasts.** On the desktop the result goes to the app-level toast, so it
  survives leaving the board; it names the file actually saved
  (`CuebardSaved.name`).
- **Concurrency.** Main allows one export per target path at a time; the
  web one per project.

## Migration Plan

None: no database migration, no document change. Release `v0.8.0`;
rolling back removes the route, the IPC call and the buttons.

## Open Questions

None for the code. For the architect: the dialog's strings against the
agreed mockup (D17), and the plan decisions marked above.
