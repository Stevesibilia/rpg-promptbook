Two briefs build this change: brief A groups 0 to 4 (format and layout),
brief B groups 5 to 8 (web, server, connector, e2e). Each numbered group
below is one commit, in Conventional Commits, that leaves
`npm run typecheck` and `npm test` green, with the trailers:

```
Refs: Stevesibilia/rpg-promptbook#55
Assisted-by: claude-code/<model-id>
Co-Authored-By: Claude <model name> <noreply@anthropic.com>
```

The checks are `npm run typecheck`, `npm test` (with `--reporter=default`
when you need passing tests' output) and `npm run e2e` (build web and
desktop first in a fresh worktree). Prettier only on the Markdown files you
touch (`npx --yes prettier@3 --write <files>`). The owner's campaign is
never written into the repository (D15).

## 0. Baseline (brief A)

- [x] 0.1 On `main`, build Sabaoth's PDF with the four option sets of `layout/test/own-sections.test.ts` and record each SHA-256 and size here; they must equal the values in that test
  - `defaultLayoutOptions`: 302113 bytes, `42adc6e28813cb30fb2e983c7a5d31bfc46e69a602437bf4d154b06014357318`
  - `inkSaver`: 298454 bytes, `e785911a3083f997691b678fbde6e81f96b5427d550a4b1afbffc715d71fd52a`
  - `pregenerated: false`: 288029 bytes, `842e47e98588059b2c6d404139e8d8219010ac93dbd2c7a92c57edb5a34be7a2`
  - `paper: 'us-letter'`: 303189 bytes, `f92bb33ea0e6debcff49775beb60f6e551d03219678fd0b699ef5d9f40ad97d8`

## 1. Format: campaign templates with PDF options (brief A)

- [x] 1.1 `template/schema.ts`: the campaign refusals and acceptances of D3
- [x] 1.2 `template/pdf.ts`: `sectionPdf(section, kind)` and `withPdf(section, patch, kind)` with the campaign defaults (D3); every caller in `packages/format` passes the kind (`checks/callouts.ts`, `template/changes.ts` with the campaign wording)
- [x] 1.3 `template/campagna.ts`: `campagnaV2` (D2); `registry.ts`: `builtinTemplates`, `defaultTemplateRef('campaign')` at v2, `latestBuiltin`, `builtinVersions`, `implicitTemplateRef` (D4); `index.ts` exports and `templates.campagnaV2`
- [x] 1.4 `packages/project`: `readTemplateRef` falls back to `implicitTemplateRef`; the `skeleton.ts` comment (D4)
- [x] 1.5 `packages/layout/src/input.ts`: pass `'adventure'` to `sectionPdf` (`:573`, `:603`); nothing else changes there
- [x] 1.6 Tests: each D3 rule with its path and message; adventure defaults unchanged; campaign defaults and `withPdf` dropping them; v2 validates with the sections and options of D2; v1 unchanged; `resolveTemplate` exact for both versions; `latestBuiltin('campagna')` is v2; a project meta without a template reads as `campagna@1`; a new campaign's skeleton has v2's thirteen headings; the `pdf` change wording for a campaign
- [x] 1.7 Commit `feat(format): campaign templates with PDF options`

## 2. Format: reading a campaign (brief A)

- [x] 2.1 `parse/blocks.ts`, `parse/frontmatter.ts`: the narrower context types of D5; `parseAdventure` unchanged
- [x] 2.2 `parse/campaign.ts`: `parseCampaign` and its types (D5); `matchSection` and `parseCampaign` exported from `index.ts`
- [x] 2.3 `fixtures/campagna-di-prova.md`: the invented fixture of D15, written with the `scrittura-italiana` skill
- [x] 2.4 Tests: the fixture's sections in order with `known`, `role`, `pdf`; lead text; ID and plain subheadings; a `> [!nota]` callout and a quote; ranges that slice back to the heading and block text; no problems returned; every existing parse test passes unchanged
- [x] 2.5 Commit `feat(format): read a campaign's sections and blocks`

## 3. Layout: the campaign template (brief A)

- [x] 3.1 `src/campaign.ts`: `toCampaignLayoutInput` and `CampaignLayoutInput` (D6); `LayoutOptions.template` widened; exports in `index.ts`
- [x] 3.2 `typst/avventura.typ`: move `page-of`, `checkbox`, `layout-table`, `h3`, `label-pars`, `md`, `section-heading` to top level with `ink-saver` (D7); run the four Sabaoth hash tests before going on; if any moves, stop and follow Risks
- [x] 3.3 `typst/campagna.typ`: head, contents box, sections, ID subheadings, blocks, quote box (D8), tabs, footer mark rule and part positions (D9)
- [x] 3.4 `src/engine.ts` (`TEMPLATES` with file and function, `build`/`pdf` input type), `src/assets.ts` (`/campagna.typ`), `src/checks.ts` (`campaignChecks`, `sceneId: string | null`) (D7, D11)
- [x] 3.5 Tests: `toCampaignLayoutInput` on the fixture (appendix absent, a section left out absent, the unknown section present and flowing, tabs «Fronti»… from first words, `mark` of flowing sections, a callout as a quote box, the 13th tab dropped with its check); the fixture builds A4, Letter and ink saver without error, within an expected page range, twice with the same bytes; contents page numbers equal the `part` positions' pages; Sabaoth's four hashes equal 0.1
- [x] 3.6 Commit `feat(layout): the campaign PDF template`

