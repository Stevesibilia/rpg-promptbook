Two briefs build this change: brief A groups 1 to 5 (project model and
server), brief B groups 6 to 12 (web, desktop states, e2e). Each numbered
group below is one commit, in Conventional Commits, that leaves
`npm run typecheck` and `npm test` green, with the trailers:

```
Refs: Stevesibilia/rpg-promptbook#57
Assisted-by: claude-code/<model-id>
Co-Authored-By: Claude <model name> <noreply@anthropic.com>
```

The checks are `npm run typecheck`, `npm test` (with `--reporter=default`
when you need passing tests' output; the server's database tests need
`TEST_DATABASE_URL` pointing at a throwaway Postgres whose database name ends
in `_test`, else they are skipped) and `npm run e2e` (in a fresh worktree,
build first: `npm run build -w promptbook-web && npm run build -w
promptbook-desktop`). The repository wants Node 26: run the checks in
`node:26-alpine` when the host's Node is older. Prettier only on the Markdown
files you touch (`npx --yes prettier@3 --write <files>`). Never call the real
OpenRouter: every test and preview of the implementer runs against the fake
(D17).

## 1. Project: models, what is sent, generated files, jobs (brief A)

- [x] 1.1 `packages/project/src/images.ts`: `IMAGE_MODELS`, `ImageModelKey`, `imageModelKeys` (D4); `sentPrompt` and `SentPrompt` (D5); `IMAGE_SHAPES`, `defaultShape` (D6); exports in `index.ts`
- [x] 1.2 `board.ts`: `matchedBy` gains `'generated'`; `FileEntry` gains `generatedModel` and `cost`, `NewFile` takes them optionally, `toFile`, `checkNewFile` and `addFiles` handle them (D9); `setFileThumb` (D12)
- [x] 1.3 Generation jobs: `GenerationJob`, `startGenerationJob`, `recordGenerationProgress`, `finishGenerationJob`, `dismissGenerationError`, `readGenerationJobs`, `STALE_GENERATION_MS`, `GenerationBusy` (D8); `doc.ts` layout comment with `generationJobs` and the two file fields
- [x] 1.4 `settings.ts`: `Settings.imageGeneration` and its default `{ model: 'gpt', count: 2 }` (D3)
- [x] 1.5 Tests: D5's table with the mockup's three Midjourney prompts and the prose prompt, a single `--no` item, `--no` at the end and before another flag; `defaultShape` for each of `prompt`, `nearest` (21:9, 4:5) and `category`; a generated file read back with its model and cost, an older file with both null, a malformed cost dropped to null; `generated` survives `toFile`; each job writer, a second start refused while running, a stale job ignored and removed by the next writer, an errored job cleared by the next start on its prompt; `setFileThumb` sets once and refuses when set; `exportBoard` and the CueBard file list with a generated file
- [x] 1.6 Commit `feat(project): generated images and generation jobs on the board`

## 2. Server: the OpenRouter key (brief A)

- [x] 2.1 `config.ts`: `PROMPTBOOK_SECRETS_KEY` (`Config.secretsKey: Buffer | null`) and `OPENROUTER_BASE_URL` (`Config.openRouterBaseUrl`) (D16); `testConfig` in `test/db/helpers.ts` with both
- [x] 2.2 `migrations/008_image_generation.sql` as D1; `test/db/migrations.test.ts` lists it
- [x] 2.3 `src/images/secrets.ts`: `sealSecret`, `openSecret`, `saveOpenRouterKey`, `readOpenRouterKey`, `removeOpenRouterKey` (D1)
- [x] 2.4 `src/images/openrouter.ts`: `checkKey` (D2); `src/images/routes.ts`: `GET /api/image-generation` (OpenRouter called only with `?check=1`; without spending until group 3), `PUT` and `DELETE /api/image-generation/key` (D2); registered in `app.ts`; `AppOptions.logger` takes logger options with a stream (D2)
- [x] 2.5 `routes/settings.ts`: `imageGeneration` optional with its default, kept on a PUT without it (D3)
- [x] 2.6 `test/db/fake-openrouter.ts` (D17), the `/key` part first
- [x] 2.7 Tests: `loadConfig` for both variables (absent, blank, 16 and 48 bytes, not base64, a malformed URL, the default URL, a trailing `/` removed); seal and open round trip, a wrong server key, another account's row; the key routes against the fake: good, `nolimit`, rejected (400, nothing stored), unreachable (502, the old key kept), removed (204, also with none), unreadable after a server key change (`key_unreadable`), not configured (503 and `configured: false`); the GET's live check with each `error`; the key in no response body and no captured log line; the new routes in `accounts.test.ts`'s session test; settings with and without `imageGeneration`
- [x] 2.8 Commit `feat(server): an OpenRouter key per account, stored encrypted`

