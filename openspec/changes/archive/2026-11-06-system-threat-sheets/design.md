## Context

A sheet is a `### Name` under `## Schede` whose bold-key bullets are its
fields (`parse/sheets.ts`). Today `readThreat` reads seven keys named in the
template (`template/avventura.ts`, roles `type` … `talents`), and the only
system, Kulthos (`systems.ts`), gives a grade's wound and affliction counts.
The layout turns each sheet cited under `Chi c'è` into a `LayoutThreat`
(`layout/src/input.ts`), drawn by `threat-box` in `layout/typst/avventura.typ`.

The agreed mockup is
[docs/mockups/game-systems.html](../../../docs/mockups/game-systems.html).
Its `builtins()` function holds the data of the 12 built-in systems, and
`cell()` and `threatBox()` show how each block reads its value and how the
threat box draws it. This change builds that model, the built-ins, and the
PDF and editor parts. The Settings page, user systems and storage come in
change 2.

## Goals / Non-Goals

**Goals:** systems as validated data; every built-in kind parsed and drawn;
Kulthos expressed as data with Sabaoth's PDF byte-identical; problems that
guide but never block (see `checks-never-block` in the project memory).

**Non-Goals:** the Settings page, user systems, storage, system ids in the
project, formulas, rules text, versions of systems.

## Decisions

### D1. The system schema

`systems.ts` is rewritten. A system, validated by zod when defined
(`defineSystems` throws a `TemplateError` naming the path, as today):

```ts
System    { id: string /* lower-case slug */, name: string, kinds: SheetKind[], tables: LookupTable[] }
LookupTable { name: string, columns: string[] /* ≥ 1; the first is the key */, rows: string[][] }
SheetKind { name: string /* the Tipo value */, fields: FieldDefinition[] }
FieldDefinition = {
  key: string,
  show: 'row' | 'sub' | 'quote' | 'none',
  requirement: 'optional' | 'recommended' | 'required',
  afterType?: boolean,          // with show 'sub': written right after the Tipo, «Minaccia Straordinaria»
} & Block

Block =
  | { block: 'text' }
  | { block: 'number', line?: boolean }                 // line: «PF ___ / 22»
  | { block: 'choice', table: string, also?: boolean }  // also: the row's other columns in brackets
  | { block: 'stats', labels: string[] }
  | { block: 'boxes', count: Count, group?: int, marks?: boolean, values?: boolean }
  | { block: 'clock', count: { from: 'written' } | { from: 'fixed', n: int } }
  | { block: 'list', style: 'line' | 'paras' | 'check' }
  | { block: 'rows', columns: { name: string, table?: string }[] }
  | { block: 'lines', labels: string[] }
  | { block: 'flag', word: string }
Count = { from: 'written' } | { from: 'fixed', n: int } | { from: 'table', table: string, column: string }
```

Validation: system names and ids unique; kind names unique in a system,
case-insensitive; field keys unique in a kind and not the template's type
key; table names unique; every row as long as the columns; first-column
values unique, case-insensitive; every `table` and `column` named exists; a
boxes count `from: 'table'` needs a choice field on that table in the same
kind (that field picks the row); `afterType` only with `show: 'sub'`.

Systems are still found by name, case-insensitive, from the front matter key
with the role `system`. The `id` is for change 2.

### D2. The built-ins

New folder `packages/format/src/systems/`, one file per system, and
`builtinSystems` lists them in the mockup's order: Kulthos, Vileborn,
Not the End, Outgunned, D&D 5e, Historia, Blades in the Dark, PbtA, Fate,
Call of Cthulhu, Mörk Borg, Coriolis. Names, kinds, keys, blocks, options,
tables and requirements are exactly those of `builtins()` in the mockup,
translated to D1 (`o.count: 'table'` becomes `count: { from: 'table', … }`,
`labels: 'A · B'` becomes an array, `cols` of rows becomes `columns` with
`(tabella X)` as `table: 'X'`). Historia is a copy of D&D 5e under its own
name and id. Kulthos's `Grado` gets `afterType: true` (D6). The mockup's
`sample` of each kind becomes a test fixture (D10), not part of the system.

### D3. The template keeps only `Tipo`

`avventura@1`'s `sheets.keys` becomes `[{ key: 'Tipo', role: 'type' }]`.
The schema's role enum keeps its old values, so user templates saved with
all seven keys still load; the parser and the checks read only `type`.
`listSeparator` stays: lists, rows and stats split on it.

### D4. Reading a sheet

`readSheet` finds the system from the front matter and the kind whose name
equals the `Tipo` value, trimmed, case-insensitive. Fields match the kind's
keys the same way. No kind (no system, unknown system, no `Tipo`, a `Tipo`
the system lacks): `sheet.kind` is null and the sheet is plain text, as an
NPC or object sheet is today.

