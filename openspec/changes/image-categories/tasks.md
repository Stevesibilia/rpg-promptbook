Each numbered group below is one commit, in Conventional Commits, that leaves
`npm run typecheck` and `npm test` green, with the trailers:

```
Refs: Stevesibilia/rpg-promptbook#36
Assisted-by: <agent>/<model-id>
```

## 1. Model, migration, matching (brief A)

- [x] 1.1 `packages/project/src/board.ts` and `model.ts`: `imageCategories`, `ImagePromptEntry`, the `imagePrompts` flat keys of D1, `FileEntry.promptId` and the image-to-prompt resolution (an image with no `promptId` and a `sceneId` belongs to `legacy-<sceneId>`; images read with `sceneId` null), `CAPS.imagePrompts` 500; `readImagePrompts` (the later `at` of `prompt` and `legacy`, `chosen` over `legacy.chosen`), `addImagePrompt`, `updateImagePrompt`, `removeImagePrompt` (keys gone, images keep the removed id), `setFirstScenePrompt`, `chooseImage`, `chooseTrack`, `assignImage`, `assignTrack`, `removeFile`, `addFiles` with `promptId`; the shape comment in `doc.ts`; exported from `index.ts`
- [x] 1.2 Rows and tray (D9): `PromptRow`, `BoardRow.prompts`, `boardRows`, `namedPrompts`, `unmatchedFiles` with «Its prompt was removed.» and «Scene S6 is not in the appendix.», `readDocumentBoard` with `named` and `outsideAppendix`
- [x] 1.3 `packages/project/src/board-migration.ts` (D2): `needsImageMigration`, `migrateImagePrompts` (steps 1 to 4, files untouched, music untouched), `migratedView`
- [x] 1.4 `match.ts` (D3): `MatchPrompt`, `MatchScene`, the new `MatchResult` with `candidates`, `matchFile` over every shown prompt with text, `matchTargets`
- [x] 1.5 Unit tests `board.test.ts`, `board-migration.test.ts`, `match.test.ts`: every case under `packages/project` in D10, including the two-Y.Doc concurrent migration with edits on both sides in both client-id orders, idempotence, and an older client's late writes
- [x] 1.6 The callers adapted mechanically so the workspace stays green (D11): `server/src/mcp/board.ts` and `export.ts` on the new rows with today's output, the web board showing each scene's first prompt as today, their existing tests updated to the new API only
      Note (review of brief A, removed by brief B): in this interim web, a scene with no prompt gets an empty one when an image is assigned to it; two tabs doing so at once create two, and the web shows only the first prompt's images, so the second's are hidden until brief B shows every prompt.

## 2. Server and desktop hooks, connector, export (brief A)

- [x] 2.1 `server/src/sync.ts`: `afterLoadDocument` runs `migrateImagePrompts`; db test in `sync.test.ts` that a stored legacy document reaches a client migrated and is stored migrated after the debounce
- [x] 2.2 `desktop/src/main/sync.ts`: `SyncEngine.open` migrates a downloaded document that needs it through `transact` before handing its state; unit test in `test/unit/sync.test.ts` (migrated and stored; nothing written when nothing is needed)
- [x] 2.3 `server/src/mcp/board.ts` and `tools.ts` (D5): `get_board`'s new output on `migratedView`, `add_image_prompt`, `update_image_prompt`, `remove_image_prompt` with schemas, annotations, descriptions and errors, `set_scene_prompts` on the first scene prompt, migration first in every write, the shared-first-words warning, `TOOL_NAMES` (22) and `INSTRUCTIONS`
- [x] 2.4 Db tests `mcp-board.test.ts`: every case under "Server db" in D10, the tools-list count updated in `mcp.test.ts`
- [x] 2.5 Export (D6): `exportBoard`'s `board.md` and folders, `routes/transfer.ts` on `migratedView`; tests in `export.test.ts` and `export-files.test.ts`
- [x] 2.6 Checks: `npm run typecheck`, `npm test`, `npm run e2e` with the existing suite green (the board e2e adapted only as far as the new `get_board` shape needs); hand-back of brief A with the departures

## 3. Web board (brief B)

- [x] 3.1 `useBoard.ts` (prompts, named, tray with derived candidates, the migration when a legacy key or scene-less image appears), `summary.ts` (labels, counts and filters per tab, tab sub-lines), `actions.ts` (assign and move to a prompt, choose per prompt, remove a prompt, Match again across categories with its toasts), `intake.ts` (`matchTargets`, results per scene and per named prompt); web unit tests of D10
- [x] 3.2 `CategoryTabs.tsx` and `?tab=`, the summary and filters per tab, the status bar count, the Claude card's new text, `ActionSelect` with option groups
- [x] 3.3 Scenes tab: `ImageHalf.tsx` as the prompt stack, new `ImagePrompt.tsx`, «Add image prompt», removing a prompt with its confirm and toasts, thumbnails in the image's shape
- [x] 3.4 `NamedGrid.tsx`: PCs, NPCs and Handouts cards, the add card, the empty states and hints; `PromptEditor.tsx` with Name and Prompt, the Add mode and the empty-prompt toast
- [x] 3.5 `Tray.tsx` (reasons, «matches N prompts», «Assign to prompt…» grouped with «Its name matches» first), `Viewer.tsx` (Prompt, «Choose for this prompt», «Move to another prompt…»), `MatchHelp.tsx`, `DropOverlay.tsx`, the result line's tab links, the header and dropping without an appendix
- [x] 3.6 Checks: `npm run typecheck`, `npm test`; screenshots of screens 1 to 9 (1b, 1c, 1d, 7b included) for the architect

## 4. End-to-end tests, docs and preview (brief B)

- [x] 4.1 `e2e/board.spec.ts` (D10's browser flow) and the board steps of `e2e/desktop.spec.ts` (new labels, an NPC added offline reaching the web); `e2e/media.ts` names for every category and an ambiguous one
- [x] 4.2 The whole e2e suite green, once normally and once with `E2E_CPU_THROTTLE=3`
- [x] 4.3 Docs: README (image prompts in four categories, the new connector tools); `docs/design.md` (Asset board: categories, a pointer to this change; Intake by filename across categories; CueBard export: one visual folder per category is ready in the model); Prettier on the files touched
- [ ] 4.4 Owner preview: a local compose stack from `v0.6.0` (password mode, seeded user, a seeded adventure with an appendix), a board made there with one prompt per scene, files and a chosen image; then the app rebuilt from the branch on the same volumes, so the owner sees the real migration; a locally packaged Mac build (`--dir`) against it; give the owner the URLs, the app path and a folder of sample files named as Midjourney names them for scene, PC, NPC and handout prompts, with one name matching two prompts; then stop and wait for the owner's go
- [ ] 4.5 Checks (`npm run typecheck`, `npm test`, `npm run e2e`) and hand-back of brief B
