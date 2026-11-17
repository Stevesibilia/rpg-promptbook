# Design: reference-images

## Context

Change 1 of #57 (`board-image-generation`, v0.19.0) gave every image prompt
a Generate panel; `atelier-image-provider` (v0.20.0) added Atelier as a
second provider; `connector-board-images` (v0.21.0) added `generate_image`.
All three left reference images out. Today:

- A prompt is flat keys `"<id>/<part>"` in the Y.Map `imagePrompts`; the
  parts are fixed by `PROMPT_KEY` (`packages/project/src/board.ts`).
  `chosenFileId` is checked against the files when read.
- An image is a `FileEntry` in the Y.Array `files`, with `generatedModel`,
  `cost`, `generatedVia`, `atelierImageId`.
- The route `POST /api/projects/:id/image-prompts/:promptId/generate` and
  the connector both call `startImageGeneration` (`start.ts`), which reads
  the prompt in a live transaction and runs `runGenerationJob` (`jobs.ts`).
- OpenRouter: one `POST {base}/images` per image, body
  `{model, prompt, aspect_ratio, resolution: '1K'}`.
- Atelier: `POST /api/v1/generations`, then polling. Atelier's generation
  takes `referenceIds` (Atelier image ids) and Atelier has
  `POST /api/v1/uploads` (raw body, PNG, JPEG or WebP, 20 MB at most), which
  returns the image; the same bytes uploaded twice give the same image.
- Atelier's own OpenRouter client sends references as
  `input_references: [{ type: 'image_url', image_url: { url: <data URL> } }]`
  and caps their total at 30 MB. That shape is proven against the real API.

## Owner decisions (2026-11-17)

- O1. The picker is inside Promptbook's Generate panel.
- O2. Sources: the images on the same project's board, any category. Chosen
  images come first.
- O3. Up to 3 references per generation.
- O4. References are remembered per prompt, saved with the project and
  synced. No automatic suggestion.
- O5. The connector takes references in the same change.
- O6. Mockup screens 11 to 13 agreed. The mockup's $0.004 per reference is
  invented.

## Decisions

### Model (`promptbook-project`)

- D1. New prompt part `refs`: the key `"<id>/refs"` holds a JSON array of
  file ids. `PROMPT_KEY`, `PromptPart` and `allPrompts()` learn it.
  `ImagePromptEntry` gains `references: string[]`: the stored ids that are
  image files of the project today, without duplicates, in stored order, the
  first `MAX_REFERENCES` (3, exported). It also gains
  `missingReferences: number`: stored ids that are no longer such a file. A
  reference may be an image of the same prompt.
- D2. Writer `setPromptReferences(doc, promptId, fileIds, by)`: stores the
  valid ids only (same rule as D1), so a write also cleans the missing
  ones. An empty list deletes the key. It refuses more than
  `MAX_REFERENCES` valid ids by keeping the first three.
- D3. `FileEntry` gains `references: string[] | null`: the file ids the
  image was generated with, null for an image that was not generated or was
  generated without references. Readers do not filter it: the viewer needs
  to know how many are gone.
- D4. `GenerationJob` gains `references: string[]` (default `[]` when read
  from an older job).

### Server

- D5. The generate body gains `references?: string[]` (file ids, at most
  3, strict). The route passes it on; `GenerationInput` and `GenerationRun`
  gain `references: string[] | null`. `null` (the field left out) means
  «the prompt's remembered references»; a list, also an empty one, is used
  as given **and written to the prompt** with `setPromptReferences` in the
  same live transaction that reads the prompt. The app always sends the
  list.
- D6. `startImageGeneration` resolves the references before any provider
  call, and refuses the generation (400, nothing charged, no job) with one
  sentence when:
  - an id is not an image file of this project:
    «A reference image is no longer on the board. Remove it and try again.»
  - its bytes are not on the server (`linkedFile` and `blobs.has`):
    «A reference image has not reached the server yet. Wait for it to sync,
    or remove it.»
  - its type is not PNG, JPEG or WebP:
    «A reference image must be a PNG, JPEG or WebP.»
  - one is over 20 MB or together they are over 30 MB:
    «The reference images can be at most 20 MB each and 30 MB together.»
    The sentences live with the other `IMAGE_ERRORS`.
- D7. OpenRouter: `ImageRequest` gains `references: { mime, bytes }[]`;
  the body gains `input_references` in the shape above, only when there is
  at least one. Each of the `count` calls carries them. The bytes are read
  once per job from the `BlobStore`.
- D8. Atelier: for each reference, use `file.atelierImageId` when the file
  has one; otherwise upload the bytes with `POST /api/v1/uploads` (new
  client function `uploadImage`) and use the returned id. Uploads happen
  once per job, before `POST /generations`, which gains `referenceIds`. If
  Atelier refuses a `referenceIds` entry that came from `atelierImageId`
  (the image was deleted there), upload that file's bytes and retry once.
  Atelier's own refusal sentences (model takes no or fewer references) are
  shown as they are, with the existing «Atelier refused:» wording.
- D9. `land()` writes `references` on each `FileEntry` it adds (D3). The job
  in the doc carries them (D4).
