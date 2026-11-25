## Why

A campaign has images and music too: a cover, the campaign's main theme,
combat music, its recurring NPCs and its handouts. Today a campaign has no
board: the rail hides «Images and music», its address opens the Document,
the connector's board tools answer `no_board`, and its CueBard pack and
`board.md` leave the music out. Issue
[Stevesibilia/rpg-promptbook#68](https://github.com/Stevesibilia/rpg-promptbook/issues/68)
asks for images and music that belong to no scene; its first change,
`general-board-items` (v0.24.0), gave adventures and one-shots the tab
General and left campaigns for this change.

The owner agreed the mockup
[docs/mockups/board.html](../../../docs/mockups/board.html) (artifact
`https://claude.ai/artifact/B5NQ5xj1K4uZHHPhjZkA9h`, screens 11, 11b and
11c) and decided on 2026-11-24 (O3): campaigns get a board with the tabs
General, PCs, NPCs and Handouts, no Scenes tab and no appendix; its CueBard
pack has one cue group, General, and four visual folders; an empty campaign
board opens on General with the Claude card. The architect took the
remaining decisions; they are in the design, with two questions for the
owner on wording the mockup does not show.

## What Changes

- **Board on a campaign:** the rail's «Images and music» and
  `/projects/<id>/board` open a board on a campaign. It has the tabs
  General, PCs, NPCs and Handouts, opens on General, and never parses the
  document for an appendix. Everything those tabs have on an adventure works
  the same: prompts, status, choosing, intake by filename, the tray, the
  viewer, Generate, Atelier, references.
- **Campaign wording:** the header lead, the status bar («Campaign · …»),
  the hints, the empty General tab, the name example and the Claude card
  speak of the campaign, as screens 11 and 11c show.
- **Connector:** the board tools stop refusing campaigns; `no_board` is
  retired. `get_board` answers a campaign's board with no scenes.
  `set_scene_prompts` and `add_image_prompt` with the category `scene`
  answer `not_an_adventure` on a campaign, as `add_scene` does. The
  instructions and descriptions name the campaign's board.
- **CueBard export:** a campaign's pack gets the cue group «General», the
  only group, when a General track is exported; the dialog shows the
  campaign's lead and lines with no scenes (screen 11b).
- **Markdown export:** a campaign's `board.md` holds the parts General,
  PCs, NPCs and Handouts, no Scenes.

Out of scope: a campaign's General music or images in the packs or boards
of its adventures; showing the campaign's appendix «Appendice: stile visivo
e sonoro» on the board; scenes on a campaign.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `asset-board`: the board on a campaign (tabs, opening tab, wording, the
  Claude card), the board view, the categories, the General tab, narrow
  windows, how matching works.
- `editor`: the rail's «Images and music» on every project.
- `connector`: the board tools on a campaign, scene-only arguments,
  descriptions and instructions.
- `cuebard-export`: a campaign's cue group «General» and its summary
  dialog.
- `markdown-import-export`: a campaign's `board.md`.

## Impact

- `packages/project`: `cuebard.ts` and `export.ts` lose their campaign
  branches; tests.
- `packages/server`: `mcp/board.ts` (no `boardable`, the
  `not_an_adventure` refusals, descriptions), `mcp/tools.ts`
  (`INSTRUCTIONS`); db tests.
- `packages/web`: `shell/Shell.tsx`, `project/ProjectView.tsx`,
  `board/` (tabs per category, no parse for a campaign, wording, Claude
  card, help, tray, track menu), `export/CuebardDialog.tsx`.
- `packages/desktop`: nothing of its own.
- `e2e/`: a campaign board spec, connector and editor steps. README,
  `docs/design.md`. No new dependency, no database migration, no new
  document data. Lands after PR #67 (`reference-images`); released as the
  minor after it.
