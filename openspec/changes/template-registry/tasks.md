Each numbered group below is one commit, in Conventional Commits, that leaves
`npm run typecheck` and `npm test` green, with the trailers:

```
Refs: Stevesibilia/rpg-promptbook#34
Assisted-by: claude-code/<model-id>
Co-Authored-By: Claude <model name> <noreply@anthropic.com>
```

The checks are `npm run typecheck`, `npm test` (with `--reporter=default`
when you need passing tests' output) and `npm run e2e`. Prettier only on the
Markdown files you touch (`npx --yes prettier@3 --write <files>`).

## 0. Baseline

- [x] 0.1 On `main`, build Sabaoth's PDF with the layout test helpers and record its SHA-256 here (D9)
  - `defaultLayoutOptions`: `22a799aed0ce74b8d8e4b14be1c7226d003d8c96632d6a2a4356d0647423b6ef` (302099 bytes)
  - `inkSaver`: `4ea88fe77ee700cfd0a6ab326345699086897ce76acd373fc8ab9b3296636f4a`
  - `pregenerated: false`: `a776c76020a9ca07763122e0bb0dfbd4bc8cfb63e65928672b043e87743eb5df`
  - `paper: 'us-letter'`: `7b5faae7226a54b04528ffc8a65a67b17dc126d67cfafed2a6f091f3c4aa62c3`

## 1. Format: roles, systems, kinds, registry

- [x] 1.1 `template/schema.ts`: new section roles and field roles (D1); `kind` and the campaign shape as a discriminated union, `AdventureTemplate`, `CampaignTemplate`, `Template` (D3); `systems` removed (D2)
- [x] 1.2 `systems.ts`: `systemSchema`, `defineSystems`, `builtinSystems` (D2); `parse/sheets.ts`, `checks/sheets.ts`, `convert/index.ts` and `parseAdventure`'s options use them
- [x] 1.3 `template/avventura.ts`: `kind: 'adventure'`, the new roles, no `systems`; `template/campagna.ts` (D3)
- [x] 1.4 `template/registry.ts`: `TemplateRef`, `builtinTemplates`, `resolveTemplate`, `defaultTemplateRef` (D4); exports in `index.ts`
- [x] 1.5 Tests: the registry, the campaign template, roles unique, the renamed-`mustHave` scenario at the format level (the layout half is in 3.2)
- [x] 1.6 Commit `feat(format): template kinds, roles and a registry`

## 2. Project: the pinned template

- [x] 2.1 `model.ts`, `doc.ts`: `ProjectMeta.template`, read with the default, written at creation, `setTemplate` (D5); the doc header comment
- [x] 2.2 `template.ts`: `templateOf`, `adventureTemplateOf` (D6)
- [x] 2.3 `skeleton.ts` from the project's template, campaign included, same output (D3); `summary.ts`, `targets.ts`, `appendix.ts`, `board.ts` through `templateOf`
- [x] 2.4 Tests: old project with no `template` reads the default; new project records it; skeletons unchanged for all three categories
- [x] 2.5 Commit `feat(project): projects record their document template`

## 3. Layout by role

- [x] 3.1 `input.ts`: the template as a parameter; `FIELD` and the four section lookups by role (D1, D6)
- [x] 3.2 Tests: a copy of `avventura` with `mustHave` renamed puts that field in the side column; Sabaoth's hash matches 0.1
- [x] 3.3 Commit `refactor(layout): find sections and fields by role`

## 4. Web

- [x] 4.1 `Editor.tsx`, `SyntaxSheet.tsx`, `StatusBar.tsx`, `ThisScene.tsx`, `PdfReview.tsx`, `analysis/field.ts`, `inserts.ts`: the template from the project (D6); `READ_ALOUD_AFTER` from the `mustHave` role (D1)
- [x] 4.2 Parse and PDF workers receive the template with each request (D7)
- [x] 4.3 Commit `refactor(web): the editor uses the project's template`

## 5. Server and desktop

- [ ] 5.1 `server/src/snapshots.ts`, `mcp/edits.ts`: the project's template; `mcp/tools.ts` descriptions from the built-in (D8)
- [ ] 5.2 `desktop/src/main/snapshots.ts`: the project's template (see Risks)
- [ ] 5.3 `grep -rn "templates.avventura" packages/*/src` finds nothing outside `packages/format` (D4)
- [ ] 5.4 Commit `refactor: server and desktop use the project's template`

## 6. Proof and hand-back

- [ ] 6.1 `npm run typecheck`, `npm test`, `npm run e2e`: literal results in the hand-back
- [ ] 6.2 Sabaoth PDF SHA-256 on the branch equals 0.1
- [ ] 6.3 Hand back: results, the hash pair, any label found outside the list, departures from the design
