## Why

Issue
[Stevesibilia/rpg-promptbook#44](https://github.com/Stevesibilia/rpg-promptbook/issues/44).
The pregenerated characters under `### Pregenerati` in `## Schede` are
missing from the editor's outline, while every other sheet is listed. The
connector's `get_outline` leaves them out too, so Claude can read or replace
them only by rewriting the whole `Schede` section. Moving them to their own
`##` section drops them from the PDF, so there is no workaround.

## What Changes

- **The outline lists the Pregenerati block** under `Schede`, at the sheets'
  level and in text order, with its problems counted there.
- **Each pregenerated character (`####` heading) gets its own row**, one level
  deeper: the outline gets a third level. The command palette lists them, a
  click jumps to the heading, and the status bar names the character.
- **The connector gets two new kinds of target**: `pregenerated` (the whole
  block, by the template's name for it) and `character` (one character, by
  name). `get_outline`, `read_document` and `replace_section` take them, so
  Claude can write one character at a time.
- The block is named by the template (`sheets.pregenerated`), so a template
  that renames it renames the outline row and the target.

Out of scope: the PDF (it already prints the block), the format's parser
(it already reads the block and its characters), campaigns.

## Capabilities

### Modified Capabilities

- `editor`: the outline lists the Pregenerati block and its characters.
- `connector`: the Pregenerati block and each character are targets.

## Impact

`packages/web` (editor analysis places, outline, Checks, slash menu, CSS),
`packages/project` (targets), `packages/server` (connector tool
descriptions), `docs/design.md`. No migration, no new route, no new tool.