## 3. Server: generating images (brief A)

- [x] 3.1 `src/files/dimensions.ts`: `imageDimensions` for PNG, JPEG and WebP (D9)
- [x] 3.2 `src/files/store.ts`: `hasRoom` (D7)
- [x] 3.3 `src/images/openrouter.ts`: `generateImage` with the 180 s timeout, and the plain-words mapping of D10
- [x] 3.4 `src/images/jobs.ts`: `runGenerationJob` as D9: calls in parallel, each image stored, linked, measured and added in its own `withLiveDocument` transaction with its progress, its `image_generations` row, the job finished with D10's error or deleted
- [x] 3.5 `src/images/routes.ts`: `POST /api/projects/:id/image-prompts/:promptId/generate` with D7's checks in order; `GET /api/projects/:id/image-spending` and the GET's `spending` (D11)
- [x] 3.6 `test/db/fake-openrouter.ts`: `/images` with distinct bytes per call, `failNext`, `setDelay` (D17)
- [x] 3.7 Tests: `imageDimensions` (a PNG, a JPEG with an APP1 segment before SOF0, a progressive SOF2, WebP VP8, VP8L and VP8X, truncated bytes give null); each of D7's refusals in order, two concurrent generates give one 202 and one 409 `busy`; a whole job with each model: the files on the prompt with name, `matchedBy` `generated`, model, cost, width and height, `sceneId` null, the blobs linked, the rows, the job gone; the body OpenRouter received (model id, the D5 text, `aspect_ratio`, `resolution` `1K`); 401, 402, 429, 400 with `moderation`, 500, a timeout (short test timeout), a 200 with `data: []`; a partial failure's sentence; the quota; a prompt removed during the job (its images wait in Unmatched); the project binned during the job (no write to its document); spending per project and per month, a failed row not counted, a removed file keeping its cost, a project removed for good under null; the key in no log line of a whole job
- [x] 3.8 Commit `feat(server): generate board images through OpenRouter`

## 4. Chart, compose, e2e stack, docs (brief A)

- [x] 4.1 `charts/rpg-promptbook/values.yaml` `app.secretsKey.secret: ""` with its comment; `values-homelab.yaml` `app.secretsKey.secret: rpg-promptbook-secrets` (D16); `templates/deployment.yaml` the `secretKeyRef` only when set; `checksum/config` unchanged (D16)
- [x] 4.2 `compose.yaml` passes `PROMPTBOOK_SECRETS_KEY` and `OPENROUTER_BASE_URL`; `.env.example` explains both
- [x] 4.3 `e2e/openrouter/serve.mjs`, `e2e/compose.openrouter.yaml`, `e2e/stack.ts` (the file, both variables) (D17); the stack starts and `GET /api/image-generation` answers `configured: true`
- [x] 4.4 Docs: `docs/design.md` («Midjourney and Suno», «Asset board», «Desktop app»: generation through OpenRouter, the key per account, offline); `docs/deploy-homelab.md` (the Secret with `secrets-key`, made with `openssl rand -base64 32`, what rotating it does)
- [x] 4.5 `helm lint charts/rpg-promptbook` and `helm template` with and without `app.secretsKey.secret`, in a container
- [x] 4.6 Commit `feat(deploy): image generation in the chart, compose and the e2e stack`

## 5. Proof and hand-back of brief A

- [x] 5.1 `npm run typecheck`, `npm test` with `TEST_DATABASE_URL`: literal results
- [x] 5.2 The local stack with the fake: a key saved, 2 images generated with each model on a seeded prompt through `curl` with a session, the files in the document and the rows; the output in the hand-back
- [x] 5.3 Hand back: results, the `helm template` diffs, every departure from the design, anything from Risks seen

## 6. Web: data (brief B)

