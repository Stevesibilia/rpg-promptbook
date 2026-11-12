Issues Stevesibilia/rpg-promptbook#61 and #57; decisions D1 to D15 in
`design.md`; next release v0.21.0. One implementer builds groups 1 to 6 on
`feat/61-connector-board-images`. Each numbered group below is one commit,
in Conventional Commits, that leaves `npm run typecheck` and `npm test`
green, with the trailers:

```
Refs: Stevesibilia/rpg-promptbook#61
Assisted-by: claude-code/<your model id>
```

The checks are `npm run typecheck`, `npm test` (the server's database tests
need `TEST_DATABASE_URL` pointing at a throwaway Postgres whose database name
ends in `_test`, else they are skipped) and `npm run e2e` (in a fresh
worktree, build first: `npm run build -w promptbook-web && npm run build -w
promptbook-desktop`). Run the checks in `node:26-alpine` (the host has Node 24; nothing is installed on the host). Prettier only on the Markdown files
you touch (`npx --yes prettier@3 --write <files>`, in a container). Never
call the real OpenRouter or the real Atelier: every test runs against the
fakes. Write files with the Write and Edit tools, not shell heredocs.

## 1. Project: an Atelier id on an attached image

- [ ] 1.1 `packages/project/src/board.ts`: `toFile` and `checkNewFile` per
      D7; the comment on `FileEntry.atelierImageId` says both cases
- [ ] 1.2 Tests: an image with `atelierImageId` and no model is accepted
      and read back; one with `generatedVia: 'openrouter'` and an id is
      refused; a non-uuid id is refused; a generated Atelier file reads as
      before
- [ ] 1.3 Commit `feat(project): keep the Atelier id of an attached image`

## 2. Server: one way to start a generation

- [ ] 2.1 `packages/server/src/images/start.ts`: `startImageGeneration` and
      the starter per D2; `app.ts` builds the starter once and gives it to
      `imageRoutes` and `mcpRoutes`; the route keeps session, body and 202
- [ ] 2.2 `images/jobs.ts`: a run takes `addedBy` (D5); the storing part of
      `land()` exported for reuse (D8)
- [ ] 2.3 The existing route tests (`test/db/image-generate.test.ts`,
      `test/db/image-atelier.test.ts`) pass unedited; add one test: three
      jobs running, a fourth refused, one finishes, the next starts
- [ ] 2.4 Commit `refactor(server): share the generation start between the route and the connector`

## 3. Server: `attach_atelier_image`

- [ ] 3.1 `mcp/server.ts`, `routes/mcp.ts`, `mcp/tools.ts`: `McpDeps` and
      the `ToolKit` carry the starter (config, blobs, runs); `tool()` takes
      the optional `openWorld` hint (D12)
- [ ] 3.2 `mcp/tools.ts`: both names in `TOOL_NAMES` after
      `'remove_image_prompt'`; the `INSTRUCTIONS` sentence of D13
- [ ] 3.3 `mcp/board.ts`: `attach_atelier_image` per D6, D7, D9, D10, with
      the description of D13 word for word; `legible()` per D10
- [ ] 3.4 `test/db/fake-atelier.ts`: a way to add an image by bytes (D15)
- [ ] 3.5 Tests in `test/db/mcp-board.test.ts` (or a file beside it): an
      image attached (file entry fields of D7, blob stored, no
      `image_generations` row, spending unchanged); attached twice
      (`already`); OpenRouter as the account's provider still attaches; each
      row of D10's table with its code and message, the board unchanged
      after each; an unknown prompt refused before Atelier is called; a
      campaign answers `no_board`; a read grant answers `insufficient_scope`;
      the token in no error text
- [ ] 3.6 Commit `feat(connector): attach an Atelier image to an image prompt`

## 4. Server: `generate_image` and `get_board`

- [ ] 4.1 `mcp/board.ts`: `generate_image` per D3, D4, D10, D12, with the
      description of D13 word for word
- [ ] 4.2 `mcp/board.ts`: `itemOut` gains `generating` and
      `generationError` (D11)
- [ ] 4.3 Tests: two images generated through each fake provider (answer of
      D4, files `addedBy: 'claude'`, an `image_generations` row each);
      defaults from the account's settings and `defaultShape`;
      `waitSeconds: 0` answers running and the job still finishes; `no_key`,
      `prompt_empty`, `unknown_prompt`, `busy` against a job started from
      the route, `too_many_jobs` counting route and tool together, `quota`
      at 409, a read grant; `get_board` shows `generating` true during a
      slow job and `generationError` after a failed one
- [ ] 4.4 `test/db/mcp.test.ts`: 30 tools, the read-only and destructive
      lists unchanged, `generate_image` the only tool with `openWorldHint`
      true
- [ ] 4.5 Commit `feat(connector): generate images on an image prompt`

## 5. Web: the viewer row

- [ ] 5.1 `packages/web/src/board/generate.ts` and `Viewer.tsx`: the row of
      D14; no badge for an attached image
- [ ] 5.2 Tests: the row with and without an Atelier address; no row for a
      dropped file; `badge()` null for an attached image
- [ ] 5.3 Commit `feat(web): show where an attached Atelier image came from`

## 6. Docs, checks, hand-back

- [ ] 6.1 `README.md` (Claude connector, :213-243): the two tools, that
      `generate_image` spends money, that attaching needs the Atelier token;
      `docs/design.md` :429-431 names them
- [ ] 6.2 Commit `docs: the connector's image tools`
- [ ] 6.3 `openspec validate connector-board-images --strict` passes
- [ ] 6.4 `npm run typecheck`, `npm test` with the database, `npm run e2e`:
      results quoted as printed
- [ ] 6.5 Push, tick these tasks in a last commit
      `chore(openspec): tick the tasks of connector-board-images`, hand back
      to the architect with the results and any departure from the design

## 7. Architect

- [ ] 7.1 Review, pull request, checks, merge
- [ ] 7.2 Tag v0.21.0, watch the release and the deploy
- [ ] 7.3 Live check per the design's Verification
- [ ] 7.4 Archive the change, close #61, update #57
