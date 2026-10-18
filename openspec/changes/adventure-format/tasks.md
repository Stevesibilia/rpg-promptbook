## 1. Workspace and CI

- [x] 1.1 Root `package.json` with npm workspaces (`packages/*`), `"private": true`, Node 26 in `engines` and `.nvmrc`
- [x] 1.2 Shared `tsconfig.base.json` (strict, ESM, `moduleResolution: bundler`), and `packages/format` with its own `package.json` (unscoped name `promptbook-format`, private) and `tsconfig.json`
- [x] 1.3 Dependencies: `unified`, `remark-parse`, `remark-gfm`, `remark-frontmatter`, `yaml`, `zod` 4; dev: `typescript`, `vitest`
- [x] 1.4 Root scripts `typecheck` and `test`; `npm test` runs vitest in every workspace
- [x] 1.5 GitHub Actions workflow on pull requests into `main`: `npm ci`, typecheck, test, and Prettier check on the Markdown files the pull request changes

## 2. Template definition

- [x] 2.1 zod schema for a template definition (meta keys, sections, scene fields, callouts, sheet keys, grade tables per system, limits, style) and `defineTemplate`, which validates and returns it typed
- [x] 2.2 Template `avventura@1` from the `enhanced-avventure-rpg` model: sections and their order, required and optional; scene fields inline or block, required or climax-only; callouts `leggi`, `documento`, `riquadro`, `riquadro|laterale`; sheet keys; Kulthos grades (Ordinaria 3/1, Straordinaria 6/2, Leggendaria 9/3); limits 300–600, 700, 5; forbidden em and en dash
- [x] 2.3 Tests: the shipped template loads; an invalid definition fails with a message naming the bad entry

## 3. Parser and model

- [x] 3.1 Model and problem types (serializable; every item with a `range` of offsets plus 1-based line and column; problems with code, severity, message, range, scene id, fixes as text edits)
- [x] 3.2 Front matter: YAML parse with key positions, required and unknown keys, SPDX check for `licenza`
- [x] 3.3 Callout transform over blockquotes: `[!type]`, `[!type] Title`, `[!type|meta] Title`
- [x] 3.4 Sections by `##` name; unknown sections kept as plain sections
- [x] 3.5 Scenes: `### S<n>. Name`, inline and block fields, callouts, reactions table and other tables, `→ Schede:` references, `asset:` images; anything else in a scene goes to unplaced content
- [x] 3.6 Overview: revelations under `**Rivelazioni**`, the scene map, «Da non perdere stasera»
- [x] 3.7 Sheets: fields with bold keys, threat data (`Tipo`, `Grado`, `Natura`, `Ferite`, `Afflizioni`, `Branco`, `Talenti`), pregenerated characters under `### Pregenerati`
- [x] 3.8 Clue tracker, NPC table, appendix rows by scene id
- [x] 3.9 `parseAdventure(text, { template })` assembling model and problems; a test that every top-level block of a document lands in the model or in a problem

## 4. Checks

- [x] 4.1 Sections: missing, order, «La vicenda in breve» first
- [x] 4.2 Scene fields: unknown label (with the "turn into a box" fix), missing required field, text before the first label, missing blank line, missing id, duplicate id
- [x] 4.3 Callouts: one `leggi` per scene and in «Inizio forte», untitled `documento`, unknown type, plain blockquote in a scene
- [x] 4.4 References: unresolved and ambiguous names, threats from `Chi c'è`, graded sheet cited outside `Chi c'è`
- [x] 4.5 Sheets: grade versus counts, threat nested in another sheet
- [x] 4.6 Clues and revelations: at least three clues per revelation, clues in at least two scenes, tracker versus scenes, references to missing revelations or scenes, `Indizi qui` with numbers only, scene map versus scenes
- [x] 4.7 Appendix: row per scene by id, title mismatch, missing `visual:` or `mood:`, `visual:`/`mood:` outside the appendix
- [x] 4.8 Limits and style: synopsis words, overview words, at most 5 global reminders, em and en dash
- [x] 4.9 One table-driven test per problem code, each with a minimal document

## 4b. Checks added at review

- [x] 4b.1 `callout.place` (warning): a known callout type in a place its definition's `allowedIn` does not list
- [x] 4b.2 `sheet.name.duplicate` (error): two sheets with the same name, at the second heading
- [x] 4b.3 Table-driven tests for both codes

## 5. Converter

- [ ] 5.1 `convertNote(text, { title })` computing edits from tree positions and applying them to the original text
- [ ] 5.2 Header and `# Title` to front matter, with subtitle and the caller's title as fallback
- [ ] 5.3 Plain blockquotes to `[!leggi]` and `[!documento]` in scenes and «Inizio forte»
- [ ] 5.4 `Tipo` line split into `Tipo`, `Grado`, `Natura`, `Ferite`, `Afflizioni`, `Branco`
- [ ] 5.5 HTML comments removed
- [ ] 5.6 Report: edits made plus the problems left after parsing the result
- [ ] 5.7 Tests: lines outside the converted parts are byte-identical; a second run makes no edits

## 6. Fixtures and acceptance

- [ ] 6.1 Copy the template's `esempio.md` from the public `rpg-prep` plugin into `packages/format/fixtures/`, with its source in a README; convert it and check the result parses with no errors
- [ ] 6.2 Copy L'Ancora di Sabaoth as it is (the architect puts it at `packages/format/fixtures/l-ancora-di-sabaoth.md` in the plan commit); after conversion the report includes the unknown field in S5 and the threat nested in Salvi's sheet
- [ ] 6.3 Timing check: parsing the converted Sabaoth takes under 50 ms on the CI runner, reported in the test output
- [ ] 6.4 A short `packages/format/README.md`: the API and the problem codes
