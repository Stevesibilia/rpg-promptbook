## Open questions for the owner

**Answered by the owner on 2026-11-25:** Q1 takes the default (no scenes on
a campaign). Q2 takes the alternative: on a campaign the rule line reads
«Each prompt and music prompt gives its chosen file, …». The spec deltas
carry both.

The mockup's campaign screens do not show these; each changes words the
user reads. The spec deltas carry the recommended default. If the owner
answers otherwise, the architect amends the delta before brief B reaches
group 4.

- **Q1. Words that name scenes, on a campaign.** Four places of the
  adventure board speak of scenes, and a campaign has none: the matching
  help (screen 5b), the tray's select «Assign to scene or music…», the
  track menu's «Move to another scene or music…», and the confirmation of
  removing a music prompt («…where you can assign them to a scene or
  another music prompt.»). **Default:** on a campaign, drop the scenes:
  - help, Midjourney: «The filename holds the first words of the prompt.
    They pick the prompt, in any category: General, PCs, NPCs or
    Handouts.»; no scene example;
  - help, Suno: «The filename is the track title of a General music prompt.
    A second take gets "(1)".»; no scene example;
  - help, Two matches: «…Start each prompt differently to avoid it. A track
    title used twice warns on both and its tracks wait in Unmatched.»;
  - tray: «Assign to music…», with the one group «General»;
  - track menu: «Move to another music prompt…»;
  - removing: «Its N tracks move to Unmatched, where you can assign them to
    another music prompt.».
- **Q2. The rule line of the campaign export.** Screen 11b keeps the
  adventure's line «Each prompt and scene gives its chosen file, or every
  matched file when nothing is chosen. General images are not linked to a
  track. The Unmatched tray stays out.», scenes included. **Default:** keep
  it word for word, since the owner agreed 11b as drawn. The alternative is
  «Each prompt and music prompt gives its chosen file, …».

## Context

Issue #68, change 2: the board on a campaign (`asset-board`,
`cuebard-export`, `connector`, `editor`, `markdown-import-export`). The
agreed mockup is [docs/mockups/board.html](../../../docs/mockups/board.html)
(artifact `https://claude.ai/artifact/B5NQ5xj1K4uZHHPhjZkA9h`), screens 11
Campaign board, 11b Campaign export and 11c Campaign, nothing yet. Change 1,
`general-board-items` (v0.24.0, archived as
`openspec/changes/archive/2026-11-24-general-board-items/`), built the tab
General, the `general` category and the `musicPrompts` map; its D7 left
campaigns with no cue group «until campaign-board lifts that».

### Owner decisions (2026-11-24, fixed)

- **O1** One tab «General» holds named images and named Suno prompts, tied
  to no scene (change 1).
- **O2** Scene music stays one Suno prompt per scene (change 1).
- **O3** Campaigns get a board with General, PCs, NPCs and Handouts, no
  Scenes tab and no appendix. Its CueBard pack has one cue group, General,
  and four visual folders. An empty campaign board opens on General with
  the Claude card.
- **O4** CueBard: General tracks are one cue group «General»; General
  images a visual folder «General» with no link (change 1).
- **O5** Not in #68: several Suno prompts per scene; moving a prompt between
  a scene and General.

### The code today

Every gate that keeps a campaign off the board, then what else assumes an
adventure. Lines are at `d6645e9` (v0.24.0).

Gates:

- `packages/server/src/mcp/board.ts:201-202`: `NO_BOARD`, 400 `no_board`
  «A campaign has no images and music board: only an adventure or a
  one-shot does.».
- `packages/server/src/mcp/board.ts:281-285`: `boardable(project)` throws
  it for a campaign. Called by every board tool: `get_board` :302,
  `set_scene_prompts` :329, `add_image_prompt` :366, `update_image_prompt`
  :396, `generate_image` :451, `attach_atelier_image` :518,
  `remove_image_prompt` :586, `add_music_prompt` :606,
  `update_music_prompt` :633, `remove_music_prompt` :661.
- `packages/project/src/cuebard.ts:288-289`: `const cards =
meta.category === 'campaign' ? [] : board.music;` (no General group for a
  campaign).
- `packages/project/src/export.ts:175` (comment) and `:213`: a campaign's
  `board.md` is empty; its files are still listed.
