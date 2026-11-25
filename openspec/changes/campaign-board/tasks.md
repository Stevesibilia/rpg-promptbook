Each numbered group below is one commit, in Conventional Commits, that leaves
`npm run typecheck` and `npm test` green, with the trailers:

```
Refs: Stevesibilia/rpg-promptbook#68
Assisted-by: <agent>/<model-id>
```

Brief A is groups 1, 2 and 3; brief B is groups 4 to 7. B starts after A's
hand-back, on the same branch, in a fresh session. No rebase: the branch is
published and force pushes are refused; bring main in with a merge. B never calls control-room `report_tasks`.

## 1. Model: CueBard pack and board.md of a campaign (brief A)

- [ ] 1.1 If PR #67 (`reference-images`) has landed on main, merge `origin/main` now; if not, build on d6645e9 and merge `origin/main` as soon as the architect says #67 landed (before hand-back of brief A). Resolve as design D16 says; check "The code today" against the merged code and note corrections
- [x] 1.2 `packages/project/src/cuebard.ts` (D9): drop the campaign branch at `:288-289`; a campaign's group «General» at index 0; update the header comment
- [x] 1.3 `packages/project/src/export.ts` (D10): drop the campaign branch at `:213`; a campaign's `board.md` without `# Scenes`, empty while the board has no item; update the comment at `:175`
- [x] 1.4 Tests of D15 in `cuebard.test.ts` (rewrite `:413-424`), `export.test.ts` (rewrite `:486-492`) and `board.test.ts` (a campaign text with an adventure appendix reads no rows)

Commit: `feat(project): export a campaign's General group and board.md`

## 2. Connector on a campaign (brief A)

- [x] 2.1 `packages/server/src/mcp/board.ts` (D6, D7): remove `NO_BOARD` and `boardable` and their ten calls; `set_scene_prompts` and `add_image_prompt` `scene` answer 400 `not_an_adventure` on a campaign before any scene lookup
- [x] 2.2 Descriptions and `INSTRUCTIONS` (D8): `board.ts:227`, `:296`, `:348`, `:601`, `set_scene_prompts`; `tools.ts:98`
- [x] 2.3 Db tests of D15: rewrite `mcp-board.test.ts:233-245` and `:862-866` and `mcp-board-images.test.ts:341-346` to prove a campaign works; `not_an_adventure` writes nothing; the instructions where `mcp.test.ts` pins them
- [ ] 2.4 D16's check with #67: `generate_image` with one reference on a campaign's General prompt reaches the fake OpenRouter with one `input_references` entry; `get_board` on the campaign lists that prompt's `images[]` and `references`
- [x] 2.5 `grep -rn "boardable\|NO_BOARD\|no_board" packages/*/src` answers nothing

Commit: `feat(connector): open the board tools to campaigns`

## 3. Proof and hand-back of brief A

- [ ] 3.1 `npm run typecheck`; `npm test` with `TEST_DATABASE_URL` on a throwaway postgres (`CI` unset), the report showing the server db tests ran
- [ ] 3.2 Hand-back to the architect: commits, test counts, "Corrections" to "The code today", departures from D6 to D10 with their reasons

Commit: `chore(openspec): tick brief A of campaign-board`

## 4. Web board on a campaign (brief B)

- [ ] 4.1 `shell/Shell.tsx` and `project/ProjectView.tsx` (D5): the rail entry and the board route on every project
- [ ] 4.2 `board/useBoard.ts` (D2): a campaign answers an empty appendix at once, no worker; `parseNow` resolves at once
- [ ] 4.3 `board/summary.ts`, `CategoryTabs`, `BoardView` (D3): `boardTabs(category)`, the default tab per category, `tabParam` on a campaign, no Scenes panel, `ScenesSummary` or `NoAppendix` on a campaign
- [ ] 4.4 Wording (D4, "Mockup in words", Q1 defaults): lead, status bar, `GeneralView` and `NamedGrid` hints, General's `what` and example, `ClaudeCard`, `MatchHelp`, `Tray`, `MusicHalf`'s track menu, `actions.ts`' removal note
- [ ] 4.5 `export/CuebardDialog.tsx` (D11): `campaign` on `CuebardSummaryView`, the campaign lead and lines
- [ ] 4.6 Web unit tests of D15; with #67 in, a `boardImages` test over a campaign's shown prompts (D16)

Commit: `feat(web): open the images and music board on campaigns`

## 5. End-to-end tests (brief B)

- [ ] 5.1 Merge `origin/main` if it moved since brief A; build web and desktop (`npm run build -w promptbook-web && npm run build -w promptbook-desktop`)
- [ ] 5.2 `e2e/campaign-board.spec.ts` (new, D15): 11c on a new campaign, add by hand, drop files, choose, the 11b dialog lines, the pack's one group «General»; it generates nothing and leaves account-wide settings alone
- [ ] 5.3 `e2e/connector.spec.ts` (`add_music_prompt` on a campaign, `set_scene_prompts` answering `not_an_adventure`) and `e2e/editor.spec.ts` («campaign not checked»: the rail shows «Images and music»)
- [ ] 5.4 The whole e2e suite green once normally and once with `E2E_CPU_THROTTLE=3`; check `docker volume ls | grep promptbook-e2e` is empty before each fresh run

Commit: `test(e2e): cover the campaign board`

## 6. Docs, screenshots and owner preview (brief B)

- [ ] 6.1 README (the board on campaigns: tabs, CueBard group, connector) and `docs/design.md` (Asset board: replace «Campaigns keep no board for now.» at `:448`; CueBard export: a campaign's group; MCP connector: campaigns and `not_an_adventure`); Prettier on the Markdown files touched
- [ ] 6.2 Screenshots of screens 11, 11b and 11c from the running branch, with the seeded campaign filled as the mockup's «Kulthos», for the architect
- [ ] 6.3 Owner LAN preview: a local compose stack from the branch with a seeded campaign holding General images and music with files, PCs, NPCs and handouts, and an empty campaign; the URLs, login and pages in a status note; stop and wait for the owner's go; take the stack down after

Commit: `docs: describe the campaign board`

## 7. Proof and hand-back of brief B

- [ ] 7.1 `npm run typecheck`, `npm test`, `npm run e2e` on the final HEAD
- [ ] 7.2 Hand-back to the architect: commits, test counts, e2e runs (normal and throttled), screenshots, departures from D2 to D5 and D11, the owner's answer to Q1 and Q2 if given

Commit: `chore(openspec): tick brief B of campaign-board`
