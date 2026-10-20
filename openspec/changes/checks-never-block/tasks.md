## 1. Connector edits never refuse for problems

- [x] 1.1 Replace `refuseMoreErrors` in `packages/server/src/mcp/edits.ts` with a check that only reports (errors and warnings before and after, problems in the edited span). Keep every structural refusal.
- [x] 1.2 Update the `replace_section` and `add_scene` descriptions and any comment that says edits adding errors are refused (`tools.ts`).
- [x] 1.3 Update `packages/server/test/db/mcp.test.ts`: an edit that adds errors (a scene with no read-aloud, an appendix row for a scene that does not exist yet, a scene added before its appendix row) is written and its result lists the problems. Remove the `more_errors` expectations. Keep the structural refusal tests.

## 2. Several read-aloud boxes

- [x] 2.1 `leggi` in `packages/format/src/template/avventura.ts`: `perPlace: { min: 1, max: null }`; model and parser keep every read-aloud of a scene and of «Inizio forte» in order; checks report none as before and never report "more than one".
- [x] 2.2 Format tests: two `[!leggi]` in a scene and in «Inizio forte» give no problem and both are in the model; none is still an error.
- [x] 2.3 Layout: `LayoutScene` read-aloud as a list printed in order in the read-aloud slot of `typst/avventura.typ`; extra read-alouds no longer land in `boxes`; «Inizio forte» prints several in order. Layout tests for both.
- [x] 2.4 Web: inspector read-aloud row with no "1 per scene"; any other consumer the typecheck finds.

## 3. Close

- [ ] 3.1 `npm run typecheck`, the full unit tests (database tests included) and `npm run e2e` pass; Prettier on touched Markdown.
- [ ] 3.2 A PDF of a scene with two read-alouds and an «Inizio forte» with two, checked by eye (screenshot in the hand-back).