- `packages/web/src/project/ProjectView.tsx:27-33`: `/projects/<id>/board`
  on a campaign navigates to the Document.
- `packages/web/src/shell/Shell.tsx:77` (prop comment) and `:115`: the rail
  leaves out the entry with `board: true` (`:40`) for a campaign.

Already campaign-safe, kept:

- `packages/project/src/board.ts:1151-1164`: `readDocumentBoard` never
  parses a campaign (`appendix = []`), so its rows are empty and its named
  prompts, General music and tray read as on an adventure.
- No campaign check in the server's routes: generation
  (`images/routes.ts`, `images/start.ts`), file upload and download
  (`files/`), the CueBard route (`routes/cuebard.ts:34-121`). The desktop's
  `main/cuebard.ts` and `main/files.ts` have none either.
- `packages/web/src/projects/ProjectPanel.tsx:140-143` offers «Export for
  CueBard…» on every project, campaigns included.
- `packages/project/src/doc.ts:216`: the UI never changes a category, so
  no adventure becomes a campaign or back.
- `packages/server/src/mcp/edits.ts:325-332`: `add_scene` answers 400
  `not_an_adventure` «A campaign has no scenes; add_scene works on
  adventures and one-shots.» on a campaign.
- `packages/format/src/template/campagna.ts:49`: the campaign template's
  appendix is «Appendice: stile visivo e sonoro», free text that never
  prints; the adventure parser does not read it.

Assumes an adventure:

- `packages/web/src/board/useBoard.ts:162-170`: the board parses the
  document in the worker with `adventureTemplateOf(meta)`, which is the
  built-in adventure template for a campaign.
- `packages/web/src/board/summary.ts:46` `tabs` (five, Scenes first),
  `:64-65` `tabParam` defaults to `scenes`, `:89` General's `what` «…for the
  whole adventure…», `:90` the example «Messina dopo il terremoto».
- `packages/web/src/board/BoardView.tsx:231-232` the status bar («N scenes»
  or «No appendix»), `:250` the lead, `:294` «Reading the appendix…»,
  `:317-333` the Scenes panel and `NoAppendix`.
- `packages/web/src/board/ClaudeCard.tsx:8` the request, `:15-18` the text.
- `packages/web/src/board/GeneralView.tsx:138` and `NamedGrid.tsx:120`:
  «…belong to the whole adventure, not to a scene.».
- `packages/web/src/board/MatchHelp.tsx:73`, `:98`, `:125`; `Tray.tsx:90`;
  `MusicHalf.tsx:258` and `:274`; `actions.ts:384`: the strings of Q1.
- `packages/web/src/export/CuebardDialog.tsx:109-113` the lead, `:134` the
  scenes count, `:142` the Scenes folder.
- `packages/server/src/mcp/board.ts:227`, `:296`, `:348`, `:601` and
  `tools.ts:98`: descriptions and `INSTRUCTIONS` say «the whole adventure»
  and do not name campaigns.
- Tests that pin the gates: `packages/server/test/db/mcp-board.test.ts:233-245`
  and `:862-866`, `mcp-board-images.test.ts:341-346`,
  `packages/project/test/cuebard.test.ts:413-424`,
  `packages/project/test/export.test.ts:486-492`.
- Specs: `connector/spec.md:324`, `:335`, `:353-356`, `:438`, `:798`;
  `cuebard-export/spec.md:69`; `editor/spec.md:19-20`, `:38-42`;
  `asset-board/spec.md:12`. Docs: `docs/design.md:448`.

The implementer checks these against the code first (after merging main,
see Risks) and records any difference under "Corrections" in the hand-back.

## Goals / Non-Goals

**Goals:** a campaign's board with General, PCs, NPCs and Handouts and
everything those tabs do on an adventure; the connector, the CueBard pack
and `board.md` for it; the campaign wording of screens 11 to 11c. No new
document data: a campaign's board uses the maps change 1 built.

**Non-Goals:** scenes, an appendix or `visual:`/`mood:` lines on a campaign;
showing the campaign's «Appendice: stile visivo e sonoro» on the board; a
campaign's General images or music in its adventures' boards or packs;
anything of O5.

## Decisions

### D1. One board model; the campaign is a board with no rows (architect's)

