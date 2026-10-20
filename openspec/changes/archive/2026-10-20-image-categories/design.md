## Context

Issue #36: any number of image prompts, in four categories, on the Images and
music board built by the `asset-board` change (#26, `v0.6.0`). The agreed
mockup is [docs/mockups/board.html](../../../docs/mockups/board.html)
(artifact `https://claude.ai/artifact/2nvTeYyLRcuUYBfeKJVCJ6`), with fourteen
screens: Scenes, PCs, NPCs, Handouts, no prompts yet, no appendix, dropping,
after a drop, matching help, image viewer, edit a prompt, add an NPC, desktop
offline, phone width. Implementers cannot easily open it, so "Mockup in
words" below gives every screen with its exact strings.

### Owner decisions (2026-10-20, fixed)

- **O1** Any number of image prompts, in four categories, labelled exactly
  Scenes, PCs, NPCs, Handouts.
- **O2** Only Scene prompts are tied to a scene. PCs, NPCs and Handouts are
  project-wide lists; each item is a name and a Midjourney prompt.
- **O3** Music is unchanged: one Suno prompt per scene.
- **O4** Status (Wanted, Received, Chosen) and the choice are per image
  prompt; one chosen image per prompt.
- **O5** Intake by filename matches every image prompt in every category. A
  file matching none, or more than one, goes to the tray; for an ambiguous
  file the tray says «matches N prompts» and its assign menu lists those
  prompts first, then every prompt grouped by category.
- **O6** Removing a prompt sends its images to the tray (Unmatched); it never
  deletes files.
- **O7** Only the Scenes tab needs the appendix; the other tabs work without.
- **O8** Existing boards keep everything: today's single scene prompt and its
  chosen image become that scene's prompt 1.
- **O9** Phase 3 (`.cbpack`) will give each category its own CueBard visual
  folder. Out of scope here, but the model makes it easy: a category on each
  prompt, stable prompt ids, a name on non-scene prompts.
- **O10** Full release (`v0.7.0`) with an owner preview of the live local
  stack before the merge.

The architect's decisions D1 to D8 are expanded below; where they left a
choice to the plan it is marked **plan decision**, and where the plan changed
them it says so with the reason.

### The code today

- **Board model.** `packages/project/src/board.ts`: the `board` Y.Map with
  flat keys `<sceneId>/image`, `/music`, `/chosenImage`, `/chosenTrack`
  (`:13`, `KEY` `:79`); the `files` Y.Array of Y.Map (`:14`), `FileEntry`
  with `sceneId` for images and tracks alike (`:46-68`); `readBoard`
  (`:174-192`), `setImagePrompt` (`:198-207`), `addFiles` (`:246-287`),
  `assignFile` (`:305-317`), `removeFile` (`:321-328`), `chooseFile`
  (`:331-343`); `BoardRow` with one `image`, `images`, `chosenImage`,
  `imageStatus` (`:350-367`); `boardRows` (`:374-408`); `unmatchedFiles`
  with «Scene S6 is not in the appendix.» (`:434-441`); `readDocumentBoard`
  (`:452-459`, no rows for a campaign); `fileHashes` (`:155-165`) reads every
  `sha256` and `thumbSha256` whatever the item says. The shape comment is in
  `doc.ts:46-58`; `LIMITS` and `CAPS` in `model.ts:127` and `:144`
  (`imagePrompt` 2000, `name` 200, `files` 2000); `SCHEMA = 1`
  (`model.ts:5`).
- **Matching.** `packages/project/src/match.ts`: `MatchRow` (`:64-68`),
  `MatchResult` (`:70`), `matchImage` (`:78-89`: the words' key must start a
  prompt's key; one row matches; several answer «Several prompts start with
  "…".»; the fallback drops one, then two leading tokens while 12 key
  characters remain), `matchFile` (`:100-109`).
- **Export.** `packages/project/src/export.ts`: `fileSafe` (`:112-118`),
  `freeName` (`:121-128`), `fenced` (`:131-135`), `exportBoard` (`:149-192`:
  `board.md` per row with `### Image` and `### Music`, files at
  `files/<scene>/` and `files/unmatched/`), `exportProject` (`:198-225`). The
  server's `routes/transfer.ts:116-135` reads the live or stored document,
  then `exportProject` and `exportBoard(doc).files`.
- **Server load.** `packages/server/src/sync.ts:133-140` `onLoadDocument`
  applies the stored state. In `@hocuspocus/server` 4.7.1
  (`createDocument`), the document's update handler is registered after
  `onLoadDocument` and before `afterLoadDocument`: a change made in
  `onLoadDocument` is never stored, a change made in `afterLoadDocument` is
  stored like any edit, and clients sync only once both hooks ran.
- **Connector.** `packages/server/src/mcp/board.ts`: `get_board` and
  `set_scene_prompts` (`rowOut`, `NO_BOARD`, `unknown_scene` with the valid
  ids); `mcp/tools.ts`: `TOOL_NAMES` (`:44-64`), `INSTRUCTIONS` (`:68-73`),
  the `tool()` wrapper with the scope check and the write quota
  (`:132-165`), `docOf` (`:178-183`: the live document, else the stored
  one), `write` through `withLiveDocument` (`:187-196`),
  `registerBoardTools` (`:575`). Board writes store no snapshot (asset-board
  D8); only `replace_section` and `add_scene` do (`mcp/edits.ts:190-227`).
- **Desktop.** `packages/desktop/src/main/sync.ts`: `SyncEngine.add` loads a
  project's document from the store (`:179-198`), `transact` applies main's
  own change with `MAIN_ORIGIN` so it reaches the windows, the store and the
  server (`:365-370`), `open` hands a window the document's state
  (`:372-377`). The renderer runs the web client's board code.
- **Web.** `packages/web/src/board/`: `BoardView.tsx` (the head, Summary,
  Claude card, strips, Tray, rows; dropping only `hasRows`, `:51`),
  `useBoard.ts` (parse in the worker, `boardRows`, tray reasons from
  `matchFile`), `SceneRow.tsx`, `ImageHalf.tsx`, `MusicHalf.tsx`,
  `PromptEditor.tsx` (`aria-label` «Midjourney prompt for S2», `:52`),
  `Tray.tsx` («Assign to scene…» through `ActionSelect`), `Viewer.tsx`
  («Choose for this scene», «Move to another scene…», `:170-179`),
  `actions.ts` (move, assign, Match again, remove, choose), `intake.ts`
  (`addEntry` `:352-404`, `matchRows` `:417-427`), `summary.ts` (counts,
  filters, labels), `MatchHelp.tsx`, `ActionSelect.tsx` (flat options only).
- **Files elsewhere.** The server sweep (`files/sweep.ts`) and the desktop's
  files (`main/files.ts`, `main/sync.ts`) read only hashes (`fileHashes`,
  `readFiles(...).sha256`); they never look at `sceneId`.

### Corrections to the brief's facts

1. **The server instructions are in `mcp/tools.ts`** (`INSTRUCTIONS`,
   `:68-73`); `mcp/server.ts` only passes them to `McpServer`.
2. **The connector spec forbids deleting.** "No tool SHALL … delete
   anything" (connector, Requirement: Tools). `remove_image_prompt` is the
   first exception; the issue asks for it ("Claude can add, edit and remove
   image prompts in any category"), and the spec is changed to name it.
3. **No board write stores a snapshot.** "Same snapshot-before-write rules as
   existing write tools" means none: the board tools write through
   `withLiveDocument` with no snapshot (asset-board D8).
4. **Migrating in `onLoadDocument` would never be stored** (Hocuspocus
   4.7.1, above): the server migrates in `afterLoadDocument`.
5. **A Y.Map value per prompt under a deterministic key loses edits.** Two
   replicas that migrate one legacy board concurrently each create their own
   Y.Map under `legacy-S3`; Yjs keeps one, and every edit made inside the
   other (a new text, a choice) is lost. The same holds for any key that both
   the migration and a later edit write: concurrent writes to one key are
   resolved by client id, not by time. Asset-board's correction 6 met the
   same problem and chose flat keys. D1 and D2 change accordingly.

## Goals / Non-Goals

**Goals:**

- Any number of image prompts per scene, and project-wide lists of PCs, NPCs
  and handouts, each with its own files, status and chosen image.
- One drop of the Downloads batch still files every image under its prompt,
  whatever the category; files with no single match wait in the tray.
- Existing boards open unchanged in content; migration is safe on every
  replica at once, offline included.
- Claude adds, edits and removes image prompts in every category.
- Prompts carry what phase 3 needs: category, stable id, name.

**Non-Goals:**

- Music beyond one Suno prompt per scene (O3).
- A link from an NPC or a handout to a scene; the `.cbpack` export.
- Reordering prompts by hand (the order is stored; the UI appends).
- A view of scene prompts whose scene left the appendix (D4).
- Versions of the prompts (asset-board D8 stands).

## Decisions

### D1. Image prompts in the document (architect's, changed by the plan)

A new top-level Y.Map `imagePrompts` in the project's document, keyed by
prompt id. **Changed by the plan:** the architect asked for a Y.Map value
per prompt; the plan stores each prompt's fields under flat keys
`<promptId>/<part>` with plain JSON values set whole, as the `board` map
does. Reason: correction 5. With flat keys a migration and an edit never
write the same key (D2), and two edits of different fields of one prompt
merge. The architect's fields are all there:

```
imagePrompts  Y.Map, keys "<promptId>/<part>":
  "<id>/def"     { category: 'scene'|'pc'|'npc'|'handout', sceneId: string|null }
                 set once at creation, never edited; a prompt exists while it is valid
  "<id>/prompt"  { prompt, by, at }          the Midjourney prompt, its author and date
  "<id>/name"    string                       pc, npc and handout only
  "<id>/order"   number                       absent reads as 0
  "<id>/chosen"  file id | null               the chosen image, once a client chose
  "<id>/legacy"  { prompt, by, at, chosen }   written only by the migration (D2)
  "<id>/removed" true                         written only by removeImagePrompt; an id with it
                                              reads as no prompt; never cleared
files         Y.Array of Y.Map, as today, plus:
  promptId       string | null                images only; null = no prompt
```

- **Ids:** new prompts get `randomId()` (a UUID); a migrated prompt gets
  `legacy-<sceneId>` (D2). A prompt id never holds `/`.
- **`def`:** `sceneId` set for `scene` and null for the others; a `def` with
  an unknown category, or a scene prompt without a scene id, reads as no
  prompt. Keys of an id with no valid `def` (an edit that raced a removal)
  are left alone and never shown.
- **Order:** `order` orders the prompts of one scene, or of one category for
  the others; ties by id. A new prompt gets 1 + the largest order of its
  scene or category (absent = 0), so a migrated prompt 1 (no `order` key)
  stays first. Numbers in the UI ("prompt 2") are positions, derived.
- **Text and choice of a prompt, read:** the text, author and date are those
  of `prompt` or `legacy`, whichever has the later `at` (`prompt` on a tie
  or an invalid date); the choice is `chosen` when the key is present,
  else `legacy.chosen`; a chosen id that is not an image of that prompt reads
  as null. A writer that edits a prompt whose `legacy.at` is later than its
  own date writes `at = legacy.at` (ties read as `prompt`), so an edit always
  wins over a migrated text from a clock running ahead.
- **Files.** Images belong to a prompt, tracks to a scene. A file's prompt,
  read: its `promptId` when present; for an image whose `promptId` is null
  or absent and whose `sceneId` is set (as `v0.6.x` wrote it),
  `legacy-<sceneId>`. Readers report `sceneId` null for every image. Every
  writer that moves an image sets its `promptId` and sets its `sceneId` to
  null. Tracks keep `sceneId`, `promptId` null.
- **Music stays in `board`**: `<sceneId>/music` and `<sceneId>/chosenTrack`
  unchanged. `<sceneId>/image` and `<sceneId>/chosenImage` are legacy keys,
  read only by the migration.
- **Limits:** prompt text `LIMITS.imagePrompt` (2000), name `LIMITS.name`
  (200, one line, required for pc, npc and handout; the UI fills «New PC»,
  «New NPC», «New Handout» when left empty); `CAPS.imagePrompts` 500 per
  project (**plan decision**; readers keep the first 500 in order). Removed
  ids do not count toward the cap.
- `SCHEMA` stays 1: an older client leaves `imagePrompts` alone, and an
  older document reads it as empty until migrated.

Module `packages/project/src/board.ts`, each writer one transaction, checking
first and throwing (the callers check first):

```ts
export const imageCategories = ['scene', 'pc', 'npc', 'handout'] as const;
export type ImageCategory = (typeof imageCategories)[number];
export interface ImagePromptEntry {
  id: string; category: ImageCategory;
  sceneId: string | null;  name: string | null;
  prompt: string;          // '' for a migrated prompt that had images and no text
  by: Author; at: string;  // '' when unknown
  order: number; chosenFileId: string | null;
}
readImagePrompts(doc): ImagePromptEntry[]
addImagePrompt(doc, input: { category; sceneId?; name?; prompt }, by, at?): ImagePromptEntry
updateImagePrompt(doc, id, patch: { prompt?; name? }, by, at?): void   // name only for pc, npc, handout
removeImagePrompt(doc, id): { images: number }                        // O6: its images to the tray
setFirstScenePrompt(doc, sceneId, prompt, by, at?): ImagePromptEntry  // replaces setImagePrompt
chooseImage(doc, promptId, fileId | null): void
chooseTrack(doc, sceneId, fileId | null): void                        // chooseFile's audio half
assignImage(doc, fileId, promptId | null, matched = 'hand'): void      // unchooses it in its old prompt
assignTrack(doc, fileId, sceneId | null, matched = 'hand'): void       // assignFile's audio half
removeFile(doc, fileId): void                                          // unchooses it in its prompt or scene
addFiles(doc, files): …                                                // NewFile gains promptId (images)
```

`removeImagePrompt` writes `<id>/removed`, deletes the id's other keys
(including `def`, `legacy` and `chosen`) and writes nothing to files: images
that resolved to the id, by their `promptId` or, for v0.6 images, by their
`sceneId`, read as belonging to a removed prompt («Its prompt was removed.»,
the tray, D9), and the migration does not bring it back (D2). Files are never
removed (O6). **Amended in review of brief A:** a tombstone instead of
deleting `def`, because a concurrent migration on another replica re-created
a removed prompt (reviewer probe, client-id order (1,2)); a key written only
by removal keeps D1's rule that no key is written by both a migration and an
edit. `setFirstScenePrompt` writes the text of the scene's
first prompt (lowest order, then id), creating one with a random id when the
scene has none. `fileHashes` is unchanged. The shape comment in `doc.ts`
gains `imagePrompts` and `files.promptId`, and marks the two legacy keys.

Rejected: a Y.Map value per prompt (correction 5); a Y.Array of prompts (two
replicas migrating the same board would append two copies of each prompt);
the prompt's text in the `def` value (every edit would then rewrite the
category too).

### D2. Migration of existing boards (architect's, refined by the plan)

`packages/project/src/board-migration.ts`, pure, idempotent, one
transaction:

```ts
needsImageMigration(doc): boolean   // a legacy key, or an image naming a scene whose legacy prompt has no def
migrateImagePrompts(doc): boolean   // true when it changed something
migratedView(doc): Y.Doc            // doc itself when nothing to migrate, else a migrated in-memory copy
```

For each scene id `X` that has `X/image`, `X/chosenImage`, or an image file
with `sceneId` `X` and no `promptId`:

1. If `legacy-X/def` is missing and `legacy-X/removed` is absent, set def to
   `{ category: 'scene', sceneId: X }` (same value on every replica, so
   concurrent writes agree). No `order` key. For a removed `legacy-X`, steps
   2 and 3 are skipped; its legacy keys are cleared either way (step 4).
2. If `X/image` holds a valid `{ prompt, by, at }`: set `legacy-X/legacy` to
   it, unless the `legacy` already there has a later `at`.
3. If `X/chosenImage` is present: set `legacy-X/legacy.chosen` to its value
   (a file id or null) and delete `legacy-X/chosen` as this replica sees it,
   so the old client's later choice wins over an earlier one made here; a
   concurrent choice made on another replica survives the delete (Yjs
   deletes only the value this replica saw).
4. Delete `X/image` and `X/chosenImage`.

Image files are not written: they resolve to `legacy-X` by their `sceneId`
(D1). `X/music` and `X/chosenTrack` are not touched.

**Changed by the plan** from the architect's D2: the migrated text and
choice go to the `legacy` key instead of `prompt` and `chosen`, and files
keep their `sceneId` instead of getting `promptId` written. Reason
(correction 5): every key the migration writes is one no edit writes, so
two replicas can migrate at once, edit before they meet, and both keep every
edit. The architect's outcome is unchanged: one prompt `legacy-<sceneId>` per
scene, its files and its choice, legacy keys gone.

**A legacy prompt and `legacy-S3` both exist** (an older client wrote
`S3/image` after the migration): the migration runs again; the later `at`
of the old client's text and of the prompt's own text wins (D1's read rule);
the old client's images join `legacy-S3` by their `sceneId`, beside the
prompt's other images. A removed `legacy-S3` stays removed: the old client's
legacy keys are cleared, and its later images of S3 wait in the tray as
«Its prompt was removed.» (O6: never lost, never silently re-homed).
**Amended in review of brief A** (see `removeImagePrompt`, D1): before, step 1
brought a removed prompt back with its images.

**Where it runs** (any replica, any time, safe by construction):

- **Server:** `afterLoadDocument` in `sync.ts`, after `onLoadDocument`; the
  change is then stored like an edit, and clients only ever sync the
  migrated document.
- **Desktop:** `SyncEngine.open` runs it through `transact` (main's origin)
  before handing the state to the window, when the document is downloaded
  and needs it; offline included.
- **Web board** (browser and desktop renderer): `useBoard` runs it when it
  sees a legacy key or a scene-less legacy image (an older client wrote one
  during a live session).
- **Connector writes:** every board write tool runs it first, inside its
  transaction.
- **Readers of a document that may be stored unmigrated:** `get_board` and
  the export read `migratedView(doc)`, never writing (a read-scope grant
  stays read-only).

Rejected: migrating in `onLoadDocument` (correction 4); migrating only on
the server (an offline desktop would show an empty board); readers that
understand legacy keys forever (every reader would carry the old shape).

### D3. Matching across categories (architect's)

`packages/project/src/match.ts`:

```ts
interface MatchPrompt { id: string; prompt: string }
interface MatchScene { sceneId: string; title: string | null }
type MatchResult =
  | { promptId: string; matchedBy: 'prompt' }
  | { sceneId: string; matchedBy: 'title' }
  | { reason: string; candidates: string[] };   // ≥ 2 prompt ids when several match, else []
matchFile(name, kind, targets: { prompts: MatchPrompt[]; scenes: MatchScene[] }): MatchResult
matchTargets(board): { prompts; scenes }   // the shown prompts with text (D4), the appendix's scenes
```

- **Candidates:** every image prompt with non-empty text, in every category,
  except scene prompts whose scene has no appendix row (D4).
- **Rule:** today's (`matchKey`, prefix, the fallback that drops one then two
  leading tokens while 12 key characters remain). Exactly one prompt: that
  prompt, matched by `prompt`. None: `No prompt starts with "<first five
words>".`. Two or more at the first step that finds any: `Several prompts
start with "<first five words>".` with their ids as `candidates`.
- **Tracks:** unchanged, against the scenes' music titles.
- **Candidates are derived, not stored** (**plan decision** for the
  architect's choice): the tray runs `matchFile` on each image with no prompt
  as it renders, as `useBoard` already does for the reason. Why: no schema,
  never stale when a prompt is written, edited or removed after the drop, and
  the same function gives intake, the tray and Match again their answer;
  cost is one prefix test per file and prompt, memoised per document change.
- **Match again** reruns over the tray's files (D9) and assigns each one that
  matches exactly one prompt or scene, in one transaction.

### D4. Scene prompts whose scene left the appendix (architect's, decided by the plan)

Kept, never deleted, and not shown: the same rule today's music prompt of
such a scene follows. They are not candidates for matching, not counted in
the tabs, and not offered in the assign and move menus; their images wait in
the tray with «Scene S6 is not in the appendix.» (today's reason). When the
row comes back, the prompts and their images come back. `get_board` lists
them under `outsideAppendix` so Claude can see and remove them.

Rejected: a final group "No longer in the appendix" on the Scenes tab (a
second layout for a rare case, and the music prompt of such a scene is
hidden today).

### D5. Connector (architect's)

In `mcp/board.ts`; `TOOL_NAMES` gains `add_image_prompt`,
`update_image_prompt`, `remove_image_prompt` (22 tools). Same rules as the
board's writes today: `read_write` scope, the write quota, `withLiveDocument`,
no snapshot, problems in the document never refuse a write, `no_board` (400)
for a campaign, every write marked `by: 'claude'` and dated now. Each write
runs `migrateImagePrompts` first, in its transaction.

| Tool                  | Annotations                                    | Input                                                                                                             | Output                                        |
| --------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `get_board`           | read-only, idempotent                          | `projectId`                                                                                                       | below                                         |
| `add_image_prompt`    | not read-only, not idempotent, not destructive | `projectId`, `category` (`scene`, `pc`, `npc`, `handout`), `sceneId` (scene only), `name` (others only), `prompt` | `{ prompt: <item>, warnings }`                |
| `update_image_prompt` | not read-only, idempotent, not destructive     | `projectId`, `id`, `prompt?`, `name?` (one at least; `name` only for pc, npc, handout)                            | `{ prompt: <item>, warnings }`                |
| `remove_image_prompt` | not read-only, idempotent, destructive         | `projectId`, `id`                                                                                                 | `{ removed: id, imagesToUnmatched: n }`       |
| `set_scene_prompts`   | unchanged                                      | unchanged                                                                                                         | the scene as `get_board` gives it, `warnings` |

- **`get_board`:** `{ appendix, scenes: [{ sceneId, title, visual, mood,
images: [<item>], music: { … as today } }], pcs: [<item>], npcs: [<item>],
handouts: [<item>], outsideAppendix: [<item>], unmatched: n,
duplicateTitles }`, where `<item>` is `{ id, category, sceneId | name,
number, prompt, by, at, status, files, chosen }` (`prompt`, `by`, `at` null
  when the text is empty; `chosen` the chosen file's name or null; `number`
  its position in its scene or category). `rows` and each row's `image` are
  gone: the output is read by a model through the description, and keeping a
  second, partial view of the scene's prompts would mislead it.
- **`set_scene_prompts`:** the image argument writes the scene's first prompt
  (`setFirstScenePrompt`, creating it when the scene has none); the music
  arguments are unchanged; output as `get_board`'s scene.
- **Errors:** `unknown_scene` (404, with the valid ids) for a scene prompt
  on a scene with no appendix row; `unknown_prompt` (404, "No image prompt
  with that id. get_board lists them.") for an id that names no prompt,
  including a second remove; `invalid_input` for a missing `sceneId` or
  `name`, a `name` on a scene prompt, an update with neither field, and the
  cap (500 prompts).
- **Warnings:** an added or updated prompt whose first six words (as
  `matchKey`) are another shown prompt's first six words gets «<label> starts
  with the same words, so Midjourney's downloads may match both. Start each
  prompt differently.» (**plan decision**: six words, as the mockup's names
  carry; it is the case that floods the tray).
- **Descriptions** carry the `midjourney-prompts` rules per category:
  scenes `--ar 16:9`, PCs and NPCs portraits `--ar 2:3`, handouts the prop's
  own ratio (a letter `--ar 3:4`, a map `--ar 4:3`), all `--v 8.1`; English;
  subject first; no quality tokens; one idea per prompt; "start each image
  prompt with words no other prompt starts with: the downloads find their
  prompt by their first words". `add_image_prompt`: "Add an image prompt.
  Scenes: any number per scene of the appendix, each a different shot.
  PCs, NPCs, Handouts: project-wide, a name and a prompt." `remove_image_prompt`:
  "Remove an image prompt. Its images move to Unmatched; no file is
  deleted." `get_board`'s description names the four categories.
- **`INSTRUCTIONS`** (`tools.ts:68-73`), its last line becomes: «For a
  board's prompts, read get_board first. Image prompts come in four
  categories: Scenes (any number per scene), PCs, NPCs and Handouts (a name
  and a prompt each); add them with add_image_prompt, change them with
  update_image_prompt. Music is one Suno prompt per scene, written with
  set_scene_prompts.»

Rejected: dropping `set_scene_prompts`'s image argument (Claude chats started
before the release still call it); a `category` argument on
`set_scene_prompts` (two tools for one job).

### D6. Markdown folder export (architect's)

`exportBoard` (on `migratedView(doc)`, D2) writes `board.md`:

```
# Scenes

## S1 · La casa che cede

### Image prompt 1
<fenced prompt>
by Claude · <at>
Chosen: <file name>

### Image prompt 2 …        ("No image prompts yet." when none; "No prompt yet." for an empty text)

### Music                    (as today)

# PCs

## Rosalia Ferrante
<fenced prompt>
by Claude · <at>
Chosen: <file name>

# NPCs …
# Handouts …                 ("None yet." for an empty category)
```

Files: a scene prompt's images at `files/scenes/<sceneId>/<n>/<name>` (`n`
its number), a scene's tracks at `files/scenes/<sceneId>/music/<name>`, a
PC's at `files/pcs/<folder>/<name>`, an NPC's at `files/npcs/<folder>/`, a
handout's at `files/handouts/<folder>/`, the tray's (hidden prompts' images
included) at `files/unmatched/<name>`. `<folder>` is the name through
today's `fileSafe`, «Untitled» when empty, made unique within its category
with « (2)», « (3)»… (case-insensitive), as `freeName` does for files
(**plan decision** for the architect's "slug": a readable folder, as the
project folders are titles, and the same rules the export already trusts).
Files deduplicate within each folder as today. A campaign's `board.md`
stays empty. `routes/transfer.ts:116-135` reads `migratedView(doc)` for
both calls.

### D7. Web board (architect's)

Per "Mockup in words", strings exact except the departures listed.

- **Tabs:** `BoardView` gains the category switch above the summary; the
  active tab is in the address as `?tab=pcs`, `?tab=npcs`, `?tab=handouts`
  (Scenes without; **plan decision**: reload and Back keep it, the result
  line's links set it). The filter stays when the tab changes.
- **Components:** `SceneRow` keeps the row; `ImageHalf` becomes the stack of
  `ImagePrompt` blocks (new `ImagePrompt.tsx`: header, prompt box or editor,
  thumbnails); new `CategoryTabs.tsx`, `NamedGrid.tsx` (cards, the add card,
  the empty state); `PromptEditor.tsx` gains the named editor (Name and
  Prompt) and the Add mode; `Tray.tsx`, `Viewer.tsx`, `MatchHelp.tsx`,
  `ClaudeCard.tsx`, `DropOverlay.tsx`, `summary.ts`, `actions.ts`,
  `intake.ts`, `useBoard.ts` follow the model. `ActionSelect` gains option
  groups (`{ label, options }[]`), keeping its keyboard rule.
- **Labels** (one helper in `summary.ts`): a scene prompt «S1 · prompt 2»,
  long «S1 · La casa che cede · prompt 2», in a menu «S1 #2 · <first five
  words>…»; a named prompt «NPC · Padre Anselmo» (singular category), in a
  menu its name, in the first group «NPCs · Za' Nina» (tab name).
- **New and edit:** one new prompt at a time (Add elsewhere drops an unsaved
  new one); an Add writes nothing until «Add». The existing editors stay
  open alongside, as today.
- **Thumbnails** take the image's own shape (`width` / `height`, 16:9 when
  unknown); portrait images keep four per line on a phone. The viewer shows
  the image in its shape.
- **Drop and the header** («How matching works», «Add files…») are there
  whenever the board has loaded, appendix or not (O7: images can match PCs,
  NPCs and Handouts). A track dropped with no appendix waits in the tray.
- **Intake:** `matchTargets` from the document at the moment of each file
  (as today); the result counts images per scene (all its prompts) and per
  named prompt.

### D8. Desktop (architect's)

No new storage, no new IPC: the desktop shares the model and the web board.
Adding, editing, removing and choosing prompts offline are ordinary document
edits, kept in the store and synced. `SyncEngine.open` migrates (D2). The
file store, the upload queue and the local sweep read hashes only and are
not touched.

### D9. Rows, statuses and the tray, derived (plan)

In `board.ts`, never stored:

```ts
interface PromptRow { prompt: ImagePromptEntry; number: number; images: FileEntry[]; chosen: string | null; status: HalfStatus }
interface BoardRow { sceneId; title; visual; mood; prompts: PromptRow[]; music; tracks; chosenTrack; musicStatus; duplicateTitle }
boardRows(appendix, board, prompts, files): BoardRow[]
namedPrompts(prompts, files): Record<'pc' | 'npc' | 'handout', PromptRow[]>
unmatchedFiles(appendix, prompts, files): UnmatchedFile[]
readDocumentBoard(doc): { rows; named; outsideAppendix: PromptRow[]; unmatched }
```

Status per prompt: wanted (no images), received (images, none chosen),
chosen. Music status per scene as today. The tray holds, oldest first:
tracks with no scene or a scene not in the appendix (today's reasons);
images with no prompt (reason from `matchFile`, with `candidates`); images
whose prompt is gone («Its prompt was removed.»); images of a prompt whose
scene is not in the appendix («Scene S6 is not in the appendix.»).

### D10. Tests (plan)

- **`packages/project`** (`board.test.ts`, new `board-migration.test.ts`,
  `match.test.ts`, `export.test.ts`): readers on hostile values (bad `def`,
  orphan keys, a chosen id of another prompt, an image with both `promptId`
  and `sceneId`); every writer (one transaction, limits, cap, order append,
  name only on named prompts, removal leaving files with the removed id and
  unchoosing); `setFirstScenePrompt` creating then updating; migration: a
  v0.6 board (two scenes with prompts, one chosen image, images with
  `sceneId`, a scene with images and no prompt, music keys) becomes prompts 1
  with their files and choice, legacy keys gone, music untouched; running it
  twice changes nothing; an older client's later `S3/image` and
  `S3/chosenImage` win over earlier ones and the old client's new images join
  `legacy-S3`; **two Y.Docs** from the same legacy state that each migrate,
  then one edits the text, chooses an image and moves another while the
  other adds a prompt, exchanged both ways: one `legacy-` prompt per scene,
  every edit kept, the same reading on both, for both client-id orders;
  `migratedView` leaves the document untouched. Matching: one category each,
  across categories, two prompts sharing first words (candidates), a hidden
  scene prompt not matched, empty prompts skipped, fallback tokens. Export:
  `board.md` with every category and «None yet.», the folders, two NPCs with
  one name, a hidden prompt's images in `unmatched/`, a legacy document
  exported from a migrated view.
- **Server db:** `mcp-board.test.ts`: the three tools (scope, quota, no
  snapshot, `unknown_prompt`, `unknown_scene`, `no_board`, `invalid_input`
  cases, limits, the shared-words warning, a removal's images in
  `unmatched`, a live Hocuspocus client receiving each change);
  `get_board` on a stored legacy document (migrated view, nothing written);
  `set_scene_prompts` on a scene with no prompt and with two. `sync.test.ts`:
  a stored legacy document opened by a client arrives migrated and is stored
  migrated after the debounce. `export-files.test.ts`: the new paths. The
  tools-list test counts 22.
- **Desktop unit** (`sync.test.ts`): `open` migrates a stored legacy
  document and the update reaches the store; a document needing nothing
  writes nothing.
- **Web unit:** labels, summary and filter counts per tab, tab sub-lines,
  intake results per prompt, Match again across categories, the tray's
  reasons and grouped options with candidates first.
- **E2E browser** (`e2e/board.spec.ts`): Claude adds a second S1 prompt, two
  NPCs, a PC and a handout through MCP and one shares its first words with
  a scene prompt; the tabs' counts; generated PNGs named for each prompt
  plus one ambiguous name, dropped at once: the result line, the tab dots,
  the ambiguous file «matches 2 prompts» and assigned from its first group;
  add an NPC by hand (empty Add toast, then Add); choose per prompt; the
  viewer's Move to another prompt across categories; remove a prompt with
  images (confirm, toast, images in the tray with «Its prompt was removed.»);
  no appendix: PCs work, Scenes shows the empty state; export folders.
  Normal and `E2E_CPU_THROTTLE=3`.
- **E2E desktop:** the existing offline steps updated to the new labels
  («Midjourney prompt for S1 · prompt 1»), plus an NPC added offline that
  reaches the web.

### D11. Briefs and release (plan)

Two briefs, as the architect proposed. **A:** model, migration, matching,
connector, export, the server and desktop hooks (D1 to D6, D8, D9 and their
tests). **B:** web board, e2e, docs, owner preview (D7, D10's web and e2e).
Release `v0.7.0` after the owner's go (O10).

The model's first commit changes types the server and the web use
(`BoardRow`, `FileEntry`, `chooseFile`, `setImagePrompt`). So that every
commit stays green, brief A adapts those callers mechanically in the same
group: the connector and the export keep their output until their own
commit, and the web board shows each scene's first prompt as it shows the
one prompt today, until brief B.

### Accepted in review of brief A (architect)

Departures from the plan, each accepted with its reason:

1. `set_scene_prompts` answers `{ scene, warnings }`: `scene` has the shape
   of an item of `get_board`'s `scenes`.
2. The shared-first-words warning fires when one prompt's six-word key equals
   or is a prefix of another's: Midjourney cuts names mid-word, so a short
   prompt's downloads match both.
3. `addImagePrompt` accepts empty text in the model, as migrated prompts have;
   the connector and the UI refuse it.
4. `addFiles` refuses an image with a `sceneId` and a track with a `promptId`,
   enforcing D1 at write time.
5. `exportBoard` calls `migratedView` itself; `transfer.ts` takes the view
   once for both calls.
6. `board.md` stays empty for a project with no rows and no named prompts;
   otherwise all four parts are written, with «None yet.» for an empty one.
7. The server's `afterLoadDocument` migration, the desktop's `open()` and
   `migratedView` catch and log a failure and leave the document as stored,
   rather than closing the project.
8. `get_board` items carry `at: null` for an empty stored date; update and
   remove work on `outsideAppendix` prompts; a removed id answers
   `unknown_prompt`; a named prompt with an empty stored name exports as
   «Untitled».
9. Two requirements' first lines now carry SHALL, so strict validation
   passes; the meaning is unchanged.

## What is not touched

- **Music:** keys, rows, matching by title, the track menu.
- **File store:** routes, limits, quota, `BlobStore`, the PVC and the chart,
  `compose.yaml`; no database migration.
- **Sweeps:** the server's `sweepFiles` and the desktop's local sweep read
  `fileHashes` and `readFiles(...).sha256` only; "linked hashes" do not need
  `promptId`, and a file whose prompt is removed is still listed, so kept.
- **PDF, snapshots, History**, the desktop store and its IPC.

## Departures from the mockup

1. The edit hint reads «Claude can rewrite it later.» and Save toasts
   «Saved.» (the mockup adds «History keeps the old text.» and «The old text
   is in History.»), as asset-board D8: prompts are not versioned.
2. The music Save toast likewise reads «Saved.».

## Strings not in the mockup

To check at the owner preview: Match again's «1 file found its prompt.» and
«3 files found their prompt.» (zero is the mockup's «Matched again: no file
found a single prompt.»); the tray reason «Scene S6 is not in the appendix.»
(today's); the scene of a migrated prompt with images and no text showing
«No Midjourney prompt yet. Ask Claude, or write one.» with «Write by hand»
inside its block; three or more candidates joined «A, B and C. Pick one.»;
the connector's warnings and errors (D5); `board.md`'s «Image prompt n»,
«No image prompts yet.», «None yet.».

## Mockup in words

The board sits in the project shell. Status bar: left «Images and music»
and «6 scenes · 21 image prompts» (or «No appendix · 13 image prompts»,
counting the prompts shown); right the sync text.

**Head.** «Images and music»; lead «Image prompts for scenes, PCs, NPCs and
handouts; music for each scene. For the table and the CueBard export.»;
«How matching works» and «Add files…» on the right.

**Tabs** (`role=tablist`, label «Image categories»), four equal buttons:
«Scenes», «PCs», «NPCs», «Handouts», each with its number of image prompts
in small mono beside the name, a blue dot (title «New files») while one of
its prompts (or, for Scenes, a track) holds a file marked new, and a second
line: «none yet», else «N wanted» while any is wanted, else «N received»,
else «all chosen». Title «N image prompts: c chosen, r received, w wanted»
(«1 image prompt»). The active tab is tinted and underlined.

**Summary and filters.** Scenes: «**6** scenes · 8 image prompts: **3**
chosen, **4** received, **1** wanted · music **2** chosen, **3** received,
**1** wanted». Other tabs: «**4** PCs · **1** chosen, **1** received, **2**
wanted» («NPCs», «Handouts»). Filters «All n», «Wanted n», «Received n»,
«Chosen n»: on Scenes the rows with at least one image prompt or the music in
that state; elsewhere the cards in it.

**1 Scenes.** One card per appendix row: «S1» chip, title, «Open the scene
in the document». Halves:

- **Images · Midjourney** (note the plural) with, on the right, «3 prompts ·
  1 chosen» («1 prompt · 0 chosen», «No prompts»). «visual: <text>» with
  «Edit in the document». A stack of bordered blocks, one per prompt: a small
  upper-case «Prompt 1», its status chip, and a trash button (title «Remove
  this prompt», label «Remove S1 · prompt 1»); the prompt box (text in mono,
  «by Claude · 5 min ago» or «edited by you · yesterday», «Copy», «Edit»);
  then four thumbnails per line, each with the round badge («Choose this
  image», or ✓ «Chosen. Click to unchoose»), its number, the chosen one
  outlined and the prompt's others dimmed (label «Open image 2 of S1 ·
  prompt 1»), or «No images yet. Drop Midjourney's four files anywhere on the
  board.». Under the stack a dashed full-width «Add image prompt». A scene
  with none: «No image prompts yet. Ask Claude, or write one.» with «Add
  image prompt». With a filter, blocks not in its state dim; a half with
  none in it dims whole.
- **Music · Suno:** unchanged.

Under the rows «Rows follow the appendix. Add or rename a scene there and the
board follows.».

**1b–1d PCs, NPCs, Handouts.** Cards in a grid (as many 360 px columns as
fit): a header with the name in the serif face, the status chip and the
trash button; the prompt box and the thumbnails as above. A last dashed card
«Add PC», «Add NPC» or «Add handout». With a filter that keeps none: «No
NPCs are wanted. Show all». Under the grid «NPCs belong to the whole
adventure, not to a scene.» (PCs, Handouts). With no items, in place of the
summary, grid and hint: the category icon, «No PCs yet» («No NPCs yet», «No
handouts yet»), the text «Portraits of the player characters, one prompt
each: a name, then a Midjourney prompt.» (NPCs: «Portraits of the people the
PCs meet, one prompt each: a name, then a Midjourney prompt.»; Handouts:
«Props you hand to the players, like letters, maps and posters. One prompt
each: a name, then a Midjourney prompt.»), the primary «Add PC» and the hint
«Claude can write them too, from the document: ask for "the PCs of
«L'Ancora di Sabaoth»".» («the NPCs of», «the Handouts of»).

**2 No prompts yet** (no image prompt in any category and no music title),
above the tab's content on every tab: Claude's card «Prompts come from
Claude», «Claude reads the document and writes Midjourney prompts for the
scenes, the PCs, the NPCs and the handouts, and one Suno prompt per scene
from its `mood:` line. Ask in a chat on claude.ai:», the request «Write the
image and music prompts for the board of «L'Ancora di Sabaoth», with
portraits of the PCs and NPCs and the handouts» with «Copy», and the hint
«Claude needs the Promptbook connector, with read and edit access.» with
«Settings → Connected apps».

**3 No appendix.** The tabs stay; the Scenes tab shows today's card («No
scenes for the board yet», the example, «Add the appendix», «Open the
document», the hint), without summary or hint line; PCs, NPCs and Handouts
work as usual. The header buttons and dropping stay (D7).

**4 Dropping.** «Drop images and tracks», «They find their prompt by
filename, in any category.», the hint «Files that match no prompt, or more
than one, wait in Unmatched.», the count «18 files · 14 images, 4 tracks».

**5 After a drop.** The green line «**18 files added: 15 matched, 3 to
assign.** S3: 4 images, 2 tracks · S5: 4 images, 1 track · NPCs · Padre
Anselmo: 4 images. New files are marked.» with ✕; each scene id and each
«NPCs · Padre Anselmo» is a link to its tab (a scene link also scrolls to
its row). The amber, pinned tray: «Unmatched», «3 files», «Their names match
no prompt or track title, or more than one prompt.», «Match again» (title
«Match the files again against the prompts and titles as they are now»),
«How matching works». Each file: thumbnail or music icon, name, then «Image ·
<reason>» or «Track · 2:31 · <reason>»; an ambiguous image shows the amber
pill «matches 2 prompts» then «S4 · prompt 2 and NPC · Za' Nina. Pick one.».
An image's select «Assign to prompt…» (label «Assign <name> to a prompt»):
for an ambiguous file a first group «Its name matches» with «Scenes · S4 #2
· portrait of an old Sicilian…» and «NPCs · Za' Nina», then groups
«Scenes» («S1 #1 · collapsed 1900s Sicilian library at…»), «PCs», «NPCs»,
«Handouts» (names). A track's select «Assign to scene…» as today. Assigning
toasts «Assigned to <tab> · <menu label>.» («Assigned to NPCs · Za'
Nina.»); Remove toasts «Removed <name>.».

**5b Matching help.** «How files find their prompt» ✕. «Midjourney»: «The
filename holds the first words of the prompt. They pick the prompt, in any
category: Scenes, PCs, NPCs or Handouts.», a scene example «→ Scenes · S1 ·
prompt 1» and a named one «→ NPCs · Padre Anselmo» (from the project's first
scene prompt with text and first named prompt; left out without). «Suno»
unchanged. «Two matches»: «When two prompts start with the same words, their
files match both. They wait in Unmatched, marked "matches 2 prompts": pick
the prompt there. Start each prompt differently to avoid it.». «Other
files» unchanged.

**6 Image viewer.** Side header «S3 · L'ordine di Donato» or «NPCs · Dottor
Salvi»; the details gain «Prompt» («S3 · L'ordine di Donato · prompt 1»,
«NPC · Dottor Salvi») in place of Scene; Status «Chosen for this prompt»,
«Another image is chosen», «None chosen yet»; the strip is the prompt's
images; «Choose for this prompt» or «✓ Chosen · click to unchoose»; the
select «Move to another prompt…» (label «Move to another prompt»), grouped
Scenes, PCs, NPCs, Handouts, the current prompt left out; «Remove».
Choosing toasts «Chosen for S3 · prompt 1.»; moving closes and toasts
«Moved to NPC · Turi.»; Remove asks «Remove this image?», «Image 2 leaves S3
· L'ordine di Donato · prompt 1.», «The file in your Downloads folder is not
touched.», then «Image removed.».

**7 Edit a prompt.** The block's box becomes a text area (label «Midjourney
prompt for S2 · prompt 1», **plan decision** extending today's label;
named: «Midjourney prompt for NPC · Turi»), hint «Claude can rewrite it
later.», «Cancel», «Save». Named prompts show «Name» (input, placeholder
«Rosalia Ferrante», «Padre Anselmo» or «Lettera di Salvi») and «Prompt»
(text area, placeholder «portrait of …»). An empty prompt on Save or Add
toasts «Write the prompt first: its first words are how its images find
it.» and keeps the editor; an empty name becomes «New PC», «New NPC» or «New
Handout». Save toasts «Saved.».

**7b Add an NPC.** «Add NPC» opens a card in the grid's place of the add
card: header «New NPC» in faint italics, Name focused, Prompt, the hint «Its
first words are how its images find it.», «Cancel», «Add». A scene's «Add
image prompt» opens a block «New prompt» with the text area (placeholder «A
Midjourney prompt for S1…»), same hint and buttons. Add toasts «Added NPC ·
Padre Anselmo. Copy it into Midjourney.» («Added S1 · prompt 3. …»).

**Remove a prompt.** The trash asks «Remove this image prompt?», «<long
label> leaves the board.» («S1 · La casa che cede · prompt 1 leaves the
board.», «NPC · Turi leaves the board.»), then «Its 4 images move to
Unmatched, where you can assign them to another prompt.» («Its 1 image moves
to Unmatched, where you can assign it to another prompt.», «It has no images
yet.»), «Cancel», «Remove»; toast «Prompt removed. 4 images in Unmatched.»
(«1 image», or «Prompt removed.»).

**8 Desktop, offline.** As today: «On this device only», the blue line «**4
files on this computer, uploaded when you are back online.** Choosing and
editing prompts work offline; they sync too.», «on this device» badges,
«Offline · 4 files waiting to upload».

**9 Phone width.** As today, and: the four tabs stay in one row with less
padding and a smaller label; cards one per column; portrait thumbnails four
per line.

## Risks / Trade-offs

Report it, do not work around it:

- **Concurrent migration.** The design rests on "the migration writes no key
  an edit writes". If a test shows an edit lost after two replicas migrate
  (for one client-id order), report it before changing the shape.
- **Hocuspocus storing the migration.** Verified in 4.7.1's `createDocument`
  (update handler between the two hooks). If an upgrade moves it, or a db
  test finds the stored state still legacy after the debounce, report it.
- **Older desktop clients** (`v0.6.x`; Mac and deb do not update
  themselves). They show migrated images in their scene with no prompt, and
  newer images in their tray; a prompt they write by hand is folded into
  prompt 1 by the next migration; a move they make of an image that a newer
  client already moved is ignored. Nothing is lost on the newer side. If a
  test finds an older client's write breaking a newer reader, report it.
- **Connector clients calling `set_scene_prompts`** keep working on prompt 1;
  chats that parse `get_board`'s old `rows[].image` see the new shape
  instead. Accepted: the reader is a model that reads the description.
- **Ambiguous matches flooding the tray.** Portraits that all start
  «portrait of a…» will collide. The tool descriptions ask for different
  first words and the tools warn (D5); the tray lists the candidates first.
  If the preview shows real Midjourney names collide anyway, report it with
  the names.
- **Two replicas migrating different legacy states** (an older client's
  newer `S3/image` or `S3/chosenImage` on one side, the earlier one on the
  other) both write `legacy-S3/legacy`; Yjs keeps one by client id, so the
  older client's newer text or choice can be lost. Accepted: it needs an
  older client writing while two newer replicas migrate apart (known limit,
  review of brief A).
- **The server's migration counts as an edit:** it is stored like one, and
  `storeProjectDoc` sets `edited_at = now()`, so the first load of each v0.6
  project after the upgrade moves it up the projects list once. Accepted, in
  the release notes (known limit, review of brief A).
- **Prompts are not versioned** (asset-board D8): a removed prompt's text is
  gone; its images stay in the tray.

## Migration Plan

No database migration; `SCHEMA` stays 1. The first load of each document by
the `v0.7.0` server migrates it and stores it; desktops migrate what they
open. Rolling back to `v0.6.0` shows the migrated boards' images in their
scenes with no image prompt (the texts are in `imagePrompts`, which `v0.6.0`
does not read) and newer images in the tray; nothing is deleted, and
`v0.7.0` again reads everything. Release `v0.7.0` after the owner's preview.

## Open Questions

None for the code. For the architect: the change of D1 (flat keys) and D2
(the `legacy` key, files untouched) above; the strings in "Strings not in
the mockup".
