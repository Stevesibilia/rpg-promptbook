## Why

The Images and music board ties music to scenes: one Suno prompt per scene,
nothing else. Images not tied to a scene must be a PC, an NPC or a handout.
A game master also needs content for the whole adventure: a main theme, a
combat track, ambience, an establishing shot, a cover. Issue
[Stevesibilia/rpg-promptbook#68](https://github.com/Stevesibilia/rpg-promptbook/issues/68)
asks for images and music that belong to no scene.

The owner agreed the mockup
[docs/mockups/board.html](../../../docs/mockups/board.html) (artifact
`https://claude.ai/artifact/B5NQ5xj1K4uZHHPhjZkA9h`, screens 1a, 5, 7c, 10
and 11 to 11c) and decided on 2026-11-24 (O1 to O5 in the design): one
General tab holding named images and named Suno prompts; scene music stays
one per scene; campaigns get a board (a later change of #68); General
tracks become one CueBard cue group «General» after the scene groups and
General images a visual folder «General» with no link. The architect took
the remaining decisions; they are in the design.

## What Changes

- **General images:** a fifth image category, `general`, named like PCs,
  NPCs and handouts and tied to no scene. Everything image prompts have
  works on it: status, choice, intake by filename, Generate, Atelier.
- **General music:** a new `musicPrompts` map in the project's Yjs document
  holds any number of Suno prompts (title, style, lyrics, who wrote it and
  when, an order, the chosen track), with flat keys so concurrent edits
  merge. A track belongs to a scene (`sceneId`) or to a General music prompt
  (`musicId`).
- **Intake by filename** matches a track against every scene's music title
  and every General music title. A title used twice, in scenes or General,
  warns on both and its tracks wait in Unmatched.
- **Board UI:** the tab General after Scenes, with an Images section of
  cards and «Add image», and a Music section of Suno cards with their tracks
  and «Add music prompt»; summary, filters, tab count and status bar count
  both; the tray, the viewer and the track menu assign and move to General
  items; the Claude card, the matching help and the result line name
  General.
- **Connector:** `add_image_prompt` takes the category `general`; new tools
  `add_music_prompt`, `update_music_prompt` and `remove_music_prompt`
  (tracks go to the tray, files are never deleted); `get_board` returns the
  General music; the instructions and descriptions name General.
- **CueBard export:** one cue group «General» after the scene groups, left
  out when it exports no track; a visual folder «General» after «Scenes»,
  its images with no link; a warning per General music prompt with no
  track.
- **Markdown export:** `board.md` gets a General part; files go to
  `files/general/images/<name>/` and `files/general/music/<title>/`.

Out of scope (owner): several Suno prompts per scene; moving a prompt
between a scene and General; the campaign board, which is the next change
of #68 (`campaign-board`). A campaign keeps answering `no_board` here.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `asset-board`: the General tab, General images and music, tracks matched
  to General music, the tray, viewer and track menu, choosing a track per
  General music prompt, removing a General music prompt, narrow windows.
- `connector`: the `general` category, `get_board`'s General music, the
  three music prompt tools, descriptions and instructions;
  `remove_music_prompt` deletes a prompt and never a file.
- `cuebard-export`: the cue group and the visual folder «General», what
  goes in the pack, the summary's warnings.
- `markdown-import-export`: `board.md`'s General part and its folders.

## Impact

- `packages/project`: `board.ts` (the `general` category, the
  `musicPrompts` model, `FileEntry.musicId`, readers, writers, rows, tray,
  duplicate titles), `match.ts` (tracks against General music),
  `cuebard.ts` (group and folder), `export.ts` (`board.md`, folders),
  `model.ts` (`CAPS.musicPrompts`), the shape comment in `doc.ts`; exported
  from `index.ts`.
- `packages/server`: `mcp/board.ts` (three new tools, `get_board`,
  `add_image_prompt`), `mcp/tools.ts` (`TOOL_NAMES`, `INSTRUCTIONS`),
  `images/start.ts` (a General prompt's label).
- `packages/desktop`: nothing of its own; the offline pack and the board
  come from the shared model.
- `packages/web`: `board/` (tabs, the General view, music cards, editors,
  tray, viewer, track menu, help, intake, summary, Claude card),
  `export/CuebardDialog.tsx`.
- `e2e/board.spec.ts`, `e2e/connector.spec.ts`, `e2e/media.ts`, README,
  `docs/design.md`. No new dependency, no database migration. Release
  `v0.24.0`.
