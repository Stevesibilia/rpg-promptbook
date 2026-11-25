# Prompt rules that follow the generation setting

## Why

Issue #57's last open line: «Prompts written for these models, not
Midjourney». Claude still writes every image prompt for Midjourney (flags,
`--v 8.1`, first words unique for filename matching), and the board still
says «Midjourney prompt», even for an account that generates its images on
the board with GPT Image or Nano Banana. Those models read long natural
prose, can draw short text, and ignore Midjourney's flags.

The owner decided on 2026-11-25 that the rules follow the account's
generation setting, with one prompt field and no new setting: an account
that can generate on the board gets prompts written for those models; any
other account keeps the Midjourney rules of today. Dropping Midjourney is a
later step.

## What Changes

- The server decides each account's **prompt style**: `generator` when the
  provider chosen in Settings (OpenRouter or Atelier) has its key or token
  saved and the server can use it; `midjourney` otherwise.
- The connector's `get_board` returns `imageRules`: the style and the rules
  text for it. The image tools' descriptions keep a short shared core and
  point at `imageRules`; the server instructions say so too.
- Generator rules: natural prose in English, quoted text allowed in the
  image, exclusions as a sentence, no Midjourney flags except `--ar` with
  one of the four shapes the board generates (16:9, 3:2, 1:1, 2:3), which
  the board reads for the shape and leaves out of what is sent.
- Midjourney rules: unchanged.
- Warnings on writes follow the style: the first-words warning only for
  Midjourney; for the generator style, a warning when a prompt carries
  flags other than `--ar`.
- The board's wording follows the same state: «Image prompt» and «Images»
  where it says «Midjourney prompt» and «Images · Midjourney» today, unless
  the account is known to have no way to generate. «What is sent:
  Midjourney flags left out» becomes «What is sent: flags left out».

Out of scope: the «How matching works» help (Midjourney filenames still
match for anyone who drops them); prompts already written (nothing is
rewritten); the `midjourney-prompts` skill outside this repository; a new
setting or field.

## Impact

- `packages/server/src/images/start.ts` (`promptStyleOf`),
  `packages/server/src/mcp/board.ts`, `packages/server/src/mcp/tools.ts`.
- `packages/web/src/board/*` wording; `BoardView` context.
- Tests: `packages/server/test/db/mcp-board.test.ts`, web board tests,
  `e2e/generate.spec.ts`.
- Specs: `connector`, `asset-board`. Docs: `docs/design.md`.
- No migration, no chart or deploy change.