- D10. Migration `010`: `image_generations.reference_count smallint not
null default 0`, written per image row.
- D11. No server-side resize: the server has no image library, and Atelier
  sends full bytes with the same 30 MB cap. Fastify's 1 MiB body limit is
  not touched: references travel as ids.

### Web

- D12. `GeneratePanel`: a «References» block between Images/Shape and «What
  is sent», as in the mockup: picked thumbnails with a remove button and the
  image's label («S1 · 2», or the prompt's name), a «+ Add» tile while
  fewer than 3 are picked, the counter «n of 3». «+ Add» opens the grid of
  the board's images, chosen ones first, then in board order; a click picks
  or unpicks; at 3 the others are disabled with «3 references at most». An
  image that is only on this device (`device.ts`) is disabled with «Not on
  the server yet». The grid is a listbox, keyboard reachable.
- D13. Picking and removing write to the prompt at once
  (`setPromptReferences`), so they sync and survive closing the panel.
  Generate sends the current list (D5).
- D14. With `missingReferences > 0` the panel shows once «n reference(s)
  no longer on the board» above the block; the next pick or remove cleans
  them (D2).
- D15. The estimate keeps its number and, with at least one reference,
  adds «· plus the input images». No invented per-reference price (O6).
- D16. The prompt card shows «References: Padre Anselmo, S1 · 2» under the
  prompt's buttons when it has any.
- D17. The viewer shows «References» for a generated image that has them:
  the labels of those still on the board, then «n removed» for the others.
- D18. The panel's layout while the grid is open must not be clipped by the
  scene card; how (in flow, or a portal) is the implementer's choice.

### Connector

- D19. `get_board`: each prompt gains `images: [{ id, name, chosen,
generated }]` (its image files, in board order) and `references: string[]`
  (D1). The existing `files` count and `chosen` name stay.
- D20. `generate_image` gains `references?: string[]` with the meaning of
  D5; its answer gains `references: string[]` (what was sent). The tool's
  description says where the ids come from and that a list is remembered on
  the prompt.

### Fakes and tests

- D21. `fake-openrouter.ts`: `input_references`, when present, must be 1 to
  3 entries of the D7 shape with a `data:image/(png|jpeg|webp);base64,` URL,
  else 400; the fake records the count of the last request so tests can
  read it.
- D22. Fake Atelier, both copies kept in sync (`e2e/atelier/serve.mjs`,
  `fake-atelier.ts`): `POST /api/v1/uploads`; `referenceIds` on
  `POST /generations` must be known image ids, else its 400; the generation
  JSON echoes them; a way for a test to delete an image, for D8's retry.
- D23. e2e, on both providers where the stack has them: pick a reference in
  the panel, generate, the fake received 1 reference; the prompt card and
  the viewer show it; after a reload the panel still has it; removing the
  reference image from the board makes the line go.

## Contract for parallel briefs

Brief A (project, server, fakes, connector) and brief B (web, e2e) meet at:
D1 to D4 as exported from `promptbook-project`, and the generate body of D5.
A's first commit is the `promptbook-project` part alone, pushed before B
starts. Any change to these goes through the architect.

## Risks

- The real models' limit on input images is not checked here: 3 is the
  owner's number, and both models are documented as taking several. A
  provider refusal shows as the provider's sentence. The architect proves
  one real generation with a reference on the preview before the merge,
  with the owner's go for the cost.
- A board image used as a reference through Atelier is uploaded to the
  owner's Atelier gallery. Told to the owner on 2026-11-17.
- Each OpenRouter image call resends the references: 4 images with 30 MB of
  references send about 160 MB as base64.

## Accepted departures

- D5: `GenerationRun.references` is the resolved list (`ReferenceFile[]`:
  file id, sha256, mime, size, Atelier id), not ids; `GenerationInput` is as
  written. A given list is written to the prompt before the byte checks, so
  a list refused as not synced, wrong type or too large stays remembered.
- D6: the refusals carry the codes `reference_missing`,
  `reference_not_synced`, `reference_type`, `reference_too_large`.
  Duplicates in a list are dropped, not refused. An unreadable reference
  (also a read error) fails the job with the not-synced sentence.
- D1: `refs` is one value written whole, so two devices that each add a
  reference while offline keep only the last write.
- D8: the retry runs only on Atelier's not-found refusal. A stale
  `atelierImageId` stays on the file, so each later job with that reference
  pays one refused start and one upload.
- D12: at three picks the grid stays open with the others disabled, as the
  spec says; the mockup closed it. The grid lists images on prompts only; a
  reference left in the Unmatched tray stays valid and is named by its file
  name. The words «+ Add an image», «Sent with the prompt and kept on this
  prompt for next time.» and «No images on this board yet.» come from the
  mockup.
- D21, D22: the fakes serve three test-only routes, `GET /api/v1/__last` on
  both and `DELETE /api/v1/__images/:id` on Atelier, read by the e2e specs
  through `compose exec`.
- Brief A's first commit added the new fields to four test helpers in
  `packages/web/test`, to keep the root typecheck green.
- `packages/web/src/platform/hooks.ts`: `useStore` passes a server snapshot,
  so the panel's static-markup tests can draw thumbnails.
