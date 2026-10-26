## Context

The format already reads the block. `parse/sections.ts:87-98` sends the
first `###` of the sheets section whose text equals the template's
`sheets.pregenerated` to `readPregenerated` (`parse/sheets.ts:84-114`), and
every other `###` to `readSheet`. The model (`model.ts:288-293`) holds
`pregenerated: { range, headingRange, blocks, characters: { name, range,
headingRange, blocks }[] } | null`. The block's range runs from its `###` to
its last node; each character's from its `####` to its last node. A sheet
before the block ends before its heading, and the `Schede` section's range
holds the block. So the block and its characters nest the way scenes nest in
`Scene`, and nothing in the format changes.

Two lists leave them out today:

- The editor's places (`web/src/editor/analysis/field.ts:56-75`, kinds
  `meta | section | scene | sheet`), which `outline.ts` turns into rows.
- The connector's targets (`project/src/targets.ts:57-99`, kinds
  `section | scene | sheet | heading`), which `get_outline`, `read_document`
  and `replace_section` use.

The owner chose (2026-10-26) to list each character too, a third outline
level, and to make the block and each character connector targets.

## Decisions

### D1. Names come from the model and the template

The block's name is the template's `sheets.pregenerated` («Pregenerati» in
«Avventura»), the text the parser matched. A character's name is
`characters[i].name` (the `####` heading's plain text). No new name is
stored. A template that renames the block renames the row and the target
with no further work, which is what #44 asked of #34's editable templates.

Only the first matching `###` is the block; a second one stays a sheet, as
the parser reads it today.

### D2. Two new place kinds

`Place['kind']` in `field.ts` becomes
`'meta' | 'section' | 'scene' | 'sheet' | 'pregenerated' | 'character'`.
`placesOf` adds, after the sheets:

```ts
add("pregenerated", model.pregenerated ? [model.pregenerated] : []);
add("character", model.pregenerated?.characters ?? []);
```

The block's index is 0; a character's index is its index in
`model.pregenerated.characters`. `mapPlace` is unchanged: the places nest as
sections and scenes already do.

### D3. Outline rows at three depths

`OutlineItem.depth` becomes `0 | 1 | 2`. Under the section whose role is
`sheets`, `fromAnalysis` pushes the sheets and the block at depth 1 and the
characters at depth 2, **sorted by `from`**, so the block sits where it is in
the text (it can come before a sheet) and its characters follow it.

| Row       | key              | depth | name                 | place (status bar)      |
| --------- | ---------------- | ----- | -------------------- | ----------------------- |
| Block     | `pregenerated:0` | 1     | template's name      | template's name         |
| Character | `character:<i>`  | 2     | `characters[i].name` | `<block name> · <name>` |

Both have `id: null` and `movable: false`. The template is
`analysis.template`; it is set whenever a result exists (the parse used it).

Badges need no new code: `deepest()` already gives a problem to the last
row at the greatest depth that holds it. A problem in a character goes to
the character; one in the block's text before the first character goes to
the block; one in the block's heading goes to the block.

`OutlinePanel.tsx:131` gives depth 1 the class `sub` and depth 2 the class
`sub2`. `editor.css` adds `.ol li.sub2 { padding-left: 44px; }` next to
`.ol li.sub` (22px): one more step of the same indent. Nothing else in the
row changes. This is the layout the owner picked from the preview:

```text
Schede
  Tenente Donato
  Orologio
  Pregenerati      2
    Ada Rossi      2
    Bruno Valli
```

### D4. The panels that read a row's kind

- **Command palette** (`palette.ts`): lists every outline row already, so it
  gets «Go to Pregenerati» and «Go to Ada Rossi» with no change.
  `resolveItem` keeps its rules for names shared with a sheet.
- **Checks** (`Checks.tsx:49-57`, `whereOf`): skips `pregenerated` and
  `character` as it skips `sheet`, so a problem there still reads
  «Schede · line N». Sheets were placed in their section on purpose (the
  mockup); the block and characters follow that.
- **Slash menu** (`cm/slash.ts:122`): `pregenerated` and `character` offer
  what `sheet` offers (callouts whose places include `sheet` or
  `anySection`). Until now the cursor there fell to the `Schede` row and got
  the section's callouts; `checks/callouts.ts:141-143` checks the block's
  boxes as sheet places, so the sheet's list is the right one.
- **This scene, Research, `?scene=`**: read `kind === 'scene'` only, unchanged.

### D5. Two new target kinds

`Target['kind']` in `targets.ts` becomes
`'section' | 'scene' | 'sheet' | 'pregenerated' | 'character' | 'heading'`.
`adventureTargets` adds, after the sheets:

- the block: `kind: 'pregenerated'`, `target` and `title` the template's
  `sheets.pregenerated`, span from `headingRange.start` to `range.end`;
- each character: `kind: 'character'`, `target` and `title` its `name`, span
  the same way.

`span()` and the sort by `from` are the existing ones. `level` comes from
`levelAt`: 3 for the block, 4 for a character.

`replace_section` needs no new rule, and the existing ones give this:

- `checkHeading` asks for a `###` line for the block and a `####` line for a
  character.
- `spanAfter` refuses a renamed heading and a heading of the same or a higher
  level inside the new text. So a character keeps its name and holds no
  other `####`. To add, remove or rename characters, Claude replaces the
  block, whose text may hold any `####` headings.
- A name shared by a character and a sheet or section answers
  `ambiguous_target` with both, as two names do today.

`get_outline` lists the new targets with its usual counts. Nested targets
count a problem in each, as a scene and its section already do: a problem in
a character counts in the character, the block and `Schede`.

### D6. Connector wording

In `server/src/mcp/tools.ts` the three descriptions name the new targets.
Exact replacements:

- `get_outline` (:350): «sections, scenes (by id, S3) and sheets of an
  adventure or one-shot» becomes «sections, scenes (by id, S3), sheets, the
  pregenerated characters block (Pregenerati) and each pregenerated
  character (by name) of an adventure or one-shot».
- `read_document` (:380): «a section’s name, a scene id such as S3, a sheet’s
  name» becomes «a section’s name, a scene id such as S3, a sheet’s name, the
  pregenerated characters block’s name (Pregenerati) or a pregenerated
  character’s name».
- `replace_section` (:399): «a section, a scene or a sheet» becomes «a
  section, a scene, a sheet, the pregenerated characters block or one
  pregenerated character», and add one sentence: «A character keeps its
  name; to add, remove or rename characters, replace the Pregenerati block.»

Keep the rest of each description as it is. «Pregenerati» is written in the
descriptions because it is the built-in template's name; the target list
`get_outline` returns carries the real one.

### D7. Not touched

The format parser and model, the layout and PDF, the campaign outline
(`fromHeadings`: `##` and `###` only), `project/src/update.ts`,
`add_scene`, the Research view, the desktop app (it runs the same web code),
scene moves.

### Rejected

- **Pregenerati as its own `##` section**: drops it from the PDF (the issue).
- **The block only, or characters only in the connector**: the owner chose
  both, in both places.
- **Placing a character's problem under the character in Checks**: sheets
  are placed in their section by design; one rule for the whole `Schede`.

## Risks

- **`analysis.template` null while a result exists.** D3 assumes it never
  is. If a test or the type says otherwise, report it; do not fall back to a
  hard-coded «Pregenerati».
- **Sabaoth's expected lists change.** Its block has no `####` characters, so
  `outline.test.ts` and `targets.test.ts` gain one `Pregenerati` row and
  target. If a badge moves from `Schede` to `Pregenerati`, that is D3
  working: update the expectation and say so in the hand-back.
- **A hidden problem's key** (`hidden.ts`) changes for problems in the
  block. It should not (keys do not use outline rows); if it does, stop and
  report: hidden problems would come back.
- **A character's span after a `replace_section`** differs from the written
  text (the character's range ends at its last node, the target's at
  `trimEnd`). If a valid character replacement is refused by `spanAfter`,
  report it with the text; do not loosen `spanAfter`.

## Verification

- `web/test/outline.test.ts`: Sabaoth's list with `  Pregenerati`; an
  inline document whose block has text, then `#### Ada Rossi`,
  `#### Bruno Valli`, `#### Carla Neri`, with a problem in Ada and one in the
  block's text before Ada: rows, depths, keys, badges on the right rows; a
  block placed before a sheet sorts before it; `currentItem` inside Bruno is
  Bruno and the status bar's place is «Pregenerati · Bruno Valli».
- `web/test/palette.test.ts`: «Go to Ada Rossi» resolves and jumps.
- `web/test/slash.test.ts`: the cursor in a character offers the sheet's
  callouts.
- `web/test/checks.test.ts`: a problem in a character reads «Schede · line N».
- `project/test/targets.test.ts`: Sabaoth's list with
  `pregenerated:Pregenerati:3`; the inline document's targets with
  `character:<name>:4` and their spans; `findTarget` by a character's name,
  accent and case insensitive; a shared name answers `ambiguous_target`.
- `server/test/db/mcp.test.ts`: `get_outline` lists the block and characters
  with counts; `read_document` of «Ada Rossi» returns its text and hash;
  `replace_section` of a character with a `####` heading writes it and an
  open document sees it; a `###` heading or a second `####` inside it is
  refused with `invalid_markdown`; replacing the block with a fourth
  character added writes it and `get_outline` then lists four.
- `e2e/editor.spec.ts`: a project whose block holds characters; the outline
  shows `Pregenerati` and the characters, a character row is indented more
  than the block row, a click puts the cursor on the `####` heading.
- A screenshot of the outline with the block and three characters, light
  theme, for the owner.
