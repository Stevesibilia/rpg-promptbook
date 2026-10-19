## 1. Analysis, preview and problems

- [x] 1.1 Dependencies `@codemirror/lint` and `@codemirror/autocomplete` in `promptbook-web`; `src/editor/` replacing `src/project/Editor.tsx`, `EditorPage.tsx` rendered by `ProjectPage.tsx` (design decision 1); the `.later` notice removed
- [x] 1.2 `parse.worker.ts`, its client and the `analysis` state field: 250 ms debounce, one request in flight, fresh and stale results, synchronous parse for writes (decision 3); campaigns not parsed (decision 2)
- [x] 1.3 Live preview `ViewPlugin`: active lines, headings, bold and italic, field labels, callout boxes and header widget, front matter fold (decision 4); the hidden ranges built by a function of the state
- [x] 1.4 Diagnostics, gutter, themed underline and tooltip, fix actions through `fixes.ts`, F8 and Shift-F8 (decision 5)
- [x] 1.5 Tests: preview hidden ranges; `fixes.ts` fresh, stale found again, stale gone; the worker client's ordering with a fake worker

## 2. Layout, status bar and focus mode

- [x] 2.1 `Shell`: optional `left` panel and `focus` flag; project page top bar with outline and inspector toggles, focus button, ⌘K hint (decision 11); projects, bin and settings pages unchanged
- [x] 2.2 `cm/keymap.ts` shortcut table, document-level handler, Mod-/ replacing `toggleComment`; panel states in `localStorage`
- [x] 2.3 Focus mode (decision 11) and the status bar (decision 12)
- [x] 2.4 Styles from editor.html (outline, inspector, callout boxes, status bar), dark and light

## 3. Outline and moving scenes

- [x] 3.1 `outline.ts`: tree, badges, current item; campaign headings tree (decisions 2 and 6)
- [x] 3.2 `Outline.tsx`: click to jump, current item, drag handle, Alt+↑ and Alt+↓ on a focused scene
- [x] 3.3 `moveScene.ts` (decision 7), applied as one transaction from a fresh parse
- [x] 3.4 Tests: outline of Sabaoth with its badges; `moveScene` round trip byte-identical, reparse with the same scenes and no new problems, last scene before the next section

## 4. Inspector and inserts

- [ ] 4.1 `inserts.ts`: every insert of decision 8, strings from the template, template order, one blank line between blocks, cursor placement
- [ ] 4.2 `Inspector.tsx` with This scene, Checks, To-do (`TodoList`), Seed; sections open and closed remembered; campaign shows To-do and Seed only
- [ ] 4.3 Tests: each insert's text and position on Sabaoth and on the adventure skeleton (field between two present ones, empty scene, blank lines)

## 5. Insert menu, syntax sheet and palette

- [ ] 5.1 `/` menu and sheet completion (decision 9)
- [ ] 5.2 `syntax.ts` and `SyntaxSheet.tsx` (decision 10)
- [ ] 5.3 `palette.ts` and `CommandPalette.tsx` (decision 10)
- [ ] 5.4 Tests: `syntax.ts` covers every field, section and callout; `palette.ts` filtering with accents; menu entries for a scene, a section and the scenes section

## 6. End to end, preview and hand-back

- [ ] 6.1 `e2e/editor.spec.ts`: one test per scenario of the `editor` spec, against the compose stack and its seed; `projects.spec.ts` still passes
- [ ] 6.2 README: the editor's shortcuts in one short table
- [ ] 6.3 Preview for the owner: stack up from the working tree with the seed, reachable from the LAN (`PUBLIC_URL` and the relay), the URL, username and password and the pages to look at; wait for the owner's word before the last commit
- [ ] 6.4 Checks: `npm run typecheck`, `npm test` with Postgres, Playwright, Prettier on changed Markdown; a measured number for main-thread tasks while typing in Sabaoth; literal results in the hand-back
