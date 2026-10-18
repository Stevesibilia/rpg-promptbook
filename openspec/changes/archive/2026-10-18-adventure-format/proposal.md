## Why

Everything in RPG Promptbook reads the adventure: the editor's checks, the PDF,
the asset board, the `.cbpack` export and Claude's connector. Today that
reading is done by `impagina.py`, which guesses structure from conventions and
silently drops or merges what does not fit (in L'Ancora di Sabaoth, a whole
field of S5 lands inside another one and a threat gets no box). The format has
to be read once, strictly, and every problem reported, before anything else is
built on it. It needs no UI, so it can be built and tested first.

## What Changes

- A new workspace package, `format`, in TypeScript, with no native code, that
  runs in Electron, the browser and Node.
- **The agreed grammar** (docs/design.md, "Source format"): CommonMark plus GFM,
  YAML front matter for the header, Obsidian-style callouts for typed boxes
  (`[!leggi]`, `[!documento]`, `[!riquadro]`, `[!riquadro|laterale]`), scenes
  as `### S1. Name`, bold field labels, sheets with separate keys for threat
  data, `→ Schede:` references, the `visual:`/`mood:` appendix keyed by scene
  id.
- **A typed model** built from the text: metadata, sections, scenes with their
  fields and boxes, sheets with threat data, revelations, clues, appendix rows.
  Every item keeps its position in the text.
- **Templates as data:** the sections, scene fields, callout types, sheet keys
  and grade tables come from a template definition, not from code. This change
  ships one template, "Avventura" (used by adventures and one-shots), with
  Kulthos as its first system.
- **Checks:** about thirty rules, ported from the skill's `controlla.py` plus
  the layout rules found in the research. Each problem is an error or a
  warning with its line and column. Nothing is dropped: content the model
  cannot place produces a problem.
- **A converter** from today's notes (title line and bold header lines,
  untyped quotes, the single `Tipo` line) to the new format, idempotent, with
  a report of what still needs a human.
- Test fixtures: L'Ancora di Sabaoth and the template's own example.

Out of scope: the editor, the PDF template, the campaign template, storage and
sync, and the connector. They consume this package in later changes.

## Capabilities

### New Capabilities

- `adventure-format`: the grammar of an adventure document, the model built
  from it, the template definition it is checked against, and the checks with
  their errors and warnings.
- `note-conversion`: converting a note written in today's conventions into the
  new format, with a report of what was changed and what still needs a human.

### Modified Capabilities

None. This is the first change in the repository.

## Impact

- New: the npm workspace root and `packages/format`. Workspace packages are
  never published and never use the `@promptbook` scope.
- Dependencies: `unified`, `remark-parse`, `remark-gfm`, `remark-frontmatter`,
  `yaml`, `zod` 4, `spdx-license-ids` (the list of SPDX ids, data only); for
  development `typescript`, `vitest`, `@types/mdast`, `@types/node`.
- First CI on GitHub Actions: typecheck and tests on pull requests into `main`.
- Later changes (editor, PDF, asset board, connector) depend on this package's
  model and problem list; its API is the contract between them.
