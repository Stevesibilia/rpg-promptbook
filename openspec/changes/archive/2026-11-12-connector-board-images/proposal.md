# Board images through the connector: proposal

## Why

Issues Stevesibilia/rpg-promptbook#61 and the connector bullet of
Stevesibilia/rpg-promptbook#57. The connector can write image prompts but
cannot put an image on the board. Claude in a chat can write the prompts, and
can even generate images in Atelier through Atelier's own connector, but the
results then have to be downloaded and dropped on the board by hand. A chat
client has no shell that reaches both servers.

Promptbook's server already does both halves: it generates on a prompt
(v0.19.0, through Atelier since v0.20.0) and downloads Atelier originals with
the account's token. Neither is reachable from the connector.

## What Changes

- **`generate_image`** (new tool): generates 1 to 4 images on an image
  prompt, through the account's provider, exactly as the Generate button
  does. Model, count and shape default to what the panel would pick. It waits
  up to 50 seconds for the images and reports them, or says the job is still
  running.
- **`attach_atelier_image`** (new tool): takes an image prompt and the id of
  an image in the user's Atelier; the server downloads the original with the
  account's Atelier token and adds it to the prompt as a received image. It
  spends nothing and adds nothing to the project's spending.
- **`get_board`** says, per image prompt, whether images are being generated
  for it and the last generation's error.
- The viewer shows where an attached image came from, with its link to
  Atelier, as it does for a generated one.
- Errors a model can act on: no key or token, no Atelier address, the image
  unknown to Atelier, quota, a generation already running.

Out of scope: reference images (change 2 of #57), prompts rewritten for
these models (#57), adding an attached image to the project's Atelier
collection, any tool that takes a URL or image bytes.

## Impact

- Specs: `connector` (two requirements added, "Tools" and "Board tools"
  changed), `asset-board` (one requirement added).
- Code: `packages/project` (file rules), `packages/server` (generation start
  shared by the route and the connector, the two tools, `get_board`),
  `packages/web` (one viewer row), `README.md`, `docs/design.md`.
- No migration, no new configuration, no chart change.
- Release: v0.21.0.
