## Context

Issue #68: images and music that belong to the whole adventure, not to a
scene, on the Images and music board (`asset-board`, `image-categories`,
`cuebard-export`). The agreed mockup is
[docs/mockups/board.html](../../../docs/mockups/board.html) (artifact
`https://claude.ai/artifact/B5NQ5xj1K4uZHHPhjZkA9h`). The screens of this
change are 1a General, 5 After a drop, 7c Add a music prompt, 10 Export for
CueBard and the matching help (5b). Screens 11, 11b and 11c (campaign board)
belong to the next change of #68, `campaign-board`; this change keeps
campaigns as they are. "Mockup in words" below gives the strings.

### Owner decisions (2026-11-24, fixed)

- **O1** One tab «General» holds both: any number of named image prompts
  and any number of named Suno prompts, not tied to a scene.
- **O2** Scene music stays one Suno prompt per scene.
- **O3** Campaigns get a board with General, PCs, NPCs and Handouts and no
  Scenes tab. That is the change `campaign-board`, after this one.
- **O4** CueBard: General tracks become one cue group «General» after the
  scene groups; General images a visual folder «General», not linked to a
  track.
- **O5** Not in #68: several Suno prompts per scene; moving a prompt between
  a scene and General.

### The code today

- `packages/project/src/board.ts`: image prompts live in the `imagePrompts`
  Y.Map under flat keys `<id>/def|prompt|name|order|chosen|legacy|removed`;
  `imageCategories = ['scene', 'pc', 'npc', 'handout']`,
  `namedCategories = ['pc', 'npc', 'handout']`. Scene music lives in the
  `board` Y.Map under `<sceneId>/music` and `<sceneId>/chosenTrack`. Files
  live in the `files` Y.Array; an image has `promptId`, a track has
  `sceneId`, null meaning the Unmatched tray. `boardRows`, `namedPrompts`,
  `duplicateTitles` and `unmatchedFiles` derive what the board shows.
- `match.ts`: `matchTrack` compares a Suno file's title with each scene's
  music title (`MatchTargets.scenes`).
- `cuebard.ts`: `CUEBARD_FOLDERS` (Scenes, PCs, NPCs, Handouts), one cue
  group per appendix row, warnings `no-track`, `no-image`, `no-duration`,
  `missing`.
- `export.ts`: `exportBoard` writes `board.md` and the `files/` folders.
- `server/src/mcp/board.ts` and `tools.ts`: `get_board`,
  `set_scene_prompts`, the image prompt tools, `TOOL_NAMES`, `INSTRUCTIONS`,
  a `SINGULAR` label per category.
- `web/src/board/`: `summary.ts` (`tabs`, `tabOf`, `categoryOf`),
  `CategoryTabs`, `BoardView`, `NamedGrid`, `ImagePrompt`, `PromptEditor`,
  `MusicHalf`, `Tray`, `Viewer`, `MatchHelp`, `ClaudeCard`, `actions.ts`,
  `intake.ts`, `useBoard.ts`; `web/src/export/CuebardDialog.tsx`.

The implementer checks these against the code first and records any
difference under "Corrections" in the hand-back.

## Goals / Non-Goals

**Goals:** General images and General music on adventures and one-shots,
with everything the other categories have: status, choice, intake by
filename, the tray, Generate and Atelier on the images, the connector, the
Markdown export and the CueBard pack. Existing boards open unchanged.

**Non-Goals:** the campaign board (`campaign-board`); several Suno prompts
per scene; moving a prompt between a scene and General; reordering General
items by hand (the order is stored, the UI appends); versions of prompts.

## Decisions

### D1. General images are a fifth image category (architect's)

`imageCategories` becomes `['scene', 'general', 'pc', 'npc', 'handout']`
and `namedCategories` `['general', 'pc', 'npc', 'handout']`: a General
image prompt is a named prompt with no scene, stored exactly like a PC's.
Every place that lists categories follows that order (tabs, the tray's
groups, the viewer's «Move to another prompt…», `board.md`, the CueBard
folders). Labels: tab «General», singular «General», so an image prompt
reads «General · Messina dopo il terremoto»; the name of a new one left
empty becomes «New image» (not «New General»).

Rejected: a separate map for General images. The category already carries
everything a named image needs, and Generate, Atelier, matching and the
viewer work by prompt id.

Older clients (v0.23 and before) read a def with an unknown category as no
prompt: they do not show a General image prompt, and its images wait in
their tray as «Its prompt was removed.». They never delete the prompt's
keys. That is accepted: the desktop app updates itself, and the web is
always current.

### D2. General music prompts in their own map (architect's)

A new Y.Map `musicPrompts`, flat keys as for image prompts, so that two
edits of different fields merge and a removal wins over a late edit:

