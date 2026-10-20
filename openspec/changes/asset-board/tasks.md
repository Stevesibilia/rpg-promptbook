## 1. Project model, matching and server file store (brief A)

- [x] 1.1 `packages/project/src/board.ts` and `model.ts`: the `board` and `files` types of D1 with flat keys, `LIMITS` (image prompt 2000, title 120, style 1000, lyrics 3000, name 255) and `CAPS.files` 2000; `readBoard`, `readFiles`, `setImagePrompt`, `setMusicPrompt`, `addFiles`, `assignFile`, `removeFile`, `chooseFile`; `boardRows`, `unmatchedFiles`, `duplicateTitles` (D2); the shape comment in `doc.ts`; exported from `index.ts`
- [x] 1.2 `packages/project/src/match.ts`: `matchKey`, `parseMidjourney` (with the user-name fallback), `parseSuno`, `matchFile` and its reason strings (D10)
- [x] 1.3 `packages/project/src/sniff.ts` (D3), `sha256.ts` (D9's fallback), `appendix.ts` `appendixEdit` (D12)
- [x] 1.4 Unit tests `board.test.ts`, `match.test.ts`, `sniff.test.ts`, `sha256.test.ts`, `appendix.test.ts`: every case listed under `packages/project` in D18, including the concurrent-halves merge with two docs
- [x] 1.5 `migrations/005_files.sql` exactly as D4
- [x] 1.6 `config.ts`: `PROMPTBOOK_DATA_DIR` (default `./data`), `PROMPTBOOK_FILES_QUOTA_GB` (default 20, at least 1) and `PROMPTBOOK_FILES_GRACE_DAYS` (default 30, at least 1); `.gitignore` gains `packages/server/data/`; start creates and empties `files/tmp` and stops with a `ConfigError` naming the variable when it cannot write (D3)
- [x] 1.7 `src/files/blobs.ts` (`BlobStore`, `FsBlobStore`), `src/files/store.ts` (link, quota, lookup), `routes/files.ts` with the no-op octet-stream parser in its own scope, PUT and GET of D5 with every status and error code, registered in `app.ts`
- [x] 1.8 `src/files/sweep.ts` `sweepFiles` (D6: `unreferenced_since` set and cleared from each project's stored document, links past the grace period dropped, unlinked files and orphan blobs deleted), run from `main.ts` at start and every 24 hours
- [x] 1.9 CSP `mediaSrc: ["'self'", 'blob:']` in `web.ts` (D7)
- [x] 1.10 Db tests `files.test.ts`, `sweep.test.ts`, `blobs.test.ts`: every row of D5's table, idempotent 200 and `HEAD` 200 for a linked file, another user's hash needs the bytes, quota once per content, GET access and 404 for an unlinked file, Range 206/416 and headers, the 60 MB heap check; sweep: a listed file kept, `unreferenced_since` set then cleared when the file is listed again, a link dropped after the grace period and kept before it, bytes kept while another project links them, orphan blobs and tmp; bin purge cascade; config errors and the unwritable data folder; the route test's protected-routes list gains the two routes
- [x] 1.11 Deployment (D17): `Dockerfile` `/data` owned by `65532:0` and `ENV PROMPTBOOK_DATA_DIR=/data`; `compose.yaml` volume `app-data:/data`; chart `persistence`, `app.filesQuotaGb` and `app.filesGraceDays` values, `templates/pvc.yaml` with `helm.sh/resource-policy: keep`, the mount (emptyDir when disabled), the env, `fsGroup: 65532` with `fsGroupChangePolicy: OnRootMismatch`, both settings in `checksum/config`; `helm template` with `values-homelab.yaml` checked
- [x] 1.12 Checks: `npm run typecheck`, `npm test`, the image starts read-only with `/tmp` and `/data` writable (the hardened-image proof), `npm run e2e` green; hand-back of brief A

## 2. Connector tools and export (brief B)

- [x] 2.1 `src/mcp/board.ts`: `get_board` and `set_scene_prompts` with the zod schemas, annotations and descriptions of D15; `TOOL_NAMES` and `INSTRUCTIONS` updated; errors `no_board`, `unknown_scene`; the shared-title warning
- [x] 2.2 `set_scene_prompts` overwrites only the fields it is given, with `by: 'claude'` and `at` now, through `withLiveDocument`; no snapshot (D8); counted by the write quota
- [x] 2.3 Db tests `mcp-board.test.ts`: both tools, read scope refused on the write, `unknown_scene`, `no_board`, the limits, a write with document errors, an image-only write leaving the music prompt, the shared-title warning, no snapshot stored, a live Hocuspocus client receiving the board change, rate limiting
- [x] 2.4 Export (D16): `exportProject` gains `board.md` and the file list with deduplicated names; `routes/transfer.ts` streams one project and everything with `fflate`'s `Zip`, `ZipPassThrough` for files from the blob store, `ZipDeflate` for text
- [x] 2.5 Tests: `export.test.ts` (`board.md` content and order, `files/S1/…`, `files/unmatched/…`, name collisions, no thumbnails); db test that an export with files streams (heap not growing by the files' size) and the zip lists the files
- [x] 2.6 Checks: `npm run typecheck`, `npm test`, `npm run e2e`; hand-back of brief B

## 3. Web board (brief C)

- [x] 3.1 Platform seam (D13): `fileUrl` and `putFile` in `platform/index.ts`, `web.ts` (fetch PUT with `application/octet-stream`, errors mapped to messages) and `desktop.ts` (bridge `files.put`); `bridge.ts` gains `files.put`, `files.status`, `files.onStatus`, the channels `pb:files:put`, `pb:files:status`, `pb:files:on-status`, `FilesStatus`, and `DeviceUsage.files` and `fileBytes`
- [x] 3.2 Route and rail (D12): `projectViews` gains `board`; `projectEntries` gains Images and music with `BoardIcon` between Research and Brainstorm log; the entry hidden and the route redirected for a campaign
- [x] 3.3 `board/useBoard.ts` (parse through `createAnalysisClient`, `boardRows`, statuses, summary, filters) and `BoardView.tsx`, `SceneRow.tsx`, `ImageHalf.tsx`, `MusicHalf.tsx`, `ClaudeCard.tsx`, `board.css`: screens 1, 2 and 9 of Mockup in words with their strings, Copy with the secure-context fallback, the shared-title warning
- [x] 3.4 `PromptEditor.tsx`: Edit and Write by hand, Save overwriting the prompt as the user's with the toast «Saved.», Cancel (screen 7, D8)
- [x] 3.5 Empty state and Add the appendix with `appendixEdit` and its toast (screen 3); the Document view's `?scene=` (D12)
- [x] 3.6 `board/intake.ts` and `DropOverlay.tsx`: drop anywhere and Add files…, the overlay counts (screen 4), D9's metadata, thumbnail and hash, D11's steps with the `HEAD` check that re-links a file the project still links, "Uploading n of N", Retry for failed uploads, the result line with already-here and skipped counts, new marks (screen 5)
- [x] 3.7 `Tray.tsx` (pinned, Assign to scene…, Remove, toasts) and `MatchHelp.tsx` (screen 5b, examples from the project's prompts)
- [x] 3.8 `Viewer.tsx`: screen 6 with keyboard, strip, Choose, Move, Remove with the confirm, toasts; tracks with one shared `<audio>`, Play and Pause, Choose, and the track menu with «Move to another scene…» and «Remove» (confirm «Remove this track?», toasts) (D12)
- [x] 3.9 Unit tests: intake with a fake platform (skips, already here, re-link without upload, result counts, Retry), the fallback hash path, filters and summary counts, the track menu's move and remove
- [x] 3.10 Checks: `npm run typecheck`, `npm test`, `npm run e2e` with the existing suite green; screenshots of screens 1 to 9 for the architect; hand-back of brief C

## 4. Desktop files, end-to-end tests, preview and docs (brief D)

- [x] 4.1 Store migration 2 (`file_uploads`) in `main/store.ts` (D14)
- [x] 4.2 `main/files.ts`: the files folder, `pb:files:put` (sender, id, hash, sniff, 80 MB), the upload queue with retries and refusals, downloads with resume and hash check, `pb:files:status` and `pb:files:on-status`, the local sweep (D14)
- [x] 4.3 `protocol.ts`: the file route before the SPA fallback with the access rule, Range, fetch-once when online, headers; `media-src 'self' blob:` in its CSP (D7, D14)
- [x] 4.4 First sync counting files, `usage()` with `files` and `fileBytes`, This device's usage line, the sign-out dialog's count of files waiting; the board's offline strip, «on this device» badges and the status bar text (screen 8)
- [x] 4.5 Desktop unit tests: migration 2, queue (retry, 404 wait, refusal), download resume, protocol file route (allowed, refused, Range), local sweep, usage, sign-out count
- [ ] 4.6 `e2e/board.spec.ts` (D18's browser flow) and the board steps in `e2e/desktop.spec.ts` (offline drop, relaunch, upload when back, the file on the web, a web file in the app)
- [ ] 4.7 The whole e2e suite green, once normally and once with `E2E_CPU_THROTTLE=3`
- [ ] 4.8 Docs: README (the board, intake by filename, the connector's board tools, where the desktop keeps files); `docs/design.md` (Asset board and Intake by filename marked built with a pointer to this change, phase 2 built); `docs/deploy-homelab.md` ("Files volume": the claim, size, usage check, kept on uninstall, "No backup yet: the volume's backup is decided later with the infrastructure."); Prettier on the files touched
- [ ] 4.9 Owner preview: the branch's server as a local compose stack (password mode, seeded user, a seeded adventure with an appendix) and a locally packaged Mac build (`--dir`) against it; give the owner the URLs, the app path and a folder of sample files named as Midjourney and Suno name them; then stop and wait for the owner's go
- [x] 4.11 `randomId` in `packages/project` falls back to `crypto.getRandomValues` when `crypto.randomUUID` is missing (plain-HTTP origin), with a unit test
- [ ] 4.12 The Unmatched tray's «Match again» button: reruns `matchFile` on the tray's files with the current prompts and titles and assigns each one that matches exactly one scene (toast «n files found their scene.»), with unit and e2e coverage
- [ ] 4.10 Checks (`npm run typecheck`, `npm test`, `npm run e2e`) and hand-back of brief D
