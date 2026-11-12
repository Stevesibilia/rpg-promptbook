# Board images through the connector: design

## Context

Facts this design relies on (architect, 2026-11-12, file:line at `e35e94a`):

- **The generate route** (`packages/server/src/images/routes.ts:389-482`)
  holds its logic inline: session, body (`generateSchema` :140, `model`,
  `count` 1 to 4 and `shape` all required), `ownProject`, the provider from
  `getSettings(db, user.id).imageGeneration`, `serverKey()` (503
  `not_configured`), the Atelier address (503 `atelier_unavailable`),
  `readSecret` (409 `no_key`), the prompt in the live document (404
  `prompt_not_found`, 400 `prompt_empty`), a running job on the prompt (409
  `busy`), three running jobs per user counted in `runs` plus the local
  `starting` map (429 `too_many_jobs`), `hasRoom` (507 `quota`),
  `startGenerationJob`, then `runGenerationJob(...)` not awaited, and 202
  `{ jobId }`. `runs` is `app.generationRuns` (`app.ts:109`), a
  `Map<string, GenerationHandle>` whose handle has `done`, `userId`,
  `provider`, `stop`.
- **Jobs** (`images/jobs.ts`): `runGenerationJob(deps, run)` (:155). `land()`
  (:204-253) sniffs the bytes, stores the blob (`store()` :184-198:
  `blobs.put` then `linkFile`), reads width and height with
  `imageDimensions`, and adds the file with `addFiles(doc, [entry])` inside
  `withLiveDocument`; the entry has `thumbSha256: null`, `matchedBy:
'generated'`, `addedBy: 'user'`. The web client fills thumbnails in later
  for any image without one (`nextThumbless`,
  `packages/web/src/board/generate.ts:331`). A job that ends without an
  error is removed from the document; job state lives in the Yjs map
  `generationJobs` (`packages/project/src/generation.ts`,
  `readGenerationJobs` :111).
- **Atelier client** (`images/atelier.ts`): `downloadImage(base, token, id)`
  (:261) caps the answer at `FILE_LIMITS.image` (40 MiB). `call` (:80) turns
  Atelier's 404 into `AtelierError(404, 'not_found', 'Image not found.')`,
  a 401 into `AtelierError(401, 'invalid_token', …)`, no answer into
  `atelier_unreachable`, an unreadable or oversize answer into
  `atelier_bad_answer`, another refusal into `atelier_refused`.
- **Secrets** (`images/secrets.ts:70`): `readSecret(db, serverKey, userId,
'atelier')` answers `none`, `unreadable` or `ok` with the key.
- **File rules** (`packages/project/src/board.ts`): `toFile` (:180-190) keeps
  `atelierImageId` only when `generatedVia === 'atelier'`; `checkNewFile`
  (:522-553) refuses an `atelierImageId` unless `generatedVia` is
  `'atelier'`, and a `generatedVia` without a `generatedModel`. A sha already
  on the board is skipped by `addFiles`, not refused.
- **Spending** comes only from the table `image_generations`; a file's
  badge shows only when `generatedModel !== null`
  (`packages/web/src/board/generate.ts:131`). `generatedRows` (:152) gives
  the viewer's rows and the Atelier link, and answers null without a model.
- **Connector** (`packages/server/src/mcp/`): `TOOL_NAMES` (`tools.ts:54`,
  28 names), the local `tool(name, description, hints, shape, run)`
  (:159-193) which checks the `read_write` scope and the write quota for a
  tool that is not read-only and always sets `openWorldHint: false`; the
  `ToolKit` (:137) with `projectOf`, `docOf`, `write`, `templates`, `db`,
  `sync`, `caller`; `registerBoardTools(kit)` (`board.ts:148`) with
  `boardable`, `writeBoard`, `promptId`, `UNKNOWN_PROMPT()`, `invalid()`,
  `itemOut` (:42). `McpDeps` (`server.ts:35`) is `{db, sync, log, version,
quota}`; `mcpRoutes` (`routes/mcp.ts:38`) gets `{config, db, sync}`. So the
  connector has no `config`, blob store or `runs` today.
  `toToolError` (`errors.ts:68`) passes an `AppError` under 500 through and
  turns one at 500 or above into `internal_error`.
- **Tests**: `packages/server/test/db/mcp.test.ts:158-194` asserts the tool
  list, `toHaveLength(28)`, the destructive set and the 12 read-only names;
  `db/mcp-board.test.ts` tests the board tools; `db/image-generate.test.ts`
  and `db/image-atelier.test.ts` test the route against
  `db/fake-openrouter.ts` and `db/fake-atelier.ts`. The fake Atelier serves
  only images it generated.
- **Docs**: `README.md:213-243`, `docs/design.md:342` and `:429-431`, the
  `INSTRUCTIONS` string (`tools.ts:87-93`).

## Decisions

