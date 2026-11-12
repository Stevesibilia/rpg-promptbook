Two briefs build this change: brief A groups 1 to 4 (project model, server,
fake Atelier), brief B groups 5 to 8 (web, e2e, chart and docs). Each numbered
group below is one commit, in Conventional Commits, that leaves
`npm run typecheck` and `npm test` green, with the trailers:

```
Refs: Stevesibilia/rpg-promptbook#59
Assisted-by: claude-code/<model-id>
```

The checks are `npm run typecheck`, `npm test` (with `--reporter=default`
when you need passing tests' output; the server's database tests need
`TEST_DATABASE_URL` pointing at a throwaway Postgres whose database name ends
in `_test`, else they are skipped) and `npm run e2e` (in a fresh worktree,
build first: `npm run build -w promptbook-web && npm run build -w
promptbook-desktop`). Run the checks in `node:26-alpine` (the host has Node
24; nothing is installed on the host). Prettier only on the Markdown files you
touch (`npx --yes prettier@3 --write <files>`). Never call the real OpenRouter
or the real Atelier: every test and preview runs against the fakes (D15).

## 1. Project: provider on settings, files and jobs (brief A)

- [x] 1.1 `packages/project/src/providers.ts` per D5; exports in `index.ts`
- [x] 1.2 `settings.ts`: `imageGeneration.provider`, default and old settings read `'openrouter'` (D5)
- [x] 1.3 `board.ts`: `FileEntry.generatedVia` and `atelierImageId`, read, checked and written per D11; `NewFile` takes both optionally
- [x] 1.4 `generation.ts`: `GenerationJob.provider`, `startGenerationJob` takes it, `toJob` reads a missing one as `'openrouter'` (D11)
- [x] 1.5 Tests: settings default and an old settings object; a generated file with and without `generatedVia`; a non-uuid `atelierImageId` dropped; a job with and without `provider`
- [x] 1.6 Commit `feat(project): image provider on settings, generated files and jobs`

## 2. Server: configuration, secrets, the Atelier client (brief A)

- [x] 2.1 `config.ts`: `ATELIER_URL` → `Config.atelierUrl` (D2); `testConfig` in `test/db/helpers.ts`; `startApp` takes `atelierUrl`
- [x] 2.2 `migrations/009_atelier.sql` per D3 (check the constraint name first); `test/db/migrations.test.ts` lists it
- [x] 2.3 `images/secrets.ts` by kind per D4; callers updated, no behaviour change
- [x] 2.4 `images/atelier.ts` per D6
- [x] 2.5 `test/db/fake-atelier.ts` per D15
- [x] 2.6 `routes/settings.ts`: `imageGeneration.provider` validated and kept (D5)
- [x] 2.7 Tests: `loadConfig` for `ATELIER_URL` (absent, blank, https, http, no scheme, trailing `/` removed); the client against the fake for each step and error kind (JSON error, network, oversize answer); the token never in an error message
- [x] 2.8 Commit `feat(server): Atelier address, token storage and API client`

## 3. Server: token routes, status, generating through Atelier (brief A)

- [x] 3.1 `PUT` and `DELETE /api/image-generation/atelier-token` and the status fields per D8; D5's switch on removal
- [x] 3.2 Generate route per D9; `startGenerationJob` with `provider`
- [x] 3.3 `jobs.ts`: `land` extracted (OpenRouter path unchanged), the Atelier path per D10 with the collection per D7
- [x] 3.4 Spending per provider per D12
- [x] 3.5 Db tests per Verification (token routes, status with `?check=1`, generation through Atelier, collection made once, reused and remade, partial failure, cap reached, token removed mid-job, the switch, spending per provider, the token in no body or captured log line); every existing OpenRouter test passes unchanged
- [x] 3.6 Commit `feat(server): generate board images through Atelier`

## 4. Brief A hand-back

- [x] 4.1 Push; hand back with literal typecheck, unit and db results, any departures, and the status JSON as the fake returns it for a checked Atelier token (brief B builds against it)

## 5. Web: Settings → Image generation (brief B)

- [x] 5.1 `api.ts`: the status type per D8, `saveAtelierToken`, `removeAtelierToken`, the provider in settings
- [x] 5.2 `settings/ImageGeneration.tsx` and `imageGenerationTexts.ts`: Generate through, the Atelier card, defaults and spending changes per D13
- [x] 5.3 Tests: each card state of mockup screens 1, 1b, 1c, 1d; choosing a provider saves it and toasts; Remove switches per D5
- [x] 5.4 Commit `feat(web): choose Atelier or OpenRouter in Settings`

## 6. Web: panel, viewer, board (brief B)

- [ ] 6.1 `board/GeneratePanel.tsx` and `board/generate.ts`: the Through line, estimates per provider, the no-credential sentence, the check on open (D13)
- [ ] 6.2 Generating line, badge tooltip, viewer's Through row and link, "Generated here" tooltip (D13)
- [ ] 6.3 Tests for each, including an old generated file reading as OpenRouter and the link only when the status has the url
- [ ] 6.4 Commit `feat(web): show which provider generates and link Atelier images`

## 7. E2E, chart, docs (brief B)

- [ ] 7.1 `e2e/atelier/serve.mjs`, `e2e/compose.atelier.yaml`, `e2e/stack.ts` per D15
- [ ] 7.2 A spec in `e2e/generate.spec.ts` (or a new `generate-atelier.spec.ts`) per Verification; the existing generate spec unchanged
- [ ] 7.3 Chart `app.atelier.url` and the env per D2, `values-homelab.yaml`, `compose.yaml`, `.env.example`; `docs/deploy-homelab.md` and `docs/design.md` (Atelier as a provider)
- [ ] 7.4 Commit `feat: run the Atelier path end to end and deploy its address`

## 8. Brief B hand-back

- [ ] 8.1 Screenshots per Verification against the fake, saved outside the repository, paths in the hand-back
- [ ] 8.2 Push; hand back with literal results of typecheck, unit, db and e2e, the screenshots, departures
