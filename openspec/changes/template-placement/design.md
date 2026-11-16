## Context

Issue #63, «Page placement set by the template». The owner agreed the mockup
[docs/mockups/templates.html](../../../docs/mockups/templates.html) on
2026-11-16 (states 3, 4, 8 and 10; published at
https://claude.ai/artifact/72eHKBSKzZXWELS935Zdo2, which an implementer
cannot open: «The approved UI» below says it in words, and the mockup file
is in the repository). In the mockup read `NOTES` (the object near the end
of the file), `sketch`, `preview`, `renderMarks`, `openUpdate` and the
`colCtl` helper inside `renderEditorPane`.

Three briefs build this change: A is the contract (format and project), B
the layout, C the web client and the server. B and C start when A is pushed
and run in parallel.

Words used here: a **part** is something the page lays out as a unit. The
**night parts** are `reminders`, `revelations`, `clock` and `truths`; the
**scene parts** are `mustHave`, `happens`, `cast` and `clues` (scene field
roles). A **mark** is `{laterale}` or `{principale}` written in the text.

### The code today

- **Template schema**, `packages/format/src/template/schema.ts`:
  `sectionSchema` (`:48-66`) with `pdf` `{ print, newPage, sideColumn }`;
  `sceneFieldSchema` (`:81-89`) has no column; `calloutSchema` (`:91-104`)
  has `column`; `overview: z.object({ revelations: label })` (`:140`). Every
  object is a plain `z.object`, so unknown keys are stripped on parse. The
  adventure `superRefine` refuses `newPage` and `sideColumn` on role
  sections (`:195-208`), the campaign one refuses `sideColumn` (`:223-241`).
- **PDF options**, `template/pdf.ts`: `sectionPdf` (`:26`) and `withPdf`
  (`:41`). `withPdf` rebuilds `pdf` from the three keys it knows (`:44-48`),
  so it would drop any other key of `pdf`.
- **Changes**, `template/changes.ts`: `TemplateChange` (`:15-22`, `detail`
  already has `'column'`, used by boxes at `:186`); `sections()` (`:126`),
  `fields()` (`:148`); `templateChanges` (`:238`) does not compare
  `overview`.
- **Parser**, `packages/format/src/parse/`: `matchSection`
  (`sections.ts:23-31`) takes a heading equal to a section's name or
  starting with it and a colon or a space, so `## Orologio {laterale}`
  already matches «Orologio» today and `Section.heading` keeps the braces.
  `readSection` (`sections.ts:46`) sets `heading` from
  `plainText(heading).trim()`. `readRevelations` (`sections.ts:131-147`)
  wants a paragraph whose leading bold label is the template's
  `overview.revelations`, followed by a list. `leadingLabel`
  (`blocks.ts:98-112`) and `afterLabel` (`blocks.ts:115`). `readScene`
  (`scenes.ts:71-88`): a label is `form: 'inline'` when it has a colon or
  any text after it, so today `**Da non perdere qui** {principale}` is an
  inline field with the text `{principale}`, and the list under it becomes
  `content.unplaced`. Nothing in the grammar uses `{…}`.
- **Model**, `packages/format/src/model.ts`: `Section` (`:148-160`),
  `SceneField` (`:162-174`), `Model` (`:353-369`). Plain JSON-safe data.
- **Checks**, `packages/format/src/checks/index.ts:28-39`: the list of
  checks. Codes are `<thing>.<what>`: `section.unknown`, `callout.place`,
  `content.unplaced`.
- **Starting document**, `packages/project/src/skeleton.ts`: `firstScene`
  (`:63-69`) writes the required and recommended fields that are not
  climax-only; `skeletonDocument` (`:76-92`) writes `## heading` per
  section. It writes no «Rivelazioni» label. The exact text is pinned in
  `packages/project/test/skeleton.test.ts:107-131`.
- **Template update**, `packages/project/src/update.ts`: `UpdateOptions`
  (`:10-15`), `sectionNamed` (`:28-36`, a copy of `matchSection`),
  `updateEdits` (`:65-143`). Targets in `packages/project/src/targets.ts`
  read `section.heading` for a target's `title` (`:70`).
- **Layout input**, `packages/layout/src/input.ts`: `LayoutScene`
  (`:104-133`), `LayoutInput.night` (`:181-192`), `field()` (`:333-343`),
  `scene()` (`:455-501`), the revelations split (`:625-636`), `nightParts`
  (`:653-670`).
