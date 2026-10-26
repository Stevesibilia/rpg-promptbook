## Context

Plan p17, change 3 of 4, for issue #34. The owner agreed the mockup
[docs/mockups/templates.html](../../../docs/mockups/templates.html); its
Sections tab (`renderEditorPane`, lines ~546-560), `ROLE` (~363-368), the
preview's «not in the PDF» tag (~628), the change text (~445) and `NOTES`
(~761-778) hold the agreed «In the PDF» column. Change 2's archived design
(`openspec/changes/archive/2026-10-25-template-editor/design.md`) explains
uids, `templateChanges`, the draft and the editor; its D20 made PDF
headings come from the template.

One brief builds this change.

### The code today

- **Section schema**: `sectionSchema` in
  `packages/format/src/template/schema.ts:48-57` (`name`, `heading?`,
  `requirement`, `role?`, `uid?`), plain `z.object`, so unknown keys are
  stripped. Adventure `superRefine` at `:160-184`, campaign at `:189-198`.
  Nothing about the PDF.
- **Parser**: a heading the template names without a role gives a `Section`
  with `known: true, role: null`, its content in `blocks`
  (`packages/format/src/parse/sections.ts:46-110`). A heading the template
  does not name gives `known: false` and `section.unknown`.
- **Layout**: `toLayoutInput` (`packages/layout/src/input.ts:400-518`) finds
  sections only by role (`role(name)`, `:411`), so own sections never reach
  the PDF. `LayoutInput` (`:125-171`): cover, night, start, rules, scenes,
  references (clues, npcs, sheets, pregenerated, before). The appendix is
  never read.
- **Typst**: `packages/layout/typst/avventura.typ`. `section-heading(title,
from:, breaking:)` (`:176`) has an unused `breaking` flag;
  `columns-part(main, side)` (`:237`) is the 58 mm side column; the rules
  part (`~:389-399`) prints full width without side boxes and
  `columns-part` with them. Parts break with `pagebreak(weak: true)`.
  Positions of kind `part` with a `label` name the review's thumbnails
  (`packages/web/src/editor/pdf/pages.ts:77`).
- **Callout check**: `allowed()` in `packages/format/src/checks/callouts.ts:20`
  lets a box into a role-less section only with `anySection`;
  `[!riquadro|laterale]` is `allowedIn: ['scene', 'overview', 'rules']`
  (`packages/format/src/template/avventura.ts:101`).
- **Changes**: `templateChanges` compares sections in `sections()`
  (`packages/format/src/template/changes.ts:118-135`); the web words each
  change in `packages/web/src/templates/changes.ts:44-75`.
- **Editor**: the Sections tab is `SectionsTab` in
  `packages/web/src/templates/TemplateRows.tsx:213-288`; grid `.g-sec` in
  `packages/web/src/templates/templates.css:210-212`; edits through
  `patch()` (`TemplateRows.tsx:209`, `draft.ts:164`); row marks by JSON
  (`marks.ts:29-54`); preview marks and the «optional» widget in
  `marks.ts:66-105` and `StartingPreview.tsx:16-42`.

## Goals / Non-Goals

**Goals:** own sections print; the mockup's «In the PDF» column with its
three options; role sections can be left out; the preview and the save
dialog show the options; Sabaoth's PDF keeps its bytes.

**Non-Goals:** printing sections the template does not know; PDF options for
campaigns; options that change a role section's layout (it keeps its place);
connector tools (change 4).

## Decisions

### D1. `pdf` on the section, defaults left out of the JSON

`sectionSchema` gains

```ts
pdf: z.object({
  print: z.boolean().optional(),
  newPage: z.boolean().optional(),
  sideColumn: z.boolean().optional(),
}).optional(),
```

and `packages/format` exports
`sectionPdf(section: SectionDefinition): { print: boolean; newPage: boolean;
sideColumn: boolean }` with the defaults: `print` true (false, always, for
the `appendix` role); `newPage` true for an own section; `sideColumn`
false. For a role section `newPage` and `sideColumn` read false: its place
is the layout's.

The adventure `superRefine` refuses, with a path and a message:
`pdf.newPage` or `pdf.sideColumn` on a section with a role («only your own
sections take this option»), any `pdf` on the appendix role («the appendix
is never printed»). The campaign `superRefine` refuses any `pdf` («campaigns
have no PDF»).

The editor stores only what differs from the default: a `withPdf(section,
patch)` helper in `packages/format/src/template/pdf.ts` (beside
`sectionPdf`) applies a patch, drops keys equal to the default, and drops
`pdf` when it is empty.

Why: absent means default, so the built-ins and every stored v0.13 template
read unchanged, Sabaoth's bytes stay, and toggling an option back marks no
change (row marks compare JSON). Rejected: `pdf` with every key required,
which would rewrite every stored body; flat keys on the section, which mix
layout with what the checks read.

