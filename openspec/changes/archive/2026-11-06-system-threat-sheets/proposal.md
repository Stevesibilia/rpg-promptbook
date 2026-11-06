## Why

Issue
[Stevesibilia/rpg-promptbook#52](https://github.com/Stevesibilia/rpg-promptbook/issues/52)
asks for a game systems page, and widened into letting each game system say
what its threat sheets hold, how the PDF draws them, and what a table fills
in. Today the only system is Kulthos, and its keys (Grado, Ferite,
Afflizioni…) live in the template, so a Not the End challenge, a 5e stat
block or an Outgunned boss gets no threat box at all.

The owner agreed the mockup
[docs/mockups/game-systems.html](../../../docs/mockups/game-systems.html) on
2026-11-06, with these decisions: several sheet kinds per system, chosen by
the sheet's `Tipo`; derived numbers are written by hand, tables only fill
counts and labels; the 12 systems the owner runs ship as read-only built-ins;
systems are live everywhere, with no versions. The research behind the
built-ins is in
[docs/research/threat-sheets-well-known.md](../../../docs/research/threat-sheets-well-known.md)
and
[docs/research/threat-sheets-lesser-known.md](../../../docs/research/threat-sheets-lesser-known.md).

Control-room plan p41 splits the work into three changes; this is the first.

## What Changes

- **Game systems describe their sheets.** A system has a name, sheet kinds
  and lookup tables. A kind is named by the `Tipo` value and lists its
  fields; each field has a block (text, number, choice, stat row, boxes,
  clock, list, rows, lines to fill in, yes/no), a place in the scene's threat
  box (row, subtitle, quote, full sheet only), a requirement and the block's
  options.
- **Twelve built-in systems**: Kulthos, Vileborn, Not the End, Outgunned,
  D&D 5e, Historia, Blades in the Dark, PbtA, Fate, Call of Cthulhu,
  Mörk Borg, Coriolis, with the kinds of the mockup.
- **Kulthos becomes data.** Its grade table becomes the `Gradi` lookup table
  and its keys move from the template to its `Minaccia` kind. The template's
  sheet keys keep only `Tipo`. Sabaoth's PDF stays byte-identical.
- **Threat boxes for every kind.** A sheet whose `Tipo` names a kind of the
  project's system, cited under `Chi c'è`, gets a threat box drawn from its
  fields; boxes and clocks with no place in the scene box are drawn in the
  full sheet.
- **New warnings**: an unknown `sistema`, a required field missing, a value
  the block cannot read. The sheet then prints its text as written.
- **Editor**: the `/` menu inserts a sheet of each kind under `## Schede`;
  the syntax sheet lists the system's kinds and fields.

Out of scope (later changes of plan p41): the Settings → Game systems page,
user systems and their storage, duplicating and deleting systems, the
template picker grouped by system, desktop offline systems, connector tools
for systems.

## Capabilities

### New Capabilities

- `game-systems`: system definitions, sheet kinds, field blocks, lookup
  tables, the built-in systems.

### Modified Capabilities

- `adventure-format`: the template keeps only `Tipo`; sheets are read by
  their kind; the new problems.
- `pdf`: threat boxes drawn from the sheet kind.
- `editor`: insert a sheet by kind; the syntax sheet lists the kinds.

## Impact

- `packages/format`: `systems.ts` (rewritten), new `systems/` built-ins,
  `model.ts`, `parse/sheets.ts`, `parse/blocks.ts` (nested items),
  `checks/sheets.ts`, `checks/references.ts`, new system check,
  `template/schema.ts`, `template/avventura.ts`, `convert/index.ts`,
  `index.ts`.
- `packages/layout`: `src/input.ts`, `typst/avventura.typ`.
- `packages/web`: `editor/syntax.ts`, `editor/inserts.ts` and the insert
  menu.
- `packages/server`, `packages/desktop`: only if they read `sheet.threat`.
- No database migration. No new page.
