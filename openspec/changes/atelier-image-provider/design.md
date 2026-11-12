## Context

Change 1 of #57 (archived as `2026-11-11-board-image-generation`, read its
design first) built Generate on OpenRouter. The architect mapped that code on
2026-11-12; what this design relies on:

- `packages/server/src/images/routes.ts`: `ImageGenerationStatus` (:46),
  `spendingOf` (:65), `generateSchema` (:95), `labelOf`, `MAX_RUNNING_JOBS = 3`
  (:122), the key routes (:180-210) and the generate route (:223-305, checks
  in order, `startGenerationJob` on the live document, `runGenerationJob` not
  awaited, `runs` map with `stop`).
- `packages/server/src/images/jobs.ts`: `runGenerationJob` runs `count` calls
  of `one()`; after `generateImage` each image is sniffed, size-checked,
  hashed, stored (`store`), added with `addFiles` and
  `recordGenerationProgress`, and recorded in `image_generations`; the final
  error sentence and " Nothing was charged." at :199-206.
- `packages/server/src/images/secrets.ts`: AES-256-GCM sealing with AAD
  `"<userId>/<kind>"`; `SecretKind = 'openrouter'`; the SQL hardcodes
  `'openrouter'` in `saveOpenRouterKey`, `readOpenRouterKey`,
  `markOpenRouterKeyChecked`, `removeOpenRouterKey`.
- Migration 008: `user_secrets` with `check (kind in ('openrouter'))`;
  `image_generations` with `model` the model key and no provider.
- `packages/project/src`: `images.ts` (`IMAGE_MODELS` gpt/nb with OpenRouter
  slugs, `IMAGE_SHAPES`), `generation.ts` (`GenerationJob`, `toJob`,
  `STALE_GENERATION_MS` 15 min), `board.ts` (`FileEntry.generatedModel`,
  `cost`, read at :189-190, checked at :518-524, written at :566-578),
  `settings.ts` (`imageGeneration {model, count}`, default gpt/2).
- Web: `settings/ImageGeneration.tsx` and `imageGenerationTexts.ts`,
  `board/GeneratePanel.tsx`, `board/generate.ts`, the viewer.
- Tests: `test/db/fake-openrouter.ts` started per test with
  `startApp({openRouterBaseUrl})`; e2e `compose.openrouter.yaml` and
  `e2e/openrouter/serve.mjs`, wired in `e2e/stack.ts`.

Atelier (provider) facts, measured on 2026-11-12 against v0.7.0 and the
plan of its v0.8.0: both models are enabled there under the same OpenRouter
slugs and offer all four shapes; its estimates are averages of real costs
(GPT about $0.083, Nano Banana about $0.037 that day); 3 running generations
per user; 120 writes per 10 minutes per token; errors are `{error, message}`
with plain sentences.

## Goals / Non-Goals

Goals: each account generates through Atelier or OpenRouter, chosen in
Settings; through Atelier the board behaves as today and the images also sit
in the project's Atelier collection.

Non-goals: one provider per project; moving old images; using Atelier's other
models; reference images; changing the connector.

## Decisions

### D1. Contract with Atelier

Atelier is the provider and ships first (v0.8.0). This section is word for
word the same as D6 of Atelier's `atelier-promptbook-client`.

1. Check a token: `GET /api/v1/token`. 200 with `access: "write"` → usable;
   `access: "read"` → refused by Promptbook; 401 → rejected.
2. The month: `GET /api/v1/spend` → `month.spent`, `month.cap` (USD).
3. Estimates: `GET /api/v1/models` → `estCostUsd` per `id`. Promptbook uses
   `openai/gpt-image-2.6-sunburst` and `google/gemini-nano-banana-2.1`; a
   missing one means "not enabled in Atelier".
4. The project's collection: `POST /api/v1/collections {name}` → 201 `{id}`;
   on 409 `collection_exists`, `GET /api/v1/collections` and take the one whose
   name matches without regard to case.
5. Start: `POST /api/v1/generations {prompt, model, aspectRatio, count,
collectionId}` → 201 `{id, status: "running", …}`. A 400 with field
   `collectionId` means the collection is gone: Promptbook forgets it, makes it
   again (step 4) and retries once. Other errors carry `{error, message}`; the
   messages are plain sentences Promptbook may show as they are
   (`cap_reached` 409, `too_many_running` 429, `rate_limited` 429,
   `restarting` 503, `not_configured` 503, `invalid_request` 400).
6. Watch: `GET /api/v1/generations/:id` about every 2 s until `status` is not
   `running`. New entries in `images[]` are new images (`id`, `costUsd`,
   `mime`); `failures[]` and `error` explain missing ones.
