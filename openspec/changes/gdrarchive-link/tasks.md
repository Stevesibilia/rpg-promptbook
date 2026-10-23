Each numbered group below is one commit, in Conventional Commits, that leaves
`npm run typecheck` and `npm test` green, with the trailers:

```
Refs: Stevesibilia/rpg-promptbook#32
Assisted-by: claude-code/<model-id>
```

The repository has no lint script: the checks are `npm run typecheck`,
`npm test` and `npm run e2e`, and Prettier on the Markdown files touched
(`npx --yes prettier@3 --write <files>`). The proposal is committed by the
architect.

## 1. The link in the project

- [x] 1.1 `packages/project/src/gdrarchive.ts` (D2, D4, D10): `GDRARCHIVE_ORIGIN`, `GdrarchiveLink`, `ResolvedGdrarchive`, `parseGdrarchiveUrl`, `readGdrarchive`, `gdrarchiveOf`; `LIMITS.gdrarchiveLabel = 40` in `model.ts`; exported from `index.ts`
- [x] 1.2 `model.ts` `ProjectMeta.gdrarchive`; `doc.ts` `readMeta` reads it through `readGdrarchive`; new `setGdrarchive` (D3); the layout comment at `doc.ts:30-31` gains the key and the paragraph of D1
- [x] 1.3 `summary.ts`: `Summary.gdrarchive`, set by `summarize` for every category (D5); `row.ts` needs no code change
- [x] 1.4 Tests of D9 under `packages/project`: new `test/gdrarchive.test.ts`; cases in `doc.test.ts`, `summary.test.ts`, `row.test.ts`
- [x] 1.5 So the typecheck stays green: the fixture that builds a `ProjectRow` by hand gains `gdrarchive: null` (`packages/web/test/list.test.ts:13`), and the server's `toRow` (`packages/server/src/projects.ts:52-76`) passes `gdrarchive: null` until group 2 reads the columns

## 2. Server, connector, export

- [x] 2.1 `packages/server/migrations/006_gdrarchive.sql`: `gdrarchive_url text`, `gdrarchive_label text`, both nullable, and the check of D11, with a header comment naming this change
- [x] 2.2 `packages/server/src/projects.ts`: `DbRow`, `toRow`, `SELECT`, `summaryParams`, the `INSERT` of `insertProject` and the `UPDATE` of `storeProjectDoc` carry the two columns (D5)
- [x] 2.3 `packages/server/src/mcp/tools.ts` `get_project`: `gdrarchive` resolved with `gdrarchiveOf` and marked `inherited` (D7); the sentence of D7 in its description; `list_projects` unchanged
- [x] 2.4 `packages/project/src/export.ts` `exportProject`: `project.json` gains the own link, omitted when there is none (D8); `test/export.test.ts`
- [x] 2.5 Server tests of D9: `migrations.test.ts` (`:55` and the check), the row after a store (`projects.test.ts` or `sync.test.ts`), `mcp.test.ts` (`get_project` own, inherited, null)
- [x] 2.6 Desktop: no code change. Confirm `refreshRow` (`packages/desktop/src/main/projects.ts:64-84`) carries the link through `summarize`; add the case of D9 to `test/unit/router.test.ts`; confirm `window.ts:29-32` sends https links to the system browser

## 3. Web panel and top bar

- [x] 3.1 `packages/web/src/projects/gdrarchive.ts`: `linkText`, `linkTitle`, `formPreview`, `saveAction` (D12); `packages/web/test/gdrarchive.test.ts`
- [x] 3.2 `packages/web/src/projects/GdrarchiveLink.tsx`: `GdrarchiveLink`, `GdrarchiveField` (own, inherited, none) and `GdrarchiveForm` with the texts, titles, keys, error message, preview and «Remove link» rule of "The mockup in words"; focus as D14
- [x] 3.3 `ProjectPanel.tsx` `LivePanel`: `GdrarchiveField` under the "In" row, or under the status row for a campaign, with the campaign row from `campaigns` by the live `meta.campaignId`
- [x] 3.4 `project/top.tsx`: `useCampaignRow`; `ProjectCrumbs` and `ProjectMetaControls` take `campaign` (D13); the read-only pill after `StatusSelect` inside `.top-meta`; `EditorPage.tsx:285-286` and `ProjectShell.tsx:29-30` pass the row
- [x] 3.5 Styles from the mockup's `.gdr`, `.gdr-link`, `.gdr-form` rules in `projects/projects.css`, and the pill's in `editor/editor.css` beside `.top-meta`; light and dark
- [x] 3.6 Checks: `npm run typecheck`, `npm test`; screenshots of the panel (views 1 to 4 and 6, the form with its error) and the editor's top bar (view 5), light and dark, as PNG files for the architect (Settled questions)

## 4. End-to-end tests and docs

- [x] 4.1 `e2e/projects.spec.ts`: the flows of D9, on a campaign and an adventure the test creates
- [x] 4.2 The whole e2e suite green, once normally and once with `E2E_CPU_THROTTLE=3`
- [x] 4.3 Docs: README, a short "gdrarchive link" paragraph after "Hiding problems" (set it in the panel, the address rule, inheritance, the top bar, `get_project`); `docs/design.md`, under "Send to gdrarchive", one line on the link from #32 and that sending items is still later; Prettier on the files touched
- [x] 4.4 Checks (`npm run typecheck`, `npm test`, `npm run e2e`) and hand-back to the architect with the departures from the design and the risks met

## 5. Review and release (architect)

- [x] 5.1 Review against the design and the mockup; failures reported to the implementer, not worked around
- [x] 5.2 Owner go on the screenshots before the merge
- [ ] 5.3 Archive the change (`chore(openspec): archive gdrarchive-link`), merge, release `v0.10.0` (O1)
