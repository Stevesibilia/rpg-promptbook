One brief builds this change. Each numbered group is one commit, in
Conventional Commits, that leaves `npm run typecheck` and `npm test` green,
with the trailers the brief gives. The checks are `npm run typecheck`,
`npm test` (with `--reporter=default` when you need passing tests' output)
and `npm run e2e`. Prettier only on the Markdown files you touch
(`npx --yes prettier@3 --write <files>`), never on TypeScript.

## 1. Format: locks

- [x] 1.1 `template/locks.ts`: `READ_KEYS`, `isLocked` moved from `web/src/templates/draft.ts`; `lockViolations(base, next)` (D4); exported from `index.ts`; `draft.ts` imports them
- [x] 1.2 Tests: each violation with its message (locked section, scene field and box removed, role moved, role added, locked key renamed, box look changed); renaming a role section and a free key, adding and removing an own section, a needed box set to «any» and removed pass
- [x] 1.3 Commit `feat(format): template locks shared by the editor and the server`

## 2. Server: saving and updating

- [x] 2.1 `templates.ts`: `saveTemplateVersion` fills uids, checks `lockViolations` against the base version, refuses `no_changes` (D3, D4); `latestTemplate` exported (D7)
- [x] 2.2 `snapshots.ts`: `snapshotThenWrite` takes `also?: (doc) => void` in the same transaction (D8)
- [x] 2.3 DB tests through the REST route: a lock violation and `no_changes` refused, an editor-shaped save still accepted, new rows get uids
- [x] 2.4 Commit `feat(server): template saves keep locked rows`

## 3. Connector: template tools

- [x] 3.1 `mcp/templates.ts` `registerTemplateTools`: the six tools (D1, D2, D3, D5, D6, D8); `ToolKit` extended; `TOOL_NAMES` in D1's order
- [x] 3.2 `mcp/tools.ts`: `create_project`'s `template` (D7), `get_project`'s `template` (D9), `INSTRUCTIONS` and descriptions (D9), the header comment (D1)
- [x] 3.3 `test/db/mcp-templates.test.ts`: every tool's answer and refusal listed in design.md «Verification»; the tool count in `mcp.test.ts` (28)
- [x] 3.4 Commit `feat(server): template tools in the connector`

## 4. Web and docs

- [ ] 4.1 `TemplatesContext.tsx`: reload on focus and visibility, at most every 10 s (D10); a test with fake timers
- [ ] 4.2 `README.md` «Claude connector»: the template tools in a few lines
- [ ] 4.3 Commit `feat(web): templates saved elsewhere show on return`

## 5. Proof and hand-back

- [ ] 5.1 `e2e/templates.spec.ts` with `connectClaude`: duplicate «Avventura», create a project from the copy (v1) and open it; Claude saves v2 adding «Atmosfera» and renaming «Inizio forte» to «Apertura»; after the page gets the focus back the top bar shows «v2 available»; Claude calls `update_project_template`; the editor shows «## Apertura» and «## Atmosfera» without a reload; History lists the snapshot
- [ ] 5.2 `npm run typecheck`, `npm test`, `npm run e2e`: literal results
- [ ] 5.3 Hand back: results, departures from the design, anything from «Risks» that happened