The shared model already reads a campaign as a board with no appendix
(`readDocumentBoard`). The change lifts the gates and adds no data: the
`imagePrompts`, `musicPrompts`, `board` and `files` maps are the
adventure's. `cuebard.ts` exports a campaign's General music like an
adventure's (D8); `export.ts` writes its `board.md` (D10). No migration:
a campaign with a board written by nobody reads as an empty board.

Rejected: a campaign-only map or category. A campaign's items are General,
PC, NPC and handout prompts exactly as an adventure's, and every reader,
matcher and generator works by prompt id.

### D2. The web never parses a campaign for the board (architect's)

`useBoard` answers a campaign at once with an empty appendix (no worker,
no `adventureTemplateOf`), and `parseNow` resolves at once, so `loaded` is
true on the first render and «Reading the appendix…» never shows. This
mirrors `readDocumentBoard`: a campaign text with a heading that looks like
an adventure appendix still gives no rows, on the web, in the connector and
in the packs alike. The intake's scene list is empty, so tracks match
General music titles only and images any General, PC, NPC or handout
prompt.

### D3. Tabs per category; a campaign opens on General (architect's, from O3)

`summary.ts` gets `boardTabs(category)`: `['scenes', 'general', 'pcs',
'npcs', 'handouts']` for an adventure or one-shot, `['general', 'pcs',
'npcs', 'handouts']` for a campaign. `CategoryTabs` draws those. The first
tab is the default and has no parameter in the address: Scenes on an
adventure as today, General on a campaign, so `/projects/<id>/board` opens
General and `?tab=general` also works. `?tab=scenes` or an unknown value on
a campaign reads as General, and the address is replaced. The Scenes panel,
`ScenesSummary` and `NoAppendix` never mount on a campaign. A result-line
link to a scene cannot occur (no scene rows), so `goTo` needs no campaign
branch beyond the default tab.

### D4. Campaign wording (from the mockup; Q1 and Q2 answered)

The board reads «campaign» where the adventure reads «adventure», from one
value `whole: 'adventure' | 'campaign'` in the board context. Strings in
"Mockup in words". The Q1 strings are the default the owner chose on 2026-11-25.
The Q2 rule line is «Each prompt and music prompt gives …». Nothing else on the board changes words: the drop overlay, the
viewer, the editors, the toasts and the tray's reasons name no scene that
a campaign could show.

### D5. Rail and route (architect's, from O3)

`Shell.tsx` drops the `board` filter and the `board` flag; the rail shows
«Images and music» for every project. `ProjectView.tsx` renders the board
for every category. The editor spec's «No board for a campaign» scenario
becomes «Board of a campaign».

### D6. Connector: every board tool works on a campaign (architect's)

`NO_BOARD` and `boardable` go; `no_board` is retired (no tool answers it,
and nothing documents it as current). On a campaign:

- `get_board` answers the same shape as on an adventure: `scenes: []`,
  `outsideAppendix: []`, `general: { images, music }`, `pcs`, `npcs`,
  `handouts`, `unmatched`, `duplicateTitles` (General titles only). With
  #67, each prompt also carries `images[]` and `references` (see Risks).
- `add_image_prompt` (`general`, `pc`, `npc`, `handout`),
  `update_image_prompt`, `remove_image_prompt`, `generate_image`,
  `attach_atelier_image`, `add_music_prompt`, `update_music_prompt` and
  `remove_music_prompt` work as on an adventure, with the same refusals and
  warnings.

Rejected: a `kind` or `campaign` flag in `get_board`'s answer. `get_project`
already gives the category, and an empty `scenes` says the rest.

### D7. Scene-only arguments on a campaign answer `not_an_adventure` (architect's)

`set_scene_prompts`, and `add_image_prompt` with the category `scene`,
answer 400 `not_an_adventure` on a campaign, before any scene lookup and
with nothing written: «A campaign has no scenes: give its images the
category general, pc, npc or handout, and its music with add_music_prompt.»
The code is `add_scene`'s, so one code means «this needs an adventure».

Rejected: `unknown_scene`. Its sentence sends Claude to `get_board` for
scene ids that a campaign never has.

### D8. Descriptions and instructions (architect's)

- `INSTRUCTIONS`' board line gains, after the image categories: «A
  campaign’s board has no scenes: General, PCs, NPCs and Handouts, and
  General music for the whole campaign.».
