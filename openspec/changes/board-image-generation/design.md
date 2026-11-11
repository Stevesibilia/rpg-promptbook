## Context

Issue #57, change 1 of control-room plan p50. The owner agreed the mockup
[docs/mockups/image-generation.html](../../../docs/mockups/image-generation.html)
on 2026-11-11. Its notes panel (`<div class="legend">`) lists twelve
screens: 1 Scenes, 2 Generate, 3 Generating, 4 Viewer, 5 NPCs, 6 Midjourney
prompt, 7 No key yet, 8 OpenRouter error, 9 Desktop offline, 10 Settings, 10b
Settings with no key, 10c Settings offline. Its render functions hold the
exact labels: `genButton`, `pop` (the panel), `thumbs` (images, progress,
error), `board` (header total, offline line), `openLb` (viewer rows),
`settings` (the section), `start` (the toast). The implementer cannot open
it in a browser, so «The approved screens» below says what it draws.

Two briefs build this change: brief A the project model and the server
(groups 1 to 5), brief B the web client, the desktop states and the e2e
tests (groups 6 to 12).

### Facts measured on 2026-11-11

- OpenRouter's image API: `POST {base}/images` with JSON
  `{ model, prompt, aspect_ratio, resolution: "1K" }` answers
  `{ data: [{ b64_json, media_type }], usage: { cost } }`. One image per
  call. A bad `aspect_ratio` or `resolution` answers 400.
- Per image at 1K: GPT Image 2.6 Sunburst (`openai/gpt-image-2.6-sunburst`)
  $0.020 to $0.060, mean $0.040, 23 to 94 s, PNG of about 1536 x 864 for
  16:9; Nano Banana 2.1 (`google/gemini-nano-banana-2.1`) $0.036 to $0.039,
  13 to 26 s, JPEG of about 1376 x 768.
- `GET {base}/key` with the key as bearer answers 200
  `{ data: { limit, limit_remaining, usage, … } }` (`limit` and
  `limit_remaining` a number or null); a bad key answers 401.

### The code today

- **Board model** (`packages/project/src/board.ts`): image prompts in the
  `imagePrompts` map under flat keys `<id>/<part>` (`PROMPT_KEY`, `:238`);
  files in the `files` Y.Array of Y.Map (`:16-18`). `FileEntry` (`:65-91`)
  holds id, sha256, thumbSha256, name, kind, mime, size, width, height,
  duration, sceneId, promptId, matchedBy, addedAt, addedBy. `matchedBy` is
  `['prompt', 'title', 'hand']` (`:23`). `toFile` (`:156-177`) drops an
  unknown `matchedBy` to null. `checkNewFile` (`:487`) refuses an image with
  a `sceneId` («an image belongs to a prompt, not a scene»). `addFiles`
  (`:509-552`) skips a sha256 already listed and stops at `CAPS.files`.
  `readImagePrompts` (`:323`) leaves out removed prompts. The layout
  comment in `doc.ts:50-75` lists every field.
- **Web intake** (`packages/web/src/board/intake.ts`): `take` (`:312`)
  hashes, sniffs and probes in the browser (`probe.ts`: width, height and
  a 480 px thumbnail, WebP or JPEG), uploads the thumbnail and the file
  through `platform.putFile`, then `addEntry` (`:374-448`). The server has
  no image library.
- **Server writes to the live document** through `openLiveDocument`
  (`live.ts:32`) and `withLiveDocument` (`:61`); callers check first that
  the project is the user's and not in the bin (`:10-11`). The connector's
  pattern is `writeBoard` (`mcp/board.ts:162-166`), which runs
  `migrateImagePrompts` before the write.
- **File store**: `BlobStore.put` (`files/blobs.ts:21`) hashes while it
  writes and needs the sha256 up front; `fitsQuota` (`files/store.ts:42`) and
  `linkFile` (`:69`); the upload route (`routes/files.ts:121-158`) sniffs
  with `sniff` and checks `FILE_LIMITS` (`packages/project/src/sniff.ts`).
  A full quota answers 507 `quota` there (`quotaReached`).
- **Settings**: `settingsSchema` (`routes/settings.ts:12-31`) is strict and
  stored as `user_settings` jsonb; `defaultTemplates` is optional with a
  default, and a PUT without it keeps the stored value. The desktop router
  caches `GET /api/settings` on disk (`desktop/src/main/router.ts:119`,
  `:134`), so no secret may live in settings.
- **Config**: `config.ts` reads the environment (`:45-62`) into `Config`
  (`:67-90`) in `loadConfig` (`:112`); tests in
  `test/unit/config.test.ts`; `testConfig` in `test/db/helpers.ts:36`. No
  encryption helper or server secret exists.
- **Chart**: `charts/rpg-promptbook/templates/deployment.yaml` passes
  secrets by `secretKeyRef` (`credentialsSecret` `:151-163`, `oidc`
  `:165-181`); the `checksum/config` annotation (`:35`) hashes chosen
  values; `values.yaml` `app` at `:20-58`. `compose.yaml` sets the app's
  environment.
- **Desktop**: the router forwards every route it does not answer itself
  with the bearer token when online and answers 503 `offline` otherwise
  (`router.ts:78`, `:147-157`). `useOffline()` is in
  `web/src/desktop/useDevice.ts:21-32`; `NeedsServer` and `NeedsServerGroup`
  in `web/src/desktop/NeedsServer.tsx`.