7. Bytes: `GET /api/v1/images/:id/file`.
8. Link: `<Atelier address>/images/<id>` opens the image in Atelier.

### D2. Configuration

`config.ts` reads `ATELIER_URL`: optional; when set it must parse as an
`http:` or `https:` URL, is kept without a trailing slash as
`config.atelierUrl` (else `null`). A bad value fails start-up like the other
variables. The Atelier provider needs both `ATELIER_URL` and
`PROMPTBOOK_SECRETS_KEY`. **Why the server's and not the account's:**
Promptbook then never calls an address someone typed, and the homelab has one
Atelier (owner approved, mockup 1c).

Chart: `app.atelier.url: ""` in `values.yaml`, env `ATELIER_URL` set only
when non-empty; `values-homelab.yaml` sets `https://atelier.siberio.eu`.
`compose.yaml` passes `ATELIER_URL: ${ATELIER_URL:-}`; `.env.example`
documents it next to `OPENROUTER_BASE_URL`.

### D3. Migration `009_atelier.sql`

```sql
alter table user_secrets drop constraint user_secrets_kind_check;
alter table user_secrets add constraint user_secrets_kind_check
  check (kind in ('openrouter', 'atelier'));

alter table image_generations
  add column provider text not null default 'openrouter'
  check (provider in ('openrouter', 'atelier'));

-- The Atelier collection of a project, per account (D7).
create table atelier_collections (
  user_id uuid not null references users on delete cascade,
  project_id uuid not null references projects on delete cascade,
  collection_id uuid not null,
  primary key (user_id, project_id)
);
```

Check the constraint's real name in 008 first (Postgres names an inline check
`user_secrets_kind_check`); if it differs, use the real one and say so.

### D4. Secrets by kind

`SecretKind = 'openrouter' | 'atelier'`. The four functions take the kind:
`saveSecret(db, serverKey, userId, kind, plain)`,
`readSecret(db, serverKey, userId, kind): StoredSecret`,
`markSecretChecked(db, userId, kind)`, `removeSecret(db, userId, kind)`.
`StoredKey` becomes `StoredSecret` with the same states. Callers pass
`'openrouter'` where they used the old names; no other behaviour changes. The
hint stays the last four characters.

### D5. The provider choice

`Settings.imageGeneration` gains `provider: 'openrouter' | 'atelier'`,
default `'openrouter'`; settings saved before read as `'openrouter'`
(`packages/project/src/settings.ts`, and the validation in
`packages/server/src/routes/settings.ts`). New
`packages/project/src/providers.ts` exports
`IMAGE_PROVIDERS = ['openrouter', 'atelier'] as const`, `ImageProvider`,
`isImageProvider`, and `PROVIDER_NAMES` (`OpenRouter`, `Atelier`).

The server enforces nothing about readiness when the setting is saved (the
web disables an unready choice); the generate route checks the chosen
provider's credentials (D9). Removing the Atelier token while
`provider = 'atelier'` sets it to `'openrouter'` when a readable OpenRouter
key exists (mockup: "Token removed. Generate now goes through OpenRouter.").
A `PUT /api/settings` whose `imageGeneration` has no `provider` keeps the stored one, as the route already keeps a missing `imageGeneration`; older clients then cannot drop the choice.

### D6. Atelier client: `packages/server/src/images/atelier.ts`

Plain `fetch` with `Authorization: Bearer <token>`, `redirect: 'error'`, and
an `AbortSignal` per call (10 s for JSON calls, 120 s for a file). Answers
over 1 MiB (JSON) or `FILE_LIMITS.image` (file) are refused. Exports:

- `describeToken(base, token)` → `{name, access, expiresAt}` (step 1)
- `readMonth(base, token)` → `{spent, cap}` (step 2)
- `readEstimates(base, token)` → `Partial<Record<ImageModelKey, number>>`
  (step 3, by `IMAGE_MODELS[k].id`)
- `ensureCollection(base, token, name)` → `collectionId` (step 4)
- `startGeneration(base, token, body)` → `{id}` (step 5)
- `readGeneration(base, token, id)` → `{status, images: {id, costUsd,
mime}[], failures: string[], error: string | null, costUsd: number | null}`
  (step 6)
- `downloadImage(base, token, id)` → `Buffer` (step 7)

Every failure throws `AtelierError {status, code, message}`: Atelier's
`error` and `message` when it answered JSON; `atelier_unreachable` with
"Atelier did not answer." for network errors and timeouts; `atelier_refused`
with "Atelier refused the request (<status>)." for anything else. The token
is in no message or log line.

