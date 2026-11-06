Each numbered group below is one commit, in Conventional Commits, that leaves
`npm run typecheck` and `npm test` green, with the trailers:

```
Refs: Stevesibilia/rpg-promptbook#52
Assisted-by: claude-code/<model-id>
Co-Authored-By: Claude <model name> <noreply@anthropic.com>
```

The checks are `npm run typecheck`, `npm test` (with `--reporter=default`
when you need passing tests' output) and `npm run e2e`. Prettier only on the
Markdown files you touch (`npx --yes prettier@3 --write <files>`).

## 0. Baseline

- [x] 0.1 On `main`, build Sabaoth's PDF with the four option sets of `layout/test/own-sections.test.ts` and record each SHA-256 here (D11)
  - `defaultLayoutOptions`: `22a799aed0ce74b8d8e4b14be1c7226d003d8c96632d6a2a4356d0647423b6ef` (302099 bytes)
  - `inkSaver`: `4ea88fe77ee700cfd0a6ab326345699086897ce76acd373fc8ab9b3296636f4a` (298435 bytes)
  - `pregenerated: false`: `a776c76020a9ca07763122e0bb0dfbd4bc8cfb63e65928672b043e87743eb5df` (288015 bytes)
  - `paper: 'us-letter'`: `7b5faae7226a54b04528ffc8a65a67b17dc126d67cfafed2a6f091f3c4aa62c3` (303178 bytes)
  - re-baselined 2026-11-06 by owner decision: tight leading in talent paragraphs
    - `defaultLayoutOptions`: `42adc6e28813cb30fb2e983c7a5d31bfc46e69a602437bf4d154b06014357318` (302113 bytes)
    - `inkSaver`: `e785911a3083f997691b678fbde6e81f96b5427d550a4b1afbffc715d71fd52a` (298454 bytes)
    - `pregenerated: false`: `842e47e98588059b2c6d404139e8d8219010ac93dbd2c7a92c57edb5a34be7a2` (288029 bytes)
    - `paper: 'us-letter'`: `f92bb33ea0e6debcff49775beb60f6e551d03219678fd0b699ef5d9f40ad97d8` (303189 bytes)

## 1. Format: systems and built-ins

- [x] 1.1 `systems.ts`: the schema and validation of D1; `defineSystems`, `builtinSystems`, types exported from `index.ts`
- [x] 1.2 `systems/`: the 12 built-ins of D2, from the mockup's `builtins()`
- [x] 1.3 Tests: every validation rule of D1 fails with a message naming the path; the built-ins validate; Historia equals D&D 5e but for name and id
- [x] 1.4 Commit `feat(format): game systems with sheet kinds`

## 2. Format: reading sheets by kind

- [x] 2.1 `template/avventura.ts`, `template/schema.ts`: sheet keys reduced to `Tipo`, old roles still accepted (D3)
- [x] 2.2 `parse/blocks.ts`: nested items on a list item; `parse/sheets.ts`: kind lookup and the block readers of D4; `model.ts`: `Sheet.kind` (D5)
- [x] 2.3 `checks/`: `system.unknown`, `sheet.field.required`, `sheet.value.invalid`, `sheet.grade.counts`, `sheet.nested-threat`, `ref.threat.outside` as in D8
- [x] 2.4 `convert/index.ts` from the Kulthos kind (D10)
- [x] 2.5 Tests: each block, sub-bullets and one-line forms; every mockup sample parses with no problem; each new problem; the existing parse, check, convert and acceptance tests pass, updated only where `threat` became `kind`
- [x] 2.6 Commit `feat(format): read sheets by their system's kind`

## 3. Layout: threat boxes by kind

- [x] 3.1 `input.ts`: generic `LayoutThreat` and its rows (D6); trackers with `show: 'none'` on the full sheet (D7)
- [x] 3.2 `avventura.typ`: `threat-box` draws every row variant (D6)
- [x] 3.3 Tests: rows of each mockup sample; a test adventure citing one sheet of each of the 17 kinds builds without error; Sabaoth's four hashes equal 0.1
- [x] 3.4 Commit `feat(layout): threat boxes for every sheet kind`

## 4. Web: insert and syntax sheet

- [x] 4.1 Insert menu «Sheet: <kind>» under `## Schede` (D9)
- [x] 4.2 Syntax sheet lists `Tipo` and the kinds' fields (D9)
- [x] 4.3 Tests: the menu entries for Kulthos and Outgunned, the inserted text; the syntax sheet test against the system
- [x] 4.4 Commit `feat(web): insert sheets by kind`

## 5. Proof and hand-back

- [x] 5.1 `npm run typecheck`, `npm test`, `npm run e2e`: literal results in the hand-back
- [x] 5.2 Sabaoth's four hashes on the branch equal 0.1
- [x] 5.3 PNG pages of the 17-kind test PDF, paths in the hand-back
- [x] 5.4 Hand back: results, hashes, PNG paths, departures from the design