**D1. Two tools and two fields.** `generate_image` and `attach_atelier_image`
join `TOOL_NAMES` after `remove_image_prompt` (30 tools). `get_board` adds
`generating` and `generationError` to each image prompt. _Why:_ generating
covers new images in one call to one server; attaching covers an image that
already exists in Atelier; the two fields let a model see a job that outlived
the tool's wait. _Rejected:_ a `get_generation` tool (a third tool for what
two fields of `get_board` say); a tool that takes a URL (the server would
fetch a string a model chose) or image bytes (megabytes through the
conversation).

**D2. One way to start a generation.** The route's body moves, unchanged in
behaviour and error codes, into `packages/server/src/images/start.ts` as
`startImageGeneration(starter, input)`, where `input` is `{ userId,
projectId, promptId, model, count, shape, addedBy }` and the answer is
`{ jobId, provider, startedAt, done }` (`done` is the run's promise). The
`starter` is one object built once in `app.ts` holding what the route closed
over (`config`, `db`, `sync`, `blobs`, `runs`, the `starting` map, the log
and the test timings) and is given to both `imageRoutes` and `mcpRoutes`.
_Why:_ the limits (one job per prompt, three per user, quota) must count the
button and the connector together, and two copies of twelve checks would
drift. The route keeps `requireSession`, `parseBody` and the 202.

**D3. `generate_image` input.** `projectId`, `promptId`, and optional
`model` (`gpt` or `nb`), `count` (1 to 4), `shape` (one of `IMAGE_SHAPES`)
and `waitSeconds` (0 to 50, default 45). Defaults: `model` and `count` from
the account's `imageGeneration` settings; `shape` from `defaultShape(category,
<the prompt's --ar>)`, read the way `GeneratePanel.tsx` reads it. _Why:_ the
same picks the panel opens with, so "generate S3's prompt" needs two ids.

**D4. `generate_image` waits, then answers.** After the start it waits for
the run's `done` or `waitSeconds`, whichever is first, and never stops the
job. It answers `{ jobId, promptId, provider, model, count, shape, state,
images, failed, error }`: `state` is `finished` or `running`; `images` are
the prompt's files added since the job started that have a `generatedModel`,
each `{ name, width, height, cost, atelierImageId }`; `failed` and `error`
come from the job (zero and null when it is gone without an error). _Why:_
most generations end inside 50 seconds, and an MCP call should not be held
near a client's timeout; `get_board` covers the rest (D8).

**D5. Who wrote a generated file.** A run takes `addedBy` (`'user'` from the
route, `'claude'` from the tool) and `land()` writes it. _Why:_ the
connector spec marks everything a tool writes as Claude's.

**D6. `attach_atelier_image` input and order.** `projectId`, `promptId`,
`atelierImageId` (a uuid). In order: the project (`projectOf`, `boardable`),
the prompt (`UNKNOWN_PROMPT()`), the server's secrets key and Atelier address,
the account's Atelier token, room in the quota for the largest image
(`hasRoom` with `FILE_LIMITS.image`), `downloadImage`, the type from the
bytes (PNG, JPEG or WebP), the blob stored and linked, the file added to the
live board. It works whichever provider the account generates through; it
only needs the token. _Why:_ every refusal that can be known before the
download comes before it, and the board is written last, so a refusal
changes nothing.

**D7. The attached file.** `name` is `<label>-atelier-<first 8 of the
id>.<ext>`, the label from `labelOf` in `images/routes.ts` (:150); `kind: 'image'`, `matchedBy: 'hand'`,
`addedBy: 'claude'`, `promptId`, width and height from the bytes,
`thumbSha256: null`, `generatedModel: null`, `generatedVia: null`, `cost:
null`, `atelierImageId` the id. No row goes into `image_generations`. _Why:_
Promptbook did not generate it and does not know its model or cost, so it
gets no badge and adds nothing to spending; the id is kept for the link
back. The file rules change to allow it: in `board.ts`, `toFile` keeps a
uuid `atelierImageId` when `generatedVia` is `'atelier'` **or**
`generatedModel` is null, and `checkNewFile` accepts it under the same
condition (a uuid, and `generatedVia === 'atelier'` or no `generatedModel`),
refusing otherwise with the message
`atelierImageId: a uuid, on an image generated through Atelier or attached
from it`. An older client reads the id as null and loses nothing else.

**D8. Storing shared.** The part of `land()` that sniffs, stores, links and
measures an image moves to an exported function in `images/jobs.ts` (or a
file beside it) that both `land()` and the attach tool call. Generation's
behaviour, names and errors do not change. _Why:_ one path for bytes onto
the board.

**D9. `attach_atelier_image` answers** `{ promptId, atelierImageId, file: {
name, mime, size, width, height }, already }`. `already` is true when the
same bytes were on the board before the call (`addFiles` skipped them);
`file.name` is then the existing file's name. _Why:_ calling twice is safe
and says so.

**D10. Errors a model can read.** Tool errors must stay under 500 or
`toToolError` hides them. Both tools rethrow, with the same code and
message, at 409: `not_configured`, `atelier_unavailable`, `quota`
(`legible()` in `mcp/board.ts`). The attach tool adds:

| Case                                         | Status | Code                      | Message                                                    |
| -------------------------------------------- | ------ | ------------------------- | ---------------------------------------------------------- |
| No Atelier token, or one that cannot be read | 409    | `no_atelier_token`        | Add your Atelier API token in Promptbook’s Settings first. |
| Atelier answers 404                          | 404    | `atelier_image_not_found` | Atelier has no image with this id.                         |
| Atelier answers 401                          | 409    | `token_rejected`          | Atelier rejected the saved token. Replace it in Settings.  |
| `atelier_unreachable`                        | 424    | as is                     | as is                                                      |
| `atelier_bad_answer`, `atelier_refused`      | 424    | as is                     | as is                                                      |
| Not a PNG, JPEG or WebP                      | 415    | `unsupported_type`        | That Atelier file is not a PNG, JPEG or WebP image.        |
| The board holds 2000 files                   | 409    | `board_full`              | The board is full.                                         |

Any other Atelier error of its own passes as 424 with the text `Atelier
refused: <message>`, as `atelierRefused()` words it. The token never appears
in a message. `generate_image` passes the route's own errors under 500 as
they are (`no_key`, `prompt_not_found`, `prompt_empty`, `busy`,
`too_many_jobs`).

**D11. `get_board`.** `itemOut` adds `generating` (true while a job that is
not stale runs on the prompt) and `generationError` (the text of the
prompt's finished job with an error, else null), from `readGenerationJobs`.

**D12. Hints.** The local `tool()` takes an optional `openWorld` hint,
false when absent. `generate_image`: not read-only, not idempotent,
`openWorld: true` (it spends money at a provider and makes images there).
`attach_atelier_image`: not read-only, idempotent, not open world (it only
reads from Atelier). Neither is destructive.

**D13. Descriptions, literally.**

`generate_image`:

> Generate 1 to 4 images on an image prompt, through the image provider the
> user chose in Settings (Atelier or OpenRouter), as the board’s Generate
> button does. This spends the user’s money: generate when the user asks for
> images, not to try a prompt out. Model, count and shape default to the
> user’s settings and the prompt’s own ratio. The call waits up to
> waitSeconds for the images; when it answers state running, read get_board
> later: the prompt says generating until the job ends, then its files count
> has grown or generationError says why not. The images land on the prompt
> as received.

`attach_atelier_image`:

> Put an image that is already in the user’s Atelier on an image prompt, by
> the image’s id (as Atelier’s own tools give it). Promptbook downloads the
> original itself with the Atelier token saved in Settings; the bytes never
> pass through this conversation. It costs nothing. Use it for images made
> in Atelier outside Promptbook; to make new ones, use generate_image.

The `INSTRUCTIONS` board line gains: `generate_image makes images on a
prompt and spends the user’s money; attach_atelier_image puts an image
already in Atelier on a prompt.`

**D14. Viewer.** In `packages/web/src/board/generate.ts`, a file with no
`generatedModel` and an `atelierImageId` gets one viewer row: label `From`,
value `Atelier`, and, when the server's Atelier address is known, the same
link `generatedRows` builds (`No. <first 8> in Atelier ↗`). No badge. _Why:_
one row in the list that is already there; no new control, so no mockup.

**D15. The fake Atelier** gains a way for a test to add an image by bytes
and get its id. No test calls a real Atelier or OpenRouter.

## Not touched

- The generate route's behaviour, status codes and body; the panel.
- `image_generations` and the spending routes.
- The Atelier client's error mapping, collections, `secrets.ts`.
- The prompt rules in the board tools' descriptions (Midjourney wording is
  #57's).
- Migrations, the chart, the desktop packaging.

## Risks

- **Moving the route's body changes an error or its order**: the existing
  route tests are the proof; they must pass unedited. If one needs an edit,
  stop and report.
- **The `starting` reservation leaks on an early throw** after the move:
  keep the route's `try/finally` shape; a test starts three jobs, fails a
  fourth, finishes one and starts again.
- **An old desktop client rewrites a file entry and drops `atelierImageId`**:
  accepted; only the link is lost.
- **Two attaches of one image at once**: `addFiles` skips the second; both
  answer, one with `already: true`. Do not add a lock.
- **Anything in the web package beyond D14** means the plan is wrong: report
  it.

## Verification

`npm run typecheck`, `npm test` with a throwaway Postgres, `npm run e2e`, in
`node:26-alpine`. After the release the architect calls both tools on the
live server on a scratch project: one attach of an existing Atelier image,
one `generate_image` with `count` 1 on the cheaper model, then reads
`get_board`.