- **Web board**: `PromptBody` (`ImagePrompt.tsx:77-153`) with `.pfoot`
  (`:110-117`, Provenance, Copy, Edit) and `.empty-drop` (`:146-149`),
  `Thumb` (`:155-202`); `NamedGrid.tsx` (`:97`) uses `PromptBody` too;
  `Viewer.tsx` rows at `:125-149` and `matchedLabels` at `:14`;
  `Provenance` in `parts.tsx:46`; `FileImage` (`parts.tsx:69-94`) already
  loads the original when `thumbSha256` is null (`:80`); the board context
  in `context.ts:16-37`; the header and the summary lines in
  `BoardView.tsx:161-210`; `OfflineLine` at `BoardView.tsx:285`.
- **Settings page**: `webSections` (`SettingsPage.tsx:26-34`) and the
  desktop's `sections`, which inserts This device with
  `webSections.slice(0, 6)`; the section bodies at `:97-118`.
- **REST client**: `request` (`web/src/api.ts:139-163`) turns an error body
  `{ error, message }` into `ApiError`; the `api` object at `:165-225`.
- **Outbound HTTP**: the server makes none through `fetch` today. Tests mock
  `node:https` (`test/db/oauth.test.ts`) or run a local fake: the OIDC
  issuer `test/db/oidc-issuer.ts`, served in e2e by `e2e/issuer/serve.mjs`
  from `e2e/compose.oidc.yaml`, which `e2e/stack.ts` adds to `compose.yaml`.
- **Migrations**: the next is 008; `test/db/migrations.test.ts:55-62` lists
  every migration by name. `test/db/accounts.test.ts:158-200` checks that
  every `/api` route answers 401 without a session.

## Goals / Non-Goals

**Goals:** generate board images with GPT Image 2.6 Sunburst or Nano Banana
2.1 through OpenRouter, from every image prompt, as the mockup draws it; one
encrypted key per account; progress, images and errors on every device;
the cost of each image, per project and per month.

**Non-Goals:** reference images (change 2); the connector tool and new
prompt writing rules (change 3); music; any change to Midjourney intake,
filename matching, the CueBard export or the PDF; an offline or persistent
queue of generations.

## Decisions

### D1. Key storage

Migration `packages/server/migrations/008_image_generation.sql` adds:

```sql
-- Image generation (openspec change board-image-generation, D1 and D11).

create table user_secrets (
  user_id uuid not null references users on delete cascade,
  kind text not null check (kind in ('openrouter')),
  ciphertext bytea not null,
  iv bytea not null,
  tag bytea not null,
  -- The key's last four characters, shown masked in Settings.
  hint text not null,
  checked_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

-- One row per image asked of OpenRouter, ok or failed (D11).
create table image_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  project_id uuid references projects on delete set null,
  prompt_id text not null,
  model text not null,
  cost numeric(10, 6),
  sha256 text,
  ok boolean not null,
  error text,
  created_at timestamptz not null default now()
);

create index image_generations_user_time on image_generations (user_id, created_at);
create index image_generations_project on image_generations (project_id);
```

_(Drafter's choices: the `not null` constraints, `image_generations.user_id`
referencing `users` with cascade, and the two indexes.)_

