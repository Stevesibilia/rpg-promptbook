## Context

Issue #55. The owner agreed the mockup
[docs/mockups/campaign-pdf.html](../../../docs/mockups/campaign-pdf.html):
view 1 is the editor with the campaign open and the PDF pane, view 2 the
review, view 3 the built-in «Campagna» v2 in Settings. Its pages (lines
459-681) are drawn after `avventura.typ`'s sizes; its «Decisions to agree»
panel (lines 444-454) lists what the owner agreed; `SEED` and `KEYS`
(lines 831-835) hold v2's sections and keys; `renderTemplate` (line 839)
the template editor's states; `paneShow` (line 766) the pane's caption.

Owner answers: full release; campaign sections get the per-section PDF
options; own sections only, linked adventures not included; the mockup is
drawn from the owner's real campaign.

Two briefs build this change: brief A the format and layout packages
(groups 0-4), brief B the web, server and e2e (groups 5-8).

### The code today

- **The PDF** is built only in the browser worker
  (`packages/web/src/editor/pdf/pdf.worker.ts`: `inputOf` runs
  `toLayoutInput(parseAdventure(text, { template }).model, …)`, then
  `engine.build` or `engine.pdf`). The desktop app loads the same worker. No
  server route builds a PDF.
- **Campaigns are kept out**: `EditorPage.tsx:62`
  `const checked = meta.category !== 'campaign'` gates the pane (`:82`), the
  builds (`:108`), ⌘⇧P (`:180`) and the button (`:355`);
  `paletteEntries(items, { checked })` (`palette.ts:29`, `:47`) gates the
  palette's PDF entries. `useProjectTemplate` (`TemplatesContext.tsx:42`)
  answers `adventureTemplateOf(...)`, the built-in adventure for a campaign.
  `PdfSource.template` is an `AdventureTemplate` (`protocol.ts:12`), as are
  `usePdf`'s (`usePdf.ts:32`, `:85`) and `PdfReview`'s (`PdfReview.tsx:60`).
  `parsePdfOptions` (`options.ts`) always answers the default
  `template: 'avventura@1'`.
- **Layout**: `TEMPLATES` maps `'avventura@1'` to `/avventura.typ`
  (`engine.ts:47`); `prepare` writes `/main.typ` importing the function
  `avventura` (`engine.ts:157`); `typstFiles` lists the Typst files
  (`assets.ts`); `LayoutOptions.template` is `'avventura@1'` only
  (`input.ts:28`). `layoutChecks` (`checks.ts`) reads only `scene` and
  `scene-end` positions.
- **`avventura.typ`**: only the colours and fonts (`:12-25`), `pos` (`:28`),
  `part-mark` (`:36`), `page-mark` (`:41`) and `label-text` (`:51`) are at
  top level. Everything else is inside the closure `#let avventura(input)`
  (`:53`), because it reads `ink-saver` or `tint`: `page-of`, `checkbox`,
  `layout-table`, `h3`, `label-pars`, `md` (the cmarker wrapper, which maps
  every Markdown heading to `h3`), `blk`, `section-heading`, `side-box`,
  `callout`. The page setup, footer and tabs are at `:272-313` (a tab is
  18 mm tall when its label is longer than three bytes, else 10 mm), the
  cover at `:317-358`, the scene header with its 36 pt ID and 22 pt title at
  `:661-680`.
- **Templates**: `sectionSchema` (`schema.ts:48-66`) has
  `pdf { print, newPage, sideColumn }`; the campaign schema (`:213-225`)
  refuses any `pdf` («campaigns have no PDF») and accepts any section role.
  `sectionPdf` and `withPdf` (`pdf.ts`) know adventure defaults only.
  `campagna` v1 (`campagna.ts`): keys titolo (title), sistema (system),
  formato, autore, copyright, licenza; sections Premessa, Fronti, PNG
  ricorrenti, Fili aperti, Sessioni, no roles. `builtinTemplates`,
  `resolveTemplate` (exact id and version) and `defaultTemplateRef` are in
  `registry.ts`. Locks (`locks.ts`) refuse a role that the base version
  lacks.
