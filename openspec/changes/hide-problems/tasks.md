Each numbered group below is one commit, in Conventional Commits, that leaves
`npm run typecheck` and `npm test` green, with the trailers:

```
Refs: Stevesibilia/rpg-promptbook#31
Assisted-by: claude-code/<model-id>
```

The repository has no lint script: the checks are `npm run typecheck`,
`npm test` and `npm run e2e`, and Prettier on the Markdown files touched
(`npx --yes prettier@3 --write <files>`). The proposal is committed by the
architect.

## 1. Hidden problems in the project

- [x] 1.1 `packages/project/src/hidden.ts` (D1 to D4): `HiddenHow`, `HiddenEntry`, `SNOOZE_MS`, `problemKey` (FNV-1a 32-bit over the whole lines, cut by offset, whitespace collapsed), `readHidden` (skips malformed values), `isActive`, `hideProblem`, `restoreProblem`, `restoreAll`, `putHidden` (each one transaction, deleting expired snoozes), `partitionProblems`, `nextExpiry`; exported from `index.ts`
- [x] 1.2 The layout comment in `packages/project/src/doc.ts:30-77` gains `hiddenProblems` in the style of the board and image-categories entries (D1)
- [x] 1.3 `packages/project/test/hidden.test.ts`: every case under `packages/project` in D9, including two replicas merging and housekeeping

## 2. Counts and the connector

- [x] 2.1 `packages/project/src/summary.ts`: `SummarizeOptions.now`; `summarize` counts shown problems only (D15); `test/summary.test.ts` cases from D9
- [x] 2.2 `packages/server/src/mcp/edits.ts`: `ProblemOut.hidden` and `until`, `problemOut` marking, `check(text, category, hidden, now)`, `report` and `apply` reading `readHidden(live.doc)` and one `now` (D6)
- [x] 2.3 `packages/server/src/mcp/tools.ts`: `get_outline` counts shown problems only, per target and in total; the sentence of D6 in the descriptions of `get_outline`, `replace_section` and `add_scene`
- [x] 2.4 `packages/server/test/db/mcp.test.ts`: the connector cases of D9 (marking, `until` on snoozed only, counts, `list_projects` row)
- [x] 2.5 Desktop: no code change; confirm `refreshRow` (`packages/desktop/src/main/projects.ts:64`) and `create.ts:112` build on `summarize` alone, and that the desktop unit tests stay green

## 3. Web editor

- [x] 3.1 `packages/web/src/dates.ts` `snoozeDate` (D4); `packages/web/src/ui/Toast.tsx` optional action, 6 s with an action (D16)
- [x] 3.2 `packages/web/src/editor/cm/hidden.ts`: `hiddenField`, `setHidden`, keys per analysis result against `Analysis.doc` (D11, D12); `Editor.tsx` observes `hiddenProblems` and schedules the `nextExpiry` timer (D7)
- [x] 3.3 `cm/problems.ts`: `pushDiagnostics` passes shown problems only and the diagnostics are rebuilt on `setHidden` when fresh; the tooltip's hide row, «Snooze a week» · «Dismiss» and the code, after the quick fixes, as the mockup (D8, Risks)
- [x] 3.4 `editor/Checks.tsx`: shown rows with «⋯» and its menu (keys of D8); the «Hidden (n)» disclosure with Restore, Restore all and the status lines; clicking a hidden row jumps to it; `Inspector.tsx` passes `doc` and the Hidden open state
- [x] 3.5 `editor/StatusBar.tsx` counts shown problems and shows «n hidden» with the eye-off icon; `editor/outline.ts` badges count shown problems, cache keyed on the hidden state too (D13)
- [x] 3.6 `EditorPage.tsx` `useHiding(doc)`: hide, restore, restore all, Undo and the toasts (D14); «n hidden» opens Checks with Hidden expanded; styles in `editor/editor.css` from the mockup
- [x] 3.7 Web unit tests of D9
- [x] 3.8 Checks: `npm run typecheck`, `npm test`; screenshots of the tooltip, the row menu, the Hidden list and the status bar, light and dark, for the architect

## 4. End-to-end tests and docs

- [ ] 4.1 `e2e/editor.spec.ts`: the flows of D9, the second browser context through `browser.newContext()` and `signIn`
- [ ] 4.2 The whole e2e suite green, once normally and once with `E2E_CPU_THROTTLE=3`
- [ ] 4.3 Docs: README, a short "Hiding problems" paragraph after "Editor shortcuts" (dismiss, snooze, the Hidden list, synced, the project list's counts after a snooze ends), and the connector section's sentence «An edit that adds template errors is refused» corrected to #27's behaviour plus the hidden marking; `docs/design.md`, the Checks bullet (hidden problems, a pointer to this change) and the connector's «An edit that adds template errors is refused» (`:340-341`) corrected the same way; Prettier on the files touched
- [ ] 4.4 Checks (`npm run typecheck`, `npm test`, `npm run e2e`) and hand-back to the architect with the departures from the design and the risks met

## 5. Review and release (architect)

- [ ] 5.1 Review against the design and the mockup; failures reported to the implementer, not worked around
- [ ] 5.2 Owner preview as decided (Open Questions)
- [ ] 5.3 Archive the change (`chore(openspec): archive hide-problems`), merge, release `v0.9.0` (O1)