- **Typst**, `packages/layout/typst/avventura.typ`: `side-box` (`:202-217`,
  `breakable: false`), `columns-part` (`:247`), the night (`:372-403`), the
  scene columns (`:704-750`). Today's code, part by part:
  - night, main: `clock` then `truths`, each `section-heading(title, from:)`
    then `any-blocks`; the clock sets `show list.item: set block(below:
2mm)` for its blocks (`:382-390`).
  - night, side: `v(5mm)`, then `reminders` as `side-box(title, {
pos("block", from); any-blocks(blocks) })`, then `revelations` as
    `side-box(title, any-blocks(blocks))` with no `pos`, then
    `night.sideBoxes` (`:392-401`).
  - scene, main: read-alouds, `happens` and `clues` as `h3(label)` then
    `field-blocks`, handouts, boxes, `tests` in a frame, reactions, tables,
    `derail` (`:705-734`).
  - scene, side: `mustHave` as `side-box(label, { pos("block", from);
field-blocks })`, `cast` as a 9 pt block with a `label-text` title
    (`:739-746`), threats, side boxes.
- **Byte pins**, `packages/layout/test/own-sections.test.ts:106-122`: four
  SHA-256 hashes of Sabaoth's PDF. The fixture
  `packages/format/fixtures/l-ancora-di-sabaoth.converted.md` has no `{`.
- **Template editor**, `packages/web/src/templates/`: `rolePlaces`
  (`TemplateRows.tsx:42-58`), `PdfOptions` (`:258-325`), `SectionsTab`
  (`:327-404`), `FieldsTab` (`:406-478`, which has a «Used for» column the
  mockup does not draw), `pdfAction` (`draft.ts:33-40`), `previewMarks`
  (`marks.ts:72-127`, a heading is matched by the whole `line.slice(3)` at
  `:111`), `changeText` (`changes.ts:44-78`), grids `.g-sec` and `.g-fld`
  (`templates.css:210-215`). `StartingPreview.tsx` shows the skeleton in a
  read-only editor that uses the project editor's `preview()` extension
  (`:66-70`), so what the editor styles, the preview styles.
- **Editor**, `packages/web/src/editor/`: `insertText` case `'field'`
  (`inserts.ts:64-67`), shared by «This scene», the `/` menu and the
  palette; headings and bold labels in `cm/preview.ts:181-216` (a label gets
  `cm-fl` only when the bold is alone on its line or ends with a colon,
  `:209-213`); `PreviewConfig` (`cm/preview.ts:11-15`); `paletteEntries`
  (`palette.ts:30-67`), run by `runPalette` (`EditorPage.tsx:226-250`); the
  palette has no disabled rows (`CommandPalette.tsx`); `syntaxOf`
  (`syntax.ts:127`).
- **Update dialog**, `packages/web/src/templates/TemplateUpdate.tsx:66-81`
  (two options, each shown only when it has something to do) and
  `update.ts`.
- **Connector**, `packages/server/src/mcp/`: `fieldText` and
  `SCENE_REQUIRED` (`tools.ts:103-114`), `UpdateOptions` and
  `updateProjectTemplate` (`templates.ts:113-140`), the
  `save_template_version` text (`templates.ts:297`), the
  `update_project_template` tool (`templates.ts:340-352`).
  `replace_section` checks only the level of the heading it is sent
  (`edits.ts:153`).

## Goals / Non-Goals

**Goals:** the template sets the column of the eight parts; a mark in the
text overrides it; new text carries the marks; the template editor, the
editor, the update dialog and the connector know about them; documents
without marks on templates without column settings print as today, Sabaoth
byte for byte.

**Non-Goals (A11):** campaign layout and campaign templates; the «Side
column» option of own sections; the column of boxes; the look of any part in
its default place; any automatic handling of a part that does not fit.

## The owner's decisions

Fixed by the owner; do not reopen them in a brief.

- **O1. Scope.** The template sets the column, main or side, of the night
  parts (the sections with the roles `reminders`, `clock`, `truths`, and the
  revelations list inside the overview) and of the scene fields with the
  roles `mustHave`, `happens`, `cast`, `clues`. Nothing else gets a column.
- **O2. The text overrides** with a mark after the heading or the bold
  label: `## Orologio {laterale}`, `**Da non perdere qui** {principale}`. A
  mark on a scene field affects that scene only.
- **O3. The template writes the marks.** A new project's starting document
  carries a mark on every part that has a column setting, also when it
  equals the default, and so does every field inserted later. A part with no
  mark follows the template, so existing documents print as today.
- **O4. Nothing moves by itself.** No fallback when a side box does not fit;
  side boxes stay unbreakable. Rejected by the owner: moving a part to the
  main column automatically, breakable side boxes, a front matter key, marks
  only where they differ from the template, marks shown but not stored.
- **O5.** The built-in «Avventura» keeps today's placement; Sabaoth's PDF
  hashes must not change.
- **O6.** The mockup of 2026-11-16, states 3, 4, 8 and 10.

## The approved UI

What the mockup shows, for a reader who cannot open it.