### D2. Own sections print after their anchor's part

An own section is a model `Section` with `known: true` and `role: null`. Its
**anchor** is the nearest section before it in `model.sections` that has a
role; none means the cover. The anchor's role picks a **slot**, printed at
the end of that part:

| Anchor role                                | Slot         | Prints after                       |
| ------------------------------------------ | ------------ | ---------------------------------- |
| none, `synopsis`, `backstory`              | `cover`      | the cover's synopsis and backstory |
| `overview`, `reminders`, `clock`, `truths` | `night`      | the night's two columns            |
| `strongStart`, `sceneMap`                  | `start`      | the start page                     |
| `rules`                                    | `rules`      | the rules part                     |
| `scenes`                                   | `scenes`     | the last scene                     |
| `clues`, `npcs`, `sheets`                  | `references` | the sheets, before «Pregenerati»   |
| `before`                                   | `before`     | «Prima della sessione»             |
| `appendix`                                 | `end`        | everything                         |

Within a slot, own sections keep document order. The anchor counts even
when it is left out (D4).

Why: the PDF's parts have a fixed order, while the issue asks for document
order; anchoring to the section before keeps the owner's intent («Atmosfera»
written after «Inizio forte» prints after the start page) without letting
an own section split a part's two columns. Rejected: one slot at the end
(loses document order); a slot after every role section (night and
references print their sections in columns and side boxes, where a full
own section has no room).

Sections the template does not know (`known: false`) do not print, as
today. Why: they already carry `section.unknown`, and a misspelt role
heading («Indizzi») would print as a stray part.

### D3. `LayoutInput.own` and the Typst part

```ts
export type OwnSlot =
  | "cover"
  | "night"
  | "start"
  | "rules"
  | "scenes"
  | "references"
  | "before"
  | "end";
export interface LayoutOwnSection extends LayoutPart {
  newPage: boolean;
  // Empty unless the section prints with a side column.
  sideBoxes: LayoutBlock[];
}
// on LayoutInput:
own: Record<OwnSlot, LayoutOwnSection[]>;
```

`title` is the template section's `heading ?? name` (as D20 of change 2).
With `sideColumn`, the section's side boxes (`box(b)?.side`) go to
`sideBoxes` and leave `blocks`, as for the rules; without it, they stay in
`blocks` and print in the text's flow.

In `avventura.typ`, one function prints a slot, called at each of the eight
places in the table:

- `newPage` → `pagebreak(weak: true)` and a `pos("part", from, id:
"own-<n>", label: title)` so the review shows a thumbnail label; without
  it, only the heading's `pos("block", …)` as `section-heading` does.
- `section-heading(title, from: from)`, then the blocks full width, or
  `columns-part(any-blocks(blocks), { for b in sideBoxes { callout(b) } })`
  when `sideBoxes` is not empty: the rules part's code, shared.

The `cover` slot prints inside the justified block of the cover, after the
backstory.

### D4. Role sections left out

`role(name)` in `toLayoutInput` returns `undefined` for a role whose
template section has `print: false`, so the part prints as when the
document lacks that section. Two places print a heading without the
section and change:

- the night prints `overviewTitle` only when `overview` is not null or a
  revelation, side box, reminder, clock or truth is left to print. When
  «A colpo d'occhio» is left out, its revelations and side boxes go with it.
- the references part (its page break, `pos`, `part-mark`) prints only when
  clues, NPCs, sheets, «Pregenerati», «Prima della sessione» or the
  `references` slot has something.

Leaving out «Scene» drops every scene page; the tabs then hold «Notte» and
«Schede» only. Leaving out «Schede» drops the sheets and «Pregenerati»;
sheet references then print without a page number (the link has no
target): `sheetLabel` targets must not be emitted when the sheets are out,
or Typst fails on a missing label. See Risks.

Why: one place decides, and the Typst template stays declarative.

### D5. Side boxes in an own section

`callout.place` is not reported for a callout whose definition has
`column: 'side'` in a section whose template definition has
`sectionPdf(...).sideColumn` true. `Where` gains the section definition
(or the check looks it up by the model section's `name`). Other boxes keep
today's rule.

Why: «Side column» exists to hold these boxes; warning about them would
contradict the option. Rejected: a new place `sideColumn` in `allowedIn`,
which the owner would have to add to the box by hand.

### D6. The save dialog and update

`TemplateChange['detail']` gains `'pdf'`, reported by `sections()` when
`sectionPdf(from)` and `sectionPdf(to)` differ; the web words it «PDF
options of «X»» (mockup line ~445). `updateEdits` ignores it: the document
needs no edit.

### D7. The «In the PDF» column

As the mockup, between «Used for» and the remove button, header «In the
PDF», empty header and cells for a campaign:

- Role section: a fixed tag with the role's place (mockup `ROLE[role][1]`:
  Cover, Night page, Night page, side, Start page, Own page, side boxes, A
  page per scene, References, Not printed), tooltip «This section's place in
  the PDF is set by the layout», then a «Printed / Left out» toggle, except
  for the appendix.
