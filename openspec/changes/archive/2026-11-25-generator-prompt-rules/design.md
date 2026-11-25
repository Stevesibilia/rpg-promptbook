# Design: generator-prompt-rules

## Context

Change 1 of #57 (`board-image-generation`, v0.19.0) added Generate on every
image prompt; `atelier-image-provider` (v0.20.0) added Atelier as a second
provider; `connector-board-images` (v0.21.0) added `generate_image`;
`reference-images` (v0.25.0) added references. The prompts themselves are
still written for Midjourney:

- `packages/server/src/mcp/board.ts:236` `IMAGE_RULES`: «Midjourney prompts
  in English…», `--ar … --v 8.1` per category, first words unique. Used in
  the `add_image_prompt` (`:356`) and `update_image_prompt` (`:399`)
  descriptions; `set_scene_prompts` (`:317`) has its own inline copy.
- `sharedWords` (`:173-188`) warns when two prompts start with the same six
  words, «so Midjourney’s downloads may match both». Called at `:345`,
  `:391`, `:419`.
- `packages/server/src/mcp/tools.ts:93` `INSTRUCTIONS`, static.
- The MCP server is built per HTTP request with the caller known
  (`server.ts:50-58`), but descriptions are plain strings and clients cache
  the tool list, so a description cannot follow a setting that changes.
- The server knows whether an account can generate only inside
  `startImageGeneration` (`start.ts:180-194`): `serverKeyOf(config)` (no
  `secretsKey` → `not_configured`), Atelier chosen without `atelierUrl` →
  `atelier_unavailable`, then `readSecret(db, sealing, userId, provider)`
  not `ok` → `no_key`.
- The web gets the same facts from `GET /api/image-generation`
  (`ImageGenerationStatus`, `routes.ts:52-68`) through
  `useGenerationStatus(user, offline)` (`useGeneration.ts:76-94`), wired into
  the board context at `BoardView.tsx:101-103, 220-235`.
  `missingCredential(status)` (`GeneratePanel.tsx:170-176`) says why the
  chosen provider cannot generate. On the desktop offline the status stays
  `loading`.
- `sentPrompt` (`packages/project/src/images.ts`) sends the text before the
  first flag, turns `--no` into a sentence and reads `--ar` for the shape;
  `defaultShape` maps any ratio to the nearest of 16:9, 3:2, 1:1, 2:3.

## Owner decisions (2026-11-25)

- O1. The rules follow the account's generation setting. One prompt field;
  no new setting or UI field. Midjourney rules stay for accounts that do not
  generate on the board.
- O2. «Generates on the board» means: the provider chosen in Settings has
  its credential saved and the server can use it.
- O3. Generator prompts keep `--ar` as their only flag, so the board and
  `generate_image` keep picking the shape from it.
- O4. The board's «Midjourney» wording follows the same state.

## Decisions

### Server

- D1. `promptStyleOf(config, db, userId): Promise<PromptStyle>` in
  `packages/server/src/images/start.ts`, exported, with
  `export type PromptStyle = 'generator' | 'midjourney'` next to it. It
  mirrors the gate of `startImageGeneration` without throwing:
  `'midjourney'` when `config.secretsKey` is missing; else read `provider`
  from `getSettings(db, userId).imageGeneration`; `'midjourney'` when the
  provider is `atelier` and `config.atelierUrl === null`; else
  `readSecret(db, serverKeyOf(config), userId, provider)` gives
  `'generator'` on `state === 'ok'` and `'midjourney'` on `none` or
  `unreadable`. `startImageGeneration` is not changed. Reason: one answer to
  «can this account generate now», next to the code that enforces it.