- **Sections tab (state 3).** The «In the PDF» cell of «Da non perdere
  stasera», «Orologio» and «Verità del mondo» holds, in this order: the
  dashed fixed tag «Night page», a two-button switch «Main | Side» (a
  `role="group"` labelled «Column», the chosen button filled and
  `aria-pressed="true"`), then «Printed / Left out». Right under the row of
  «A colpo d'occhio» comes an indented row that cannot be edited, moved or
  removed: heading cell «↳ Rivelazioni» (the template's
  `overview.revelations`, disabled input, left padding 24 px), «Needed» cell
  the text «its list», «Used for» cell a lock and «Revelations» (tooltip
  «The list of revelations inside this section»), «In the PDF» cell the tag
  «Night page» and the same switch. Under the table and its note, a **page
  sketch**: a small card titled «Night page · where each part prints», a
  full-width dashed chip with the overview's name, then two columns
  captioned «Main column» and «Side column · 58 mm». Each column lists the
  parts set to it, in the order of the table, the side ones tinted as boxes;
  the side column ends with a dashed chip «[!riquadro|laterale] boxes»; an
  empty main column says «nothing» in italics. A section left out is not in
  the sketch. The sketch follows the switches at once.
- **Scene fields tab (state 4).** A new «In the PDF» column before the
  remove button. The four fields with a column show the same «Main | Side»
  switch; every other field shows a dashed fixed tag with the tooltip «This
  field's place on the scene page is set by the layout». Under the table and
  its note, the sketch «Scene page · where each part prints»: a full-width
  dashed chip «Title · Luogo e momento · In gioco»; the main column with a
  dashed «Da leggere», the fields set to main, a dashed «Boxes, Prove e
  regole, reactions, Se deragliano»; the side column with the fields set to
  side, dashed «Threat sheets» and «[!riquadro|laterale] boxes»; a
  full-width dashed chip «Climax fields and other labels» at the bottom.
- **Starting document.** Each heading or label of a part with a column ends
  with its mark in the monospace accent style: `## Orologio {principale}`,
  `**Da non perdere qui** {laterale}`.
- **Built-in.** Everything above shows, disabled.
- **Update dialog (state 8).** A third checkbox, unticked: «Write the column
  marks where the text has none», with the hint «e.g. «## Orologio
  {principale}»; marks you wrote stay as they are».
- **Marks in the text (state 10).** In the editor a mark shows after its
  heading or label on every line, also off the active line, in 12 px
  monospace in the accent colour with a small left margin. A label with a
  mark keeps the field-label look. A word the app does not know shows amber
  with a wavy underline and the warning «Unknown column «latterale»: write
  principale or laterale. Until then this part prints where the template
  says.» The palette offers «Move to side column» and «Move to main column»
  for the part under the cursor.
- **Change list (states 7 and 8).** A column change reads «…prints in the
  side column».

## Decisions

A1 to A11 are the architect's; each says why.

### A1. The mark's grammar

A mark is `{word}`: an opening brace, optional spaces, one word of letters,
optional spaces, a closing brace. It is read in two places of an adventure
or a one-shot, and nowhere else:

- at the end of a `##` heading: `## Orologio {laterale}`. The space before
  the brace is optional.
- directly after the closing `**` of a bold label that opens a paragraph,
  has no colon, and is followed by nothing else in that paragraph:
  `**Da non perdere qui** {principale}`, and the revelations label
  `**Rivelazioni** {principale}`. The space before the brace is optional.

The words are constants of the format package, not template data:
`laterale` is the side column, `principale` the main one. A word is compared
trimmed and lower-cased. Any other single word in that place is still read
as a mark, with an unknown column (A3).

Not marks, the braces stay text: an inline field (`**Label:** {x}`, or a
label followed by other text), a `###` heading, a list item, a sheet, braces
holding more than one word or no letters, and everything in a campaign
document.

Why constants: one vocabulary in every template, as `|laterale` on a box
reads the same everywhere, and the connector and the syntax sheet can name
the two words without reading a template. Why not inline fields: their text
runs to the end of the paragraph and may end with braces of its own. Why not
campaigns: their headings are never rewritten and their parser has no roles.

### A2. The model holds the mark, the names do not

`packages/format/src/model.ts` gains

```ts
export interface ColumnMark {
  // The word as written, without the braces, trimmed.
  word: string;
  // Null when the word is not one of the two the format knows.
  column: "main" | "side" | null;
  // The braces and what is between them.
  range: Range;
}
```

and `mark: ColumnMark | null` on `Section` and on `SceneField`, and on
`Model`

```ts
// The bold label of the revelations list in the overview, when the list has one.
revelationsLabel: { labelRange: Range; mark: ColumnMark | null } | null;
```

The parser strips the mark before anything reads the text:

- `readSection` takes the mark off the heading text before `matchSection`,
  so `Section.heading`, `Section.id` of an unknown section, outline titles,
  connector targets and titles (`targets.ts:70`) and every check message
  that quotes a heading never hold it. `headingRange` stays the whole
  heading line.
- `readScene`: a label with no colon whose rest is exactly a mark is a block
  field: `form: 'block'`, `text: ''`, `mark` set, and the list or table
  after it attaches as today. `labelRange` stays the bold text.
