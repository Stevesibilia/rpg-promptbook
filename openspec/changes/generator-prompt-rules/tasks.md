# Tasks: generator-prompt-rules

## 1. Server

- [x] 1.1 `promptStyleOf` and `PromptStyle` in `images/start.ts` (D1), with
      tests: no secrets key, no credential, OpenRouter key saved, Atelier
      chosen without `atelierUrl`, Atelier token saved, unreadable secret.
- [x] 1.2 `MIDJOURNEY_RULES`, `GENERATOR_RULES`, `IMAGE_RULES_POINTER` (D2);
      `get_board` `imageRules` and description (D3); the three write
      descriptions (D4); `INSTRUCTIONS` (D5).
- [x] 1.3 Warnings by style, `flagWarning` (D6, D7).
- [x] 1.4 `mcp-board.test.ts`: `imageRules` both ways and after a key is
      deleted; warnings both ways; descriptions (`--ar 16:9 --v 8.1` now
      asserted on `imageRules`, not on `add_image_prompt`'s description);
      instructions.
- [x] 1.5 Commit `feat(server): image prompt rules follow the generation
    setting`, push.

## 2. Web

- [ ] 2.1 `missingCredential` moved to `generate.ts`; `promptWording`
      (D8); `wording` in the board context (D9).
- [ ] 2.2 The D10 strings both ways; `addPrompt(…, wording)`;
      `sentView` summary «What is sent: flags left out» (D11).
- [ ] 2.3 Web unit tests: `promptWording` (null, not configured, no key,
      Atelier unavailable, key saved), each D10 string both ways; update
      `generate.test.ts:125` and `generate-board.test.ts:148`; existing
      Midjourney assertions stay where the test has no key.
- [ ] 2.4 Commit `feat(web): board wording follows the generation
    setting`, push.

## 3. e2e and docs

- [ ] 3.1 `e2e/generate.spec.ts`: `:111` reads «What is sent: flags left
      out»; with the key saved, a scene row's image half reads «Images»,
      the Add NPC editor is labelled «Image prompt for the new NPC» and its
      toast is «Added NPC · <name>.». Leave the other specs' Midjourney
      assertions as they are (Risks).
- [ ] 3.2 `docs/design.md` «Asset board» (`:439-440`, `:458-463`) and
      «MCP connector» (`:337`): the two rule sets and how the style is
      chosen. Prettier on the Markdown files touched only.
- [ ] 3.3 Commit `test(e2e): image wording on a generating account` and
      `docs: prompt rules follow the generation setting`, push.

## 4. Proof and hand-back

- [ ] 4.1 Typecheck; package tests (server with `TEST_DATABASE_URL`);
      e2e full suite. Literal counts in the hand-back.
- [ ] 4.2 Screenshots: board with a key (scene row, NPCs tab text, Add
      editor placeholder, toast) and without (unchanged), in the
      scratchpad, paths in the hand-back.
- [ ] 4.3 Hand back.
