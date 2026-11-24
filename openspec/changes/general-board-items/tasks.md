Each numbered group below is one commit, in Conventional Commits, that leaves
`npm run typecheck` and `npm test` green, with the trailers:

```
Refs: Stevesibilia/rpg-promptbook#68
Assisted-by: <agent>/<model-id>
```

## 1. Model and matching (brief A)

- [ ] 1.1 `packages/project/src/board.ts`, `model.ts`, `doc.ts`: the `general` category in `imageCategories` and `namedCategories` (D1); the `musicPrompts` map, `MusicPromptEntry`, `readMusicPrompts`, `addMusicPrompt`, `updateMusicPrompt`, `removeMusicPrompt`, `chooseGeneralTrack`, `CAPS.musicPrompts` (D2); `FileEntry.musicId`, `NewFile.musicId`, `assignTrack` with `{ sceneId } | { musicId } | null`, `unchoose`, `addFiles`, `removeFile` (D3); exported from `index.ts`
- [ ] 1.2 Rows and tray (D5): `MusicCardRow`, `generalMusic`, `readDocumentBoard`'s `music`, `unmatchedFiles` for a removed music prompt's tracks, `duplicateTitles` over scenes and General
- [ ] 1.3 `match.ts` (D4): `MatchTargets.music`, the `{ musicId }` result, the new reason for a shared title, `matchTargets`
- [ ] 1.4 Unit tests of D11 under `packages/project` for 1.1 to 1.3, including the two-Y.Doc edit-and-remove convergence
- [ ] 1.5 Callers adapted mechanically so the workspace stays green: the web board compiles on the new types and shows nothing new yet

## 2. Connector, CueBard, Markdown export (brief A)

- [ ] 2.1 `server/src/mcp/board.ts`, `tools.ts`, `images/start.ts` (D6): `general` in `add_image_prompt`, `get_board`'s `general.music`, `add_music_prompt`, `update_music_prompt`, `remove_music_prompt` with schemas, annotations, descriptions and errors, `TOOL_NAMES` (33), `INSTRUCTIONS`, `SINGULAR`
- [ ] 2.2 Db tests in `mcp-board.test.ts` and the tools-list count in `mcp.test.ts` (D11)
- [ ] 2.3 `cuebard.ts` (D7): the General folder and group, names, warnings, summary; `cuebard.test.ts`
- [ ] 2.4 `export.ts` (D8): `board.md`'s General part and folders; `export.test.ts`
- [ ] 2.5 Checks: `npm run typecheck`, `npm test` (server db tests with `TEST_DATABASE_URL`); hand-back of brief A with corrections and departures

## 3. Web board (brief B)

- [ ] 3.1 `summary.ts`, `useBoard.ts`, `actions.ts`, `intake.ts` (D9): the General tab, counts, filters, add, edit, remove, choose, assign and move for General images and music, intake and Match again with General targets, the result line; web unit tests of D11
- [ ] 3.2 `CategoryTabs`, `BoardView`, new `GeneralView` and music card, `PromptEditor` (Add image, Add music prompt), the empty General tab, the header lead, the status bar
- [ ] 3.3 `Tray`, `Viewer`, the track menu, `MatchHelp`, `ClaudeCard`, `export/CuebardDialog.tsx` (D7's lines and warnings), narrow windows
- [ ] 3.4 Checks: `npm run typecheck`, `npm test`; screenshots of screens 1a, 5, 5b, 7c and 10 for the architect

## 4. End-to-end tests, docs and preview

- [ ] 4.1 `e2e/board.spec.ts`, `e2e/connector.spec.ts`, `e2e/media.ts` (D11)
- [ ] 4.2 The whole e2e suite green, once normally and once with `E2E_CPU_THROTTLE=3`
- [ ] 4.3 Docs: README (General images and music, the three new connector tools); `docs/design.md` (Asset board: General; CueBard export: the General group and folder); Prettier on the Markdown files touched
- [ ] 4.4 Owner preview: a local compose stack from the branch with a seeded adventure, General images and music with files, and the URLs, login and pages for the owner; stop and wait for the owner's go
- [ ] 4.5 Checks (`npm run typecheck`, `npm test`, `npm run e2e`) and hand-back