- `readRevelations` accepts the label with a mark and reports the label's
  range and mark; `readSection` stores it in `model.revelationsLabel` (the
  first one found). A label paragraph that is alone (the bold label, an
  optional mark, nothing else) sets `revelationsLabel` also when no list
  follows it (A7); it gives no revelations.
- `parseCampaign` is not touched.

Why strip in the parser: a mark is a setting, not part of a name. Every
reader of `heading` (the outline, `findTarget`, `sectionNamed`, the update
dialog, check messages) would otherwise have to strip it again, and one that
forgot would break silently.

The overview keeps the label paragraph among its `blocks`, with the mark in
its text, as today's label is kept; the layout already drops that paragraph
(`input.ts:633`).

### A3. Two warnings, nothing blocked

A new check, `packages/format/src/checks/columns.ts`, added to the list in
`checks/index.ts`. Both are warnings; the part prints where the template
says.

- `column.unknown`, at the mark's range, on a part that has a column:
  «Unknown column «latterale»: write principale or laterale. Until then this
  part prints where the template says.» Fixes: «Write {principale}» and
  «Write {laterale}», each replacing the mark.
- `column.ignored`, at the mark's range, on a `##` section or a block field
  that takes no column (`## Indizi {laterale}`, an own section, an own
  field, «Regole della situazione»), whatever the word: «"Indizi" takes no
  column: the mark {laterale} does nothing here.» Fix: «Remove the mark»,
  deleting the mark and the spaces before it.
- `column.ignored` also on a scene heading whose title ends with one of the
  two known words in braces (`### S1. Il molo {laterale}`), at the heading's
  range, with the message «A scene heading takes no column: {laterale} is
  printed as part of the title.» and no fix. A `###` heading is never
  stripped (A1), so other braces in a scene title stay silent.

Why warnings: checks never block (project rule), and a wrong word must not
move anything. Why the scene heading case: the owner will try it once, and a
title printed with braces and no word of explanation reads as a bug.

### A4. Template data and the one resolver

Schema (`template/schema.ts`), all optional, absent meaning the default:

```ts
// sectionSchema.pdf
column: z.enum(['main', 'side']).optional(),
// sceneFieldSchema
column: z.enum(['main', 'side']).optional(),
// adventureSchema.overview
overview: z.object({ revelations: label, column: z.enum(['main', 'side']).optional() }),
```

Refusals, each with its path:

- `sections[n].pdf.column` on an adventure section whose role is not
  `reminders`, `clock` or `truths`, own sections included: «only the night
  page's parts take a column». The existing early return for own sections
  (`schema.ts:197`) must not skip this.
- `sections[n].pdf.column` in a campaign template: «campaigns have no
  columns».
- `sceneFields[n].column` on a field whose role is not `mustHave`,
  `happens`, `cast` or `clues`, fields without a role included: «only the
  fields the scene page lays out take a column».

Defaults, never stored: `reminders` side, `revelations` side, `clock` main,
`truths` main, `mustHave` side, `happens` main, `cast` side, `clues` main.
They are today's places, so `avventura@1` needs no data change and no new
version.

A new file `packages/format/src/template/placement.ts`, exported from
`index.ts`:

```ts
export type Column = "main" | "side";
export type NightPart = "reminders" | "revelations" | "clock" | "truths";
export type ScenePart = "mustHave" | "happens" | "cast" | "clues";
export type PlacedPart = NightPart | ScenePart;

export const COLUMN_WORDS: Record<Column, string>; // main: 'principale', side: 'laterale'
export const NIGHT_PARTS: readonly NightPart[]; // revelations, reminders, clock, truths
export const SCENE_PARTS: readonly ScenePart[]; // mustHave, happens, cast, clues
export const DEFAULT_COLUMN: Record<PlacedPart, Column>;

// The column a word names, null for any other word. Trimmed, lower-cased.
export function columnOfWord(word: string): Column | null;
// '{laterale}' or '{principale}'.
export function columnMark(column: Column): string;
// The part a section or a scene field is, by its role; null for the others.
export function nightPartOf(
  role: SectionRole | null | undefined,
): NightPart | null;
export function scenePartOf(
  role: SceneFieldRole | null | undefined,
): ScenePart | null;
// What the template says: its stored value, else the default.
export function templateColumn(
  template: AdventureTemplate,
  part: PlacedPart,
): Column;
// The effective column: a mark with a known word, else the template's.
export function columnOf(
  template: AdventureTemplate,
  part: PlacedPart,
  mark?: ColumnMark | null,
): Column;
// The template with the part's column set, storing only what differs from
// the default (as withPdf does): setting a column back leaves the JSON as it was.
export function withColumn(
  template: AdventureTemplate,
  part: PlacedPart,
  column: Column,
): AdventureTemplate;
```

`columnOf` is the only place that decides a column. The layout, the
skeleton, the inserts, the update option, the editor's sketch and the
palette all call it or `templateColumn`.

