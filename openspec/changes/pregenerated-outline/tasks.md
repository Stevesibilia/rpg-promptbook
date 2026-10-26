One brief builds this change. Each numbered group is one commit, in
Conventional Commits, that leaves `npm run typecheck` and `npm test` green,
with the trailers the brief gives. The checks are `npm run typecheck`,
`npm test` (with `--reporter=default` when you need passing tests' output)
and `npm run e2e`. Prettier only on the Markdown files you touch
(`npx --yes prettier@3 --write <files>`), never on TypeScript.

## 1. Editor: outline rows

- [x] 1.1 `analysis/field.ts`: the `pregenerated` and `character` place kinds (D2)
- [x] 1.2 `outline.ts`: depth `0 | 1 | 2`, the block and characters under the sheets section sorted by `from`, names and places from D3; `OutlinePanel.tsx` class `sub2`; `editor.css` `.ol li.sub2`
- [x] 1.3 `Checks.tsx` `whereOf` and `cm/slash.ts` treat both kinds as `sheet` (D4)
- [x] 1.4 Tests from design.md «Verification»: `outline.test.ts`, `palette.test.ts`, `slash.test.ts`, `checks.test.ts`
- [x] 1.5 Commit `feat(web): pregenerated characters in the outline`

## 2. Connector: targets

- [ ] 2.1 `project/src/targets.ts`: the `pregenerated` and `character` target kinds (D5)
- [ ] 2.2 `server/src/mcp/tools.ts`: the three descriptions (D6)
- [ ] 2.3 Tests from design.md «Verification»: `project/test/targets.test.ts`, `server/test/db/mcp.test.ts`
- [ ] 2.4 Commit `feat(connector): pregenerated characters as targets`

## 3. Proof, docs and hand-back

- [ ] 3.1 `e2e/editor.spec.ts`: the outline test from design.md «Verification»
- [ ] 3.2 `docs/design.md:207-208`: the outline lists sections, scenes, sheets and pregenerated characters; `README.md` «Claude connector» only if it lists target kinds
- [ ] 3.3 Commit `test(e2e): pregenerated characters in the outline`
- [ ] 3.4 `npm run typecheck`, `npm test`, `npm run e2e`: literal results; a screenshot of the outline (block and three characters, light theme) saved under the scratchpad, path in the hand-back
- [ ] 3.5 Hand back: results, departures from the design, anything from «Risks» that happened