## 4. Proof and hand-back of brief A

- [x] 4.1 PNGs of every page of the fixture (A4, then ink saver), under the scratchpad
- [x] 4.2 The owner's campaign: `read_document` (projectId `10ee1b2b-c5c0-41ee-9e5e-4665b23c2095`) and `get_template` (`t-u9cjaveeg4`) into a scratch directory outside the repository; PNGs of every page with `campagna@2` and with «Campagna a fronti» v2; build times; nothing of it committed
- [x] 4.3 `npm run typecheck`, `npm test`: literal results; Sabaoth's four hashes on the branch equal 0.1
- [x] 4.4 Hand back: results, hashes, PNG paths, which helpers moved or were duplicated, departures from the design

## 5. Built-ins in two versions: web, server, connector (brief B)

- [ ] 5.1 `web/src/templates/list.ts:91` one entry per built-in id at its latest; `TemplateEditor.tsx:35` opens `latestBuiltin`, with the banner sentence of D4
  - list.ts:91 done in group 1 (brief A); TemplateEditor.tsx:35 and banner remain
- [ ] 5.2 `server/src/mcp/templates.ts`: `latestVersion` (`:62`), `list_templates` (`:201`), `get_template` (`:239`) as D4; the `save_template_version` text of D13 (`:290`)
- [ ] 5.3 `server/src/templates.ts`: `templateUsage` with `implicitTemplateRef` (`:158-161`), the comment at `:147`
- [ ] 5.4 Tests: one «Campagna» v2 in the web list and in `list_templates` with versions 1 and 2; `get_template` with and without a version; `duplicate_template` and `create_project` without a version give v2; usage counts a project without a template as `campagna@1`; a project on `campagna@1` resolves to v1 in web, server and desktop (`desktop/src/main/templates.ts`, read only)
- [ ] 5.5 Commit `feat(templates): built-ins with more than one version`

## 6. Web: the campaign PDF (brief B)

- [ ] 6.1 `TemplatesContext.tsx`: `useProjectTemplate` answers `document` and covers campaigns in `missing` (D10)
- [ ] 6.2 `pdf/protocol.ts`, `usePdf.ts`, `pdf.worker.ts`: `Template` in the request; the campaign path with `campaignChecks`; `options.template` from the kind (D10, D11)
- [ ] 6.3 `EditorPage.tsx`: `printable` beside `checked` at `:82`, `:108`, `:180`, `:355`; `palette.ts` `{ checked, printable }`
- [ ] 6.4 `PdfReview.tsx`: no «Pregenerated sheets» for a campaign, the template's name and version; `PdfPane.tsx`: the «not printed» caption and dimmed page (D10)
- [ ] 6.5 `outline.ts` `fromHeadings`: ID badges for `### X. Name` (D10)
- [ ] 6.6 Tests: palette entries for a campaign; the worker answers a campaign build; the review options; the pane caption in the appendix; the outline IDs; the adventure's tests unchanged
- [ ] 6.7 Commit `feat(web): PDF preview and review for campaigns`

## 7. Web: the template editor for campaigns (brief B)

- [ ] 7.1 `TemplateRows.tsx`: the campaign «In the PDF» column, the appendix tag, the Sections note, the Front matter note (D12); `draft.ts` passes the kind to `withPdf`
- [ ] 7.2 `marks.ts`, `StartingPreview.tsx`: «not in the PDF» and «new page» for campaigns (D12)
- [ ] 7.3 Tests: the built-in v2 column disabled with its values; a copy's toggles patch and toggle back to no change; no «Side column» for a campaign; the preview marks; the save dialog's «PDF options of «X»» for a campaign
- [ ] 7.4 Commit `feat(web): PDF options in campaign templates`

## 8. e2e, docs and hand-back of brief B

- [ ] 8.1 `e2e/pdf.spec.ts`: replace «campaign has no PDF» with the campaign PDF: button, pane, ⌘⇧P review without «Pregenerated sheets», Template «Campagna v2», «Save PDF» whose `pdfTexts` hold the section titles and not «Appendice»
- [ ] 8.2 `e2e/templates.spec.ts`: the built-in «Campagna» v2 column; a copy with «Aggiornamenti» left out and «Fazioni» on a new page, saved
- [ ] 8.3 Docs: `docs/design.md` (PDF preview and review, PDF for the table) and `README.md` where they say the PDF is for adventures only; check, change only what is wrong
- [ ] 8.4 The whole e2e suite green, once normally and once with `E2E_CPU_THROTTLE=3`; literal results
- [ ] 8.5 Screenshots (1440 x 900) of the states in design.md «Verification», under the scratchpad
- [ ] 8.6 Hand back: results, screenshot paths, departures from the design