`withPdf` (`pdf.ts:41-51`) must keep `pdf.column` when it rewrites the other
three options, and `withColumn` must keep those three. `sectionPdf` and its
type do not change: the column is not one of its options, so the existing
`'pdf'` change (`changes.ts:140`) does not fire on a column change.

A field with one of the four roles keeps its column when the template sets
its form to `inline`: it prints in that column, but its label takes no mark
(A1), so only the template can move it.

Why defaults left out of the JSON: the built-ins and every stored template
read unchanged, and a switch set back marks no change (row marks compare
JSON, `marks.ts:52`). Why `overview.column` and not a pseudo-section: the
revelations are a list inside a section, the schema already keeps their
label there, and section rows carry requirement and order that a list has
not.

### A5. Where each part prints, and how it looks there

Night page. The overview's text prints full width, as today. Then:

- main column: the parts whose column is main, in the order of the text;
- side column: `reminders` first when it is there, then the other parts
  whose column is side in the order of the text, then the overview's
  `[!riquadro|laterale]` boxes.

Scene page. Within each column the four fields keep one fixed order,
`mustHave`, `happens`, `cast`, `clues`:

- main column: the read-alouds, then the fields whose column is main, then
  handouts, boxes, «Prove e regole», reactions, tables, «Se deragliano», as
  today;
- side column: the fields whose column is side, then the threat boxes, then
  the side boxes. Threat boxes stay in the side column wherever «Chi c'è»
  prints: they come from its sheet references, not from its text.

The look depends on the column, not on the part:

| Part                           | In the side column                                                           | In the main column                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `reminders`, `clock`, `truths` | `side-box(title, { pos("block", from); any-blocks(blocks) })`                | `section-heading(title, from:)` then `any-blocks`; the clock keeps its `show list.item` spacing rule |
| `revelations`                  | `side-box(title, any-blocks(blocks))`, without a `pos`, exactly as today     | `section-heading(title, from:)` then `any-blocks`                                                    |
| `mustHave`                     | `side-box(label, { pos("block", from); field-blocks })`                      | `h3(label)` then `field-blocks`                                                                      |
| `happens`, `cast`, `clues`     | today's cast block: 9 pt, a `label-text` title, `field-blocks`, `below: 3mm` | `h3(label)` then `field-blocks`                                                                      |

Why these orders: with the default columns they give today's sequence in
both columns of both pages, which is what keeps Sabaoth's bytes. Why the
look follows the column: a part moved to the side must fit 58 mm in the
small type, and a part moved to the main column should read like its
neighbours there. No part gets a new look (A11).

One difference from today on a document whose sections are out of the
template's order (already reported as `section.order`): the main column
prints «Verità del mondo» before «Orologio» when the text has them that way,
where today the clock always comes first. Accepted: text order is the rule
the owner can see.

### A6. `LayoutInput` carries the placement by name

`toLayoutInput` decides; the Typst template renders each name.

```ts
// LayoutInput.night gains
main: NightPart[]; // the night parts that print in the main column, in print order
side: NightPart[]; // the same for the side column, reminders first
// LayoutScene gains
main: ScenePart[]; // mustHave, happens, cast, clues order
side: ScenePart[];
```

A part that is null (its section is missing or left out, the scene has no
such field) is in neither list. The existing keys (`night.reminders`,
`night.revelations`, `night.clock`, `night.truths`, `scene.mustHave`,
`scene.happens`, `scene.cast`, `scene.clues`) stay and hold the content; the
template reads `night.at(name)` and `scene.at(name)`. The column of a night
section is `columnOf(template, part, section.mark)`, of the revelations
`columnOf(template, 'revelations', model.revelationsLabel?.mark)`, of a
scene field `columnOf(template, part, field.mark)`.

`night.revelations.from` becomes the offset of the label paragraph when
there is one, else of the list (today it is the overview's start,
`input.ts:657`). The side column prints no `pos` for the revelations, so
this changes no byte there; the main column needs it for the heading's
position.

**An empty side column.** When a page's side column has nothing at all (no
side part, no side box and, on a scene page, no threat box), the main column
prints full width instead of beside an empty 58 mm column, and the night
page does not print the side column's `v(5mm)`. This differs from today only
for a night page or a scene whose side column is empty: today such a page
keeps the narrow main column. Accepted as part of this change, because
moving everything to the main column is otherwise pointless. Sabaoth is not
affected: its night page has reminders and every scene has «Da non perdere
qui».

Why names in the input: «every decision about what goes where is made here»
is the first comment of `input.ts`; the Typst file stays a renderer and the
placement is testable without an engine.

### A7. The skeleton and the inserts write the marks

Both use `templateColumn` and `columnMark`:

- `skeletonDocument` writes `## Da non perdere stasera {laterale}`,
  `## Orologio {principale}`, `## Verità del mondo {principale}` for an
  adventure template: a space and the mark after the heading of each section
  with one of the three roles. A campaign's skeleton has no mark.
