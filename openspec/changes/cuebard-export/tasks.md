Each numbered group below is one commit, in Conventional Commits, that leaves
`npm run typecheck` and `npm test` green, with the trailers:

```
Refs: Stevesibilia/rpg-promptbook#38
Assisted-by: <agent>/<model-id>
```

The repository has no lint script: the checks are `npm run typecheck`,
`npm test` and `npm run e2e`, and Prettier on the Markdown files touched.

## 1. Shared planner (brief A)

- [x] 1.1 `packages/project/src/cuebard.ts` (D4): `CUEBARD_FOLDERS`, the types `CuebardEntry`, `CuebardWarning`, `CuebardSummary`, `CuebardOptions`, `CuebardPack`; `cuebardUuid` (D11); the internal `cuebardSafe`, track names unique without case, the extension from the MIME type, `cuebardFileName` (D12); `needsDuration`; `cuebardPack` on `readDocumentBoard(migratedView(doc))`: contents (D1), project file (D6), groups (D7), tracks (D8), visuals and folders (D3, D9), lengths and `durations` (D10), `missing`, the names-before-leaving-out invariant, the summary and its warnings in board order; exported from `index.ts`
- [x] 1.2 `packages/project/src/cuebard-check.ts`: `checkCuebardPack(zip)` with CueBard's rules (D19), its own reader of the zip's headers; exported from `index.ts`
- [x] 1.3 `packages/project/test/cuebard.test.ts` and `cuebard-check.test.ts`: every case under `packages/project` and `checkCuebardPack` in D19, including the whole project file compared as text, the invariant (a `missing` track removed, the other names unchanged, the visual relinked), a campaign, a v0.6 board read migrated and the document unchanged, and one broken pack per rule

## 2. Server route (brief A)

- [ ] 2.1 `packages/server/src/routes/zip.ts`: `attachment`, `send`, `ZIP_BYTES_MAX`, `ZIP_ENTRIES_MAX`, `zipWriter()` moved out of `routes/transfer.ts`; `transfer.ts` uses them; `export-files.test.ts` unchanged and green
- [ ] 2.2 `music-metadata` 11.16.1 (exact) in `packages/server`'s dependencies; `packages/server/src/files/duration.ts` `trackDuration(stream, mime, size)`, null on any failure or a length not finite or not above 0; unit test with a generated WAV and with bytes that give no length
- [ ] 2.3 `packages/server/src/routes/cuebard.ts` `GET /api/projects/:id/cuebard` (D14 steps 1 to 5), registered in `app.ts`; the limits and 413 message (D13); `left-out.txt` (D5)
- [ ] 2.4 `packages/server/test/db/cuebard.test.ts`: every case under the server in D19, each pack through `checkCuebardPack`, including a non-ASCII name with the UTF-8 flag, a length read from a WAV, a track left out for its length, an unlinked file left out, 404, 413, the streamed memory check, the live document's unsaved edit
- [ ] 2.5 Checks: `npm run typecheck`, `npm test`, `npm run e2e` with the existing suite green; Prettier on the Markdown touched; hand-back of brief A to the architect with the departures from the design, a pack produced from the db test's fixture saved under the scratchpad for the proof (6.1), and the open risks met

## 3. Desktop export (brief B)

- [ ] 3.1 `packages/web/src/platform/bridge.ts`: `filesExportCuebard: 'pb:files:export-cuebard'`, `CuebardSaved`, `files.exportCuebard` in `PromptbookBridge`; `packages/desktop/src/preload/index.ts` forwards it
- [ ] 3.2 `packages/desktop/src/main/files.ts`: `Files.localPath(projectId, sha256)` (D15), with a unit test in `test/unit/files.test.ts` (on disk, allowed or not, offline and absent, online and fetched in its turn)
- [ ] 3.3 `packages/desktop/src/main/cuebard.ts` `exportCuebard` (D15), the handler in `main/ipc.ts` with the save dialog and its filter; `fflate` ^0.8.3 and `music-metadata` 11.16.1 (exact) as devDependencies of `promptbook-desktop`; `npm run build -w promptbook-desktop` bundles them
- [ ] 3.4 `packages/desktop/test/unit/cuebard.test.ts`: every desktop case in D19, each pack through `checkCuebardPack`

## 4. Web UI (brief B)

- [ ] 4.1 `Platform.exportCuebard` (`platform/index.ts`, `web.ts`, `desktop.ts`) and `cuebardUrl` in `api.ts` (D16)
- [ ] 4.2 `packages/web/src/export/CuebardDialog.tsx` (D16, D17): the summary, the warnings, the empty and too-large states, the where line per platform, Export and Cancel, the toasts; strings from D17, which follows the agreed mockup (screens 10, 10b, 10c of `docs/mockups/board.html`) and wins where they differ (the length warning)
- [ ] 4.3 The board header's «Export for CueBard…» (`board/BoardView.tsx`) and the projects panel's Actions entry under «Export as a Markdown folder…» (`projects/ProjectPanel.tsx`), not inside `NeedsServer`
- [ ] 4.4 Web unit tests: the dialog's lines and warnings from summaries, its states, the toasts
- [ ] 4.5 Checks: `npm run typecheck`, `npm test`; screenshots of the dialog (summary with warnings, nothing to export, desktop offline) and of both entries for the architect

## 5. End-to-end tests and docs (brief B)

- [ ] 5.1 `e2e/board.spec.ts`: D19's browser flow (the dialog's counts and a warning, the download, unzipped and through `checkCuebardPack`, the chosen files alone, the tray's file absent, the projects Actions entry)
- [ ] 5.2 `e2e/desktop.spec.ts`: D19's desktop flow, offline, with the save dialog stubbed
- [ ] 5.3 The whole e2e suite green, once normally and once with `E2E_CPU_THROTTLE=3`
- [ ] 5.4 Docs: README (the CueBard export, from the board and from the projects screen, offline on the desktop); `docs/design.md` (CueBard export: built, a pointer to this change, the pack's layout and what goes in; Phases: phase 3 built); Prettier on the files touched
- [ ] 5.5 Checks (`npm run typecheck`, `npm test`, `npm run e2e`) and hand-back of brief B, with a pack exported by the desktop app offline saved under the scratchpad for the proof (6.1)

## 6. Proof with CueBard and release (architect)

- [ ] 6.1 Scripted proof against the CueBard clone at `f55135e`: in a scratch copy with `npm ci`, a vitest file under `tests/` that, for each pack of 2.5 and 5.5 and one downloaded from the e2e stack, runs CueBard's own `extractArchive` (`electron/lib/extract-archive.js`) into a new folder named after the pack, finds the one project file at its root with `isProjectFile`, then `JSON.parse`, `validateProjectStructure`, `checkSchemaCompat` (ok), `runMigrations` (no change at 5), `normalizeProject` (no change), and checks that every `mediaPath` exists on disk, every `linkedCueUuid` names an audio item, every `duration` is finite and above 0, and a non-ASCII name came out intact. Nothing is committed to CueBard
- [ ] 6.2 If possible, the pack opened in the CueBard app itself (`npm run dev` in the clone, or an installed build): import, play a scene's track, show a linked image from its cue, check the four folders; screenshots. When the app cannot run here, say so in the hand-back to the owner and rely on 6.1
- [ ] 6.3 Review of both briefs against the design; failures of 6.1 or 6.2 reported to the implementer, not worked around
- [ ] 6.4 Archive the change (`chore(openspec): archive cuebard-export`), merge, release `v0.8.0` (O4: no owner preview)