- Own section: «Printed / Left out»; when printed, «New page» and «Side
  column».
- Toggles are buttons with `aria-pressed`, styled as the mockup's `.tg` and
  `.tg.on`, disabled read-only (built-ins).
- The footer text becomes the mockup's: «Renaming a section with a role
  keeps it working: the checks and the PDF follow the role. Sections you add
  print in document order, with the options you set.»; campaigns: «Campaigns
  have no PDF yet; their sections are checked for presence only.»
- The preview adds a «not in the PDF» widget after a `## ` heading whose
  section is the appendix or left out (adventures only), styled as the
  «optional» one.

The grid gains a column; check the row still fits at 1440 px and the narrow
layout the tab already has.

## Risks

- **Sabaoth's bytes.** The built-ins gain no `pdf`, so the PDF must not
  change. Record the hash on `main` first (task 0.1); if it differs on the
  branch, report it with the cause, do not update the recorded value.
- **Missing labels in Typst.** `references.sheets` is built from
  `model.sheets`, not from the role (`input.ts:493`); with «Schede» left out
  it must be empty. Sheet labels are then used without a target by
  `linkReferences` (`input.ts:238`, `→ [X](#sheet-…)`, then `page-of` at
  `avventura.typ:160`) and by the threat box's «scheda completa, p. N»
  (`input.ts:323`, `avventura.typ:431`). With the sheets out, print the
  reference as plain text and the threat box without that line. If that is
  not contained to the layout package, report it before working around it.
- **Old desktops.** A v0.13 desktop strips `pdf` when it reads a body, and
  saving from its editor would write a version without the options. Accept
  it: the server keeps both versions. Say so in the hand-back if you see
  another path where a reader rewrites a body.
- **Two Typst engines in one vitest file** keep the process alive after the
  tests pass; kill it, do not add a teardown hack to the engine.

## Verification

- Format tests: defaults, refusals, `withPdf`, the `pdf` change.
- Layout tests (pure, `input.test.ts`): anchors and slots for every row of
  D2's table, own before any role section, unknown section not printed,
  side column split, each role left out.
- Layout PDF test (one engine): Sabaoth with an own section «Atmosfera»
  after «Inizio forte» prints it after the start page on its own page; with
  «New page» off, on the same page; Sabaoth's default hash unchanged.
- e2e (`e2e/templates.spec.ts`): in an own template, add «Atmosfera», leave
  out «Prima della sessione», save; a new project from it with text under
  «Atmosfera»; the saved PDF's text (`pdfTexts`) has «Atmosfera» and not
  «Prima della sessione».
- Screenshots for the architect (1440 x 900): the Sections tab of an own
  template with an own section showing all three toggles, a role section
  left out, the built-in read-only, a campaign (no column), the preview with
  «not in the PDF», the save dialog listing «PDF options of …», and the PDF
  review on the own section's page with a side column.

## Departures accepted at review

All accepted; the architect compared the screenshots (Sections tab light
and dark, built-in, campaign, preview, save dialog, PDF review) with the
mockup.

- `LayoutInput.references.print` is computed in `input.ts`, not in Typst,
  so every decision stays in one place (D4). `night.overviewTitle` is
  `string | null`.
- The «Schede» tab shows only when the references part prints, so a
  document with nothing in the references has no references page; the
  Sabaoth test «a document with almost nothing in it» now expects the parts
  `cover` and `night`.
- With «Schede» left out a reference prints «→ Tenente Donato»: the arrow
  stays, «Schede:» goes.
- An own part's position id is `own-<from offset>`.
- Own sections in the cover keep the page break before the night.
- The `pdf` change's before and after read «printed, new page», «left out»
  and so on.
- `pdfAction` in `web/src/templates/draft.ts` patches `{ pdf:
withPdf(...).pdf }`; toggles are named «In the PDF, X», «New page, X»,
  «Side column, X» with `aria-pressed`.
- The `.g-sec` grid is `44px 1fr 118px 132px 212px 30px` (the mockup's
  `112px 150px` did not fit three toggles at 1440 px); the narrow layout's
  minimum width for that grid is 760 px.
- The callout check finds a section's definition by the model section's
  name, for known sections only.

Proofs beyond the plan: the side column in the engine both ways (a box
written after the second paragraph prints beside the first with «Side
column», below the text without).

Not verified: the Sections tab below 760 px; a v0.13 desktop reading a body
with `pdf` (read by code: server and desktop parse bodies through
`defineTemplate`, which strips it); Node 26 separately.

Seen, not changed: an empty «Regole della notte» from the skeleton still
prints an empty page, as before this change.