- `firstScene` writes `**Da non perdere qui** {laterale}` for a block field
  with one of the four roles; an inline field gets none.
- `insertText` case `'field'` writes `**Label** {word}\n\n- ` for such a
  field, so «This scene», the `/` menu and the palette all do.
- `skeletonDocument` writes the revelations label with its mark,
  `**Rivelazioni** {laterale}` (the template's `overview.revelations` and
  `templateColumn(template, 'revelations')`), as the one block under the
  overview's heading. Today it writes no such label; the agreed mockup's
  starting document has it, and without it a new project's revelations could
  be moved by the template only. The label has no list under it yet, so two
  things follow: the parser sets `model.revelationsLabel` for a label
  paragraph that is alone (bold label, optional mark, nothing else) also
  when no list follows it, and the layout drops such a lone label from the
  overview's printed blocks, so «Rivelazioni» is not printed as loose bold
  text. A label followed by other text and no list stays an ordinary
  paragraph, as today.
- The connector's `fieldText` (`tools.ts:103`) shows the mark for the block
  fields that have a column, and `add_scene`'s description says the marks
  are optional and what they do.

`skeleton.test.ts:107-131` changes on purpose: the three headings and the
three block labels of the first scene gain their marks («Chi c'è» is
optional and is not in the skeleton), and the overview gains the
revelations label with its mark.

Why also when the column equals the default (O3): the mark is how the owner
learns the feature exists, and a later change of the template's default must
not move parts of a document that was written under the old one.

### A8. Template update: a third option, off by default

`UpdateOptions` gains `writeColumns: boolean`. When set, and both templates
are adventures, `updateEdits` parses the text with `from` and adds one edit
for each of these that has no mark at all (`mark === null`; an unknown word
counts as a mark and is left alone):

- a section with one of the three roles: ` {word}` at the end of the
  heading's text, before a closing `#` run if the heading has one;
- a block scene field with one of the four roles: ` {word}` right after the
  label's closing `**`;
- the revelations label, when the document has one: the same.

`word` is `columnMark(templateColumn(to, part))`: the new version's column.
The edits must not overlap a rename of the same heading or label: a renamed
heading gets its mark after the new name. Marks already in the text are
never changed, with or without the option.

The web dialog shows the checkbox when the option would write at least one
mark, unticked, with the mockup's text. The connector's
`update_project_template` gains `writeColumns`, default `false`.

`templateChanges` reports column changes, so the dialogs list them:

- a section or a scene field whose `templateColumn` differs:
  `{ kind: 'changed', what: 'section' | 'field', label, detail: 'column',
before, after }` with `before` and `after` `'main'` or `'side'`;
- the revelations: the same with a new `what: 'revelations'` and the
  label `overview.revelations`.

The web words them «Section «Orologio» prints in the side column», «Scene
field «Chi c'è» prints in the main column», «Revelations list «Rivelazioni»
prints in the main column». A box's `'column'` change keeps its wording.

Why off by default: writing marks freezes every part where the new version
puts it, which is the opposite of what an owner who just changed a column in
the template usually wants (parts without marks already follow the new
version).

### A9. The editors

**Project editor.**

- `cm/preview.ts`: a mark at the end of a `##` heading line, and a mark
  after a bold label that is otherwise alone on its line, gets a `mark` item
  with the class `cm-pm`, plus `cm-pm-bad` when `columnOfWord` gives null.
  It is never hidden, on or off the active line. Such a label keeps `cm-fl`:
  the test at `:210` must count a line that ends with a mark as alone.
  `PreviewConfig` gains `columnMarks: boolean`, true for adventures and
  one-shots, so a campaign shows braces as text.
- The warnings of A3 arrive through the parser's problems like any other
  (`cm/problems.ts`); no special widget.
- Palette: `paletteEntries` gains a third option, `column: Column | null`,
  the effective column of the placeable part under the cursor, null
  elsewhere. With `'main'` the list holds «Move to side column», with
  `'side'` «Move to main column», with null neither: the palette has no
  disabled rows, so a command that cannot run is not listed. The action
  `{ kind: 'column'; to: Column }` writes the mark at the end of the heading
  or after the label, or replaces the mark that is there (also an unknown
  word), as one edit. «Under the cursor» means: the cursor is in a section
  with one of the three roles; or in a block field with one of the four
  roles, from its label to the end of its blocks; or on the revelations
  label or in its list.
- Syntax sheet (`syntax.ts`): a group «Columns» with two rows,
  `{principale}` «Main column» and `{laterale}` «Side column», the note «after
  a ## heading or a block field's label: prints the part in that column,
  whatever the template says», and the names of the parts that take one.

**Template editor.**

