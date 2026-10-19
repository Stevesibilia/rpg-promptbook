## Context

`docs/design.md` (PDF for the table) decided Typst on 2026-10-18 after
rendering Sabaoth four ways ([pdf-engines.md](../../../docs/research/pdf-engines.md)).
The editor mockup shows a PDF pane in place of the inspector and a
full-screen review. Today:

- `promptbook-format`'s `parseAdventure(text, {template})` returns a
  JSON-safe `Model` (`packages/format/src/model.ts:312`) with every block's
  raw Markdown in `text` and its source `range` (`Point.offset`).
- The editor parses in `src/editor/analysis/parse.worker.ts` with a 250 ms
  debounce and one request in flight (`analysis/client.ts`).
- The reference layout is `impagina.py` (354 lines) and `stile.css` (119
  lines) in
  `~/Homelab/stevesibilia-plugins/plugins/rpg-prep/skills/impagina-avventura/scripts/`,
  with eight TTF fonts in `scripts/fonts/`. The PDF it made of Sabaoth is
  `~/Downloads/Ancora-di-Sabaoth-A4.pdf` (WeasyPrint 70, 14 pages).
- The server serves the web build with `@fastify/static` and sets a helmet
  content security policy (`packages/server/src/web.ts`), with no
  compression and no cache headers.

### Measured by the architect on 2026-10-19

A throwaway prototype in Node with the packages this plan pins, loading the
browser compiler's WASM (`typst-ts-web-compiler`), not the native one:

- `createTypstCompiler()`, `init({ getModule: () => wasmBytes, beforeBuild:
[disableDefaultFontAssets(), loadFonts([...ttfBytes])] })`: 30 ms. Typst
  reports `0.15.0`.
- `compile({ mainFilePath, format: 1 })` gives a PDF. **`format` takes the
  enum value** (`CompileFormatEnum.pdf` = 1, `vector` = 0); the string
  `'pdf'` silently gives the vector artifact. 5 pages: 60 to 70 ms.
- `cmarker` 0.1.10, mapped with `mapShadow` under `/cmarker/`, renders bold,
  italic, task lists and GFM tables inside the WASM compiler. Fonts embed as
  subsets. Task list items print as `[ ]` and `[x]` unless the template
  overrides them.
