## Why

Issue [#59](https://github.com/Stevesibilia/rpg-promptbook/issues/59):
Promptbook generates board images with each account's own OpenRouter key
(change 1 of #57, v0.19.0). The owner also runs Atelier, an image studio with
its own API, monthly spending cap and gallery, and wants Promptbook to
generate through it: one cap, one gallery. The owner decided on 2026-11-12 to
keep the OpenRouter path too, so Promptbook still works without Atelier, and
approved the mockup
[docs/mockups/atelier-provider.html](../../../docs/mockups/atelier-provider.html)
the same day (screens 1 to 7).

Atelier ships what this change needs in its v0.8.0 (Atelier change
`atelier-promptbook-client`): a generation that files its images into a
collection, and a route that describes an API token.

## What Changes

- **Generate through Atelier or OpenRouter.** Settings → Image generation
  gets a "Generate through" choice per account. Each provider keeps its own
  credentials; only the chosen one is used. A choice is off until its
  credentials work.
- **Atelier credentials.** The server's Atelier address comes from
  `ATELIER_URL`; each account pastes a write API token, checked with Atelier
  and stored encrypted like the OpenRouter key. Settings shows the token's
  name, expiry and the month against Atelier's cap. A server without
  `ATELIER_URL` shows Atelier as unavailable.
- **Generating through Atelier.** Same two models, shapes, counts and prompt
  text. The server starts one Atelier generation, watches it, downloads each
  image and adds it to the board as today. The images also go into an Atelier
  collection named after the project, made on the first Generate.
- **Panel, viewer, board.** The Generate panel says which provider it uses,
  with that provider's price estimates; the viewer shows "Through" and links
  an Atelier image to Atelier; spending counts both providers.
- Images generated before keep what they are.

Out of scope: reference images (change 2 of #57, built on both providers
after this), the connector tool, moving old images to Atelier, choosing a
provider per project.

## Capabilities

### Modified Capabilities

- `asset-board`: Generate through the chosen provider; Atelier generation,
  collection and links; provider on images, jobs and spending.
- `accounts`: an Atelier API token per account, and the provider choice.
- `projects-screen`: Settings → Image generation with "Generate through" and
  the Atelier card.
- `deployment`: `ATELIER_URL` and its chart value.

## Impact

- `packages/project`: `board.ts` (`FileEntry.generatedVia`,
  `FileEntry.atelierImageId`), `generation.ts` (`GenerationJob.provider`),
  `settings.ts` (`imageGeneration.provider`), new `providers.ts`.
- `packages/server`: migration `009_atelier.sql`; `config.ts`
  (`ATELIER_URL`); new `images/atelier.ts`; `images/jobs.ts`,
  `images/routes.ts`, `images/secrets.ts`; `routes/settings.ts`; a fake Atelier
  for tests.
- `packages/web`: Settings → Image generation, the Generate panel, the
  viewer, the board's "Generated here", `api.ts`.
- `charts/rpg-promptbook`, `compose.yaml`, `.env.example`, `e2e/` (fake
  Atelier service and a spec), `docs/deploy-homelab.md`.
- One database migration (009). Needs Atelier v0.8.0 live before release.