- Sections tab: `PdfOptions` shows the «Main | Side» switch between the
  fixed tag and «Printed / Left out» for the three roles;
  `rolePlaces.reminders` becomes «Night page» (the switch says the rest).
  The «↳ Rivelazioni» row follows the overview's row, as «The approved UI»
  describes; it is not a row of `draft.sections` and takes no row mark.
- Scene fields tab: a new «In the PDF» column between «Climax» and the
  remove button; the existing «Used for» column stays. Fixed tags, from
  where `avventura.typ` prints each field: `place` and `inPlay` «Scene
  header» (`:675-702`), `tests` «Framed, main column» (`:717-723`),
  `derail` «End of main column» (`:726-733`), `situation`, `decides` and
  every field without a role «Under both columns» (`:755-765`).
- A new draft action sets a column through `withColumn`; switching back
  leaves no change.
- The sketches under both tables, as described; a new component in its own
  file, fed by `templateColumn` and `sectionPdf(...).print`.
- Starting document: the marks come with the skeleton's text and are styled
  by the same `preview()` extension. `previewMarks` (`marks.ts:110-115`)
  must match a heading without its mark, or the «optional», «not in the
  PDF» and change marks vanish from the three headings.
- Built-in templates: every switch disabled, the sketch shown.
- `changeText`: the wording of A8.

Why the mark is always visible: it is short, and it is a setting the owner
wants to see while reading, unlike `##` or `**`.

### A10. Compatibility

- **An older desktop app.** A v0.21 app reads `**Da non perdere qui**
{laterale}` as an inline field with the text `{laterale}` and reports the
  list under it as `content.unplaced`; its PDF prints the braces and loses
  the list from that box. Section headings are safe there: `matchSection`
  already takes `## Orologio {laterale}`, and the PDF heading comes from the
  template. This lasts until the app updates and affects every project
  created or edited with marks by v0.22. Accepted; the release notes say to
  update the desktop app.
- **An older client saving a template.** Every schema object is a plain
  `z.object`, so an older client drops `pdf.column`, `column` on fields and
  `overview.column` when it reads a body, and a version saved from its
  editor is written without them: the parts go back to the defaults in that
  version. The server keeps the earlier version. Accepted, as for `pdf` in
  `template-pdf-layout`.
- **The connector.** `replace_section` checks only the heading's level, so
  Claude can drop a mark by rewriting a heading without it; the part then
  follows the template. The tool texts say to keep the mark.
- Release v0.22.0.

### A11. Not touched

Campaign layout and campaign templates; own sections' `sideColumn`; the
`column` of a box; the look of any part printed in its default column; any
automatic move, break or shrink of a part that does not fit.

## Risks

Each says how to recognise it. «Report» means: stop, write what you saw in
the hand-back or ask the architect, and do not work around it.

- **Sabaoth's bytes move.** One of the four tests «prints Sabaoth with the
  recorded bytes» in `own-sections.test.ts` fails after a change to
  `input.ts` or `avventura.typ`. The recorded values are never updated in
  this change. Bisect one edit at a time with `npx vitest run
test/own-sections.test.ts -t "recorded bytes" --reporter=default` in
  `packages/layout`. Known from this project: `context {}` around content
  and `layout()` inside a block keep the bytes; `layout(...)` around a whole
  block, and any spacing or leading change on text that wraps, break them.
  The likely causes here: a `pos` added to or removed from a part in its
  default column (the revelations side box has none today), the clock's
  `show list.item` rule applied to more or less than today, the side
  column's `v(5mm)`, a part wrapped in an extra `block`. If the default
  layout cannot be reproduced through the by-name rendering, report it.
- **A mark eats text.** An existing document has a `##` heading that really
  ends with one word in braces, or a bold label alone in its paragraph
  followed by one. You see it as a heading that lost its ending in the
  outline, or as a new `column.ignored` or `column.unknown` warning on a
  fixture that had none. Sabaoth has no `{`. If any other fixture in
  `packages/format/fixtures` or a test document changes its parse, report it
  with the line.
