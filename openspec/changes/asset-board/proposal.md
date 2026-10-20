## Why

Phase 2 of `docs/design.md` (Asset board, Intake by filename): each scene of
an adventure needs a Midjourney image and a Suno track, today written by
hand from the appendix's `visual:` and `mood:` lines, then downloaded and
sorted into folders by hand. Issue
[Stevesibilia/rpg-promptbook#26](https://github.com/Stevesibilia/rpg-promptbook/issues/26)
holds the board that keeps the prompts per scene, takes the whole Downloads
batch at once and files each download under its scene by its name. The
images and tracks are optional; they feed the table and, later, the CueBard
export.

The owner agreed the mockup
[docs/mockups/board.html](../../../docs/mockups/board.html) and answered on
2026-10-20: a full release (v0.6.0) with an owner preview before the merge;
Claude writes the prompts through new connector tools and the user can edit
them by hand, so the app itself needs no AI; the server keeps the files on a
persistent volume, named by hash; the desktop app keeps every file of every
project on the computer. The architect took the remaining decisions; they
are in the design.

## What Changes

- **Board view** at `/projects/:id/board`, rail entry «Images and music»
  between Research and Brainstorm log, for adventures and one-shots: one row
  per appendix row, an image half and a music half, each with the source
  line, the prompt with Copy and Edit, the files, and a status (Wanted,
  Received, Chosen) derived from the files.
- **Board data in the project's Yjs document:** the prompts, who wrote them
  and when, the choices, and the list of files with their scene. Merges
  offline like the rest; the schema stays 1.
- **Intake by filename:** drop anything on the board or use Add files…;
  Midjourney images find the scene whose prompt starts with the filename's
  words, Suno tracks the scene whose music title is the filename; the rest
  wait in an Unmatched tray to assign by hand. Image viewer with Choose, Move
  and Remove; tracks play in place, with Choose, Move and Remove.
- **Server file store:** content-addressed files on a persistent volume
  behind a `BlobStore` interface, upload and download routes with type
  sniffing, size limits, a per-user quota and byte ranges; a daily sweep
  deletes a file 30 days after no document lists it any more. Migration
  `005_files.sql`.
- **Prompts are not versioned:** Claude and the user overwrite them, with who
  and when; snapshots stay text only.
- **Connector tools** `get_board` and `set_scene_prompts`, whose descriptions
  carry the `midjourney-prompts` and `suno-prompts` rules.
- **Desktop:** every file of every project downloaded to the computer at
  sync; files dropped offline kept on disk and uploaded when back online;
  first sync and Settings → This device count them; removing the projects at
  sign-out removes them.
- **Export:** each project folder gains `board.md` and `files/<scene>/`; the
  zip is streamed.
- **Deployment:** a persistent volume at `/data` in the chart, a named volume
  in compose, three new settings; the volume's backup is out of scope.

Out of scope (owner): images in the PDF, a missing-image check, the GM-only
flag and GM note per image, NPC portrait rows, several image prompts per
scene, API generators (Gemini, Ace Data), the `.cbpack` export (phase 3), and
the volume's backup. Also out: the mockup's top-bar theme toggle and the
status bar's Claude connection item (as in the connector change), and
versions of the prompts in History.

## Capabilities

### New Capabilities

- `asset-board`: the board view, its rows, halves, statuses, filters and
  prompts; intake by filename, the Unmatched tray, the viewer, choosing and
  removing; the server's file routes, limits, quota and sweep.

### Modified Capabilities

- `connector`: the tools `get_board` and `set_scene_prompts`.
- `projects`: the document holds the board and the file list; file bytes
  live outside it.
- `editor`: the rail's Images and music entry; opening the Document view at a
  scene.
- `projects-screen`: the Images and music rail entry now appears.
- `markdown-import-export`: `board.md` and `files/` in the export, streamed.
- `desktop-app`: files on this computer, offline uploads, first sync and
  This device counting files, the sign-out warning.
- `deployment`: the `/data` volume, its settings, the hardened image writing
  to it.

## Impact

- `packages/project`: `board.ts` (types, readers, writers, rows, statuses),
  `match.ts` (filename matching), `sniff.ts`, `sha256.ts`, `appendix.ts`
  (Add the appendix), export
  files; exported from `index.ts`.
- `packages/server`: `migrations/005_files.sql`; `src/files/` (`blobs.ts`,
  `store.ts`, `sweep.ts`), `routes/files.ts`; `mcp/tools.ts` and
  `mcp/board.ts`; streamed export in `routes/transfer.ts`; `config.ts`
  (`PROMPTBOOK_DATA_DIR`, `PROMPTBOOK_FILES_QUOTA_GB`,
  `PROMPTBOOK_FILES_GRACE_DAYS`); CSP `media-src`.
- `packages/web`: `board/` (view, rows, tray, viewer, intake, upload),
  platform seam `fileUrl` and `putFile`, rail entry and icon, the Document
  view's `?scene=`.
- `packages/desktop`: store migration 2 (`file_uploads`),
  `files.ts` (folder, downloads, upload queue, local sweep), protocol route
  for files with ranges, bridge `files.put`/`status`/`onStatus`, first sync,
  usage, sign-out count.
- `Dockerfile` (`/data` owned by 65532), `compose.yaml` (named volume),
  `charts/rpg-promptbook` (PVC, `fsGroup`, values, env),
  `docs/deploy-homelab.md`, README, `docs/design.md`.
- No new dependency: hashing with `node:crypto` and Web Crypto, streaming zip
  with `fflate`'s `Zip`, thumbnails with `createImageBitmap` and
  `OffscreenCanvas`. Release `v0.6.0`.