- D2. The rules live in `board.ts` as three constants:
  - `IMAGE_RULES` renamed `MIDJOURNEY_RULES`, text unchanged.
  - `GENERATOR_RULES`, exactly:

    > Image prompts for GPT Image and Nano Banana, which this account
    > generates on the board: in English, two to five full sentences of
    > natural description, not a list of keywords. Most important first: the
    > subject and what it does, then the setting, the light, the framing,
    > the style and the mood; concrete visual detail, no quality tokens (8k,
    > masterpiece); one idea per prompt. Text that must appear in the image,
    > such as a sign or a letter’s heading, goes in double quotes with where
    > it sits; keep it short. Say what to leave out as a sentence («No
    > modern buildings.»), not with --no. No Midjourney flags (--v, --style,
    > --no and the rest), except the shape at the very end: `--ar 16:9` for
    > scenes and General establishing shots, `--ar 2:3` for PC and NPC
    > portraits and for a cover, and for a handout the prop’s own shape:
    > `--ar 2:3` for a letter, `--ar 3:2` for a map, `--ar 1:1` otherwise.
    > Only 16:9, 3:2, 1:1 and 2:3 exist. Scenes: from the scene’s visual:
    > line. To keep a face or a place the same across prompts, describe it
    > the same way each time and pass references to generate_image.

    One string, no line breaks; the typographic apostrophes and «» as
    written.

  - `IMAGE_RULES_POINTER`, exactly: «Image prompts in English, most
    important first, concrete words, no quality tokens (8k, masterpiece),
    one idea per prompt. The rest of the rules follow the account’s
    generation setting: read imageRules in get_board first and follow it.»