| Key            | Value                                                                      |
| -------------- | -------------------------------------------------------------------------- |
| `<id>/music`   | `{ title, style, lyrics, by, at }`, the shape of a scene's `MusicPrompt`   |
| `<id>/order`   | number: 1 + the largest order present, so new prompts append               |
| `<id>/chosen`  | file id of the chosen track, or absent                                     |
| `<id>/removed` | `true`: the tombstone; the reader skips the id, its other keys are deleted |

A prompt exists while it has a valid `music` value with a non-empty title
and no `removed`. Ids come from `randomId()`. `CAPS.musicPrompts` is 100,
counted on prompts not removed. The limits are the scene music's
(`LIMITS.trackTitle`, `LIMITS.style`, `LIMITS.lyrics`); the title is
required and one line.

New exports in `board.ts`:

- `MusicPromptEntry { id, title, style, lyrics, by, at, order, chosenTrack }`
  and `readMusicPrompts(doc)` (ordered by order then id, chosen read as null
  unless it names a track of this prompt).
- `addMusicPrompt(doc, { title, style, lyrics }, by, at)`,
  `updateMusicPrompt(doc, id, patch, by, at)` (any of the three fields; an
  empty title refused), `removeMusicPrompt(doc, id) → { tracks }`
  (tombstone, other keys deleted, tracks untouched so they read as the
  tray's), `chooseGeneralTrack(doc, id, fileId | null)`. Unknown id: throw
  `No music prompt <id>`.

Rejected: General music in the `board` map under a made-up scene id. Older
clients would treat it as a scene not in the appendix, and every reader of
`board` would have to tell the two apart.

### D3. A track belongs to a scene or to a General music prompt (architect's)

`FileEntry` gets `musicId: string | null`, always null for an image.
`NewFile` takes it. A track reads as:

- the scene's when `sceneId` is set (whatever `musicId` holds: an older
  client that assigns a track writes only `sceneId`, and its choice wins);
- else the General music prompt's when `musicId` is set;
- else the tray's.

Writers set one and delete the other. `assignTrack(doc, fileId, target)`
takes `{ sceneId } | { musicId } | null`; a track chosen in its old owner is
unchosen there (`unchoose` learns `musicPrompts`). `addFiles` checks that a
track names a scene or a music prompt, not both. `removeFile` unchooses in
either. `chooseTrack` (scene) refuses a track that is not the scene's, as
today.

Older clients show a General track in their tray (its `sceneId` is null)
and can assign it to a scene, which D3's reading honours.

### D4. Matching tracks against General music (architect's)

`MatchTargets` gets `music: { musicId, title }[]` (the General music
prompts) beside `scenes`. `matchTrack` compares the Suno title's
`matchKey` with every scene title and every General title together:

- one hit: `{ sceneId, matchedBy: 'title' }` or
  `{ musicId, matchedBy: 'title' }` (`MatchResult` gains the second shape);
- several: the tray, reason «Several music prompts have the track title
  "<title>".» (replacing «Several scenes have…»);
- none: «No track title "<title>".», as today.