- **Page positions:** `compiler.query()` on the driver fails ("document is
  not compiled"). This works:

  ```ts
  await compiler.runWithWorld({ mainFilePath, inputs }, async (world) => {
    await world.compile({ diagnostics: "full" });
    const positions = await world.query({
      selector: "<pb-pos>",
      field: "value",
    });
    const vector = world.vector({ diagnostics: "full" });
  });
  ```

  with, in Typst,
  `#let pos(v) = context [#metadata((..v, page: here().page(), y: here().position().y.pt()))<pb-pos>]`.
  A query that reads `metadata` from inside a metadata element did not
  converge; the labelled form above did.

- `createTypstRenderer()` turns the vector artifact into one SVG of the
  whole document: pages stacked as `<g class="typst-page"
transform="translate(0, y)" data-page-width data-page-height>`. The
  `window` option does not crop to one page. The default output contains a
  `<script>` whose `&` breaks XML, so it does not load as an `<img>`;
  inline, or with the script removed, it renders correctly in Chrome.
  `data_selection: { js: false }` should leave the script out.
- Sizes: compiler WASM 28.8 MB, 10.9 MB gzip, 7.6 MB Brotli; renderer WASM
  1.3 MB.

## Goals / Non-Goals

**Goals:**

- A PDF of any adventure or one-shot with the structure of today's: cover
  and opening, the night, strong start and scene map, rules, one scene per
  page start with edge tabs, references (clues, NPCs, sheets with threat
  boxes, pregenerated).
- Preview and review in the browser, as the mockup shows, with no server
  work per build.
- The same package usable by the desktop app (#6) and by Node tests.

**Non-Goals:**

- The same page breaks as WeasyPrint. The target is the same structure.
- Images, the Images option, the missing-image check (phase 2).
- Versions and compare (#4). A5 booklet.
- PDFs of campaigns: they are not parsed (editor decision 2), so there is no
  model to lay out.

## Decisions

### 1. A new `packages/layout` workspace

Package `promptbook-layout`, as `docs/design.md` (Stack) planned:

```
packages/layout/
  package.json          exports "./src/index.ts", like promptbook-format
  fonts/                the eight TTFs from impagina-avventura, plus OFL.txt per family
  typst/
    avventura.typ       the template (decision 3)
    cmarker/            cmarker 0.1.10: lib.typ, plugin.wasm, typst.toml, LICENSE
  src/
    index.ts
    input.ts            Model + options → the JSON the template reads (decision 2)
    engine.ts           createEngine(), build(), pdf() (decision 4)
    positions.ts        Position type, pageOf(), blockAt() (decisions 7, 9)
    checks.ts           layoutChecks() (decision 8)
    licence.ts          licenceShort(), licenceUrl() (decision 5)
    assets.ts           the files the engine needs, as URLs (decision 4)
  test/
```

Why: the design planned this split; the web client and the desktop app both
need it, and keeping it out of `promptbook-format` keeps the parser free of
a 29 MB dependency. Rejected: putting the template in `packages/web` (the
desktop app and the plugin could not reuse it).

### 2. The template reads a layout input, not the raw model

`toLayoutInput(model, options, project)` returns plain JSON written to the
shadow file `/input.json`; the template reads it with `json("/input.json")`.
`project` is `{ title }`, the project's name, used when the front matter has
no `titolo`. It carries:

- `options` (decision 6), `title`, `subtitle`, and the footer fields:
  `author` (from `autore`, names joined with «, »), `copyright`,
  `licence: { short, url } | null`.
- The sections, scenes, sheets, pregenerated, clues and NPC tables in
  document order, each block as `{ from, kind, markdown }` where `from` is
  `range.start.offset` and `markdown` is the block's `text`.
- `tabs`: `["Notte", "S1", …, "Sn", "Schede"]`, as `impagina.py`'s `voci`.
- References to sheets resolved to a label (`sheet-<slug>`), so the template
  prints «Nome, p. N» with Typst's `locate`, as `stile.css`'s
  `target-counter` did.

Why: the template stays declarative and the mapping from the model is plain
TypeScript with unit tests. Markdown inside blocks is rendered in Typst by
`cmarker`, so no Markdown-to-Typst escaping lives in TypeScript (the
research's proposal, proved in the prototype). Rejected: converting Markdown
to Typst markup in TypeScript (every escape becomes our bug).

### 3. The template: `stile.css` and `impagina.py` ported

`typst/avventura.typ` follows `impagina.py`'s `costruisci` part by part:
apertura (cover with title, subtitle, meta, «La vicenda in breve»,
«Antefatto»), notte («A colpo d'occhio», side column with «Da non perdere
stasera» and «Rivelazioni», «Orologio», «Verità del mondo»), inizio
(«Inizio forte» with read-aloud, «Mappa delle scene»), regole (two
columns), one part per scene (`scena_html`: header, fields, read-aloud,
side column with `[!riquadro|laterale]` boxes, threat boxes, reactions
table, derail), riferimenti (Indizi, PNG, Schede with `riquadro_minaccia`,
Pregenerati, «Prima della sessione»). «Appendice: immagini e musica» is not
printed, as in the skill. Colours, sizes, margins and fonts come from `stile.css`:

- Page A4, margins 12 / 15 / 14 / 14 mm; body Spectral 9.5 pt, leading as
  `line-height: 1.36`.
- Fonts: Spectral (body), IM FELL English as «Fell» (titles), IBM Plex Sans
  Condensed as «Plex» (labels, footer, page number). Typst addresses Plex as
  `"IBM Plex Sans"` with `stretch: 87.5%` (research note).
- Colours `--inchiostro #1c1a17`, `--accento #7b2d26`, `--carta #f1ede4`,
  `--grigio #4a463f`, `--filo #8a857c`.
- Edge tabs on the right edge, one slot per entry of `tabs`, the current one
  filled; the footer «Title · section» on the left, page number on the right.
- Task list items print as drawn 3 mm boxes, ticked when checked, as
  `stile.css`'s `.box`: none of the vendored fonts has ☐ or ☑, and there is
  no fallback font.
- Markdown tables are styled with a show rule on `table` guarded by a
  `<pb-table>` label: cmarker builds them with `table.cell`, so a
  `scope.table` override fails.

Every element the template prints from the input calls `pos(…)` first
(decision 7). Nothing outside the input is printed: no seed, no inspiration,
no research (design.md says they stay out of the PDF).

When the reference and the model disagree (a field the model names
differently, a section the skill handled by string matching), follow the
model and list the difference in the hand-back. Report a part of
`impagina.py` that has no counterpart in the model rather than parsing
Markdown again in the template.

### 4. The engine: one API for the browser and Node

```ts
export interface EngineAssets {
  compilerWasm: Uint8Array | ArrayBuffer;
  fonts: Uint8Array[];
  files: { path: string; bytes: Uint8Array }[]; // template and cmarker
}
export async function createEngine(assets: EngineAssets): Promise<Engine>;
interface Engine {
  build(input: LayoutInput): Promise<BuildResult>; // vector + positions + pages
  pdf(input: LayoutInput): Promise<Uint8Array>;
}
interface BuildResult {
  vector: Uint8Array;
  pages: { width: number; height: number }[];
  positions: Position[];
  diagnostics: { severity: "error" | "warning"; message: string }[];
}
```

- Pin `@myriaddreamin/typst.ts`, `@myriaddreamin/typst-ts-web-compiler` and
  `@myriaddreamin/typst-ts-renderer` at exactly `0.8.0-rc3`. Why: it is the
  build the research measured, it carries Typst 0.15.0, and `cmarker` 0.1.10
  needs 0.15. Rejected: `0.7.0` (the `latest` tag; older Typst, not
  measured).
- `init` with `disableDefaultFontAssets()` and `loadFonts(fonts)`, or it
  fetches fonts from a CDN.
- `build` uses `runWithWorld` as measured (Context); `pdf` uses
  `compile({ format: 1 })`. One compiler per engine; call `reset()` only if
  memory grows across builds (measure, do not guess).
- `assets.ts` exports the paths and `new URL('../fonts/…', import.meta.url)`
  of every font and Typst file, so the web worker fetches them through Vite
  and Node tests read them with `fileURLToPath`. The compiler WASM is
  resolved by the caller (web: `?url` import; Node: `import.meta.resolve`).
- Build errors are returned in `diagnostics`, never thrown, so the UI can
  show them.
- `pdf()` throws `LayoutError`, carrying the diagnostics, when the document
  does not build; `build()` never throws.
- `pages` comes from `<pb-page>` metadata the template places on every page.
- Only error and warning diagnostics are kept; the compiler's hints (the
  call trace) are dropped.
- Two builds give byte-identical PDFs and positions; the vector artifact is
  not byte-identical, so the tests do not compare it.
- typst.ts 0.8.0-rc3 evaluates strings while it initialises (`new Function`
  in `loadFonts` and five placeholders in the compiler's wasm-bindgen
  builder), which a policy without 'unsafe-eval' refuses. The engine loads
  fonts with its own loader and, only while `init` runs, answers those five
  exact sources with plain closures; any other string still reaches the real
  constructor. A test runs the engine with string evaluation refused.
  Rejected: 'unsafe-eval' for the worker's script (that realm holds the
  session) or the site.

### 5. Footer, cover, licence

As `docs/design.md` decided on 2026-10-18: every page footer shows «Title ·
section», then the author, the copyright and the short licence when set,
then the page number; the cover repeats them, the licence as its short form
linked to its SPDX page.

- `licenceShort`: a `CC-` SPDX id becomes «CC BY-NC-SA 4.0» (drop `CC-`,
  the last part is the version, the rest keeps its hyphens); any other SPDX
  id prints as is; free text prints as written.
- `licenceUrl`: `https://spdx.org/licenses/<id>.html` for an SPDX id, none
  for free text.
- Missing `autore`, `copyright` or `licenza`: that part of the footer is
  left out, with no placeholder.

### 6. Options

```ts
interface LayoutOptions {
  paper: "a4" | "us-letter";
  inkSaver: boolean; // tints become white; text, rules and borders stay
  pregenerated: boolean; // false leaves out the Pregenerati part
  template: "avventura@1";
}
```

Ink saver also gives tinted boxes a 0.3 mm border, the table header an ink
rule and the current tab an outline, or the side boxes vanish.

Defaults A4, ink saver off, pregenerated on. The web client keeps them per
project in `localStorage` (`promptbook.pdf.<projectId>`), read and written
in `try`/`catch` like the inspector's sections. Why: paper and ink are the
printer's business, not the adventure's, and the project document stays
unchanged. Rejected: storing them in the Yjs document (a schema change for a
device preference). The template select shows the one template, disabled.

### 7. Positions

```ts
interface Position {
  kind: "part" | "scene" | "block" | "scene-end";
  id?: string; // "S3" for scenes, the part name for parts
  label?: string; // what a thumbnail shows: "Cover", "S3", "Schede"…
  from: number; // source offset
  page: number; // 1-based
  y: number; // pt from the top of the page
}
```

The template emits one `pos` per part, scene, block and scene end. The
engine returns them sorted by page then `y`. `pageOf(positions, offset)`
returns the page of the position whose `from` is the greatest at or below
`offset`. `blockAt(positions, page, y)` returns the last position on that page whose
`y` is at most `y`, else the last one before the page.

### 8. Layout checks

`layoutChecks(positions, pages)` returns `{ message, where, page, sceneId }[]`:

- **Half-empty page:** a scene whose `scene-end` sits above half of its
  page's height, when the next scene starts on a later page: «Half of page
  7 is empty: S2 ends early», where «S2 · page 7».
- **Long scene:** a scene spanning three pages or more: «S5 runs to 3 pages
  (the others take 1–2)», where «S5 · pages 10–12». The range in brackets is
  the other scenes' minimum and maximum, «1» when they are equal.

Checks are warnings in the review only; they do not join the editor's
problems. The missing-image check of the mockup waits for images.

### 9. Web: the PDF worker

`src/editor/pdf/pdf.worker.ts`, created on first use and kept while the
project page is open:

- Loads the engine (decision 4), the compiler WASM through
  `?url` import of
  `@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm`,
  and the renderer WASM the same way. If the package `exports` block those
  paths, report it; do not copy the WASM into the repository.
- Request `{ version, text, options, project }`: parses with
  `parseAdventure` and `templates.avventura`, builds, renders the vector to
  one SVG with `data_selection: { body: true, defs: true, css: true, js:
false }`, and answers `{ version, svg, pages, positions, checks,
diagnostics }`. A `pdf` request answers the bytes.
- `src/editor/pdf/client.ts`: like `analysis/client.ts`, a 400 ms debounce
  and one request in flight; it sends only while the pane or the review is
  open. First open shows «Loading the PDF engine…» until the engine is
  ready.

### 10. Web: drawing pages

The SVG is inserted once, hidden, in the page (`innerHTML` of a container;
it carries no script). Each visible page, in the pane, the stage and the
thumbnails, is an `<svg viewBox="0 <pageTop> <w> <h>">` with a `<use>` of
the document group. Why: crisp at every zoom, one copy of the glyphs.
Measure the review with Sabaoth: if thumbnails make opening the review
slower than 1 s after a build, draw thumbnails with the renderer's
`renderCanvas` at a low `pixelPerPt` instead, and say so in the hand-back.
Rejected: `<img>` of a Blob per page (each Blob holds the whole document);
pdf.js (a second renderer for what Typst already draws).

### 11. Web: preview pane

As the mockup (`.pdfpane`, `editor.html:490`):

- A **PDF** button in the top bar, primary style, hidden in focus mode,
  shown only for adventures and one-shots. It toggles the pane.
- The pane takes the right column, 460 px, in place of the inspector, which
  comes back when the pane closes. The inspector toggle while the pane is
  open closes the pane. Open state kept with the other panels
  (`editor/panels.ts`).
- Header «PDF preview · page 6 of 14 · follows the cursor», with
  «⤢ Review» (title «Review the whole PDF (⌘⇧P)») and ✕.
- Shows the page `pageOf(positions, cursor)`, fit to the pane's width;
  moving the cursor changes page without a build. Double-click jumps
  (decision 13).
- Build errors: «The PDF could not be built.» with the first error's message;
  the last good page stays under it, dimmed.

### 12. Web: review

Full screen under the top bar, as the mockup (`.review`, `editor.html:517`):

- **Thumbnails** column: one per page, «6 · S1» (page number · label of the
  last part or scene started on or before that page), the current ones
  outlined, an amber mark on pages with a layout check. Click shows that
  page.
- **Stage**: tools «← Editor Esc», «Pages 6–7 of 14», zoom − 100% +,
  Single / Spread / Fit width. Spread pairs the cover alone, then 2–3, 4–5…
  (even page on the left). Under the pages: «Double-click any text to jump
  to it in the editor.»
- **Side column**: «Layout checks» with its count (click shows the page);
  «Options» (Paper, Ink saver (no tints), Pregenerated sheets, Template);
  actions «Print…» and «Save PDF».
- **Save PDF** downloads `<slug of the title>.pdf`, built with the current
  options.
- **Print…** opens the PDF in a new tab, where the browser's viewer prints
  it. Why: a hidden-frame `print()` of a PDF works only in Chrome and needs
  `frame-src blob:` in the policy; this departs from the mockup's direct
  print dialog.
- Opened with ⌘⇧P, the pane's «Review», or the palette; Esc or «← Editor»
  closes it and puts focus back in the editor.

### 13. Jump from the PDF

Double-click on a page in the pane or the stage: `blockAt(positions, page,
y)` from the click's position in points; the review closes, the editor
selects `from`, scrolls it into view and takes focus. The offset is from
the text the build read; if the text changed since, clamp it to the
document's length.

### 14. Shortcuts and palette

- `pdfReview` ⌘⇧P (Ctrl+Shift+P elsewhere) in `cm/keymap.ts`'s shortcut
  list. Firefox keeps that key for a private window; the button and the
  palette cover it, as for ⌘1 and ⌘2 in Chrome.
- Palette commands «PDF preview» (toggle) and «Review PDF», each with its
  shortcut where it has one.

### 15. Server

In `packages/server/src/web.ts`:

- Content security policy: `scriptSrc: ["'self'", "'wasm-unsafe-eval'"]`.
  Without it, the browser refuses to compile WebAssembly.
- `@fastify/static` with `preCompressed: true`; the web build writes `.br`
  and `.gz` next to every `.wasm`, `.js`, `.css` and `.svg` in `dist/` (a
  small Node script run by the web package's `build`, with `node:zlib`).
- `Cache-Control: public, max-age=31536000, immutable` for `/assets/*`
  (hashed names); `no-cache` for `index.html`.
- `.wasm` served as `application/wasm` (check; set it if
  `@fastify/static` does not).

### 16. Tests

- **Layout, Node** (`packages/layout/test`, vitest, the browser WASM as in
  the prototype): Sabaoth
  (`packages/format/fixtures/l-ancora-di-sabaoth.converted.md` with `autore`,
  `copyright` and `licenza` added in the test) builds with no
  error diagnostics; every scene's first position starts a page; the page
  count is between 12 and 18; two builds give byte-identical PDFs; the PDF
  starts with `%PDF`; the Letter option changes the page size; ink saver
  and pregenerated off change the output; build time for Sabaoth after the
  first is under 1 s.
- **Unit**: `toLayoutInput` (footer fields, tabs, sheet labels, options),
  `licenceShort`, `licenceUrl`, `pageOf`, `blockAt`, `layoutChecks`, spread
  pairing.
- **e2e** (`e2e/pdf.spec.ts`): open Sabaoth, PDF pane shows a page and
  follows the cursor to another scene; ⌘⇧P opens the review with one
  thumbnail per page; Letter changes the page shape; Save PDF downloads a
  file starting with `%PDF`; double-click on a scene's page jumps the
  cursor into that scene; Esc returns.
- **Owner preview** on the LAN before the hand-back, compared side by side
  with `~/Downloads/Ancora-di-Sabaoth-A4.pdf`.

## Risks / Trade-offs

- **typst.ts is a release candidate.** Pinned exactly. If an API in
  Context behaves differently in the browser than in Node, report it with
  the error; do not upgrade or downgrade without asking.
  The engine's init answers typst.ts's string evaluations by their exact
  source; an upgrade that changes them fails the no-eval test, which must
  pass before anything else.
- **First load is 7.6 MB** with Brotli (10.9 MB gzip). Only when a PDF is
  opened; cached after. If the deployed host does not get the `.br` file
  (a proxy stripping `Accept-Encoding`), report the size measured in the
  browser.
- **Positions inside floats and columns** may report the `y` of where the
  float was placed, not where its text is. If `blockAt` lands on the wrong
  block in the side column, jump to the scene instead and say so.
- **Build time on the owner's longest document.** Measure Sabaoth; if a
  build in the browser takes over 1 s, report the number before tuning.
- **Template fidelity is judged by eye.** The owner's preview decides; the
  tests check structure only.

## Migration Plan

Nothing to migrate. Release as `v0.3.0` once merged; the chart needs no
change.

## Open Questions

None.