- **Places that assume one built-in per id**: `web/src/templates/list.ts:91`
  (one list entry per built-in), `TemplateEditor.tsx:35` (`find` by id),
  `server/src/mcp/templates.ts:62` (`latestVersion` answers 1 for a
  built-in), `:201` (`list_templates`, one entry per built-in), `:239`
  (`get_template`). Places that read a project recording no template as
  `defaultTemplateRef`: `project/src/template.ts:46` (`readTemplateRef`)
  and `server/src/templates.ts:158-161` (`templateUsage`). The others
  (`list.ts:62`, `mcp/templates.ts:57`, `:79`, `server/src/templates.ts:145`,
  `desktop/src/main/templates.ts:65`, `project/src/settings.ts:47-48`,
  `skeleton.ts:79`, `doc.ts:164`) use the id only or want the latest
  default, and stay right with v2.
- **The template editor**: `PdfOptions` (`TemplateRows.tsx:256-300`) and
  the campaign branch of `SectionsTab` (`:304`, `:315`, `:358`, the note at
  `:373-375`); `previewMarks` marks «not in the PDF» for adventures only
  (`marks.ts:79`); the banner of a built-in (`TemplateEditor.tsx:202-205`).
- **The parser**: `parseAdventure` splits at `##` and reads each section
  with `matchSection` (`parse/sections.ts:22`); `toBlock` (`parse/blocks.ts`)
  turns a node into a block (a `>` quote into `quote`, a `> [!type]` line
  into `callout`, a heading into `heading`). `ParseContext.template` is an
  `AdventureTemplate`; `readFrontMatter` (`parse/frontmatter.ts`, not
  exported) reads only `template.meta`.
- **The owner's campaign** (project `10ee1b2b-…`, read with the connector's
  `get_project` and `get_template` on 2026-11-07) does not use `campagna@1`:
  it uses the owner's own template «Campagna a fronti» (`t-u9cjaveeg4`) v2,
  copied from «Campagna», with the same thirteen headings as v2 below, no
  roles and no PDF options.

## Goals / Non-Goals

**Goals:** a campaign's PDF as the mockup draws it, with the adventure's
preview, review, save and print; campaign templates with PDF options;
«Campagna» v2; Sabaoth's four hashes unchanged.

**Non-Goals:** linked adventures in the PDF; checks for campaigns; an update
path from `campagna@1` to v2; changes to the adventure's PDF, the adventure
template, the connector's reading and writing of campaign documents, the
desktop main process or the server routes.

## Decisions

### D1. What a campaign's PDF prints

Every `##` section of the document, in document order, whether the
template lists it or not: campaigns are free-form and never checked, and
skipping unknown sections as adventures do would drop most of a real
campaign. A heading matches a template section by `matchSection`, as for
adventures. A section does not print when it is the appendix (role
`appendix`) or its template section is «Left out» (D3). Linked adventures
are not included: the PDF is the campaign document's own.

Front matter: the keys `sistema` and `formato` print on the grey line above
the title, each only when set, as `**Sistema:** X · **Formato:** Y`; the
title is the value of the title-role key, else the project's title; `autore`,
`copyright` and `licenza` print on the credits line and in the footer
exactly as the adventure prints them (`toLayoutInput`'s `authors`,
`licenceShort`, `licenceUrl`). Other keys do not print.