The key is encrypted with AES-256-GCM (`node:crypto`), a random 12-byte IV
per save and the 16-byte tag, under a server key read from the new variable
`PROMPTBOOK_SECRETS_KEY`: the base64 of 32 bytes; `loadConfig` refuses any
other length, naming the variable. The additional authenticated data is
`<userId>/<kind>`, so a row copied to another account does not decrypt.
_(Drafter's choice.)_ `hint` is the key's last four characters.

Without `PROMPTBOOK_SECRETS_KEY`, image generation is **not configured**:
`PUT` and `DELETE /api/image-generation/key` and the generate route answer
503 `{ error: 'not_configured' }`, `GET /api/image-generation` answers
`configured: false`, and Settings says the server is not set up for it. A
row that fails to decrypt (the server key was rotated) counts as no key,
with the message «The saved key can't be read any more. Save it again.»

New module `packages/server/src/images/secrets.ts`: `sealSecret(serverKey,
userId, kind, plain)` → `{ ciphertext, iv, tag }`, `openSecret(serverKey,
userId, kind, row)` → the plain key or null; `saveOpenRouterKey(db,
serverKey, userId, plain)` (upsert, `checked_at` now), `readOpenRouterKey(db,
serverKey, userId)` → `{ state: 'none' } | { state: 'unreadable' } | {
state: 'ok'; key; hint; checkedAt }`, `removeOpenRouterKey(db, userId)`.

Why: the owner chose one key per account, never sent to a client, and the
settings blob is cached on the desktop's disk. Rejected: the key in
`user_settings` (it would land on the desktop's disk); one server-wide key
(the owner said per account).

### D2. Key routes

Every route needs a session or the desktop's bearer token (the existing
`requireSession`). The desktop router forwards them when online and never
caches them; offline it answers 503 `offline` as for any route it does not
answer itself.

- `GET /api/image-generation` → 200

  ```ts
  interface ImageGenerationStatus {
    configured: boolean;
    key: {
      hint: string;
      checkedAt: string;
      limitRemaining: number | null;
    } | null;
    // Why the key is missing or not working, when that is known.
    error?: "key_unreadable" | "key_rejected" | "openrouter_unreachable";
    spending: Spending; // D11
  }
  ```

  Plain, the route makes no call to OpenRouter: it answers the saved
  key's `hint` and `checkedAt` with `limitRemaining: null`, so opening the
  board never calls OpenRouter. With `?check=1` (the Settings section asks
  this each time it opens) and a saved key, it checks the key with
  `GET {base}/key` (10 s timeout): 200 sets `checked_at` and answers
  `limitRemaining` from `limit_remaining`; 401 answers the key with
  `error: 'key_rejected'`; no answer or 5xx answers the stored `checkedAt`,
  `limitRemaining: null` and `error: 'openrouter_unreachable'`. A row that
  does not decrypt answers `key: null, error: 'key_unreadable'` either way.
  _(Architect, Q1: the credit left is never stored, only shown fresh.)_

- `PUT /api/image-generation/key` with `{ key }`: the key trimmed, refused
  with 400 `validation_error` when empty or over 200 characters; then
  `GET {base}/key` with it: 401 → 400 `{ error: 'key_rejected' }`; no
  answer, a timeout or 5xx → 502 `{ error: 'openrouter_unreachable' }`;
  in both cases nothing is stored. 200 → encrypt and upsert, answer 200 with
  the `ImageGenerationStatus`.
- `DELETE /api/image-generation/key` → 204, also when no key was saved.

The plain key never appears in any response or log line. `AppOptions.logger`
(`app.ts`) widens to take Fastify logger options with a destination stream,
so a test can capture the log of a key save, a check and a whole job and
assert the key is in none of it. The OpenRouter client never puts request
headers in an error it throws.

### D3. Defaults for Generate

`Settings` (`packages/project/src/settings.ts`) gains
`imageGeneration: { model: 'gpt' | 'nb'; count: 1 | 2 | 3 | 4 }`;
`defaultSettings()` gives `{ model: 'gpt', count: 2 }`. `settingsSchema`
accepts it as optional with that default, so an older client still saves;
like `defaultTemplates`, a PUT without it keeps the stored value instead of
the default. _(Drafter's addition, following the `defaultTemplates`
precedent at `routes/settings.ts:50-54`.)_ The defaults are not secret.

### D4. Models

New `packages/project/src/images.ts`, exported from `index.ts`:

```ts
export const IMAGE_MODELS = {
  gpt: {
    id: "openai/gpt-image-2.6-sunburst",
    name: "GPT Image 2.6",
    full: "GPT Image 2.6 Sunburst",
    note: "Best detail and text",
    estimate: 0.04,
    seconds: 53,
  },
  nb: {
    id: "google/gemini-nano-banana-2.1",
    name: "Nano Banana 2.1",
    full: "Nano Banana 2.1",
    note: "Fast draft",
    estimate: 0.037,
    seconds: 17,
  },
} as const;
export type ImageModelKey = keyof typeof IMAGE_MODELS;
export const imageModelKeys = ["gpt", "nb"] as const;
```

Clients send the key (`gpt` or `nb`); the server maps it to the id. The
resolution is always `"1K"`. Why: the owner's bake-off; one place to change
an id.

### D5. What is sent

`sentPrompt(text: string): SentPrompt` in `images.ts`, used by the server
and by the panel's «What is sent»:

```ts
interface SentPrompt {
  text: string; // what OpenRouter gets
  base: string; // the text before the first flag, trimmed
  flags: string; // the flags as written, '' when none
  no: string | null; // the --no list as sent: "text, letters or modern buildings"
  ar: string | null; // the --ar value as written: "3:2"
}
```

1. Find the first match of `/\s--[a-z]/`. None: `text` is the input
   trimmed, `flags` `''`, `no` and `ar` null.
2. `base` is everything before it, trimmed; `flags` the rest, trimmed.
3. `ar` is the `w:h` after `--ar` (`/--ar\s+(\d+:\d+)/`), else null.
4. `no` is what follows `--no` up to the next ` --` or the end, trimmed,
   with its last `, ` turned into `or`; null when absent or empty.
5. `text` is `base` when `no` is null; otherwise `base` without trailing
   full stops and spaces, then `. No <no>.`. Every other flag is dropped.
   _(The mockup's `sentText` strips trailing full stops only before adding
   the sentence; kept.)_

Unit tests with the mockup's three Midjourney prompts and one prose prompt:

| Prompt (end)                                                         | `text` ends                                           | `ar`   |
| -------------------------------------------------------------------- | ----------------------------------------------------- | ------ |
| `…sepia and ash palette --ar 16:9 --v 8.1`                           | `…sepia and ash palette`                              | `16:9` |
| `…desaturated --ar 3:2 --v 8.1 --no text, letters, modern buildings` | `…desaturated. No text, letters or modern buildings.` | `3:2`  |
| `…melancholic --ar 2:3 --v 8.1`                                      | `…melancholic`                                        | `2:3`  |
| `Wide shot of a collapsed 1900s Sicilian library… vignette.`         | unchanged                                             | null   |

### D6. Shape

`IMAGE_SHAPES = ['16:9', '3:2', '1:1', '2:3'] as const` and
`defaultShape(category, ar): { shape; source: 'prompt' | 'nearest' |
'category' }` in `images.ts`. The prompt's `--ar` when it is one of these
(`prompt`); else, for a well-formed `w:h`, the allowed shape nearest by
ratio, comparing `|ln(w/h) − ln(sw/sh)|`, the first on a tie (`nearest`);
else the category's: scene 16:9, pc 2:3, npc 2:3, handout 1:1 (`category`).
The panel may override it.

The panel's footer shows the resolution tier «1K», not a size in pixels:
the two models return different sizes for one shape (GPT 1536 × 864, Nano
Banana about 1376 × 768 for 16:9). The viewer shows each file's own width
and height. _(Architect, Q4: departs from the mockup's footer, which showed
GPT's sizes. No `SHAPE_SIZES`.)_

### D7. Generate route

`POST /api/projects/:id/image-prompts/:promptId/generate` with
`{ model: 'gpt' | 'nb', count: 1..4, shape: '16:9' | '3:2' | '1:1' | '2:3' }`
(strict; anything else 400 `validation_error`) → 202 `{ jobId }`. The checks,
in this order:

1. a session (401);
2. the project is the user's and not in the bin, else 404 `not_found`;
3. configured, else 503 `not_configured`;
4. a key that decrypts, else 409 `{ error: 'no_key' }`;
5. on the live document (`openLiveDocument`, after `migrateImagePrompts` in
   a transaction as `writeBoard` does): the prompt exists and is not
   removed, else 404 `prompt_not_found`; it has text, else 400
   `prompt_empty` _(error codes: drafter's choice)_;
6. no running job on this prompt (D8), else 409 `{ error: 'busy' }`;
   6b. fewer than 3 jobs of this account running in this process
   (`app.generationRuns`), else 429 `{ error: 'too_many_jobs' }` «Three
   generations are already running. Wait for one to finish.» _(Architect,
   review of brief A: one click per prompt would otherwise start any number
   of parallel OpenRouter calls on the user's money and the server's memory.
   Counted on the in-process runs map, the source of truth for running calls
   with a single server replica.)_
7. quota room for `count × 20 MB`, else 507 `{ error: 'quota' }`, through a
   new `hasRoom(db, userId, length, quotaBytes)` in `files/store.ts` sharing
   `fitsQuota`'s sum. _(Architect, Q3: 507, as the upload route.)_

Then `startGenerationJob` in one transaction on the same live document
(repeating check 6, so two clicks start one job), the document closed, the
job started in the background in the server process (D9), and the answer
sent at once. The prompt's text and category are read here and handed to
the job.

New module `packages/server/src/images/routes.ts` holds the routes of D2,
D7 and D11, registered in `app.ts` with `{ config, db, sync, blobs }`.

### D8. Jobs in the project document

A new top-level `Y.Map` `generationJobs`, key the job id (a UUID), each
value a plain JSON object set whole, as the board's flat keys:

```ts
interface GenerationJob {
  id: string;
  promptId: string;
  model: ImageModelKey;
  count: number; // 1..4
  done: number; // images added
  failed: number;
  startedAt: string; // ISO, the server's clock
  by: string; // the user id that started it
  error: string | null; // D10's plain words
  finishedAt: string | null;
}
```

Writers and the reader in `packages/project/src/board.ts` (or a new
`generation.ts` beside it), exported from `index.ts`:

- `startGenerationJob(doc, { id, promptId, model, count, by, startedAt })`:
  throws `GenerationBusy` while a running job that is not stale holds the
  prompt; removes the finished jobs with an error on that prompt.
- `recordGenerationProgress(doc, jobId, outcome: 'done' | 'failed')`: adds
  one; nothing when the job is gone.
- `finishGenerationJob(doc, jobId, error: string | null)`: without an error
  deletes the job; with one sets `error` and `finishedAt`.
- `dismissGenerationError(doc, jobId)`: deletes a finished job.
- `readGenerationJobs(doc, now = new Date())`: the running jobs and the
  finished ones with an error, leaving out stale ones: a job not finished
  15 minutes after `startedAt` (`STALE_GENERATION_MS`).

Every writer first deletes the stale jobs it finds. `doc.ts`'s layout
comment gains `generationJobs`.

Why: the job lives in the document, so every device sees it through the
sync it already has, with no new channel. Rejected: a server-side job table
polled by clients.

### D9. The job

`runGenerationJob(deps, job)` in `packages/server/src/images/jobs.ts`. One
job is `count` OpenRouter calls run in parallel (at most 4), each with a
180 s timeout (`AbortSignal.timeout`). The OpenRouter client is
`packages/server/src/images/openrouter.ts` on the global `fetch`:
`checkKey(baseUrl, key)` and `generateImage(baseUrl, key, { model, prompt,
aspectRatio })`, which posts `{ model: IMAGE_MODELS[m].id, prompt:
sentPrompt(text).text, aspect_ratio: shape, resolution: '1K' }`.

For each answer:

1. take `data[0].b64_json`, decode it; none, or not decodable, fails the
   image;
2. `sniff` its head: PNG, JPEG or WebP only, else the image fails;
3. `FILE_LIMITS.image`, else the image fails;
4. hash it (SHA-256), `blobs.put(sha, …, { maxBytes, size })`, `linkFile`
   (the quota);
5. read width and height from the header with
   `packages/server/src/files/dimensions.ts` `imageDimensions(bytes, mime)`:
   PNG `IHDR`, JPEG `SOFn` (C0 to CF but C4, C8, CC), WebP `VP8 `, `VP8L`,
   `VP8X`; null when unreadable, and the image still lands (checks never
   block);
6. check again that the project is the user's and not in the bin, then ONE
   `withLiveDocument` transaction that runs `migrateImagePrompts`, `addFiles`
   the entry and `recordGenerationProgress(…, 'done')`;
7. insert its `image_generations` row (D11).

A failed image gets `recordGenerationProgress(…, 'failed')` in its own short
transaction and a row with `ok` false. When every call has ended,
`finishGenerationJob` with D10's error or null. A live document is never
held open across an OpenRouter call.

The file entry: `name` `<label>-<model>-<n>.<ext>`, where `label` is the
scene id, `-p` and the prompt's number in its scene (`S2-p1`) or the prompt's
name slugged to lower-case ASCII letters, digits and hyphens
(`padre-anselmo`), `model` the key (`gpt`, `nb`), `n` the image's number on
the prompt once it lands, `ext` `png`, `jpg` or `webp` from the sniffed type
_(the meaning of `n` and the model key in the name: drafter's choices)_;
`kind` `image`; `promptId` the prompt; `sceneId` null (see below);
`matchedBy` `'generated'` (new value of the enum); `addedBy` `'user'`;
`thumbSha256` null (D12); and two new fields on `FileEntry`, `NewFile`,
`toFile`, `checkNewFile` and `addFiles`:

- `generatedModel: 'gpt' | 'nb' | null`;
- `cost: number | null`, the dollars OpenRouter reported, null when none.

`FileEntry` always carries both (null for every other file); `NewFile` takes
them optionally; `addFiles` writes them to the map only when set, so other
files' maps stay as they are; `toFile` reads them for images only and drops
anything malformed to null.

_`sceneId`: D9 in the architect's decisions says «sceneId from the prompt»,
but `checkNewFile` (`board.ts:497`) refuses an image with a scene and
`toFile` reads an image's `sceneId` as null. The entry is written with
`sceneId` null; the scene comes from the prompt, as for dropped images.
(Architect, Q2.)_

### D10. Errors in plain words

`job.error` holds one of these sentences, from the first failed image:

| OpenRouter                                        | `job.error`                                                                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 401                                               | «OpenRouter rejected your key. Check it in Settings → Image generation.»                        |
| 402                                               | «OpenRouter refused: your key has no credit left. Add credit on openrouter.ai, then try again.» |
| 429                                               | «OpenRouter is busy (rate limit). Try again in a minute.»                                       |
| 400 whose body mentions `moderation` or `content` | «OpenRouter refused this prompt (content policy).»                                              |
| timeout, 5xx, no answer                           | «OpenRouter did not answer. Try again.»                                                         |
| other 4xx _(drafter's choice)_                    | «OpenRouter refused the request (HTTP <status>).»                                               |
| 200 without an image _(drafter's choice)_         | «OpenRouter sent no image. Try again.»                                                          |
| quota full at `linkFile` _(drafter's choice)_     | «Your files have reached their quota.»                                                          |

When some images of the job arrived, they stay and the error reads «2 of 4
images failed: <sentence>»; when none arrived, the sentence alone. A failed
image records the cost OpenRouter reported for it, if any: OpenRouter's
refusals report none, but an image billed and then refused on our side
(quota, board full, bin) was paid for.

When no image of the job landed and OpenRouter billed none of them, the
sentence ends with « Nothing was charged.»; the board shows `job.error`
unchanged.

### D11. Spending

`image_generations` (D1) gets one row per image asked, ok or failed:
`project_id`, `prompt_id`, `model` (the key), `cost` (null when OpenRouter
reported none), `sha256` (null when failed), `ok`, `error`.

- `GET /api/projects/:id/image-spending` → `{ images, cost }`: this
  project's rows, all time, counted as below. 404 for a project that is not the user's or is
  in the bin. It answers whether or not the server is configured.
- `Spending` in `GET /api/image-generation`:

  ```ts
  interface Spending {
    month: { images: number; cost: number };
    all: { images: number; cost: number };
    // This calendar month (UTC), one entry per project with at least one
    // row this month, by title; projectId and title null for projects
    // removed for good.
    projects: {
      projectId: string | null;
      title: string | null;
      images: number;
      cost: number;
    }[];
  }
  ```

Images count ok rows; cost sums every row's cost (null as 0), so spending
matches what OpenRouter billed; both as JSON numbers.
Months start at `date_trunc('month', now() at time zone 'UTC')`. Removing an
image from the board keeps its row: the mockup says «Removing an image does
not remove its cost.» _(Drafter's choices: projects listed when they have any
row this month, failed only included, which is how the mockup shows «Il Faro
di Capo Peloro 0 $0.00»; removed projects grouped under null.)_

### D12. Thumbnails

Generated files arrive with `thumbSha256` null. The client fills it in:
while the board shows an image file with `thumbSha256` null, it fetches the
file (`platform.fileUrl`), builds the 480 px thumbnail with the existing
`probe`, hashes it, stores it with `platform.putFile` and calls the new
`setFileThumb(doc, fileId, thumbSha256): boolean` in `board.ts`, which sets
it in one transaction only while it is still null. Whichever device does it
first wins; the others find it set. One file at a time; each file tried at
most once per page, so an image the browser cannot read is not retried in a
loop. _(Drafter's addition.)_ The desktop does the same through its own
`putFile`. Until then `FileImage` shows the original scaled: it already
does (`parts.tsx:80`).

### D13. The board

The web board as the mockup draws it, described under «The approved
screens». The panel starts from the Settings defaults (D3) and keeps the
last choice of model and count in memory for the page session. Generated
thumbnails get a badge with the model and cost; a file dropped from
Midjourney gets no new badge (the mockup's «Midjourney» badge was only to
tell them apart). The board header shows the project's total from the
spending route, hidden when it is 0 or offline. When a job the user
started finishes without an error while the board is open, a toast says so.

### D14. Settings → Image generation

A section «Image generation» after «Connected apps», at
`/settings/image-generation` _(path: drafter's choice)_, as «The approved
screens» describe: the key card, the defaults card, the spending card, and
the line about storage. Not configured: one card saying the server is not
set up for it. The desktop's `sections` must keep This device after Sync
and storage: `webSections.slice(0, 6)` becomes `slice(0, 7)`.

### D15. Desktop offline

Offline, Generate is disabled with the title «Generating needs the server.
It comes back when this computer is online.»; the Settings section shows
the offline card of screen 10c. No queue of generations while offline: the
router answers 503 `offline` to the generate route anyway. The web client
tells 503 `offline` from 503 `not_configured` by the error code.

### D16. Configuration and infrastructure

- `PROMPTBOOK_SECRETS_KEY`: optional; absent or blank turns the feature
  off; else the base64 of exactly 32 bytes, or the server refuses to start
  with a message naming it. `Config.secretsKey: Buffer | null`.
- `OPENROUTER_BASE_URL`: optional, an `http:` or `https:` URL, default
  `https://openrouter.ai/api/v1`, a trailing `/` removed.
  `Config.openRouterBaseUrl: string`. Tests and e2e point it at the fake.
- Chart: `values.yaml` gains `app.secretsKey.secret: ""` with a comment (a
  Secret with the key `secrets-key`, written outside the chart);
  `deployment.yaml` sets `PROMPTBOOK_SECRETS_KEY` from it by `secretKeyRef`
  (`optional: false`) only when the value is set. The `checksum/config`
  annotation does not change. The chart does not set `OPENROUTER_BASE_URL`.
- `compose.yaml` passes `PROMPTBOOK_SECRETS_KEY: ${PROMPTBOOK_SECRETS_KEY:-}`
  and `OPENROUTER_BASE_URL: ${OPENROUTER_BASE_URL:-}`; `.env.example`
  explains both, with `openssl rand -base64 32` to make a key.
- `values-homelab.yaml` sets `app.secretsKey.secret: rpg-promptbook-secrets`.
  The Secret itself (key `secrets-key`) is created in the namespace by the
  architect before the merge, never committed. _(Architect, Q5.)_

### D17. Fake OpenRouter

`packages/server/test/db/fake-openrouter.ts` (`node:http` and built-ins
only, erasable TypeScript only, so Node can run it with its types stripped
in the e2e container, like `oidc-issuer.ts`):

```ts
startFakeOpenRouter(options?: { host?: string; port?: number; delayMs?: number }):
  Promise<{ baseUrl: string; calls: FakeCall[]; setDelay(ms: number): void;
            failNext(status: number, body?: unknown): void; close(): Promise<void> }>
```

It serves under `/api/v1`:

- `GET /api/v1/key`: bearer `sk-or-v1-good` → 200 with `limit: 10`,
  `limit_remaining: 9.5`; `sk-or-v1-broke` → 200 the same;
  `sk-or-v1-nolimit` → 200 with `limit` and `limit_remaining` null
  _(drafter's addition, for «No spending limit on this key.»)_; any other → 401.
- `POST /api/v1/images`: refuses an unknown model, a `resolution` other than
  `1K` or an `aspect_ratio` outside D6 with 400, as OpenRouter does; bearer
  `sk-or-v1-good` → after the delay, 200 with one image and `usage.cost`
  0.04 for GPT (a PNG) or 0.037 for Nano Banana (a JPEG); `sk-or-v1-broke`
  → 402; any other → 401. `failNext` makes the next call answer a status
  and body of the test's choosing (429, 400 with `moderation`, 500, a 200
  with `data: []`), and a delay longer than the client's timeout tests the
  timeout.
- Every image has bytes of its own (a per-call colour in a PNG built as
  `e2e/media.ts` builds them, sized by the aspect ratio; a small real JPEG
  held in base64 with a per-call comment segment), since `addFiles` skips a
  sha256 the project already lists.
- `calls` records each request's path, body and whether it carried a
  bearer, never the key itself in a log.

`e2e/openrouter/serve.mjs` runs it in a container of the app's image, as
`e2e/issuer/serve.mjs` runs the issuer (`FAKE_OPENROUTER_PORT`,
`FAKE_OPENROUTER_DELAY_MS`), from a new override `e2e/compose.openrouter.yaml`
(service `openrouter`, files mounted read-only, a health check, the app
depending on it). `e2e/stack.ts` adds that file and sets
`PROMPTBOOK_SECRETS_KEY` (a fixed test value) and `OPENROUTER_BASE_URL`
(`http://openrouter:<port>/api/v1`).

Real-world proof: the architect runs real generations on the preview stack
with a real key (owner approved up to about $0.50). The implementer never
calls the real OpenRouter.

## The approved screens

What the mockup draws, in words. Labels are exact.

**Generate button** (screens 1, 5): in each prompt's `.pfoot`, after Copy and
Edit, a small button with a sparkle icon and «Generate», the primary colour
as its outline (`.tb sm` with a primary border). Every category: scene
prompts and the PC, NPC and handout cards (both use `PromptBody`). It shows
only where Copy shows, on a prompt with text. `aria-expanded` follows the
panel. While a job runs on the prompt it is disabled with the title
«Generating…». Offline on the desktop it is disabled with the title of D15.

**Panel** (screen 2): a popover under the prompt box, `role="dialog"`,
`aria-label="Generate images"`, closed by ✕, Cancel, Esc or a second click
on Generate. From top to bottom:

- the title «Generate images» with ✕ (title «Close»);
- «Model»: two cards side by side, the chosen one highlighted; each holds
  the name in bold («GPT Image 2.6», «Nano Banana 2.1»), the note («Best
  detail and text», «Fast draft») and «≈ $0.04 · 53 s per image» («≈ $0.04 ·
  17 s per image»), the estimate with two decimals;
- one row with «Images», a segmented 1 2 3 4, and «Shape» with its hint in
  small text after the label, a segmented 16:9 3:2 1:1 2:3. The hint reads
  «from the prompt's --ar», or «default for Scenes» («PCs», «NPCs»,
  «Handouts»); for a shape mapped from another `--ar` it reads «nearest to
  the prompt's --ar 21:9» _(drafter's choice; the mockup has no such
  case)_;
- a `<details>` «What is sent», open with the summary «What is sent:
  Midjourney flags left out» when the prompt has flags (screen 6). Its body
  shows the base text, then the `No … or ….` sentence marked as added
  (`<ins>`), then the dropped flags struck through (`<s>`); without flags,
  the text alone;
- the footer: «About $0.08 · 1K» (the model's estimate times the
  count, two decimals), «Cancel», and the primary
  «Generate 2» with the sparkle (the count in the label).

Generate posts D7, closes the panel and shows the progress at once.

**No key** (screen 7): the same popover with its title and ✕, the line
«Add your OpenRouter key first. Images are billed to your OpenRouter
account.» and the primary button «Open Settings → Image generation», which
goes to `/settings/image-generation`. Not configured _(drafter's choice)_:
the popover says «This server is not set up for image generation.» with no
button. The panel learns both from `GET /api/image-generation`, fetched once
per page and again after Settings changes the key.

**Progress** (screen 3): the images already arrived, then one shimmering
slot (`.slot-g`) per image still to come (`count − done − failed`), in the
prompt's shape; under them a line with a spinner: «Generating 2 of 4 with
GPT Image 2.6 · 47s. It keeps going if you leave this page.» (`done + failed

- 1`, the model's `name`, whole seconds since `startedAt`). Every device with
  the board open shows it, from the job in the document. Images that arrive
  while the board is open are marked «new», as dropped files are.

**Done**: the toast, on the device whose user started the job, «2 images
for S2 · prompt 1 · $0.08» (one image: «1 image for …»; a named prompt:
«… for Padre Anselmo · …»), the cost summed over the job's generated files
on that prompt. _(How the client knows: the job it saw running is gone
without an error; it sums the files with `matchedBy` `generated` on that
prompt added since `startedAt`. Drafter's choice.)_

**Error** (screen 8): under the prompt, an `.info.err` line with a warning
icon, the job's error as it is (the first sentence bold, as the mockup;
the server ends it with «Nothing was charged.» when that is true, D10),
«Try again» (opens the panel) and a dismiss button
(`dismissGenerationError`). The line replaces the empty-drop text.

**Badges** (screens 1, 5): on a generated thumbnail, a small badge «GPT ·
$0.04» or «Nano Banana · $0.04» (two decimals; «GPT · cost unknown» when
`cost` is null) with the title «GPT Image 2.6 Sunburst, $0.041» (three
decimals). The words «GPT» and «Nano Banana» live in the web client.

**Viewer** (screen 4): for a generated file, the rows keep Prompt, Size and
Dimensions, and «Matched by» gives way to «Source» «Generated», «Model» (the
`full` name) and «Cost» («$0.041», three decimals, or «unknown»); Added and
Status stay. _(D13 lists Source, Model, Cost, Size WxH and Added; the
existing Size and Dimensions rows are kept; drafter's reading.)_
`matchedLabels` gains `generated: 'Generated'`.

**Header total** (screen 1): on the summary line under the tabs, at its
right end, a coin icon and «Generated here: **3 images · $0.12**» with the
title «Generated in this project, as billed by OpenRouter». Hidden when the
project has no generated image, when offline, or when the request fails.
Fetched when the board opens and again when a job ends.

**Empty prompt**: «No images yet. Generate them, or drop downloaded files
here.» in place of «No images yet. Drop Midjourney's four files anywhere on
the board.»

**Offline board** (screen 9): the line «**Offline.** Choosing, editing and
dropping files still work. Generate comes back when this computer is
online.» while offline with no file waiting; with files waiting, the
existing `OfflineLine` as it is. _(From the mockup; D15 does not list the
line.)_

**Settings → Image generation** (screens 10, 10b, 10c): the heading «Image
generation» and the lead «Generate board images with GPT Image or Nano
Banana through OpenRouter, from any image prompt.», then three cards.

- «OpenRouter key». Saved: the label «Key», the masked key
  `sk-or-v1-••••••••••••a41f` (12 dots and the hint, as the mockup), «Replace»
  and «Remove» (danger), and a status line with a check icon: «Works. $12.40
  credit left on this key (checked 21:40).» or «Works. No spending limit on
  this key.» when `limitRemaining` is null and there is no error. With
  `key_rejected`: «OpenRouter rejects this key now. Replace it.»; with
  `openrouter_unreachable`: «OpenRouter did not answer; last checked
  21:40.» _(both drafter's choices)_. Not saved: «Key», a password input
  with the placeholder «sk-or-v1-…», no autocomplete or spellcheck, the
  primary «Save and check», and the hint «Create one at
  openrouter.ai/settings/keys. A spending limit on the key caps what
  Promptbook can spend.»; with `key_unreadable`, D1's sentence above the
  input. Replace shows the input; the saved key stays until a new one is
  saved. Under either state: «Stored encrypted on the server and used only
  to generate your images. It is never sent to the browser or the desktop
  app. Images are billed to your OpenRouter account.» Toasts: «Key saved and
  checked: $12.40 credit left.» (no limit: «Key saved and checked: no
  spending limit.», drafter's choice), «Key removed. Generate asks for a key
  again.» Save errors under the input: `key_rejected` «OpenRouter rejected
  this key.», `openrouter_unreachable` «OpenRouter did not answer. Nothing
  was saved.» _(drafter's choices)_.
- «Defaults for Generate»: «Model» with the two model cards, «Images per
  Generate» with the segmented 1 to 4, and the hint «The Generate panel
  starts from these; your last choice there is kept for the session.» Saved
  through the existing settings saver.
- «Spending»: two big figures, «$0.12» over «November, 3 images» and
  «$1.33» over «All time, 32 images» (the month name in the browser's
  locale); a table «Project · Images · November» with one row per project
  of D11 («Removed projects» for the null entry, drafter's choice); the hint
  «Costs as OpenRouter reports them for each image. Removing an image does
  not remove its cost.»

Not configured: one card «This server is not set up for image generation.
Its administrator turns it on with PROMPTBOOK_SECRETS_KEY.» _(wording:
drafter's choice)_. Offline on the desktop (10c): one card with the offline
icon, «Image generation is kept on the server. Connect this computer to
change it.» The mockup's «new» tag on the nav entry is not built.

## Not touched

The MCP connector and `get_board`'s shape (change 3); reference images
(change 2); Midjourney intake and filename matching; music; the CueBard
export (generated files export like any image: check that it does not break
on `matchedBy` `generated` or the new fields); the Markdown export; the PDF;
the desktop main process.

## Risks

Each is a situation to recognise; report it, do not work around it.

- **A reader or writer chokes on `generated` or the new fields.** Places that
  switch on `matchedBy` or rebuild a `FileEntry`: `Viewer.tsx`
  (`matchedLabels`), `project/src/export.ts` (`exportBoard`, `:174`),
  `project/src/cuebard.ts`, `board-migration.ts`, the intake. An older app
  reads `generated` as null and shows no «Matched by» value; that is expected.
- **One `withLiveDocument` per image is slow or races live clients.**
  Hocuspocus's direct connection opens and stores the document each time.
  If images arrive late, out of order, or a client's edit is lost, report
  before redesigning.
- **OpenRouter answers 200 with no `data[0]`, no `b64_json`, or bytes that
  are not an image.** The image counts as failed; the job goes on.
- **An image billed but refused afterwards** (quota full at `linkFile`,
  project binned mid-job, or its bytes already listed so `addFiles` skips
  them). Billed money and the board disagree; report what you saw.
- **Server restart mid-job.** Images already written stay; the job goes
  stale after 15 minutes and drops out. No persistent queue.
- **503 read as offline.** A client path that treats every 503 as offline
  would hide `not_configured`; check the error code.
- **The fake drifts from OpenRouter.** The fake follows the measured facts
  above; if a real call on the preview disagrees (field names, status
  codes), the architect fixes the fake and the client together.

## Verification

- Unit tests (project): `sentPrompt` with D5's table, `defaultShape` for
  each source; `toFile` and `addFiles` with the new fields
  and `generated`; every generation-job writer and the stale rule;
  `setFileThumb` only while null; the settings default.
- Server unit tests: `loadConfig` for both variables (absent, blank, short,
  long, malformed URL); `sealSecret` and `openSecret` round trip, a wrong
  server key, another account's row; `imageDimensions` on a PNG, a JPEG
  with an APP segment before SOF, and WebP VP8, VP8L and VP8X headers;
  D10's mapping.
- Server db tests against the fake: the key routes (good, rejected,
  unreachable, removed, unreadable after a key change, not configured), no
  key in any response or captured log line; the generate route's every
  refusal in D7's order; a whole job with both models (files in the
  document with name, model, cost, dimensions; rows in `image_generations`;
  the job gone); a partial failure and its sentence; each D10 status; a
  timeout with a short test timeout; spending per project and per month,
  a removed file keeping its cost; migration 008 in the migrations list;
  the new routes in the session test.
- e2e against the fake, the whole suite once normally and once with
  `E2E_CPU_THROTTLE=3`.
- Screenshots (1440 x 900) of every mockup screen, light and dark for the
  panel and Settings, in the scratchpad.
- The owner's LAN preview, with the fake, before the merge.
- Then the architect's real generations on the preview with a real key,
  both models, within about $0.50.

## Answers to the drafter's questions (architect, 2026-11-11)

- **Q1.** The credit left is never stored. `GET /api/image-generation`
  calls OpenRouter only with `?check=1`, which the Settings section sends
  when it opens (D2).
- **Q2.** `sceneId` stays null on a generated image, as on every image; the
  scene is the prompt's (D9).
- **Q3.** 507 `quota`, the same as the upload route (D7).
- **Q4.** The footer shows «1K», not pixels (D6).
- **Q5.** This change sets `app.secretsKey.secret: rpg-promptbook-secrets` in
  `values-homelab.yaml`; the architect creates the Secret before the merge
  (D16).