A field written as a bullet with sub-bullets gives one item per sub-bullet;
written on one line, items split on the list separator. `parse/blocks.ts`
keeps the nested list's items on the `ListItem` for this. Each block reads
(as in the mockup's `cell()` and `count()`):

| block  | written                                  | read                                     |
| ------ | ---------------------------------------- | ---------------------------------------- |
| text   | anything                                 | the text                                 |
| number | `22 (4d8+4)`                             | the text                                 |
| choice | a first-column value of the table        | the row; unknown value → invalid         |
| stats  | `FOR 13 (+1) · DES 15 (+2) …`            | label → value, in the kind's label order |
| boxes  | `6`, `6 (3)`, `10 (8, 10)`               | count and marked boxes                   |
| clock  | fixed: nothing; written: items `Text: 6` | one clock per item                       |
| list   | items; `paras` items `Name (text)`       | items, `paras` split into name and text  |
| rows   | items `Cell: cell · cell`                | cells in column order                    |
| lines  | nothing                                  | the labels from the kind                 |
| flag   | written and not `no`, `false`, `0`       | true                                     |

A boxes count `from: 'table'` takes the row picked by the kind's choice field
on that table and reads the column as an integer; `from: 'fixed'` is `n`;
`from: 'written'` is the first number written. A rows column with a `table`
looks its cell up in that table and keeps the second column as a token count.
A flag counts as written even with free text after it, as Kulthos's `Branco`
does today.

### D5. Model

`Sheet.threat` is replaced by `Sheet.kind: SheetKindData | null`:

```ts
SheetKindData { system: string, kind: string, fields: SheetKindField[], missing: string[] /* required keys not written */ }
SheetKindField { key: string, block: Block['block'], show, range: Range, text: string, value: BlockValue | null /* null: unreadable */ }
```

`BlockValue` is a union per block, holding what the table above reads.
Fixed boxes and clocks and `lines` are present even when not written.

### D6. The threat box

`LayoutThreat` becomes generic:

```ts
LayoutThreat { name, subtitle: string, quotes: string[], rows: LayoutThreatRow[], sheet: string | null }
LayoutThreatRow = text | number | stats | boxes | clocks | list | rows | lines   // one variant per block
```

A sheet gets a box when it has a kind and no required field is missing. The
subtitle is the kind's name; subtitle fields follow in kind order, the
`afterType` one after a space and the others after `·` (a flag adds its
`word` when true). Quotes print under the subtitle. Rows print in kind order
with the key in a label column at least 13 mm wide, wider when a key needs
it. A `paras` list keeps today's talent rule: up to two items print as
«Name: first sentence», more print their names on one line after the key.
A field that is unreadable prints as `Key: text`. `threat-box` in
`avventura.typ` draws each variant: boxes in groups as Kulthos's counters,
marked boxes filled, numbered boxes; clocks as circles cut into segments;
tokens as small filled dots; write-in lines.

For Kulthos these rules give today's box: «Minaccia Straordinaria ·
branco», rows Ferite and Afflizioni, talents, «scheda completa, p. N».

### D7. The full sheet

Under «Schede» the sheet prints its written text as today. A boxes or clock
field with `show: 'none'` also draws its marks after the text, so a tracker
always prints once. This keeps Sabaoth's full sheets unchanged, where the
mockup said every tracker prints in the full sheet: the trackers shown in
the scene box are already drawn there.

### D8. Problems

All warnings; none blocks anything.

- `system.unknown`: the front matter names a system that does not exist; on
  the front matter key.
- `sheet.field.required`: a kind's required field is not written; on the
  sheet heading; the sheet gets no threat box.
- `sheet.value.invalid`: a field the block cannot read (choice not in the
  table, no number in written boxes or a clock item, a stat label the kind
  lacks); on the field; it prints as text.
- `sheet.grade.counts` (code kept: hidden problems are stored by code): a
  boxes field counted from a table whose written value disagrees, read as
  today: with a `group`, the first number is groups and a second the group
  size; without, the first number is boxes.
- `sheet.nested-threat` (kept): words from the tables of required choice
  fields stand for today's grade words. Only Kulthos has such a field.
- `ref.threat.outside` (kept): «graded sheet» becomes «sheet with a kind».
- A `Tipo` that is not a kind of the system gives nothing.
- Recommended fields give no problem; the insert puts them in (D9).

### D9. Editor

The `/` menu, on a line under `## Schede`, lists «Sheet: <kind>» for each
kind of the project's system. It inserts `### ` with the cursor after it,
then `- **Tipo:** <kind>` and `- **<key>:** ` for each required and
recommended field, in kind order. The syntax sheet's «Sheet keys» group lists
`Tipo` and, for each kind, its fields with block and requirement. The parse
worker keeps using `builtinSystems`.

### D10. The converter

`convert/index.ts` takes its keys from the built-in Kulthos `Minaccia` kind:
the required choice field is the grade, the first text field the nature, the
flag the pack, the `paras` list the talents; `Key: value` segments match a
field key by name. The converted Sabaoth fixture stays identical.

### D11. Proof

Tests use the mockup's `sample` of every kind: each parses with no problem,
and its layout row variants match the mockup's box. A test adventure with one
cited sheet of each of the 17 kinds builds a PDF without error. Sabaoth's
four hashes (recorded in tasks 0.1) stay equal. The owner judges the boxes
by eye, so the hand-back carries the PNG pages of that test PDF.

## Risks / Trade-offs

- **Byte identity with a generic box.** Typst's PDF bytes follow the layout
  frames, not the source code, so the same content gives the same bytes. If
  the generic box cannot reproduce Kulthos exactly, stop and report the
  difference instead of re-baselining.
- **Live systems.** Changing a built-in changes every project's warnings and
  PDF at once. Accepted by the owner; built-ins change only in releases.
- **Key names guessed.** Several Italian keys for Outgunned and Vileborn are
  guesses; the owner fixes them later by duplicating, or a follow-up release.

## Review of groups 0 to 2 (accepted departures)

Brief A (commits 0380171, 17fa95d) departed from the decisions above in
these ways, all accepted by the architect:

- **D5.** `SheetKindField` also carries its `definition` (the layout needs
  group, marks, values, word, afterType, style, line, labels, also without
  the systems), its `error` (the reason, read once) and a `range` that is
  null for a field the block fills without being written. `SheetField` has
  `lead` and `items`, `ListItem` has `items`.
- **D5.** Boxes counted from a table are present unwritten when the choice
  picks a row, as Kulthos's `Afflizioni` prints today. A required field the
  block fills unwritten is not missing.
- **D4 rows.** The separator splits cells, so a rows field on one line is
  one row; several rows need sub-bullets. Text before the sub-bullets is the
  first row.
- **D4 flag.** Off when the first word is `no`, `false` or `0`; an empty
  `Branco:` is on. `Branco: no` no longer draws «branco».
- **D4 boxes.** Brackets mark boxes only with `marks`; marks split on commas
  or spaces; a mark outside 1..count is `sheet.value.invalid`; text after the
  number is accepted.
- **D4 splitting.** On the separator outside brackets, plain when brackets do
  not balance; empty items dropped; soft-wrapped items joined; single-value
  blocks read the item's own line; stat labels match ignoring case, a colon
  and emphasis.
- **D1.** Also: a column a boxes count uses holds whole numbers; a rows first
  cell is not empty; table columns unique; names compared ignoring case;
  `requirement` defaults to optional.
- **D10.** Converted lines follow `Tipo` and kind order (Branco before
  Ferite); `Volontà` and `Condotta` segments are converted too. The Sabaoth
  golden file is unchanged.
- **D8.** `sheet.nested-threat` skips every key of the sheet's kind;
  `ref.threat.outside` fires for any sheet with a kind; one
  `sheet.field.required` per missing key; `system.unknown` lists the known
  systems.
- **Layout bridge.** `threat()` in `layout/src/input.ts` reads `Sheet.kind`
  for Kulthos-shaped kinds only; group 3 replaces it.

## Review of groups 3 to 5 (accepted departures)

Brief B (b6d77b7 to 491ac0d) departed in these ways, accepted by the
architect; the owner chose the re-baseline.

- **D11.** Twelve test adventures, one per system, and one test-only merged
  layout input for the 17-kind proof PDF. The samples live in
  `packages/format/fixtures/kind-samples.json`.
- **Sabaoth re-baselined.** Talent paragraphs use the tight leading of the
  other blocks, so a wrapped talent no longer reads as two items. Sabaoth's
  PDF text is unchanged; its four hashes are recorded anew in tasks 0.1 and
  in `own-sections.test.ts`.
- **D6.** Stat rows and written clocks print no key, as the mockup draws
  them. The label column is the widest key, at least 13 mm, capped at
  26 mm; keys never hyphenate and wrap at spaces. Rows tables size columns by
  content; when three columns do not fit, tokens sit under their word. Stat
  values stay on one line, shrinking down to 6 pt. Marked boxes are light
  grey, also with ink saver. A zero count prints «0».
- **D6, talents.** A paragraph item splits on the last bracket group at its
  end: «Artigli 45% (22/9) (1D6 + BD)» is named «Artigli 45% (22/9)».
- **Full sheet.** Fields written with sub-bullets print as a nested list.
- **D9.** The menu group is «Insert a sheet»; each entry shows the keys it
  inserts. A `/` on a blank line after an item belongs to that item, so the
  menu works under a bare `## Schede`. The kind is looked up again when an
  entry is applied.
- **D9.** The syntax sheet lists `Tipo` with the kinds, then one group per
  kind with each field's block, place and requirement.