- D3. `get_board`'s answer gains `imageRules: { style: PromptStyle; rules:
string }`, `rules` being `GENERATOR_RULES` or `MIDJOURNEY_RULES`. Its
  description gains: «imageRules gives the rules for writing image prompts
  on this account: for GPT Image and Nano Banana when it generates on the
  board, for Midjourney otherwise.» Reason: the tool Claude must read before
  writing prompts is read live, so a key added or removed takes effect at
  the next read; a description could not (Context).
- D4. Descriptions: `add_image_prompt` and `update_image_prompt` use
  `IMAGE_RULES_POINTER` where they use `IMAGE_RULES` today.
  `set_scene_prompts` replaces its inline Midjourney sentence («Image: one
  Midjourney prompt … end with `--ar 16:9 --v 8.1`.») with «Image: one
  prompt from the scene’s visual: line. ${IMAGE_RULES_POINTER}», keeping the
  rest («It replaces the text of the scene’s prompt 1…» onwards) as it is.
  The Suno rules are not touched.
- D5. `INSTRUCTIONS` (`tools.ts:93`), board line: after «…add them with
  add_image_prompt, change them with update_image_prompt.» insert «Write
  them with the rules get_board gives in imageRules: for GPT Image and Nano
  Banana when the account generates on the board, for Midjourney
  otherwise.»
- D6. Warnings follow the style. The three image writes
  (`set_scene_prompts` with an image, `add_image_prompt`,
  `update_image_prompt` with a prompt) call `promptStyleOf` once, before the
  write transaction (`writeBoard`), not inside it.
  - `midjourney`: `sharedWords` as today.
  - `generator`: no `sharedWords` (generated images land on their prompt;
    no filename to match). Instead, `flagWarning(prompt)`: take
    `sentPrompt(prompt).flags`, remove every `--ar <w>:<h>`, trim; when
    something is left, warn exactly «Flags other than --ar are left out of
    what is sent: <left>. Say it in words instead.» Nothing is refused
    (checks never block).
- D7. `set_scene_prompts` still answers `not_an_adventure` before anything
  else on a campaign; the style lookup comes after that check.

### Web

- D8. `missingCredential` moves from `GeneratePanel.tsx` to
  `packages/web/src/board/generate.ts` (pure, exported; `GeneratePanel`
  imports it). New in `generate.ts`:

  ```ts
  export type PromptWording = "midjourney" | "image";
  // 'midjourney' only when the account is known to have no way to
  // generate: status read, and the server not configured or the chosen
  // provider without its credential. Unknown (loading, failed, offline)
  // reads as 'image'.
  export function promptWording(
    status: ImageGenerationStatus | null,
  ): PromptWording;
  ```

  `'midjourney'` when `status !== null && (!status.configured ||
missingCredential(status) !== null)`; else `'image'`. Reason: Midjourney
  words only where they are true for sure; neutral words otherwise.

- D9. `BoardView` computes `wording = promptWording(offline || status.state
!== 'ready' ? null : status.status)` and the board context's `Generation`
  (`context.ts:64-90`) gains `wording: PromptWording`.
- D10. The wording, `midjourney` → `image`, exactly:

  | Where                                                  | midjourney (today)                                         | image                                                 |
  | ------------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------- |
  | `ImageHalf.tsx:24`, `GeneralView.tsx:96` section label | `Images · Midjourney`                                      | `Images`                                              |
  | `PromptEditor.tsx:73` aria-label                       | `Midjourney prompt for <label>`                            | `Image prompt for <label>`                            |
  | `PromptEditor.tsx:167-168` aria-label                  | `Midjourney prompt for S2 · prompt 1` / `…for the new NPC` | `Image prompt for S2 · prompt 1` / `…for the new NPC` |
  | `PromptEditor.tsx:174` placeholder                     | `A Midjourney prompt for S2…`                              | `An image prompt for S2…`                             |
  | `ImagePrompt.tsx:164`                                  | `No Midjourney prompt yet. Ask Claude, or write one.`      | `No image prompt yet. Ask Claude, or write one.`      |
  | `summary.ts:112,120,128` `categoryText.*.what`         | `…a name, then a Midjourney prompt.`                       | `…a name, then an image prompt.`                      |
  | `actions.ts:289,293` `addPrompt` toast                 | `Added S2 · prompt 2. Copy it into Midjourney.`            | `Added S2 · prompt 2.`                                |
  | `ClaudeCard.tsx:26,30`                                 | `…Midjourney prompts for…`                                 | `…image prompts for…`                                 |

  `addPrompt` gains a `wording` parameter; `categoryText.what` becomes a
  function of the wording (or a pair), whichever keeps call sites simplest.

- D11. `sentView` (`generate.ts:120`): the summary reads «What is sent:
  flags left out» for every account. The Generate panel opens only for an
  account that can generate, so it has no Midjourney wording to keep.

### Not touched

- `MatchHelp.tsx` (the «How matching works» dialog) and Midjourney filename
  matching: anyone may still drop Midjourney files.
- Code comments that say Midjourney, `midjourneyWords`, `e2e/media.ts`
  `midjourneyName()`.
- `sentPrompt`, `defaultShape`, `generate_image`, the routes, Settings,
  stored prompts.
- The Suno rules.

## Accepted departures (review, 2026-11-25)

- The new tests live in their own files,
  `packages/server/test/db/mcp-image-rules.test.ts` and
  `packages/web/test/prompt-wording.test.ts`: saving a key in
  `mcp-board.test.ts` would need the fake OpenRouter. Assertions that moved
  to `imageRules` were updated in place in `mcp-board.test.ts`.
- `namedText` and `addPrompt` take the wording with `'midjourney'` as the
  default, so callers that pass none keep the earlier text.
- The «a name, then an image prompt.» line shows only on an empty PCs, NPCs
  or Handouts tab; the screenshot shows the empty PCs tab.

## Rejected

- Per-user tool descriptions built at registration: clients cache the tool
  list, so the rules would lag a key change until a reconnect, and
  `registerTools` is synchronous.
- Both rule sets in every description: long, and Claude would have to know
  the account's state anyway.
- No flags at all for the generator style: covers and map handouts would
  lose their shape (O3).
- Rewriting existing prompts: not asked; Generate already drops the flags.

## Risks

- e2e specs share one account in file order. `board.spec.ts` and `campaign-board.spec.ts` assert Midjourney labels and toasts and run online before `generate.spec.ts` saves a key, so they keep passing unchanged. `desktop.spec.ts` edits the board offline, where D9 gives the image wording, so its offline assertions use the image words (found in the build, accepted 2026-11-25).
- The board flashes the `image` wording for a Midjourney account until the
  status loads (once per page). Accepted.
- If saving a key in `mcp-board.test.ts` needs the fake OpenRouter `/key`
  check (see `image-generate.test.ts:89`), seal a secret directly with the
  secrets module instead; ask if neither fits.

## Verification

- Server tests (with `TEST_DATABASE_URL`): `promptStyleOf` for no secrets
  key, no credential, OpenRouter key saved, Atelier chosen without
  `atelierUrl`, Atelier token saved, unreadable secret; `get_board`
  `imageRules` both ways, and switching after a key is saved then deleted;
  warnings both ways; descriptions and instructions.
- Web unit tests for `promptWording` and each D10 string both ways.
- e2e full suite; `generate.spec.ts` asserts the `image` wording once a key
  is saved.
- Screenshots: the board with a key (scene row, NPCs tab text, Add editor
  placeholder) and without (unchanged).
- After release: `get_board` through the real connector on the owner's
  account (key saved) returns `style: 'generator'`.
