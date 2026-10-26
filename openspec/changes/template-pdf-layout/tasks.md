One brief builds this change. Each numbered group is one commit, in
Conventional Commits, that leaves `npm run typecheck` and `npm test` green,
with the trailers the brief gives. The checks are `npm run typecheck`,
`npm test` (with `--reporter=default` when you need passing tests' output)
and `npm run e2e`. Prettier only on the Markdown files you touch
(`npx --yes prettier@3 --write <files>`), never on TypeScript.

## 0. Baseline

- [x] 0.1 On `main`, build Sabaoth's PDF with the layout test helpers and default options and record its SHA-256 and size here
      (2026-10-26, `ae39583`: `22a799aed0ce74b8d8e4b14be1c7226d003d8c96632d6a2a4356d0647423b6ef`, 302099 bytes)

## 1. Format: section PDF options

- [x] 1.1 `template/schema.ts`: `pdf` on `sectionSchema`; the refusals in the adventure and campaign `superRefine` (D1)
- [x] 1.2 `template/pdf.ts`: `sectionPdf`, `withPdf` (D1); exported from `index.ts`
- [x] 1.3 `template/changes.ts`: detail `'pdf'` (D6)
- [x] 1.4 `checks/callouts.ts`: a side box in an own section with a side column is allowed (D5)
- [x] 1.5 Tests: defaults per role and for own sections, each refusal with its path, `withPdf` dropping defaults, the `pdf` change, the callout check both ways
- [x] 1.6 Commit `feat(format): PDF options on template sections`

## 2. Layout: own sections and sections left out

- [x] 2.1 `input.ts`: `OwnSlot`, `LayoutOwnSection`, `LayoutInput.own` with the anchors of D2 and the side column split (D3); `role()` skips sections left out (D4); sheets and sheet links when «Schede» is out (Risks)
- [x] 2.2 `typst/avventura.typ`: the own-sections function at the eight slots, the shared side-column code with the rules (D3); the night heading and the references part only when they have something (D4)
- [x] 2.3 Tests in `input.test.ts`: each row of D2's table, an own section before any role section, an unknown section not printed, the side column split, each role left out, sheet references as text
- [x] 2.4 PDF test (one engine): «Atmosfera» after «Inizio forte» on its own page after the start page; with `newPage: false` on the start page; «Schede» left out builds without error; Sabaoth's default hash equals 0.1
- [x] 2.5 Commit `feat(layout): print own sections and leave sections out`

## 3. Web: the «In the PDF» column

- [ ] 3.1 `TemplateRows.tsx` `SectionsTab`: the column, toggles and footer text (D7); `templates.css` grid and `.tg` styles
- [ ] 3.2 `marks.ts`, `StartingPreview.tsx`: «not in the PDF» (D7)
- [ ] 3.3 `templates/changes.ts`: «PDF options of «X»» (D6)
- [ ] 3.4 Tests: the toggles patch through `withPdf`, toggling back leaves no change, the preview mark, the change text, no column for a campaign
- [ ] 3.5 Commit `feat(web): PDF options in the template editor`

## 4. Proof and hand-back

- [ ] 4.1 `e2e/templates.spec.ts`: add «Atmosfera», leave out «Prima della sessione», save; a new project from it with text under «Atmosfera»; the saved PDF's text has «Atmosfera» and not «Prima della sessione»
- [ ] 4.2 `npm run typecheck`, `npm test`, `npm run e2e`: literal results
- [ ] 4.3 Screenshots (1440 x 900) of the states listed in design.md «Verification», saved under the scratchpad, paths in the hand-back
- [ ] 4.4 Hand back: results, the hash pair, departures from the design
