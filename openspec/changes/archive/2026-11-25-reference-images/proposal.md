# Reference images for board image generation

## Why

A generation starts from the prompt's text alone, so the same NPC gets a new
face in every scene. Issue #57 asks for a chosen image as a reference, to
keep a character the same. Atelier can do it, but only by leaving
Promptbook; the owner wants the picker inside Generate (2026-11-17).

## What Changes

- The Generate panel takes up to 3 reference images, picked from the images
  on the same project's board, in any category.
- A prompt remembers its references: they are saved in the project, sync
  like the prompt's text, and show as a line on the prompt.
- The server sends the references with the prompt, through OpenRouter
  (`input_references`) or through Atelier (uploaded there when the image did
  not come from Atelier).
- A generated image records the references it was made with; the viewer
  shows them.
- The connector's `generate_image` takes references, and `get_board` lists
  each prompt's images by id and its references.
- Mockup: `docs/mockups/image-generation.html`, screens 11 to 13, agreed
  with the owner on 2026-11-17.

Out of scope: references from a file on disk or from the Atelier gallery;
suggesting the portraits of a scene's cast; prompts rewritten for GPT Image
and Nano Banana (change 3 of #57); any change to Atelier.

## Impact

- `promptbook-project`: prompt part `refs`, `FileEntry.references`,
  `GenerationJob.references`.
- `promptbook-server`: generate route and `startImageGeneration`, OpenRouter
  and Atelier clients, migration 010, connector tools, both fakes.
- `promptbook-web`: Generate panel, prompt card, viewer.
- `e2e`: fake OpenRouter and fake Atelier, board specs.
- Specs: `asset-board`, `connector` (added requirements).
