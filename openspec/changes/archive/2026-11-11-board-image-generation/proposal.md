## Why

Issue
[Stevesibilia/rpg-promptbook#57](https://github.com/Stevesibilia/rpg-promptbook/issues/57)
asks to generate the board's images from inside Promptbook. Today every image
comes from Midjourney by hand: copy the prompt, run it there, download, drop
the files on the board. Midjourney has no API and its terms forbid automated
tools (docs/design.md, «Midjourney and Suno»), so it cannot be driven from
the app, and the owner plans to drop it later.

The owner ran a bake-off on 2026-11-11 (two rounds, 32 images) through
OpenRouter's image API and picked **GPT Image 2.6 Sunburst** as the default
(best detail and text, about $0.040 and 53 s per image) and **Nano Banana
2.1** as the fast draft (about $0.037 and 17 s per image).

The owner agreed the mockup
[docs/mockups/image-generation.html](../../../docs/mockups/image-generation.html)
on 2026-11-11, screens 1 to 10c, with these answers: one OpenRouter key per
account, kept encrypted on the server and never sent to a client; the server
does the work, so images arrive on every device by sync; Midjourney prompts
keep working, with their flags left out; generated images land as received
images with their model and cost.

Control-room plan p50 splits issue #57 into three changes; this is the first.

## What Changes

- **Generate on every image prompt.** Next to Copy and Edit, in every
  category, a **Generate** button opens a panel: model (GPT Image 2.6 or Nano
  Banana 2.1), number of images (1 to 4), shape (16:9, 3:2, 1:1, 2:3), the
  estimated price and the exact text that is sent.
- **Midjourney prompts keep working.** The server sends the text before the
  first `--` flag, turns `--no …` into a sentence, and takes the shape from
  `--ar`; the panel shows what is sent.
- **Generation runs on the server.** The server calls OpenRouter, stores each
  image like an uploaded file and adds it to the board through the live
  document, so progress and images show on every device, also after the page
  is left. Failures come back in plain words on the prompt; a failed image
  costs nothing.
- **Generated images carry their model and cost**: a badge on the thumbnail,
  rows in the viewer, a «Generated here» total in the board header.
- **Settings → Image generation**: the OpenRouter key (saved after a check
  with OpenRouter, shown masked, replaced or removed), the defaults for
  Generate, and the spending of the month by project.
- **Desktop**: Generate and the settings section need the server, shown
  disabled offline with a reason; no offline queue.
- **Deployment**: a new server secret `PROMPTBOOK_SECRETS_KEY` turns the
  feature on; `OPENROUTER_BASE_URL` points tests at a fake OpenRouter.

Out of scope: reference images for generation (change 2 of #57); the
connector tool for generation and the GPT Image and Nano Banana prompt
writing rules (change 3 of #57), while the Midjourney prompt rules stay as
they are; music generation; changes to Midjourney intake and filename
matching; the PDF.

## Capabilities

### Modified Capabilities

- `asset-board`: Generate and its panel; what is sent from a Midjourney
  prompt; generation jobs in the project; generated images with model and
  cost; errors; the generate and project spending routes; thumbnails of
  generated images; the viewer's rows for a generated image.
- `accounts`: an OpenRouter key per account, checked, stored encrypted and
  never returned.
- `projects`: the settings hold the defaults for Generate.
- `projects-screen`: the Settings section «Image generation».
- `desktop-app`: Generate and Image generation among the actions that need
  the server.
- `deployment`: `PROMPTBOOK_SECRETS_KEY` and `OPENROUTER_BASE_URL`, and the
  chart value for the secret.

## Impact

- `packages/project`: new `images.ts` (models, `sentPrompt`, shapes),
  `board.ts` (`matchedBy` `generated`, `FileEntry` fields, generation jobs,
  thumbnail writer), `settings.ts`, `doc.ts` (layout comment), `index.ts`.
- `packages/server`: new migration `008_image_generation.sql`; `config.ts`;
  new `images/` (secrets, OpenRouter client, job runner, routes);
  new `files/dimensions.ts`; `files/store.ts`; `routes/settings.ts`;
  `app.ts`; test helpers and a fake OpenRouter (`test/db/fake-openrouter.ts`).
- `packages/web`: the board (`ImagePrompt.tsx`, `Viewer.tsx`, `BoardView.tsx`,
  new Generate panel and hooks, `board.css`), `api.ts`, Settings
  (`SettingsPage.tsx`, new Image generation section).
- `packages/desktop`: nothing in main; the router already forwards the new
  routes online and answers 503 offline.
- `charts/rpg-promptbook`, `compose.yaml`, `.env.example`, `e2e/` (fake
  OpenRouter service, compose override, new spec), `docs/design.md`,
  `docs/deploy-homelab.md`.
- One database migration (008). The homelab Secret holding
  `PROMPTBOOK_SECRETS_KEY` is created by the architect at release, outside
  the repository.