### D7. The project's collection

Name: the project's title, trimmed, cut to 60 characters (Atelier's limit);
"Promptbook project" when empty. `atelier_collections` keeps the id per
(account, project). Before a start: use the stored id, or `ensureCollection`
and store it. When the start answers 400 with field `collectionId`, delete the
row, `ensureCollection` again, store it and start once more. A project renamed
later keeps its collection (Atelier's name is not changed).

### D8. Token routes and status

`PUT /api/image-generation/atelier-token` with `{token}` (strict; trimmed, 1
to 200 characters, starting `atl_pat_`, else 400 `invalid` "This is not an
Atelier API token."). Order: 503 `not_configured` without the secrets key;
503 `atelier_unavailable` "This server has no Atelier address." without
`ATELIER_URL`; `describeToken`: 401 → 400 `token_rejected` "Atelier rejected
this token."; `access: "read"` → 400 `token_read_only` "This token is read
only. Make one with Generate + read in Atelier."; unreachable → 502
`atelier_unreachable` "Atelier did not answer. Nothing was saved." Only then
`saveSecret(…, 'atelier', token)`. Answers the status, with the checked
details.

`DELETE /api/image-generation/atelier-token` → 204; stops the account's
running Atelier jobs with "The Atelier token was removed." and applies D5's
switch.

`ImageGenerationStatus` gains, keeping every field it has:

```ts
provider: ImageProvider;
atelier: {
  available: boolean; // ATELIER_URL set
  url: string | null;
  token: {
    hint: string;
    checkedAt: string;
    // Filled only by ?check=1 or a save:
    name: string | null;
    expiresAt: string | null;
    month: { spent: number; cap: number } | null;
    estimates: Partial<Record<ImageModelKey, number>> | null;
  } | null;
  error?: 'token_unreadable' | 'token_rejected' | 'token_read_only' | 'atelier_unreachable';
};
```

`?check=1` checks both credentials that exist: OpenRouter as today, Atelier
with steps 1 to 3 (one failure sets `error` and leaves the rest null).

### D9. Generate route

`generateSchema` is unchanged (the provider is the account's setting). After
`ownProject`, read `provider` from the account's settings, then:

- `openrouter`: as today; no key → 409 `no_key` "Add your OpenRouter key
  first."
- `atelier`: 503 `atelier_unavailable` without `ATELIER_URL`; no readable token
  → 409 `no_key` "Add your Atelier API token first."

The other checks (prompt, busy, `MAX_RUNNING_JOBS`, room, the job on the live
document) are unchanged. `startGenerationJob` records `provider`. The run gets
`provider`, the credential, and for Atelier `atelierUrl` and the project title.

### D10. The job through Atelier

`runGenerationJob` keeps the OpenRouter path as it is and branches on
`run.provider`. The part after the bytes arrive (sniff, size, hash, bin
check, `store`, `addFiles`, `recordGenerationProgress`, the ok row) moves into
one function, `land(bytes, cost, extra)`, used by both paths; `extra` sets
`generatedVia` and `atelierImageId` on the entry and `provider` on the row.
The OpenRouter path must behave exactly as before.

Atelier path:

1. Collection (D7), then `startGeneration` with `prompt: sentPrompt(…).text`,
   `model: IMAGE_MODELS[run.model].id`, `aspectRatio: run.shape`,
   `count: run.count`, `collectionId`. A start error fails every image with
   Atelier's message (" Nothing was charged." added as today, since nothing
   started).
2. Poll `readGeneration` every 2 s (a test may shorten it) until `status` is
   not `running`, the stop signal fires, or 10 minutes pass. Each image id not
   seen before: `downloadImage`, then `land(bytes, image.costUsd,
{generatedVia: 'atelier', atelierImageId: image.id})`. A download or land
   failure fails that one image as today.
3. When it ends, every image still missing fails with, in order: the stop
   reason; "Atelier did not finish in time. The images may still arrive in
   Atelier." after 10 minutes; else the next entry of `failures[]`, else
   Atelier's `error`, else "Atelier sent fewer images than asked."
4. Cost: each landed image carries its `costUsd`. If the generation's
   `costUsd` exceeds the sum of its images', the difference goes on the first
   failed row, and the job counts as charged for the final sentence.
5. A poll that gets no answer is retried at the next tick; three in a row end
   the watch with "Atelier did not answer."
6. When the watch ends by the stop, the 10-minute timeout or three unanswered polls, Atelier may still bill the missing images: the final sentence never adds " Nothing was charged." then, and their rows keep cost null.

File names stay `${label}-${model}-${n}.ext`. **Why one generation, not
`count` calls:** Atelier runs the images in parallel itself, counts them as
one generation against its 3-running limit, and files them together.

### D11. Project model

- `FileEntry` gains `generatedVia: 'openrouter' | 'atelier' | null` and
  `atelierImageId: string | null`. Read: a generated image (`generatedModel`
  set) without `generatedVia` reads `'openrouter'`; `atelierImageId` only when
  it is a uuid and `generatedVia` is `'atelier'`. Checked and written like
  `generatedModel` and `cost` (board.ts :189-190, :518-524, :566-578);
  `NewFile` takes both as optional.
- `GenerationJob` gains `provider: ImageProvider`; a job without one reads
  `'openrouter'` (`toJob`).

### D12. Spending

`image_generations.provider` is written on every row. `Spending.projects[]`
gains `atelier: number` and `openrouter: number` (this month's cost per
provider); totals unchanged. `GET /api/projects/:id/image-spending` is
unchanged.

### D13. Web

As the approved mockup (screens 1 to 7):

- **Settings → Image generation** (`ImageGeneration.tsx`): lead "Generate
  board images with GPT Image or Nano Banana from any image prompt, through
  Atelier or straight through OpenRouter." Then cards in this order:
  - **Generate through**: two choice buttons in the model-picker style,
    "Atelier" (note "One monthly cap; images also in its gallery") and
    "OpenRouter" ("Your own key, billed to that account"), each with a status
    line: "Token works" / "Key works" (primary colour), "Add a token below" /
    "Add a key below" or "Not available on this server" (amber). An unready
    choice is disabled. Choosing saves `provider` through `PUT /api/settings`
    and toasts "Generate now goes through Atelier." (or OpenRouter). Hint
    under it: "Generate uses this one for every project. Images already
    generated keep where they came from."
  - **Atelier**: without `available`, the amber line "This Promptbook server
    has no Atelier address. Whoever runs it sets ATELIER_URL." Otherwise
    Address (read only, monospace, dashed box) with hint "Set by the server.";
    API token: input `atl_pat_…` with "Save and check", hint "Make a token with
    write access in Atelier → Settings → API tokens."; once saved, masked
    `atl_pat_••••••••••••<hint>` with Replace and Remove and the check line
    "Works. Write token «<name>», expires <d Mon yyyy>. $<spent> of the
    $<cap> cap used in <Month> (checked <HH:MM>)." ("never expires" for no
    expiry). Footnote: "Stored encrypted on the server, like the OpenRouter
    key. Images also go into an Atelier collection named after the project,
    made on the first Generate." Errors show in the same places and wording
    style as the key card's.
  - **OpenRouter key**, **Defaults for Generate**, **Spending** as today,
    except: the defaults' price lines use the chosen provider's estimates;
    the spending table gains columns Atelier and OpenRouter before the month
    total; its footnote becomes "Costs as Atelier or OpenRouter report them
    for each image. Atelier's cap also counts what you make in Atelier
    itself. Removing an image does not remove its cost."
- **Generate panel**: under the title, one line: "Through **Atelier** · into
  the collection «<project title>» · $<spent> of $<cap> used this month
  Change" or "Through **OpenRouter** · billed to your OpenRouter key Change";
  Change opens Settings → Image generation. Model price lines and the footer
  estimate use Atelier's estimates through Atelier (falling back to
  `IMAGE_MODELS` when missing). The panel asks `?check=1` when it opens with
  Atelier chosen. The no-credential state names the provider: "Add your
  Atelier API token first. Images are billed against your Atelier monthly
  cap." / the existing OpenRouter sentence.
