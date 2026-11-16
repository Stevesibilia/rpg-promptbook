Three briefs build this change. Brief A (groups 0 to 4) is the contract:
format and project. Brief B (groups 5 to 8) is the layout. Brief C (groups 9
to 13) is the web client, the server and the e2e. B and C start when A is
pushed, each in its own worktree, and run in parallel. Each numbered group
below is one commit, in Conventional Commits, that leaves
`npm run typecheck` and `npm test` green, with the trailers:

```
Refs: Stevesibilia/rpg-promptbook#63
Assisted-by: claude-code/<model-id>
Co-Authored-By: Claude <model name> <noreply@anthropic.com>
```

Read `design.md` whole before the first task: decisions A1 to A11 are cited
below by number, and its «Risks» say when to stop and report.

The checks are `npm run typecheck`, `npm test` (run vitest with
`--reporter=default` when you need passing tests' output) and, for brief C,
`npm run e2e`. The Mac has Node 24 and `.nvmrc` says 26: when a result looks
odd, run the check again in `node:26-alpine`. Nothing is installed on the
Mac. Prettier only on the Markdown files you touch
(`npx --yes prettier@3 --write <files>`), never on TypeScript. The owner's
adventures are never written into the repository.

**Who owns what.** A brief changes only its own files; a change needed
elsewhere is reported, not made.

- Brief A: `packages/format/**`, `packages/project/**`, and, in other
  packages, only what its own change breaks: the `what` record of
  `packages/web/src/templates/changes.ts` (one line for `'revelations'`) and
  test expectations that quote the starting document. It lists each such
  file in its hand-back.
- Brief B: `packages/layout/**`.
- Brief C: `packages/web/**`, `packages/server/**`, `packages/desktop/**`
  (no change expected), `e2e/**`, `README.md`.

## 0. Baseline (brief A)

- [ ] 0.1 Before any change, run the four «prints Sabaoth with the recorded bytes» tests of `packages/layout/test/own-sections.test.ts` (`npx vitest run test/own-sections.test.ts -t "recorded bytes" --reporter=default` in `packages/layout`) and confirm each SHA-256 and size equals the values below, which are the ones at `own-sections.test.ts:111-114`; tick only when they do
  - `defaultLayoutOptions`: 302113 bytes, `42adc6e28813cb30fb2e983c7a5d31bfc46e69a602437bf4d154b06014357318`
  - `inkSaver`: 298454 bytes, `e785911a3083f997691b678fbde6e81f96b5427d550a4b1afbffc715d71fd52a`
  - `pregenerated: false`: 288029 bytes, `842e47e98588059b2c6d404139e8d8219010ac93dbd2c7a92c57edb5a34be7a2`
  - `paper: 'us-letter'`: 303189 bytes, `f92bb33ea0e6debcff49775beb60f6e551d03219678fd0b699ef5d9f40ad97d8`

## 1. Format: column settings on templates (brief A)

- [ ] 1.1 `template/schema.ts`: `column` on `sectionSchema.pdf`, on `sceneFieldSchema` and on `overview`; the three refusals with their paths and messages (A4). The refusal on sections must also reach own sections, which the `superRefine` skips today (`:197`)
- [ ] 1.2 New `template/placement.ts` with the types, constants and functions of A4 (`COLUMN_WORDS`, `NIGHT_PARTS`, `SCENE_PARTS`, `DEFAULT_COLUMN`, `columnOfWord`, `columnMark`, `nightPartOf`, `scenePartOf`, `templateColumn`, `columnOf`, `withColumn`); exported from `index.ts`. `ColumnMark` is declared in `model.ts` (group 2 fills it in the parser; declare the type here so `columnOf` compiles)
- [ ] 1.3 `template/pdf.ts`: `withPdf` keeps `pdf.column`; `sectionPdf` unchanged (A4)
- [ ] 1.4 `template/changes.ts`: `what` gains `'revelations'`; `sections()` and `fields()` report a `'column'` change when `templateColumn` differs; `templateChanges` compares the revelations' column (A8). `packages/web/src/templates/changes.ts`: add `revelations: 'Revelations list'` to the `what` record so the workspace still compiles (brief C words the rest)
- [ ] 1.5 Tests: `avventura@1` validates unchanged and has no column key in its JSON; `templateColumn` gives the eight defaults; each refusal with its path (a role section that is not a night part, an own section, a campaign section, a field with another role, a field without a role); `withColumn` stores only what differs and removes the key when set back, for a section, a field and the revelations; `withPdf` after `withColumn` keeps the column and `withColumn` keeps `print`; `columnOf` with a known mark, an unknown mark, no mark; a column change of a section, a field and the revelations in `templateChanges`, and no `'pdf'` change with it
- [ ] 1.6 Commit `feat(format): column settings on templates`

## 2. Format: column marks in the text (brief A)

- [ ] 2.1 `model.ts`: `mark` on `Section` and `SceneField`, `revelationsLabel` on `Model` (A2)
- [ ] 2.2 `parse/sections.ts`: the mark off a `##` heading before `matchSection`, `heading` and `id` without it, `mark` set; `readRevelations` accepts a marked label and `readSection` stores `model.revelationsLabel`, also for a lone label with no list under it (A1, A2, A7)
- [ ] 2.3 `parse/scenes.ts` `readScene`: a label without a colon whose rest is exactly a mark is a block field with `text: ''` and `mark` set, and keeps its list or table (A2). Inline fields and `###` headings unchanged. `parse/campaign.ts` not touched
- [ ] 2.4 `checks/columns.ts` with `column.unknown` and `column.ignored`, their messages and fixes (A3); added to `checks/index.ts`
- [ ] 2.5 Tests: `## Orologio {laterale}`, `## Orologio{laterale}`, `## Orologio { Laterale }` (name, role, heading text, mark word, column, range that slices back to the braces); a closed heading `## Orologio {laterale} ##`; `## Appendice: immagini e musica` untouched; a marked block field keeps its list and gives no `content.unplaced`; a marked label followed by a table; `**In gioco:** {laterale}` and `**Da non perdere qui** {laterale} poi testo` stay inline with the braces as text; `**Rivelazioni** {principale}` gives the revelations and `revelationsLabel.mark`; a lone `**Rivelazioni** {laterale}` with no list gives `revelationsLabel`, no revelations and no `column.` problem; `**Rivelazioni** poi testo` with no list gives no `revelationsLabel`; a list item `- **R1.** {x}` is not a mark; `### S1. Il molo {laterale}` keeps its title; each warning of A3 with its code, range, message and fixes, and none for the two known words on a part with a column; the Sabaoth fixture parses to the same sections, fields and problems as before, with every `mark` null; `parseCampaign` on the campaign fixture is unchanged
- [ ] 2.6 Commit `feat(format): column marks in the text`

## 3. Project: the starting document and the update option (brief A)

- [ ] 3.1 `skeleton.ts`: the marks on the three section headings and on the first scene's block fields that take a column, and the revelations label with its mark under the overview's heading (A7); the campaign skeleton unchanged
- [ ] 3.2 `update.ts`: `writeColumns?: boolean` on `UpdateOptions` (optional, so today's callers compile), the edits of A8, never overlapping a rename of the same heading or label; marks in the text never changed
- [ ] 3.3 `targets.ts`: no code change expected; a test that `targetsOf` and `findTarget` name «Orologio» for `## Orologio {laterale}` and that the target's range still starts at the heading line
- [ ] 3.4 Tests: `skeleton.test.ts:107-131` with the new exact text for the adventure and the one-shot, the campaign texts unchanged; the skeleton of a template that moves a part writes that column; the skeleton parses with no `column.` problem; `updateEdits` with `writeColumns` on a text with no mark, with some marks (left alone, an unknown word included), with a renamed heading that also gets its mark, with an inline field of a column role (no mark written), with and without a revelations label; without the option the edits are the same as before this change
- [ ] 3.5 Run `npm test` for every workspace and update, in other packages' tests only, the expectations that quote the starting document; a test that writes its own document by hand keeps its text without marks. List each file touched
- [ ] 3.6 Commit `feat(project): write the column marks`

## 4. Proof and hand-back of brief A

- [ ] 4.1 `npm run typecheck`, `npm test`: literal results. The four Sabaoth tests of 0.1 pass unchanged
- [ ] 4.2 Push the branch. Hand back: the results; the exported names and signatures as built (briefs B and C code against them); every file touched outside `packages/format` and `packages/project`; departures from the design; anything from «Risks» you met

## 5. Baseline of brief B

- [ ] 5.1 First, before any edit, with brief A's commits in: the four Sabaoth tests of 0.1 pass in `packages/layout`. If one fails, stop and report: the cause is in the contract, not in the layout

## 6. Layout: the placement in the input (brief B)

- [ ] 6.1 `src/input.ts`: `night.main` and `night.side`, `main` and `side` on `LayoutScene`, each from `columnOf` with the part's mark, in the orders of A5 and A6; null parts in neither list; `night.revelations.from` as A6 says; a lone revelations label (no list under it) left out of the overview's blocks (A7); the comments on `LayoutScene` that say «The side column» and «The main column» corrected
- [ ] 6.2 Tests in `test/input.test.ts`: Sabaoth gives `night.main` `['clock', 'truths']`, `night.side` `['reminders', 'revelations']`, and for a scene with all four fields `main` `['happens', 'clues']`, `side` `['mustHave', 'cast']`; a mark moves one night section each way; `**Rivelazioni** {principale}` moves the revelations; a mark on a field moves it in that scene and not in the next; a template with columns set moves parts with no mark in the text; a mark beats the template; an unknown word leaves the template's column; a section left out or missing is in neither list; the starting document's lone `**Rivelazioni** {laterale}` is not among the overview's blocks and `night.revelations` is null; the side order with the clock and the truths both on the side (reminders, then text order); text order in the main column
- [ ] 6.3 Commit `feat(layout): placement of the night and scene parts in the input`. The Typst file still reads the old keys, so the PDF is unchanged: run the four Sabaoth tests

## 7. Layout: the Typst template renders by name (brief B)

- [ ] 7.1 `typst/avventura.typ`, night page (`:372-403`): one function per column that renders a part by its name with the look of A5's table; the main column from `night.main`, the side column from `night.side` then `night.sideBoxes`; the clock's list rule only around the clock in the main column; the side column and its `v(5mm)` only when it has something, else the main column full width (A6). Run the four Sabaoth tests after each edit
- [ ] 7.2 `typst/avventura.typ`, scene page (`:704-750`): the main column prints the read-alouds, then `scene.main`, then the rest as today; the side column prints `scene.side`, then the threats and the side boxes; full width when the side column has nothing (A6). Run the four Sabaoth tests after each edit
- [ ] 7.3 An invented fixture, `packages/layout/test/fixtures/la-lanterna-spenta.md`: a short adventure on the built-in template with every night part, a revelations label, three scenes with all four fields, one scene with a threat sheet, written with the `scrittura-italiana` skill. Nothing from the owner's adventures
- [ ] 7.4 PDF tests in a new `test/placement.test.ts` (one engine in the file): with no mark the positions of the fixture's parts are in the columns of today (compare the `x` of each part's `block` position with the main column's); `## Orologio {laterale}` prints the clock in the side column under the reminders; `**Rivelazioni** {principale}` prints the list in the main column; a marked field moves in its scene only; a template that moves parts, with no mark; a night page with every part on the main side prints full width (the block is wider than the main column of the default build) and so does a scene with nothing in the side column; no build error and no `{laterale}` or `{principale}` in the PDF's text in any of them; two builds give the same bytes
- [ ] 7.5 Commit `feat(layout): print each part in its column`

## 8. Proof and hand-back of brief B

- [ ] 8.1 PNGs under the scratchpad, rendered in a container, of the five cases of design.md «How it is verified for real»: the fixture by default, with marks, with a template that moves parts, an all-main night page, and the «Fair Play» case rebuilt with invented text (a long overview and a long «Rivelazioni» list), once with the default (the lonely box page) and once with `**Rivelazioni** {principale}` (no lonely box page)
- [ ] 8.2 `npm run typecheck`, `npm test`: literal results; the four Sabaoth hashes on the branch equal 0.1
- [ ] 8.3 Hand back: results, the hash pairs, PNG paths, the page counts of the two «Fair Play» builds, departures from the design, anything from «Risks» you met. Do not report tasks to Control Room: the architect does

## 9. Web: the template editor (brief C)

- [ ] 9.1 `templates/draft.ts`: a draft action that sets a part's column through `withColumn`; `pdfAction` keeps the column (it goes through `withPdf`)
- [ ] 9.2 `templates/TemplateRows.tsx`: the «Main | Side» switch in `PdfOptions` for the three roles, `rolePlaces.reminders` «Night page», the «↳ Rivelazioni» row under the overview's row, the «In the PDF» column of `FieldsTab` with the switch or the fixed tag of A9; all disabled read-only. `templates.css`: the switch (the mockup's `.col`), the sub-row, the wider `.g-sec` and `.g-fld` grids; check 1440 px and the narrow layout
- [ ] 9.3 A new `templates/PageSketch.tsx` for the night page and the scene page, under each table (design.md «The approved UI»)
- [ ] 9.4 `templates/marks.ts` `previewMarks`: match a `## ` heading without its mark (`:110-115`); `templates/changes.ts` `changeText`: «…prints in the side column» for a section, a field and the revelations, the box wording unchanged (A8)
- [ ] 9.5 Tests: each switch patches through `withColumn` and switching back leaves no change and no row mark; toggling «Printed» keeps the column; the Rivelazioni row shows for an adventure and not for a campaign, and is not a draft row; the fixed tags per field role; the sketch lists follow the draft and leave out a section left out; `previewMarks` still marks «optional», «not in the PDF» and changed on a marked heading; the three change texts; built-in read-only
- [ ] 9.6 Commit `feat(web): column switches in the template editor`

## 10. Web: the marks in the editor (brief C)

- [ ] 10.1 `editor/cm/preview.ts`: `cm-pm` and `cm-pm-bad` on a mark, never hidden; a label followed by a mark keeps `cm-fl`; `PreviewConfig.columnMarks` (A9). `editor/editor.css`: the two classes, as the mockup's `.pm` and `.pm.bad`
- [ ] 10.2 `editor/inserts.ts` `insertText` case `'field'`: the mark for a block field that takes a column (A7); check `slotAnchor` and the `/` menu's `existingField` (`cm/slash.ts:195`) still find a marked label
- [ ] 10.3 `editor/palette.ts` and `EditorPage.tsx`: the `column` option of `paletteEntries`, the two entries, the action that writes or replaces the mark as one edit (A9)
- [ ] 10.4 `editor/syntax.ts`: the «Columns» group (A9)
- [ ] 10.5 Tests: the preview items for a marked heading and a marked label on and off the active line, an unknown word, a campaign (no item); the insert text for the four fields on the built-in and on a template that moves one, and for an inline field; the palette's entries with the cursor in a section, a field's list, the revelations list, a part without a column, a campaign; the edit written with no mark, a known mark, an unknown word; the syntax rows
- [ ] 10.6 Commit `feat(web): column marks in the editor`

## 11. Web and server: the update option and the connector (brief C)

- [ ] 11.1 `templates/TemplateUpdate.tsx`, `templates/update.ts`: the third checkbox with the mockup's text, unticked, shown when the option would write at least one mark; the checks' preview and the update pass `writeColumns` (A8)
- [ ] 11.2 `server/src/mcp/templates.ts`: `writeColumns` on `UpdateOptions` and on the `update_project_template` tool, default false, with its description; the `save_template_version` text names `pdf.column`, the fields' `column` and `overview.column` and who accepts them
- [ ] 11.3 `server/src/mcp/tools.ts`: `fieldText` shows the mark on the block fields that take a column; `add_scene`'s description says the marks are optional and what they do; the instructions line about `replace_section` says to keep a heading's mark (A10)
- [ ] 11.4 Tests: the dialog's checkbox shown and hidden, its edits, one undo step; server tests with `TEST_DATABASE_URL` set to a throwaway Postgres (without it `npm test` skips them): `update_project_template` with and without `writeColumns`, `save_template_version` with a column saved and with a refused one (the path in the error), `get_outline` and `read_document` targets without marks on a marked document, the `add_scene` description, a scene added with marked labels reports no error
- [ ] 11.5 Commits `feat(web): column marks on a template update` and `feat(server): column marks through the connector`

## 12. e2e and docs (brief C)

- [ ] 12.1 In a fresh worktree build web and desktop before `npm run e2e`, and do not edit while the stack builds. Check that the volumes of an earlier e2e stack are gone first
- [ ] 12.2 `e2e/templates.spec.ts`: in an own template set «Orologio» to «Side» and «↳ Rivelazioni» to «Main»; the sketch, the starting document's marks, the save bar and the save dialog's two lines; the Scene fields tab's switches and tags; the built-in disabled
- [ ] 12.3 `e2e/projects.spec.ts` or `e2e/editor.spec.ts`: a project created from that template has `## Orologio {laterale}` in its document; the mark is visible with the cursor elsewhere; «Move to main column» from the palette rewrites it; an unknown word shows the warning in Checks; the saved PDF's text (`pdfTexts`) has no `{`
- [ ] 12.4 `e2e/templates.spec.ts`: the update dialog's third option on a project whose text has no marks: unticked by default, ticked writes the marks, one undo restores the text and the version
- [ ] 12.5 Fix the e2e specs that quote the starting document; the whole e2e suite green; literal results. Specs share one account in file order: keep new generating steps out of the files that sort before `generate.spec.ts`
- [ ] 12.6 Docs: `README.md` where it describes the format or the PDF; check, change only what is wrong (`docs/design.md` is already written by the architect)
- [ ] 12.7 Commit `test(e2e): column marks and switches`

## 13. Proof and hand-back of brief C

- [ ] 13.1 Screenshots (1440 x 900) under the scratchpad: the Sections tab with a moved part and the sketch, light and dark; the «↳ Rivelazioni» row; the Scene fields tab; the built-in; the starting document with marks; the save dialog with a column change; the update dialog with the third option; the editor with marks off the active line, an unknown word with its warning, the palette showing the command; the syntax sheet's «Columns» group
- [ ] 13.2 `npm run typecheck`, `npm test` (with `TEST_DATABASE_URL`), `npm run e2e`: literal results
- [ ] 13.3 Hand back: results, screenshot paths, departures from the design and from the mockup, anything from «Risks» you met. Do not report tasks to Control Room: the architect does

## Risks

The full list, with how to recognise each, is in design.md «Risks». The ones
that stop a brief:

- A Sabaoth hash moves (briefs A and B): never update the recorded values;
  bisect one edit at a time; report it when the default layout cannot be
  kept.
- A fixture or a hand-written test document parses differently because
  something in it now reads as a mark (brief A): report it with the line, do
  not change the document.
- You need a change in a file another brief owns (all): report it, do not
  make it.

## How it is verified for real

- Brief B's PNGs of the invented fixture with parts moved by marks and by
  the template, and of the «Fair Play» case with invented text: with
  «Rivelazioni» in the main column no page holds a lonely box.
- Sabaoth's four hashes, unchanged from 0.1, in briefs A and B.
- Brief C's e2e run and screenshots.
- The architect starts the local stack and gives the owner its addresses
  before the merge: the owner creates a project, moves a part with the
  palette and in the template editor, and looks at the PDF.
