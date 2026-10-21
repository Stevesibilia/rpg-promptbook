## Why

The board's images and tracks reach CueBard by hand today: download them,
then add each file to a CueBard project, name it, put it in a group, link
each image to its cue. Issue
[Stevesibilia/rpg-promptbook#38](https://github.com/Stevesibilia/rpg-promptbook/issues/38)
asks Promptbook to export a project as a `.cbpack` that CueBard imports as a
ready project (phase 3 of [docs/design.md](../../../docs/design.md)). CueBard
must not depend on Promptbook: the pack follows CueBard's own project format,
`schemaVersion` 5.

The owner decided on 2026-10-21 (O1 to O3 in the design): per prompt the
chosen image, else every matched image, and per scene the chosen track, else
every matched track, with the Unmatched tray left out; the browser downloads
the pack from the server and the desktop app builds it itself, offline; one
visual folder per category, «Scenes», «PCs», «NPCs», «Handouts», with each
scene's images linked to its track. A full release, with no owner LAN
preview. The architect took the remaining decisions; they are in the design.

## What Changes

- **A CueBard pack:** a zip named `<project>.cbpack` holding
  `<project>.cuebard` at its root (the CueBard project, JSON,
  `schemaVersion` 5), the tracks under `media/` and the images under
  `media/visuals/`. No waveforms (CueBard draws them on open), no
  thumbnails, no text of the prep.
- **Cue list:** one cue group per scene of the appendix, in its order, named
  «S1. Title», holding the scene's exported tracks as looping cues named
  after the scene's Suno title. A scene with no track keeps an empty group.
- **Visual folders:** «Scenes», «PCs», «NPCs», «Handouts»; scene images named
  after their scene and linked to its first exported track; the others named
  after their prompt.
- **One planner for both shells:** a pure function in `packages/project`
  builds the project file, the list of entries and the summary; the server
  and the desktop's main process only stream bytes into the zip.
- **Track lengths:** CueBard needs each cue's length. The board's recorded
  length is used; when it is missing the server or the desktop reads it from
  the file (`music-metadata`); a track whose length still cannot be read is
  left out and listed.
- **Browser:** `GET /api/projects/:id/cuebard` streams the pack, with the
  Markdown export's limits (4 GB, 65,000 entries, 413 `export_too_large`).
- **Desktop app:** a new IPC call builds the pack in main from the files on
  this computer and streams it to the path chosen in a save dialog, online or
  offline.
- **UI:** «Export for CueBard…» in the board's header and in the projects
  screen's Actions; it opens a summary of what goes in (cue groups, tracks,
  images per folder) with a warning per gap (a scene with no track, a prompt
  with no image, a track with no recorded length), then «Export» or
  «Cancel».

Out of scope (owner): the prep's text, research, seed, inspiration and
brainstorm log in the pack; the Unmatched tray. Also not built: CueBard's cart,
waveforms, music prompt text in CueBard, a re-export that merges into a
CueBard project already edited there (the stable ids make it possible later).

## Capabilities

### New Capabilities

- `cuebard-export`: the `.cbpack` archive, its project file, cue groups and
  tracks, visual folders and links, what goes in, names, ids, track lengths,
  limits, the browser download, the desktop's offline export, the summary
  dialog.

### Modified Capabilities

- `asset-board`: the board's header gains «Export for CueBard…» (Board view).
- `projects-screen`: the project panel's actions gain «Export for CueBard…»
  (Project panel).
- `desktop-app`: the export that needs the server is the Markdown folder
  export; the CueBard export works offline (Actions that need the server).

## Impact

- `packages/project`: new `cuebard.ts` (`cuebardPack`, `cuebardUuid`,
  `cuebardFileName`, `needsDuration`, the types) and `cuebard-check.ts`
  (`checkCuebardPack`, CueBard's rules, for the tests), exported from
  `index.ts`; reuses
  `readDocumentBoard`, `migratedView`, `sha256Hex`. No change to the
  document's shape; `SCHEMA` stays 1.
- `packages/server`: new `routes/cuebard.ts` (`GET /api/projects/:id/cuebard`),
  new `routes/zip.ts` (the zip helpers and limits moved out of
  `routes/transfer.ts`, unchanged in behaviour), new `files/duration.ts`; new
  dependency `music-metadata` 11.16.1.
- `packages/desktop`: new `main/cuebard.ts`, `Files.localPath` in
  `main/files.ts`, a handler in `main/ipc.ts`, the preload; new
  devDependencies `fflate` ^0.8.3 and `music-metadata` 11.16.1 (bundled by
  esbuild).
- `packages/web`: a bridge channel and type (`platform/bridge.ts`),
  `Platform.exportCuebard` (`platform/index.ts`, `web.ts`, `desktop.ts`),
  `api.ts` (`cuebardUrl`), the new `export/CuebardDialog.tsx`, the board header
  (`board/BoardView.tsx`) and the projects panel
  (`projects/ProjectPanel.tsx`).
- `e2e/board.spec.ts`, `e2e/desktop.spec.ts`; README, `docs/design.md`. No
  database migration. Release `v0.8.0`.