- `get_board`'s description: «General (images of the whole adventure or
  campaign …)», and «A campaign has no scenes: scenes is empty. For the
  style of a campaign’s images and music, read its document.».
- `add_image_prompt` and the shared prompt rules (`board.ts:227`): «General:
  images of the whole adventure or campaign …»; the `scene` category's line
  adds «(adventures and one-shots only)».
- `add_music_prompt`: «a Suno prompt for the whole adventure or campaign,
  not tied to a scene …».
- `set_scene_prompts`: «Adventures and one-shots only.».

### D9. CueBard pack of a campaign (architect's, from O3 and O4)

`cuebard.ts` drops the campaign branch. A campaign's plan has no scenes, so:

- `items` holds the one group «General» at index `[0]`, uuid key `general`,
  when at least one General track is exported, else nothing. Its cues are
  `[0, n]`, named and ordered as on an adventure.
- `visualFolders` lists General, PCs, NPCs, Handouts that have images
  (never Scenes): «four visual folders» of 11b.
- `cuebardFiles` order: General tracks, then General, PC, NPC and handout
  images. Warnings: General images, General music, PCs, NPCs, Handouts (the
  code's order since change 1; the mockup lists the music first, a
  simplification of the mockup's own code).
- `summary.groups` is 1 or 0 and `summary.general` says which. The summary
  type is unchanged; the dialog reads the category from the document (D11).
- A campaign exported before and after this change keeps its visuals' ids:
  they derive from the file ids.

### D10. `board.md` of a campaign (architect's)

`exportBoard` drops the campaign branch and, for a campaign, leaves out the
part `# Scenes`: `board.md` is `# General` (with `## Images` and
`## Music`), `# PCs`, `# NPCs`, `# Handouts`, as on an adventure. A campaign
with no item at all still gets an empty `board.md`. Files keep their
folders (`files/general/…`, `files/pcs/…`, `files/unmatched/…`).

### D11. The export dialog on a campaign (from the mockup, 11b)

`CuebardSummaryView` takes `campaign: boolean` (the dialog reads
`readMeta(doc).category`). On a campaign:

- lead «A CueBard project: one cue group General with the campaign's music,
  and the images in four visual folders.»;
- Cue groups: «General · N tracks», or «no General group · N tracks», with
  no scenes part;
- Visual folders: «General N · PCs N · NPCs N · Handouts N images», with no
  Scenes part;
- the rule line, the warnings, «Nothing to export yet: add files to the
  board first.», where the pack is built and the toasts as on an adventure
  (Q2 for the rule line).

### D12. Desktop (architect's)

Nothing of its own: the board, the intake and the offline pack come from
`packages/project` and `packages/web`. A campaign's board works offline as
an adventure's does (files on this computer, choosing and prompts sync
later). The desktop e2e board steps keep passing. An older desktop app
keeps hiding the campaign board until it updates; it never deletes a
campaign's board data.

### D13. Older clients (architect's)

A v0.24 web or desktop shows no board on a campaign, and its CueBard export
of a campaign leaves the General group out; nothing it does deletes a
campaign's prompts or files. Accepted: the web is always current and the
desktop updates itself.

### D14. Generation and references on a campaign (architect's)

Nothing to change: Generate, Atelier and the reference picker of #67 work
by prompt id and over the board's shown prompts, which on a campaign are its
General, PC, NPC and handout prompts. D16 lists the checks after #67 lands.

### D15. Tests (plan)