`duplicateTitles` takes the scene rows and the General music prompts and
returns the shared titles; the board warns «Title used twice» on each scene
row and General music card holding one (today's scene warning, extended),
and `get_board` lists them. «Match again» uses the same targets.

### D5. Rows, statuses and the tray, derived (architect's)

- `MusicCardRow { prompt: MusicPromptEntry, tracks: FileEntry[], status }`
  with `generalMusic(prompts, files)`: tracks with that `musicId` (and no
  `sceneId`), oldest first; status Wanted (no track), Received, Chosen.
- `readDocumentBoard` returns `music: MusicCardRow[]` beside `rows`,
  `named` (which now has `general`) and the tray.
- `unmatchedFiles`: a track whose `musicId` names no live music prompt
  waits with «Its prompt was removed.»; a track with neither id, as today.
- The board's «Prompts come from Claude» card shows while no image prompt
  has text, no scene has a music title and no General music prompt exists.

### D6. Connector (architect's)

- `add_image_prompt`: `category` accepts `general` (a name is required, as
  for `pc`, `npc`, `handout`). The description lists five categories and
  the ratio rule for General: the image's own ratio, `--ar 16:9` for an
  establishing shot, `--ar 2:3` for a cover.
- `get_board` gains `general.music`: per General music prompt its id,
  title, style, lyrics, who wrote it and when, status, track count and
  chosen track; General image prompts come with the other named prompts,
  category `general`. `duplicateTitles` covers both.
- `add_music_prompt { projectId, title, style, lyrics }`: edit access, a
  write, no snapshot; marked as Claude's, dated now; answers the new id;
  refuses a campaign (`no_board`); a title another scene or General prompt
  uses is written with a warning naming it.
- `update_music_prompt { projectId, musicId, title?, style?, lyrics? }`:
  at least one field; an empty title refused (`invalid_input`); an unknown
  id answers `unknown_music`.
- `remove_music_prompt { projectId, musicId }`: removes the prompt, its
  tracks wait in Unmatched, no file deleted; answers how many tracks moved.
  It joins `remove_image_prompt` and `delete_template` as the tools that
  delete something.
- `TOOL_NAMES` grows by three (33). `INSTRUCTIONS`' board line becomes:
  «For a board’s prompts, read get_board first. Image prompts come in five
  categories: Scenes (any number per scene), General, PCs, NPCs and
  Handouts (a name and a prompt each); add them with add_image_prompt,
  change them with update_image_prompt. Music is one Suno prompt per scene,
  written with set_scene_prompts, plus any number of General music prompts
  for the whole adventure (a main theme, combat, ambience), written with
  add_music_prompt and update_music_prompt. generate_image makes images on
  a prompt and spends the user’s money; attach_atelier_image puts an image
  already in Atelier on a prompt.»
- The Suno rules of `set_scene_prompts`' description are shared with the
  two new tools: English, 4 to 7 style descriptors, lyrics of meta tags
  ending `[End]`, instrumental unless asked, a title unique in the project.
- `SINGULAR` (and the generation label in `images/start.ts`) get
  `general: 'General'`.

### D7. CueBard pack (architect's)

- `CUEBARD_FOLDERS` order: Scenes, General, PCs, NPCs, Handouts; a folder
  with no image is left out, as today. General images are named after the
  prompt's name, « (2)», « (3)»… for later images, with no link.
- After the scene groups, one group «General» when at least one General
  track is exported, else none. Its uuid key is `general`
  (`cuebardUuid(id, 'group', 'general')`, which no appendix scene id can
  take since scene ids match `S<n>`; the implementer checks this). It holds,
  per General music prompt in order, its chosen track or every track when
  none is chosen, each a looping cue like a scene's, named after the
  prompt's title with « (2)», « (3)»… for its second and later tracks.
- Warnings: `no-track` and `no-duration` carry either `sceneId` or
  `musicId`; the dialog writes «General music "<title>" has no track.» and
  «General "<title>": the length of "<file>" is unknown, so it is left
  out.». A General music prompt with no track does not add an empty group.
  The summary carries `general: boolean` (the General group is exported;
  `groups` stays the total), and a General warning is
  `{ kind: 'no-track' | 'no-duration', musicId, label }` (plus `fileId`,
  `fileName` for `no-duration`), `label` being the prompt's title.
- The summary's `groups` counts the scene groups plus the General group;
  the dialog's Cue groups line reads «6 scenes · General · 9 tracks», or
  «6 scenes · no General group · 7 tracks»; Visual folders lists General
  after Scenes. Lead: «A CueBard project: one cue group per scene, with its
  tracks, then one group General for the music of the whole adventure, and
  the images in five visual folders.» The note gains «General images are
  not linked to a track.»
- The desktop builds the same pack offline from the same code.

### D8. Markdown export (architect's)

`board.md` gets a part `# General` after Scenes: `## Images` with each
image prompt as `### <name>` (prompt, author and date, chosen file) and
`## Music` with each prompt as `### <title>` (style, lyrics, author and
date, chosen file); «None yet.» for an empty half. Files:
`files/general/images/<name>/` and `files/general/music/<title>/`, names
taken twice getting « (2)»… as elsewhere.

### D9. Web board (architect's, from the mockup)

- `summary.ts`: `tabs = ['scenes', 'general', 'pcs', 'npcs', 'handouts']`,
  `?tab=general`. The tab's number counts image and music prompts; its
  second line counts both («2 wanted»); its title attribute «3 images and 3
  music prompts: 2 chosen, 2 received, 2 wanted»; its dot shows for a new
  image or track.
- `GeneralView` (new): section «Images · Midjourney» with «N images · M
  chosen», the image cards (the `NamedGrid` card) and the add card «Add
  image»; section «Music · Suno» with «N music prompts · M chosen», one
  card per General music prompt and the add card «Add music prompt».
  Under them the hint «General images and music belong to the whole
  adventure, not to a scene. Their files find them by filename, like the
  others.»
- Music card (new, reusing `MusicHalf`'s prompt and track parts): header
  with the title (or «New music prompt» in italics while adding), status
  chip and Remove; Title with «The download's filename. Used to match
  tracks.», Style, Lyrics, each with Copy; the fixed line; author and age;
  Edit; the tracks with Play, Take n, duration, Choose / «✓ Chosen»; «No
  tracks yet. Drop Suno's downloads anywhere on the board.».
- Adding: «Add music prompt» opens a card with Title (placeholder «Tema di
  Sabaoth»), Style, Lyrics, the hint «Suno names the download after the
  title.», Cancel and Add. An empty title is refused with the toast «Write
  the title first: it is how its tracks find it.». Add toasts «Added
  General · <title>. Copy it into Suno.». «Add image» behaves like «Add
  NPC», toast «Added General · <name>. Copy it into Midjourney.».
- Removing a music prompt: confirm «Remove this music prompt?», «General ·
  <title> leaves the board.», «Its N tracks move to Unmatched, where you can
  assign them to a scene or another music prompt.» (or «It has no tracks
  yet.»), button Remove; toast «Music prompt removed. N tracks in
  Unmatched.» (or «Music prompt removed.»).
- Empty General tab: «Nothing general yet», «Images and music for the whole
  adventure, not tied to a scene: establishing shots, a cover, a main
  theme, ambience, combat music.», buttons «Add image» and «Add music
  prompt», hint «Claude can write them too: ask for "the general images and
  music of «<project title>»".».
- Summary on General: «3 images: 1 chosen, 1 received, 1 wanted · 3 music:
  1 chosen, 1 received, 1 wanted»; the filters count both and keep the
  cards in that state; «No general images are wanted.» / «No general music
  is wanted.» with «Show all» for an emptied section.
- Header lead: «Images and music for each scene and for the whole
  adventure, with PCs, NPCs and handouts. For the table and the CueBard
  export.». Status bar: «6 scenes · 24 image prompts · 3 general music».
- Claude card: «Claude reads the document and writes Midjourney prompts
  for the scenes, the PCs, the NPCs and the handouts, one Suno prompt per
  scene from its `mood:` line, and General images and music for the whole
  adventure. Ask in a chat on claude.ai:» and the request «Write the image
  and music prompts for the board of «<title>», with portraits of the PCs
  and NPCs, the handouts, and general images and music».
- Tray: a track's select «Assign to scene or music…» with groups «Scenes»
  and «General»; toast «Assigned to General · <title>.». An image's select
  and the viewer's «Move to another prompt…» get the group «General» after
  «Scenes». The track menu's «Move to another scene…» becomes «Move to
  another scene or music…» with the same groups; toast «Moved to General ·
  <title>.».
- Result line: General items as «General · Tra le macerie: 1 track» and
  «General · Copertina: 4 images», each linking to the General tab.
- Matching help: Midjourney «…in any category: Scenes, General, PCs, NPCs
  or Handouts.»; Suno «The filename is the track title from the prompt, of
  a scene or of a General music prompt. A second take gets "(1)".» with a
  second example when the project has a General music prompt («→ General ·
  <title>»); Two matches gains «A track title used twice, in scenes or
  General, warns on both and its tracks wait in Unmatched.».
- Narrow windows: the five tabs stay in one row and scroll sideways when
  they do not fit; General cards one per line.

### D10. Desktop (architect's)

Nothing of its own: the board, intake and the offline CueBard pack use
`packages/project`. The desktop e2e board steps keep passing.

### D11. Tests (plan)

- `packages/project`: `board.test.ts` (General image prompts like PCs;
  music prompts: add, update, remove with tombstone, cap, order; a track's
  owner by D3 including both ids set; assign and choose across scene and
  General; unchoose on move and remove; two Y.Docs editing and removing the
  same music prompt converge with the removal winning); `match.test.ts`
  (scene hit, General hit, a title in a scene and in General goes to the
  tray with the new reason); `cuebard.test.ts` (General group after the
  scenes, left out with no track, chosen first, names with « (2)», General
  folder after Scenes, no link, warnings); `export.test.ts` (`board.md`
  General part, folders).
- `packages/server`: `mcp-board.test.ts` (db) for the three tools, the
  `general` category, `get_board`'s `general.music`, the duplicate-title
  warning, `unknown_music`, read scope refused; the tools-list count in
  `mcp.test.ts`.
- `packages/web`: `summary.test.ts` (tab counts and filters on General),
  `intake.test.ts` (a track to a General prompt, the result line).
- `e2e/board.spec.ts`: add a General image and a music prompt by hand, drop
  an image and a track named after them, choose the track, remove the music
  prompt and find its track in Unmatched, assign it back from the tray.
  `e2e/connector.spec.ts`: `add_music_prompt` then the card shows without a
  reload. `e2e/media.ts`: names for a General image and track.

## Risks / Trade-offs

- **Older clients** hide General items (D1, D3). Accepted; no data is lost,
  because nothing an older client does deletes a General key or file.
- **A title shared by a scene and a General prompt** sends its tracks to the
  tray. The warning on both and the connector's warning make it visible.
- **The General cue group key** must not collide with a scene's uuid key;
  D7 asks for the check.

## Migration Plan

None: the new map and field start empty; existing boards read as today.
Rollback to v0.23 leaves General items hidden but kept.

## Open Questions

None.