Every section prints under its heading as written, known or not: a campaign
is free-form, and a prefix match («## Archi narrativi» matches «Archi») must
not rewrite what the owner wrote. The matched template section gives only the
PDF options and the appendix role. _(Changed in review of brief A.)_

Text before the first `##`, other than the front matter, prints untitled
after the contents box, with no tab and no contents entry: nothing is
dropped silently. _(Drafter's addition.)_

### D2. Built-in «Campagna» v2

`template/campagna.ts` keeps `campagna` (v1) unchanged and adds `campagnaV2`
(`id: 'campagna'`, `version: 2`, `name: 'Campagna'`), meta as v1, every
section optional, in this order:

| Section                | PDF                                                                    |
| ---------------------- | ---------------------------------------------------------------------- |
| Premessa               |                                                                        |
| Verità del mondo       |                                                                        |
| Fronti                 | `newPage: true`                                                        |
| Fazioni                |                                                                        |
| PNG ricorrenti         | `newPage: true`                                                        |
| PG e agganci           |                                                                        |
| Archi                  | `newPage: true`                                                        |
| Finali possibili       |                                                                        |
| Fili aperti            | `newPage: true`                                                        |
| Temi e motivi          |                                                                        |
| Prima della campagna   |                                                                        |
| Aggiornamenti          |                                                                        |
| Appendice (`appendix`) | `heading: 'Appendice: stile visivo e sonoro'`, never printed, no `pdf` |

`builtinTemplates` becomes `[avventura, campagna, campagnaV2]`;
`templates` in `index.ts` gains `campagnaV2`. `defaultTemplateRef('campaign')`
answers v2, so new campaigns (skeleton, `createProjectDoc`, the server's
`templateForNewProject`, imports, the seed) get v2.

Why: a project keeps the version it records, and built-ins never change in
place. Rejected: changing v1 in place, which would change every existing
campaign's sections and PDF at once.

### D3. Campaign section PDF options

The campaign `superRefine` (`schema.ts:213`) changes:

- a section's `pdf.print` and `pdf.newPage` are accepted;
- `pdf.sideColumn` is refused at `sections.<n>.pdf.sideColumn`, «campaigns
  have no side column»: campaign sections have no side boxes;
- any `pdf` on the `appendix` role is refused at `sections.<n>.pdf`, «the
  appendix is never printed», as for adventures;
- a role other than `appendix` is refused at `sections.<n>.role`, «a
  campaign section takes no role but the appendix». **New**: today the
  campaign schema accepts any role. No stored campaign template can hold
  one: copies of v1 have none and the locks refuse a role the base version
  lacks.

`sectionPdf(section, kind)` and `withPdf(section, patch, kind)` take the
template's kind (`Template['kind']`, required, so no caller can forget it).
Adventure results are unchanged. Campaign defaults: `print` true (false,
always, for the appendix), `newPage` false, `sideColumn` false always.
`withPdf` drops what equals those defaults. Callers pass the kind:
`checks/callouts.ts:27`, `template/changes.ts:121` and `:140`,
`layout/src/input.ts:573` and `:603`, `web/src/templates/TemplateRows.tsx:267`,
`draft.ts:34`, `marks.ts:79`. `templateChanges` words a campaign's options
«printed», «printed, new page» or «left out».

A section the template does not list prints, flowing (no new page).

Why flowing by default: a campaign document is many short sections; a page
each would waste most of the paper, and the template says where breaks
belong.

### D4. Built-ins with two versions

`registry.ts` gains:

- `latestBuiltin(id): Template | undefined`: the highest version of a
  built-in id;
- `builtinVersions(id): Template[]`: its versions, oldest first;
- `implicitTemplateRef(kind): TemplateRef`: what a project that records no
  template reads as, `avventura@1` or `campagna@1`. _(Drafter's addition:
  without it, `readTemplateRef` (`project/src/template.ts:46`) and
  `templateUsage` (`server/src/templates.ts:158-161`) would move every
  campaign that records no template to v2 silently, against D2's rule.)_

`resolveTemplate` stays exact. Each place in «The code today» that looks a
built-in up by id or kind changes:

| Place                                     | Change                                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `web/src/templates/list.ts:91`            | one entry per built-in id, at `latestBuiltin` (one «Campagna», v2)                                                                                                             |
| `web/src/templates/TemplateEditor.tsx:35` | opens `latestBuiltin(id)`                                                                                                                                                      |
| `server/src/mcp/templates.ts:62`          | `latestVersion` answers `latestBuiltin(id).version`                                                                                                                            |
| `server/src/mcp/templates.ts:201`         | `list_templates`: one entry per built-in id, `version` the latest, `versions` every one                                                                                        |
| `server/src/mcp/templates.ts:239`         | `get_template`: the asked version among `builtinVersions`, else the latest; `latestVersion` the latest                                                                         |
| `project/src/template.ts:46`              | `readTemplateRef` falls back to `implicitTemplateRef`                                                                                                                          |
| `server/src/templates.ts:158-161`         | `templateUsage` counts a row without a template as `implicitTemplateRef`                                                                                                       |
| `server/src/templates.ts:147`             | comment «one version each» corrected; the code stays                                                                                                                           |
| `server/src/mcp/tools.ts:287`             | unchanged: `latestVersion` is what `update_project_template` can move the project to, so a project on `campagna@1` reads 1 (no update path from a built-in version, see below) |
| `project/src/skeleton.ts:73-75`           | comment «(avventura@1, campagna@1)» corrected                                                                                                                                  |

`duplicate_template` and `create_project` without a version go through
`refOf`, so they get v2. `templateOf`'s fallback for a template the device
does not hold stays the kind's default, now v2.

A built-in's editor shows, when older versions exist, the banner «Built-in
template. It can't be changed; duplicate it to make your own. v1 stays
available for the projects that use it.» (mockup line ~868). The update
dialog (`TemplateUpdate.tsx:22`) reads own templates only, so a project on
`campagna@1` shows no «v2 available»: out of scope.

### D5. Reading a campaign: `parseCampaign`

New `packages/format/src/parse/campaign.ts`, exported from `index.ts`:

```ts
parseCampaign(text: string, { template }: { template: CampaignTemplate }): CampaignParse

CampaignParse { meta: Meta; lead: CampaignBlock[]; sections: CampaignSection[] }
CampaignSection {
  title: string;        // the heading as written, which the PDF prints (D1)
  from: number; to: number;      // source offsets of the section
  known: boolean;
  role: 'appendix' | null;
  pdf: SectionPdf;      // sectionPdf(definition, 'campaign'), or print + flow when unknown
  blocks: CampaignBlock[];
}
CampaignBlock = Exclude<Block, HeadingBlock> | SubheadingBlock
SubheadingBlock { kind: 'subheading'; range; text; depth: number; id: string | null; name: string }
```

It uses the same remark processor, `readFrontMatter` and `toBlock`, so each
block keeps its source range (the pane follows the cursor and a
double-click jumps back). A `###` heading whose text is `X. Name`, with `X`
matching `/^[A-Z]{1,3}\d+$/`, becomes a subheading with `id: 'X'` and
`name: 'Name'`; any other `###`, `####` or deeper heading is a subheading
with `id: null`. Plain `>` quotes stay `quote`; a `> [!type]` callout
stays a `callout` block (the layout prints it as a quote, D7). Campaigns are
not checked: parse problems (front matter, malformed callouts) are dropped,
and `CampaignParse` has none.

`readFrontMatter` and `toBlock` take a narrower context, typed by what they
read (`source`, `problems`, and `template.meta` for the front matter), so a
campaign template fits; `ParseContext` stays as it is for adventures.

_(Recorded in review of brief A.)_ `CampaignSection` has no `heading`: the
title as written is what prints (D1). `lead` is `CampaignBlock[]`: a `###`
before the first `##` becomes a subheading as anywhere else. The remark
processor is shared by both readers in `parse/processor.ts`.

Why: positions come for free from the existing parser, and the ID rule is
the scene's. Rejected: reusing `project/src/targets.ts` `headingTargets`
(`:134-190`), a line scan without blocks or positions inside sections.

### D6. Campaign layout input

New `packages/layout/src/campaign.ts`, exported from `index.ts`:

```ts
toCampaignLayoutInput(parsed: CampaignParse, options: LayoutOptions,
                      project: LayoutProject, template: CampaignTemplate): CampaignLayoutInput

CampaignLayoutInput {
  options: LayoutOptions;            // template 'campagna@1'
  title: string;
  author: string | null; copyright: string | null;
  licence: { short: string; full: string; url: string | null } | null;
  head: { from: number; over: LayoutBlock[] };
  lead: CampaignLayoutBlock[];
  tabs: string[];                    // the tabbed sections' tabs, in order
  sections: CampaignLayoutSection[]; // printed sections only
}
CampaignLayoutSection {
  title: string; from: number; newPage: boolean;
  tab: string | null;   // its own tab: it starts a page and is among the first 12
  mark: number | null;  // the tab filled while it prints, as an index into `tabs`
  blocks: CampaignLayoutBlock[];
}
CampaignLayoutBlock = LayoutBlock | { from: number; kind: 'subheading'; id: string | null; name: string }
```

Rules: the appendix and sections left out are absent; unknown sections are
present with `newPage: false`; a tab is the first word of the printed title
without trailing punctuation («PNG ricorrenti» → «PNG», «Fili aperti» →
«Fili»); a `quote` or a `callout` gets `box: { role: 'quote', label: null,
title: null, side: false }` with the content as Markdown (a callout's title
line is dropped: campaign templates have no callouts); other blocks keep
their Markdown as written. `LayoutOptions.template` widens to
`'avventura@1' | 'campagna@1'`; `options.pregenerated` is ignored.
`toLayoutInput` and `LayoutInput` do not change.

_(Recorded in review of brief A.)_ `mark` is an index into `tabs`, so two
sections with the same first word never light both tabs: a section's own
tab, else the previous printed section's mark; null before the first tabbed
section and after a section that starts a page without a tab, until the next
tabbed one. `text` and `authors` are exported from `input.ts` (module level,
not `index.ts`) for `campaign.ts`. `toLayoutInput` now forces
`options.template` to `'avventura@1'` in its output, so an adventure never
loads `campagna.typ` (Sabaoth's bytes unchanged).

### D7. `campagna.typ` and the engine

New `packages/layout/typst/campagna.typ` with `#let campagna(input)`.
`engine.ts`'s `TEMPLATES` maps each layout template to its file and function
(`'avventura@1'` → `/avventura.typ`, `avventura`; `'campagna@1'` →
`/campagna.typ`, `campagna`), and `prepare` writes `/main.typ` from them.
`Engine.build` and `Engine.pdf` take `LayoutInput | CampaignLayoutInput`.
`assets.ts` `typstFiles` adds `/campagna.typ`.

`campagna.typ` imports from `avventura.typ` (`#import "/avventura.typ": …`)
and writes its own page setup, footer, tabs, head, contents box, ID
subheading and quote box. What it needs that sits inside the `avventura`
closure today (`page-of`, `checkbox`, `layout-table`, `h3`, `label-pars`,
`md`, `section-heading`) moves to the top level of `avventura.typ`, each
helper that reads the tints taking `ink-saver: false` as a named argument;
inside `avventura`, `let md = md.with(ink-saver: ink-saver)` and so on keep
every call site as it is. The move is allowed only with Sabaoth's four
hashes unchanged (Risks). `callout`, `side-box` and the rest stay in the
closure; the quote box is a dozen lines of `campagna.typ`.

Every subheading is its own block, never Markdown inside `md()`: cmarker
maps every heading to `h3` (`avventura.typ:158`), which would lose the ID
mark.

Why: one place for the Markdown, table and label rules both PDFs share.
Rejected: a shared `common.typ` refactor (risk to Sabaoth's bytes for no
gain to the owner); a second Markdown converter (`md()` already covers
tables, task lists and quotes).

### D8. The campaign's pages, as approved

- **Page 1 head** (mockup page 1): the grey «over» line (D1), the title in
  IM Fell 34 pt ink, the 0.6 mm ink rule under them, as the adventure's
  cover; then the credits line «Autore: … · Copyright: … · Licenza: …» in
  9 pt grey with label-style keys.
- **Contents box «In questa campagna»** under the credits: tinted
  (`paper-tint`; with ink saver white with a 0.3 mm rule border), the label
  in label style, three columns, 9 pt; each printed section's title, a
  dotted leader and its page number (Plex semibold, accent) through a Typst
  query of a label on its heading; a ▸ in accent before each section that
  starts a page. The lead text and the appendix are not listed.
- **Sections** follow the box and flow. A section heading is the
  adventure's `section-heading`: IM Fell 18 pt accent, a 0.3 mm rule under
  it. A section with `newPage` starts a page (`pagebreak(weak: true)`).
- **ID subheadings** (`### F1. La Compagnia`): the scene header's sizes,
  flowing: the ID in IM Fell 36 pt accent, the name in IM Fell 22 pt ink,
  bottom-aligned in a two-column grid, a 0.6 mm ink rule under them, 6 mm
  above (1 mm right after a section heading) and 3 mm below; kept with the
  next block (`sticky`). A plain subheading prints with `h3`. _(Recorded in
  review of brief A.)_ Right after a section heading the gap is 2.5 mm, not
  1 mm: Typst keeps the larger of adjacent spacings and `section-heading`'s
  wins; accepted, touching the shared `section-heading` is not worth it.
- **Blocks**: a paragraph whose only marked run is bold prints that run as
  an accent caps label (`label-pars`: «OBIETTIVO:»), other bold stays bold;
  task lists print drawn checkboxes; tables use `layout-table`, the `small`
  variant from six columns up (the mockup's «Fazioni»); quotes and callouts
  the tinted italic quote box (10.3 pt, as the adventure's read-aloud
  without a label).
- **Paper and ink saver** work as for adventures.

### D9. Tabs, footer and thumbnails

- **Edge tabs**: on every page, the adventure's tab column and sizes (18 mm
  tall above three bytes, else 10 mm), one per section that starts a page,
  labelled by its tab (D6): the mockup's «Fronti», «PNG», «Archi», «Fili».
  The current tab is filled accent (white with an accent border with ink
  saver); none is filled before the first tabbed section (page 1).
- **How many tabs**: at most 12. From 20 mm below the top edge, 18 mm tabs
  with 1 mm gaps reach the bottom margin after 13 tabs on A4 and 12 on US
  Letter; 12 keeps one rule for both papers. A later section that starts a
  page gets no tab, prints with no tab filled, and the review lists a layout
  check (D11). For comparison, the adventure has no limit: with «Notte»,
  «Schede» and 10 mm scene tabs, A4 holds 20 scenes above the bottom margin
  and Letter 18.
- **Footer**: the adventure's: «title · section», then author · copyright ·
  short licence, then the page number. The section is the one the page
  opens in: a section whose heading is at the top of the page, else the
  section continuing from the page before; page 1 names the first section.
  The mockup draws it so (page 3 «Fronti» though «Fazioni» starts on it,
  page 6 «Archi» though «Finali possibili» starts on it). The filled tab
  follows the same rule.
- **Thumbnails**: `pos("part", …)` with the section's title as label for the
  first printed section and for each section that starts a page, so
  `pageLabels` (`pages.ts`) reads «1 · Premessa», «2 · Fronti», «3 · Fronti»,
  «4 · PNG ricorrenti» and so on. Every other printed element emits
  `pos("block", …)` as in `avventura.typ`. _(The mockup leaves continuation
  pages unlabelled; `pageLabels` names the section in progress, as for
  adventures' scenes. Kept.)_

### D10. Web: a PDF for every project

- `EditorPage.tsx`: `checked` keeps meaning «checked» (problems, Checks,
  status bar); a new flag `printable` (true for every category) gates the
  pane (`:82`), the builds (`:108`), ⌘⇧P (`:180`) and the **PDF** button
  (`:355`). `paletteEntries` takes `{ checked, printable }`: the problem
  entries follow `checked`, «PDF preview» and «Review PDF» `printable`.
- `useProjectTemplate` also answers `document: Template`, the project's own
  template as `templateOf` resolves it (a campaign's campaign template);
  `missing` covers campaigns too, by `document`. `usePdf`, `PdfSource` and
  `PdfReview` take `Template`.
- The worker: for a campaign template, `parseCampaign`,
  `toCampaignLayoutInput` with `options.template` set to `'campagna@1'`, and
  campaign checks (D11); else as today. The editor sets `options.template`
  from the template's kind on each request; stored options keep ignoring it.
- `PdfReview` for a campaign: Paper, Ink saver, Template (disabled, «<name>
  v<version>», «Campagna v2» for the built-in); no «Pregenerated sheets»
  row. «Save PDF» and «Print…» as today; the file is named from the
  project's title (`pdfFileName`: `prima-che-arrivi-la-legge.pdf`).
- `PdfPane` for a campaign, when the cursor's `##` section does not print:
  the caption reads «PDF preview · the appendix is not printed» (or «PDF
  preview · «X» is not printed» for a section left out) and the page shown
  is dimmed to 45 % opacity (mockup `paneShow`). The section comes from the
  outline's current heading and `matchSection`, which `index.ts` exports.
  _(Drafter's addition for sections left out; the mockup shows the
  appendix only.)_
- The campaign outline (`outline.ts:141` `fromHeadings`) shows the ID of a
  heading `### X. Name` as the item's id badge and `Name` as its name, as
  the mockup's outline does (line 749). _(Drafter's addition: the mockup shows
  it, the brief did not list it.)_

### D11. Layout checks for campaigns

The scene checks (half-empty page, a scene of three pages or more) read
scene positions, which `campagna.typ` never emits, so none applies. One
campaign check, `campaignChecks(input, positions)` in `checks.ts`: when a
section starts a page past the 12th tab, ««X» and N more sections start a
page without a tab», on the page where «X» starts. `LayoutCheck.sceneId`
becomes `string | null` (null here; the web does not read it). With no
check the review shows «Layout checks · none» and «Nothing to look at.»,
as today.

### D12. Template editor for campaigns

As mockup view 3 (`renderTemplate`):

- the Sections tab shows the «In the PDF» column for campaigns: an own
  section shows «Printed / Left out» and, while printed, «New page»; no
  «Side column». The appendix shows a fixed, dashed tag «Never in the PDF»
  with the tooltip «The appendix holds image and music prompts», and no
  toggle; its row cannot be removed (locked by its role). «Used for» shows
  «Appendix» with the lock, «Your own» for the others, as today.
- The footer note «Campaigns have no PDF yet; their sections are checked for
  presence only.» becomes «Sections the template does not list still print,
  flowing after the section before them.»
- The Front matter tab of a campaign gets the footer note «`sistema` and
  `formato` print on the line above the title; `autore`, `copyright` and
  `licenza` on the credits line and in the footer.»
- The preview marks a campaign's `##` heading «not in the PDF» when it is
  the appendix or left out, and «new page» (in the primary colour, not
  italic) when it starts a page. Adventures keep their marks.
- Toggles patch through `withPdf(…, 'campaign')`; toggling back leaves no
  change.

### D13. Connector texts

`save_template_version`'s description (`mcp/templates.ts:290`) says: in
adventure templates, `pdf.print` on any section but the appendix, `newPage`
and `sideColumn` only on sections without a role; in campaign templates,
`print` and `newPage` on any section but the appendix, never
`sideColumn`; the appendix never prints. No other tool text names PDF
options.

### D14. What does not change

The adventure's PDF (Sabaoth's four hashes), `avventura@1`, the connector's
reading and writing of campaign documents, the desktop main process, the
server routes.

The owner's campaign uses «Campagna a fronti» v2, not `campagna@1`. With
this change it prints every section flowing, the appendix included, since
that template has no appendix role and no options. To get the mockup's
pages the owner saves a v3 of it with «Appendice: stile visivo e sonoro»
left out and «New page» on Fronti, PNG ricorrenti, Archi and Fili aperti,
then updates the project. A role cannot be added to it (locks). The
hand-back says this to the owner.

### D15. Tests and proof

- **Fixture** `packages/format/fixtures/campagna-di-prova.md`, invented,
  short, in Italian (written with the `scrittura-italiana` skill): front
  matter with `titolo`, `sistema`, `formato`, `autore`, `licenza`; fronts
  with `### F1.` and `### F2.` IDs and task-list clocks; a six-column table;
  a plain quote; a `> [!nota]` callout; a section v2 does not list
  («Appunti del master»); text before the first `##`; and an appendix.
- **The owner's campaign is never committed** (the repository is public;
  it is the owner's prep). For the proof the implementer reads it with the
  connector tool `read_document` (projectId
  `10ee1b2b-c5c0-41ee-9e5e-4665b23c2095`) into a scratch directory outside
  the repository and renders PNGs of every page, twice: with `campagna@2`
  (the mockup's options) and with «Campagna a fronti» v2 as stored (read
  with `get_template`).
- Unit tests: D3's accepts and refusals with their paths; v2 validates;
  `latestBuiltin`, `builtinVersions`, `implicitTemplateRef` and each call
  site of D4; `parseCampaign` blocks, ID and plain subheadings, ranges;
  `toCampaignLayoutInput` (appendix absent, a left-out section absent, the
  unknown section present and flowing, tabs and marks, the 13th tab
  dropped); the fixture builds a PDF of an expected page range, twice with
  the same bytes; Sabaoth's four hashes unchanged. The contents-number test
  reads the PDF with `e2e/pdf-text.ts` through a dynamic import (the layout
  tests' `rootDir` refuses a static one).
- e2e: the seeded campaign «Blacksad - Il Continentale»
  (`server/src/seed.ts:40`, now on v2's skeleton) has the PDF button; the
  review has no «Pregenerated sheets»; «Save PDF» gives a PDF whose text
  (`pdfTexts`) holds its section titles and not «Appendice»; the template
  editor's campaign column. It replaces «campaign has no PDF»
  (`e2e/pdf.spec.ts:150-156`).

## Risks

- **Sabaoth's hashes move.** Stop, bisect the helper move (project memory
  «Typst byte identity»: `layout()` at block level and leading on wrapped
  text break bytes), report. Never re-baseline. If the move cannot keep the
  bytes, put copies of the helpers in `campagna.typ`, leave `avventura.typ`
  as on `main`, and say so in the hand-back.
- **Moved helpers carrying closure state.** A helper that reads a `set` or
  `show` rule of the `avventura` closure, or a counter, may print otherwise
  at top level. Move only what keeps the hashes; duplicate the rest and say
  which.
- **Contents page numbers.** Typst resolves the query in its layout
  iterations; a contents box whose size changes with its numbers may not
  converge («layout did not converge»), and a query per entry costs build
  time. Report either, with the build times of the fixture and the owner's
  campaign; do not work around it with fixed numbers.
- **A built-in in two versions.** It may show twice in a list, or a project
  on `campagna@1` may open with v2. Each call site of D4 gets a test.
- **cmarker headings.** A subheading sent through `md()` prints as `h3`;
  subheadings must stay their own blocks (D7).
- **The contents box does not break across pages**: around 260 long section
  titles would overflow page 1; accepted, far beyond any real campaign.
- **A role refused in a stored campaign template** (D3). If any stored body
  turns out to hold one, the server would fail to read it: report it, do
  not loosen the rule silently.

## Verification

- Format and layout tests as D15; `npm run typecheck`, `npm test`.
- PNGs of every page of the fixture and of the owner's campaign (both
  templates), A4 and ink saver, paths in the hand-back.
- e2e: the whole suite, once normally and once with `E2E_CPU_THROTTLE=3`.
- Screenshots (1440 x 900) for the architect: the editor with a campaign
  and the pane, the pane on the appendix, the review of a campaign (light
  and dark), the built-in «Campagna» v2 Sections tab, a copy with toggles
  changed, its preview, the Front matter tab.