- `packages/project`: `cuebard.test.ts` (a campaign with General music
  exports the group «General» at `[0]`; with no General track no group;
  folders without Scenes; the `cuebardFiles` order; the old «named images
  only» test rewritten); `export.test.ts` (a campaign's `board.md` has
  General, PCs, NPCs, Handouts and no `# Scenes`; an empty campaign gives
  ''); `board.test.ts` (a campaign whose text holds `## Appendice: immagini
e musica` with `### S1. …` still reads no rows).
- `packages/server` (db): `mcp-board.test.ts` (on a campaign: `get_board`
  with `scenes: []` and its General, PC and music items; `add_image_prompt`
  `general` and `npc`; `set_scene_prompts` and `add_image_prompt` `scene`
  answer `not_an_adventure` and write nothing; the music tools work; the
  duplicate-title warning among General prompts); `mcp-board-images.test.ts`
  (`attach_atelier_image` on a campaign's General prompt); `mcp.test.ts`
  if the instructions are pinned there.
- `packages/web`: `summary` tests (`boardTabs`, the default tab, `tabParam`
  on a campaign), the export dialog's campaign lines, the Claude card's
  campaign text, the help's campaign variant.
- `e2e/campaign-board.spec.ts` (new; sorts before `generate.spec.ts` and
  generates nothing): create a campaign, open «Images and music» from the
  rail, see the tabs General, PCs, NPCs, Handouts and the Claude card with
  the campaign request (11c); add a General image and a music prompt by
  hand; drop an image and a track named after them; choose the track; add
  an NPC; open «Export for CueBard…» and read 11b's lines; download the pack
  and check its project file has one group «General». `e2e/connector.spec.ts`:
  `add_music_prompt` on a campaign shows its card without a reload, and
  `set_scene_prompts` on it answers `not_an_adventure`.
  `e2e/editor.spec.ts` «campaign not checked»: the rail shows «Images and
  music».

### D16. After PR #67 lands (architect's)

The implementer of brief A merges `origin/main` into the branch once #67
(`reference-images`) is on main, before group 1, and checks:

- Conflicts: `packages/server/src/mcp/board.ts` (#67 adds `references` to
  `generate_image` and `images[]`/`references` to each prompt in
  `get_board`; this change removes the `boardable` calls in the same
  functions), `mcp-board.test.ts`, `mcp-board-images.test.ts`, and one line
  of `web/src/board/BoardView.tsx`. Keep both sides.
- `grep -rn "boardable\|NO_BOARD\|no_board" packages/*/src` is empty after
  group 2, #67's code included.
- A db test: `generate_image` with one reference on a campaign's General
  prompt reaches the fake OpenRouter with one `input_references` entry, and
  `get_board` on the campaign lists that prompt's `images[]` and
  `references`.
- Brief B, after rebasing: the Generate panel's reference picker on a
  campaign board lists its General, PC, NPC and handout images, and the
  prompt card shows «References: …». A unit test over `boardImages` with
  a campaign's shown prompts is enough; no generating e2e step.
- #67's migration is `010`; this change adds none.
- The release is the minor after #67's.

### Mockup in words

Screen 11, Campaign board (the seeded campaign «Kulthos»):

- Window title «Kulthos · Promptbook»; crumbs «Kulthos»; category chip
  «Campaign». The rail shows «Images and music», on.
- Heading «Images and music»; lead «Images and music for the whole
  campaign, with PCs, NPCs and handouts. For the table and the CueBard
  export.»; buttons «How matching works», «Export for CueBard…», «Add
  files…».
- Tabs, in order: «General 5» «2 wanted»; «PCs 4» «2 wanted»; «NPCs 6» «3
  wanted»; «Handouts 3» «1 wanted». No Scenes tab. General is on. Its title
  attribute: «2 images and 3 music prompts: 2 chosen, 1 received, 2
  wanted»; PCs' «4 image prompts: 1 chosen, 1 received, 2 wanted».
- Summary «2 images: 1 chosen, 0 received, 1 wanted · 3 music: 1 chosen, 1
  received, 1 wanted»; filters All 5, Wanted 2, Received 1, Chosen 2.
- Section «Images · Midjourney», «2 images · 1 chosen»: card «Copertina
  della campagna», Chosen, its prompt «an ancient bronze anchor half buried
  in black sand, … --ar 2:3 --v 8.1», «by Claude · 3 days ago», Copy, Edit,
  four images with the third chosen (Generate as on every image prompt,
  from image-generation.html); card «Il mare che guarda»,
  Wanted, «No images yet. Drop Midjourney's four files anywhere on the
  board.»; the add card «Add image».
- Section «Music · Suno», «3 music prompts · 1 chosen»: card «Tema della
  campagna», Chosen, Title «Tema della campagna» with «The download's
  filename. Used to match tracks.», Style, Lyrics, each with Copy,
  «Instrumental: ON · Weirdness: low · Style Influence: strong», «by Claude
  · 3 days ago», Edit, track «tema della campagna.mp3» «Take 1» «4:21» «✓
  Chosen»; card «Combattimento», Received, tracks «combattimento.mp3» «Take
  1» «2:48» Choose and «combattimento (1).mp3» «Take 2» «3:05» Choose; card
  «Riposo alla locanda», Wanted, «edited by you · yesterday», «No tracks
  yet. Drop Suno's downloads anywhere on the board.»; the add card «Add
  music prompt».
- Hint «General images and music belong to the whole campaign, not to a
  scene. Their files find them by filename, like the others.» On PCs, NPCs
  and Handouts: «PCs belong to the whole campaign, not to a scene.» (and so
  on).
- Adding a General image on a campaign: the Name placeholder «Copertina
  della campagna».
- Status bar «Images and music», «Campaign · 15 image prompts · 3 general
  music», «Claude connected · read and edit», «Synced 21:40 ·
  promptbook.siberio.eu».

Screen 11b, Campaign export (on screen 11's board):

- Dialog «Export for CueBard». Lead «A CueBard project: one cue group
  General with the campaign's music, and the images in four visual
  folders.»
- «Cue groups» «General · 3 tracks». «Visual folders» «General 1 · PCs 5 ·
  NPCs 9 · Handouts 5 images».
- «Each prompt and music prompt gives its chosen file, or every matched file when
  nothing is chosen. General images are not linked to a track. The
  Unmatched tray stays out.» (Q2)
- «8 warnings»: «General music "Riposo alla locanda" has no track.»,
  «General "Il mare che guarda" has no image.», «PC "Ignazio Scuderi" has
  no image.», «PC "Elsa Lindqvist" has no image.», «NPC "Padre Anselmo" has
  no image.», «NPC "Za' Nina" has no image.», «NPC "L'uomo col cappotto
  nero" has no image.», «Handout "Avviso di ricerca" has no image.» (the
  app lists the General image before the General music, D9).
- «Your browser downloads Kulthos.cbpack»; Cancel, Export; toast
  «Downloading Kulthos.cbpack.». With no file on the board: «Nothing to
  export yet: add files to the board first.», Export off.

Screen 11c, Campaign, nothing yet:

- Tabs «General 0» «none yet», «PCs 0» «none yet», «NPCs 0» «none yet»,
  «Handouts 0» «none yet»; General on; no summary line, no filters.
- Card «Prompts come from Claude»: «Claude reads the campaign and writes
  General images and music for it, like a cover and a main theme, and
  Midjourney prompts for the PCs, the NPCs and the handouts. Ask in a chat
  on claude.ai:», the request «Write the image and music prompts for the
  board of «Kulthos»: general images and music, portraits of the PCs and
  NPCs, and the handouts» with Copy, and «Claude needs the Promptbook
  connector, with read and edit access. Settings → Connected apps».
- Empty General: «Nothing general yet», «Images and music for the whole
  campaign, not tied to a scene: establishing shots, a cover, a main theme,
  ambience, combat music.», «Add image», «Add music prompt», «Claude can
  write them too: ask for "the general images and music of «Kulthos»".».
- Status bar «Campaign · 0 image prompts · 0 general music».

## Risks / Trade-offs

- **PR #67 lands first.** `reference-images` (change 2 of #57, branch
  `feat/57-reference-images`) is being merged with main and lands before
  this change. It touches `board.ts`, `doc.ts`, generation, the Generate
  panel, `get_board` and `generate_image`. D16 says when to merge and what
  to check; the campaign board must work with references on its prompts.
- **A campaign text that looks like an adventure appendix** would give rows
  if parsed; D2 and `readDocumentBoard` never parse it.
- **`no_board` retired.** A client that relied on it (none known; Claude
  reads the descriptions each session) now gets a board.
- **Older clients** hide the campaign board (D13). No data is lost.
- **Q1 and Q2** were answered by the owner on 2026-11-25 (top of this
  design).

## Contract for parallel briefs

Brief A (project, server, connector) and brief B (web, e2e, docs) share no
new type: the model exports nothing new. B builds against D3, D4, D9 and
D11 after A's hand-back, on the same branch, in a fresh session (no rebase:
the branch is published and force pushes are refused). A's group 1 lands
first, since B's export dialog lines need D9's summary on a campaign. Any
change to D6 to D11 goes through the architect.

## Migration Plan

None: no new data, and a campaign's maps read as an empty board. Rollback
to the previous release hides the campaign board again and keeps its data.
