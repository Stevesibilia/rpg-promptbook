## Why

The Images and music board (#26) holds one Midjourney prompt per scene. An
adventure needs more: several shots of a scene, portraits of the player
characters and the NPCs, and handouts. Issue
[Stevesibilia/rpg-promptbook#36](https://github.com/Stevesibilia/rpg-promptbook/issues/36)
asks for any number of image prompts in four categories, before the
`.cbpack` export (phase 3) gives each category its own CueBard visual folder.

The owner agreed the mockup
[docs/mockups/board.html](../../../docs/mockups/board.html) (artifact
`https://claude.ai/artifact/2nvTeYyLRcuUYBfeKJVCJ6`) and decided on
2026-10-20 (O1 to O10 in the design): four categories labelled Scenes, PCs,
NPCs and Handouts; only Scene prompts tied to a scene; music unchanged;
status and choice per image prompt; intake by filename across every
category, with files matching none or several prompts in the tray; removing
a prompt never deletes files; only Scenes needs the appendix; existing
boards keep everything; phase 3 kept easy; a full release with an owner
preview. The architect took the remaining decisions; they are in the design.

## What Changes

- **Image prompts in four categories:** a new `imagePrompts` map in the
  project's Yjs document holds any number of image prompts, each with a
  category (scene, pc, npc, handout), a scene id (scene prompts) or a name
  (the others), the Midjourney prompt, who wrote it and when, an order, and
  its chosen image. Images belong to a prompt (`promptId`); tracks keep their
  scene. Flat keys, so concurrent edits merge field by field.
- **Existing boards migrate:** each scene's single image prompt and its
  chosen image become that scene's prompt 1, with a stable id
  `legacy-<sceneId>`; the migration never writes a key an edit writes, so it
  can run on every replica at once and still converge without losing an
  edit. It runs when the server loads a document, when the desktop opens
  one, and wherever an older client wrote a legacy key since.
- **Board UI:** a category switch (Scenes, PCs, NPCs, Handouts) with counts,
  what is still wanted and a new-files dot; filters inside the active tab;
  scene rows whose image half is a stack of prompts with «Add image prompt»;
  cards for PCs, NPCs and Handouts with «Add PC», «Add NPC», «Add handout»
  and their empty states; removing a prompt with a confirm; the viewer
  choosing «for this prompt» and moving «to another prompt»; the tray's
  grouped «Assign to prompt…».
- **Intake by filename** matches every image prompt of every category. A
  file matching one prompt goes to it; none or several, to the tray; an
  ambiguous file says «matches N prompts» and lists those prompts first.
- **Connector:** `get_board` returns every image prompt with its id;
  new tools `add_image_prompt`, `update_image_prompt` and
  `remove_image_prompt` (images go to the tray, files are never deleted);
  `set_scene_prompts` keeps working on a scene's first prompt; the server
  instructions name the categories.
- **Markdown export:** `board.md` lists Scenes (prompts numbered), PCs, NPCs
  and Handouts; files go to `files/scenes/<scene>/<n>/`,
  `files/scenes/<scene>/music/`, `files/pcs/<name>/`, `files/npcs/<name>/`,
  `files/handouts/<name>/` and `files/unmatched/`.

Out of scope (owner): music beyond one Suno prompt per scene; a link from an
NPC or a handout to a scene; the `.cbpack` export (phase 3). Also not built:
reordering prompts by hand (the order is stored, the UI appends), a group of
prompts whose scene left the appendix (they are kept, hidden, as today's
music prompts are), versions of the prompts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `asset-board`: categories, several image prompts per scene, PCs, NPCs and
  Handouts, status and choice per prompt, matching across categories, the
  ambiguous tray, removing a prompt, the migration of existing boards.
- `connector`: `get_board`'s image prompts, the three image prompt tools,
  `set_scene_prompts` on a scene's first prompt, the instructions and
  descriptions; `remove_image_prompt` is the one tool that deletes
  something.
- `markdown-import-export`: `board.md` and the `files/` folders by category.

## Impact

- `packages/project`: `board.ts` (the image prompt model, readers, writers,
  rows per prompt, tray), new `migrate.ts` (`migrateImagePrompts`,
  `needsImageMigration`, `migratedView`), `match.ts` (prompts of every
  category, candidates), `export.ts` (`board.md`, folders), `model.ts`
  (`CAPS.imagePrompts`), the shape comment in `doc.ts`; exported from
  `index.ts`.
- `packages/server`: `sync.ts` (`afterLoadDocument` migrates), `mcp/board.ts`
  (three new tools, `get_board`, `set_scene_prompts`), `mcp/tools.ts`
  (`TOOL_NAMES`, `INSTRUCTIONS`), `routes/transfer.ts` (export reads a
  migrated view).
- `packages/desktop`: `main/sync.ts` migrates a project's document when a
  window opens it. No new storage.
- `packages/web`: `board/` (tabs, scene prompt stack, cards, editors, tray,
  viewer, help, intake, summary).
- `e2e/board.spec.ts`, `e2e/desktop.spec.ts` (the board steps), README,
  `docs/design.md`. No new dependency, no database migration. Release
  `v0.7.0`.