- **Generating line**: "Generating <n> of <m> with <model> through
  <provider> · <s>s. It keeps going if you leave this page."
- **Badge tooltip**: "<model full name> through <provider>, $<cost>".
- **Viewer**: a row "Through" after Source: "Atelier · No. <first 8 of id>
  in Atelier ↗" linking `<atelier.url>/images/<id>` in a new tab when the
  status has the url, plain "Atelier" otherwise; "OpenRouter" for the rest.
- **Board header** "Generated here" tooltip: "Generated in this project, as
  billed by <providers present on the board, joined with "and">".

### D14. Desktop

Nothing in main. The new routes go through the router like the others and
answer 503 `offline` when offline; Settings shows the existing offline card.

### D15. Fake Atelier

`packages/server/test/db/fake-atelier.ts`, like `fake-openrouter.ts`:
serves steps 1 to 7 for tokens `atl_pat_good` (write), `atl_pat_read`
(read), anything else 401; keeps collections and generations in memory;
makes a generation's images one by one after `setDelay` ms (default short),
each a small valid PNG with `costUsd` 0.08 (gpt) or 0.037 (nb); `failNext(n,
reason)` makes the next n images fail into `failures[]`; `capReached()`
answers the next start with 409 `cap_reached` and Atelier's sentence;
`dropCollection(id)` simulates a deleted collection. `startApp` takes
`atelierUrl`. For e2e, `e2e/atelier/serve.mjs` and `compose.atelier.yaml` as
the OpenRouter ones, port 8098, `ATELIER_URL=http://atelier:8098`, added to
`e2e/stack.ts`.