- **The label is no longer «alone».** A check or a web helper that tests a
  block label by «nothing after the bold» (`cm/preview.ts:210`, the `/`
  menu's `existingField`, `slotAnchor`) stops seeing marked labels. You see
  it as a marked label drawn as plain bold, or as an insert offering a field
  the scene already has. Fix the helper; if it is outside your brief's
  files, report it.
- **`withPdf` drops the column.** Toggling «Printed / Left out» on «Orologio»
  resets its switch to the default. Covered by a test in brief A; if it
  shows up in the browser, the web is patching `pdf` without `withPdf`.
- **The update option overlaps a rename.** Two edits touch the same heading
  line and the document comes out with a mangled heading. `updateEdits`
  promises edits that do not overlap (`update.ts:64`); test the rename and
  the mark on the same heading.
- **Old starting text in tests.** Tests and e2e specs across the packages
  quote the skeleton («**Da non perdere qui**» with nothing after it). They
  fail on the new text. Update the expectation when the test is about the
  starting document; when a test wrote its own document by hand, leave the
  text without marks: that is the existing-document case and must keep
  passing unchanged.
- **Two briefs, one file.** B and C own different files (tasks.md). If you
  need a change in a file of the other brief or of the contract, report it.
- **The engine keeps vitest alive.** One Typst engine per test file, as the
  comment at `own-sections.test.ts:13` says.

## How it is verified for real

- **Unit tests** in `packages/format`, `packages/project`, `packages/layout`
  and `packages/web`, listed per task.
- **Sabaoth's four hashes** equal the values of task 0.1, before and after
  brief B.
- **PDF renders as PNGs** (brief B), of an invented fixture written for this
  change, never the owner's content:
  1. the default columns and no mark;
  2. the same text with marks that move a part each way on the night page
     and in one scene;
  3. a template that moves parts, with no mark in the text;
  4. a night page with every part in the main column, printing full width;
  5. the owner's «Fair Play» case rebuilt with invented text: a long «A
     colpo d'occhio», a long «Rivelazioni» list. With the default it shows
     the problem (the revelations box alone on the next page); with
     `**Rivelazioni** {principale}` the list follows the overview on the
     night page and no page holds a lonely box.
- **e2e** (brief C): the template editor's switches and sketch, a project
  created from a template with a moved part whose document carries the
  marks, the editor's mark and palette command, the update option.
- **Screenshots** (brief C, 1440 x 900, light and dark where the mockup
  differs): the states of «The approved UI».
- **The owner looks** at the PNGs and screenshots before the merge, and at
  the running stack for the editor.

## Accepted departures

Brief A (format and project), accepted by the architect on 2026-11-16:

1. A2 said the first revelations label found is `model.revelationsLabel`. A
   label with a list under it wins over an earlier lone label, so a stray
   lone label cannot decide where the real list prints.
2. A lone label counts only with no colon and nothing but an optional mark
   after it: a lone `**Rivelazioni:**` gives no `revelationsLabel`.
3. With `writeColumns`, a night section heading that the update adds also
   gets its mark (A8 named only parts already in the text).
4. `writeColumns` writes no mark after a revelations label that has a colon
   or text after it, even with a list under it (the mark would not be read
   and every later update would write it again), nor on a part the new
   version renamed while the text keeps the old name. The palette command of
   A9 follows the same rule: it is not offered on such a label.
5. The mark grammar lives in `packages/format/src/parse/marks.ts`
   (`headingMark`, `labelMark`). A brace escaped with a backslash is never a
   mark.
6. `column.ignored` quotes the mark as written, spaces included.

Brief B (layout), accepted by the architect on 2026-11-16:

1. `Position` gains an optional `x` (points from the left edge), recorded by
   `pos()` in `avventura.typ`, so tests can tell the column a part printed
   in. The PDF bytes do not change.
2. Full width is tested by height (the same content with and without a side
   box), since positions carry no width.
3. «No mark in the PDF» is asserted on the layout input; the real PDF text
   was checked with `pdftotext` on the proof builds.
4. The layout leaves out every lone revelations label in the overview, not
   only the starting document's, and a label that prints over a list without
   revelation ids prints without its mark. `input.ts` mirrors the label
   grammar with its own regular expression, because `parse/marks.ts` is not
   exported.

Known and left: when the first labelled list under the overview has no
revelation ids and a later one has them, the first label's mark decides the
later list's column.

Brief C (web, server, e2e), accepted by the architect on 2026-11-16:

1. The page sketches list the parts in print order (A5), not in the table's
   order as the mockup drew them: the night side column starts with the
   reminders.
2. The palette's «Move to … column» comes after the other commands, so
   Ctrl+K then Enter keeps doing what it did.
3. The sketch's fixed chips are read from the template (the side boxes, the
   read-aloud label, the header and main-column field labels), and an
   overview left out drops its chip and the revelations.
4. Row marks compare rows as JSON with sorted keys, so a switch set back
   shows no change.
5. The switch group's accessible name is «Column: <name>»; the syntax sheet
   names the parts in the group's title.
6. The e2e steps of task 12.3 live in `e2e/templates.spec.ts`.
7. `packages/server/test/db/templates.test.ts` quoted the starting document
   and was updated here: brief A had run without a database.
8. The sketch's full-width row uses the class `sk-full`: the mockup's `full`
   collides with the sign-in overlay's global class.

Fixed by the architect at review: `bareLabel` in
`packages/project/src/update.ts` took any numbered line or an empty bullet
as the start of a list; only a bullet with text or an item numbered 1 ends
a paragraph, as the web copy already had it. The two copies of
`headingTextEnd` and `bareLabel` (project and web) are left as they are.

## Open questions

None. Two points the draft left open were settled by the architect on
2026-11-16: a new project starts with the revelations label and its mark
(A7, as the agreed mockup draws it), and the fixed tag of «In gioco» keeps
the mockup's «Scene header».