- [ ] 6.1 `api.ts`: `imageGeneration()`, `saveOpenRouterKey(key)`, `removeOpenRouterKey()`, `generate(projectId, promptId, body)`, `imageSpending(projectId)`; their types
- [ ] 6.2 Hooks: the generation status (fetched once per page, refreshed after a key change); the project's spending (refreshed when a job ends); the prompt's jobs from `readGenerationJobs` on the document; the toast rule of «The approved screens» (a job of this user gone without an error)
- [ ] 6.3 Thumbnail backfill (D12): one file at a time, once per file per page, through `probe`, `platform.putFile` and `setFileThumb`
- [ ] 6.4 Tests (pure logic): the panel's state from the defaults and the session's last choice; the shape hint for each source; the price line («About $0.08 · 1K»); the badge and viewer texts (two and three decimals, cost unknown); the progress line; the toast text and cost sum; the error line with and without «Nothing was charged.»; the backfill's choice of files
- [ ] 6.5 Commit `feat(web): image generation data for the board`

## 7. Web: Generate on the board (brief B)

- [ ] 7.1 `ImagePrompt.tsx`: Generate in `.pfoot` after Edit; the panel (model cards, Images, Shape with hint, What is sent, footer); the no-key and not-configured panels; progress with placeholders; the error line with Try again and dismiss; the new empty-drop text (D13, «The approved screens»)
- [ ] 7.2 `Thumb`: the model and cost badge; generated images marked new as they arrive
- [ ] 7.3 `Viewer.tsx`: Source, Model and Cost for a generated file; `matchedLabels.generated`
- [ ] 7.4 `BoardView.tsx`: «Generated here» on the summary line; the toast; `board.css` for all of it, light and dark
- [ ] 7.5 Commit `feat(web): generate images from the board`

## 8. Web: Settings → Image generation (brief B)

- [ ] 8.1 `SettingsPage.tsx`: the section after Connected apps at `/settings/image-generation`; the desktop's `slice(0, 7)` (D14)
- [ ] 8.2 The section loads its status with `?check=1` each time it opens (D2); the key card (saved, not saved, each status line and error, Replace, Remove, toasts), the defaults card through the settings saver, the spending card, the storage line, the not-configured card
- [ ] 8.3 Commit `feat(web): image generation settings`

## 9. Desktop: offline (brief B)

- [ ] 9.1 Generate disabled offline with D15's title; the board's offline line of screen 9; «Generated here» hidden offline; the Settings section's offline card (D15)
- [ ] 9.2 Tests: the offline states through `useOffline`, as the existing offline tests do
- [ ] 9.3 Commit `feat(desktop): generating needs the server`

## 10. e2e (brief B)

- [ ] 10.1 New `e2e/generate.spec.ts` against the fake: Settings saves `sk-or-v1-good` and shows the credit; Generate's panel defaults and «What is sent» on a Midjourney prompt; 2 images arrive with badges, toast and header total, a second page sees the progress and the images by sync; the viewer's rows; the thumbnail is filled; `sk-or-v1-broke` gives the 402 line with Try again; Remove the key and the no-key panel; `sk-or-v1-nolimit` gives «No spending limit»
- [ ] 10.2 `e2e/desktop.spec.ts`: Generate disabled offline with its title, and the Settings offline card
- [ ] 10.3 The whole e2e suite green, once normally and once with `E2E_CPU_THROTTLE=3`; literal results
- [ ] 10.4 Commit `test(e2e): generate images against a fake OpenRouter`

## 11. Screenshots and the owner's preview (brief B)

- [ ] 11.1 Screenshots (1440 x 900) of every mockup screen, 1 to 10c, from the real app against the fake, light and dark for the panel and Settings, under the scratchpad
- [ ] 11.2 Start the local stack with the fake (`e2e/compose.openrouter.yaml`) for the owner's LAN preview, give the URLs, and **stop and wait** for the owner's verdict
- [ ] 11.3 After the owner, leave the stack up for the architect, who switches it to the real OpenRouter for the real generations (within about $0.50)

## 12. Proof and hand-back of brief B

- [ ] 12.1 `npm run typecheck`, `npm test`, `npm run e2e` (normal and throttled): literal results
- [ ] 12.2 Hand back: results, screenshot paths, the owner's verdict, every departure from the design, anything from Risks seen