### D16. Accepted departures of brief A

Recorded by the architect at review, 2026-11-12:

1. `AtelierError` has a third code, `atelier_bad_answer`, "Atelier sent an
   answer Promptbook cannot read.", for a 2xx answer that is not D1's JSON or
   is past the size cap; and a `field` (null unless Atelier sent one), which
   D1 step 5 needs.
2. Atelier-path sentences D10 did not write: bytes that are not an image →
   "Atelier sent no image. Try again."; a failed download → the
   `AtelierError` message, else "Atelier did not answer."
3. `land` writes `generatedVia: 'openrouter'` on new OpenRouter images too;
   readers see the same, since D11 reads a missing value as OpenRouter.
4. `DELETE /api/image-generation/key` stops only the account's OpenRouter
   jobs; each `GenerationHandle` carries its provider.
5. The fake's shapes follow Atelier's merged v0.8.0 source. The architect
   corrected the fake's answer to a write with a read token to Atelier's real
   one, 403 `insufficient_scope` "This token is read only." (the hand-back
   had guessed `forbidden`).
6. `AppOptions` and `startApp` take `atelierPollMs` (2 s) and
   `atelierWatchMs` (10 minutes) for the tests.
7. Collection names are cut at 60 UTF-16 units without splitting a
   character.
8. Brief A made type-only edits in `packages/web` (agreed during the build):
   `ImageGeneration.tsx` keeps the stored provider when the defaults are
   saved, and test fixtures gained the new fields.

## Rejected

- Atelier address per account: an address typed by a user is called by the
  server; one per server is enough here.
- Replacing OpenRouter: the owner wants Promptbook to work without Atelier.
- `count` Atelier generations of one image each: three such jobs would fill
  Atelier's running limit at once.
- Promptbook adds images to the collection itself: Atelier now does it as it
  stores them (its D1-D2), so a restart here loses nothing there.
- A URL on the file entry: other clients write the document; an id checked as
  a uuid cannot become a script link.

## Not touched

The connector and its tools, `get_board`, Midjourney intake, the PDF, the
desktop main process, the OpenRouter path's behaviour, music.

## Risks

- **503 read as offline** (change 1's risk): the desktop treats only
  `{error:'offline'}` as offline; the new 503 codes are `not_configured` and
  `atelier_unavailable`. Keep it so.
- **Server restart mid-job**: polling stops; the job goes stale after 15
  minutes as today; the images still reach the Atelier collection. Accepted.
- **Fake drifts from Atelier**: the release check (Verification) runs one
  real generation through the live Atelier. If the real answers differ from
  D1, report it; do not adapt the fake to match a guess.
- **OpenRouter path regressions**: the `land` extraction touches it; the
  existing db and e2e tests for it must pass unchanged. If one needs editing,
  say why in the hand-back.

## Verification

- Unit: settings default and old settings read `'openrouter'`; `FileEntry` and
  `GenerationJob` read old entries as OpenRouter and reject a non-uuid
  `atelierImageId`.
- Db (fake Atelier): save token good / read / rejected / unreachable / no
  `ATELIER_URL`; status with `?check=1`; generate through Atelier lands
  `count` images with `generatedVia`, `atelierImageId` and cost, rows with
  provider `atelier`, the collection created once per project and reused,
  recreated after `dropCollection`; partial failure sentence; cap reached →
  every image fails with Atelier's sentence and " Nothing was charged.";
  token removed mid-job stops it; D5's switch; spending per provider; every
  existing OpenRouter test unchanged.
- E2E (fake Atelier): save a token, choose Atelier, Generate 2, both appear
  with the badge and the viewer's Atelier link; the panel's Through line.
- Screenshots of mockup screens 1, 1b, 1c, 2, 4 and 6 at desktop width, and
  Settings at phone width, compared with the mockup by the architect.
- Release: Atelier v0.8.0 live first; then the owner's real check: a token
  saved on promptbook.siberio.eu, one Nano Banana image generated through
  Atelier, visible on the board and in Atelier's collection.
