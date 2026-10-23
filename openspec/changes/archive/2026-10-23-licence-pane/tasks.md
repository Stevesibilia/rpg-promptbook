Each numbered group below is one commit, in Conventional Commits, that leaves
`npm run typecheck` and `npm test` green, with the trailers:

```
Refs: Stevesibilia/rpg-promptbook#33
Assisted-by: claude-code/claude-opus-5-5
```

The repository has no lint script: the checks are `npm run typecheck`,
`npm test` and `npm run e2e` (CI runs the e2e under `xvfb-run -a`), and
Prettier on the Markdown files touched only
(`npx --yes prettier@3 --write <files>`), never on TypeScript. The proposal
is committed by the architect.

## 1. The list and the pane

- [x] 1.1 `packages/web/src/licence/licences.ts` (D1, D2, D3): `Mark`, `LicenceMarks`, `LicenceEntry`, `LICENCES` and `LICENCE_MARKS`, with the copy, urls and marks of "The eight entries" word for word
- [x] 1.2 `packages/web/src/licence/LicencePane.tsx` (D4, D14): on `Modal` with `className="lic"`; the listbox with `aria-activedescendant`, focused on mount; the «Current» chip and the free-text note; click, double-click, Enter, ↑ ↓ wrapping, Home, End; «Full text» never selects or picks; «Use licence» disabled with no selection or the current one («Already the licence»); the «Writes» line and footer note by `context`; marks with `title` and `aria-label`
- [x] 1.3 `packages/web/src/licence/licence.css`: the mockup's `.modal.lic`, `.cur-note`, `.lic-*`, `.radio` and `.mark` rules and its 760 px query, on the app's tokens, light and dark
- [x] 1.4 `packages/web/test/licences.test.ts` (D11)
- [x] 1.5 Commit `feat(web): licence list and pane`

## 2. Settings

- [x] 2.1 `settings/SettingsPage.tsx` `AuthorDefaults` (D5): «Choose…» beside the Licence input in a `.with-btn` row, the hint under it; the pane with `context: 'settings'` and `current` from the input at the click; a pick saves as the blur does and shows in the input; focus back on «Choose…»; typed values of the other fields kept
- [x] 2.2 `settings/settings.css`: the mockup's `.field .with-btn` rules
- [x] 2.3 E2E in `e2e/projects.spec.ts` (D11): open from Settings, the current row selected, pick CC BY 4.0, the field shows `CC-BY-4.0`, a reload keeps it; the previous default put back at the end
- [x] 2.4 Commit `feat(web): choose the default licence in Settings`

## 3. Editor

- [x] 3.1 `packages/web/src/editor/licence.ts` (D6, D13): `licenceEdits` and `currentLicence`; `packages/web/test/licence.test.ts` with the cases of D11
- [x] 3.2 `editor/palette.ts` (D7): `{ kind: 'licence' }` and «Choose licence…» before «Back to projects» for every category; `test/palette.test.ts`
- [x] 3.3 `editor/cm/preview.ts` (D8): the `licence` item, `LicenceChoose`, `licenceHandler`; `test/preview.test.ts` cases of D11; the `.cm-fm-licence` style in `editor/editor.css` from the mockup's `.lic-choose`
- [x] 3.4 `editor/EditorPage.tsx` (D7, D8, D14): `dialog` gains `'licence'`; `runPalette` opens it; `licenceHandler.of(...)` in the extensions memo through a ref; the pane with `context: 'editor'`, `current` from `currentLicence`; a pick writes with `write(view, licenceEdits(view.state.doc, value), { userEvent: 'input.licence' })` and closes with `closeDialog`
- [x] 3.5 E2E in `e2e/editor.spec.ts` on a project made with `projectWith` (D11): palette pick rewrites the line; ⌘Z restores it in one step; the caret did not move; the widget shown with the caret in the front matter and gone with it in the body; the free-text note; the line added after `copyright:`
- [x] 3.6 Commit `feat(web): choose the licence from the editor`

## 4. Specs, docs, review and checks

- [x] 4.1 Check the spec deltas against what was built (`specs/editor/spec.md`, `specs/projects-screen/spec.md`); report any other spec the change touches
- [x] 4.2 Docs: README, a short "Choosing a licence" paragraph after "gdrarchive link" (the palette command, «Choose…» on the `licenza:` line, Settings, free text still works, not legal advice); `docs/design.md`, under "Author, copyright and licence", one line on the pane from #33; Prettier on the files touched
- [x] 4.3 Self-review by a reviewer subagent given the diff, the design and the mockup, for races (Settings save and pick, document changed while the pane is open), focus and accessibility (listbox, marks, return of focus, narrow layout); every finding fixed or reported
- [x] 4.4 The whole e2e suite green, once normally and once with `E2E_CPU_THROTTLE=3`
- [x] 4.5 Checks: `npm run typecheck`, `npm test`, `npm run e2e`
- [x] 4.6 Preview for the owner: stack up from the working tree with the seed, reachable from the LAN (`PUBLIC_URL` and the relay), the URL, username and password and the pages to look at (Settings → Author and licence; a project's front matter, the palette and the pane, light and dark, wide and narrow); a status note with them; stop and wait for the owner's go
- [x] 4.7 Commit `docs: licence pane`; hand-back to the architect with the departures from the design and the risks met

## 5. Review and release (architect)

- [x] 5.1 Review against the design and the mockup; failures reported to the implementer, not worked around
- [x] 5.2 Owner go on the preview before the merge
- [x] 5.3 Archive the change (`chore(openspec): archive licence-pane`), merge, release `v0.11.0`
