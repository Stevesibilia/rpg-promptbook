# PDF engines for the table PDF

Research for [design.md, "PDF for the table"](../design.md#pdf-for-the-table).
Question: which engine builds a predictable, richly laid-out adventure PDF
offline inside the Electron app on Mac, Linux and Windows? Does the current
proposal (port `impagina.py` to TypeScript, keep `stile.css`, print with
Chromium `printToPDF` plus Paged.js) stand?

Date: 2026-10-18. Source format is out of scope (see `source-format.md`); it
appears here only where an engine implies one.

## Summary

- **Recommendation:** keep the HTML route (TypeScript port of `impagina.py`,
  `stile.css`, the fonts, Electron `printToPDF`), but use **Vivliostyle.js**
  as the paged-media engine instead of Paged.js.
- **Why not Paged.js:** it works today with `stile.css` unchanged, but its last
  release is 0.4.3 (July 2023; a 0.5 beta in October 2024). Version 2 is being
  rebuilt as separate, unreleased libraries. Vivliostyle renders the same
  stylesheet with the same result, ships monthly, and covers more of the specs.
- **Main trade-off:** Vivliostyle is AGPL-3.0. Fine for a personal app
  restricted to one account; if the app is ever distributed, it must be
  distributed under AGPL terms. If that is not acceptable, pin Paged.js 0.4.3
  (MIT), which passed the same test.
- **The strong alternative is Typst.** Its own layout engine gave byte-identical
  output on repeat runs, identical layout in native and WASM builds, and 31
  pages in 0.16 s in WASM. It costs a rewrite of `stile.css` as a Typst
  template and a second styling language next to the skill's CSS. Pick it if
  the cross-OS check below shows Chromium drifting between Mac, Linux and
  Windows.
- **No engine will match WeasyPrint page for page.** Both Chromium engines gave
  14 pages where WeasyPrint gives 13, because Chromium does not split the
  floated side column of scene S5. The goal should be "same structure" (page
  per scene, same tabs, footers and references), not identical pages.

## What was tested

All runs on this Mac (Apple Silicon), in the scratch directory, nothing
installed globally.

| Engine                                         | Pages | Footer strings | Edge tabs             | "p. N" references | Time                                       |
| ---------------------------------------------- | ----- | -------------- | --------------------- | ----------------- | ------------------------------------------ |
| WeasyPrint 70.0 (`impagina.py`, in Docker)     | 13    | yes            | yes                   | yes (p. 11)       | 0.86 s                                     |
| Chromium 147, no polyfill                      | 18    | no             | no: tabs flow as text | no                | 0.24 s                                     |
| Chromium 147 + Paged.js 0.4.3                  | 14    | yes            | yes                   | yes (p. 12)       | 0.31 s layout + 0.08 s PDF                 |
| Chromium 147 + Vivliostyle 2.45.2 (CLI 11.3.3) | 14    | yes            | yes                   | yes (p. 12)       | 1.9 s, including browser start             |
| Typst 0.15.1 CLI, 30-scene synthetic file      | 31    | yes            | yes                   | yes               | 0.04 to 0.09 s                             |
| Typst via typst.ts 0.8.0-rc3 WASM, same file   | 31    | yes            | yes                   | yes               | 0.31 s first (with WASM init), 0.16 s next |

Input: `l-ancora-di-sabaoth.md`, comments stripped as the skill says, rendered
by `impagina.py` to HTML. The Chromium runs used that HTML and `stile.css`
unchanged (font URLs rewritten to local paths). Chromium was Playwright's
Chrome for Testing 147, the same engine family Electron ships.

Findings:

- **Paged.js and Vivliostyle both reach near-parity with no CSS change.**
  Running elements, `string-set`, `counter(page)` and `target-counter` all
  work. Footers match WeasyPrint's text page by page up to S5.
- **Both leave the first S5 page almost empty** (43 words against 475 in
  WeasyPrint). The cause is the floated `.laterale` column: with
  `float: none` the empty page goes away. Replacing the float with a CSS grid
  fixed the empty page in Vivliostyle (still 14 pages) and made Paged.js worse
  (16 pages). Parity work starts here.
- **Native Chromium is not enough with `stile.css` as written:** no
  `element()`, no `string()`, no `target-counter()`. But Chromium 147 does
  support `@page` margin boxes, `counter(pages)`, named pages, and backgrounds
  in margin boxes. A small test drew a per-scene tab strip (SVG background in
  `@right-top` of a named page) and a per-scene footer, repeated on overflow
  pages. So a polyfill-free route exists; see "Native Chromium" below.
- **Vivliostyle needs fonts by relative URL.** The CLI serves files over HTTP;
  `file://` font URLs silently fell back to Times.
- **Typst:** the proof below compiled first time after two fixes (integer
  division; Typst groups IBM Plex Sans Condensed under "IBM Plex Sans" with
  `stretch: 87.5%`). Repeat compiles were byte-identical. The WASM build, with
  default font downloads disabled and the eight bundled TTFs loaded from disk,
  made the same layout as the native CLI (same text per page). No network.

## Requirements from today's layout

From `impagina.py`, `stile.css` and the rendered PDF (13 A4 pages for L'ancora
di Sabaoth).

1. **Page:** A4, margins 12 / 15 / 14 / 14 mm, set with `@page`.
2. **Page per section and per scene:** `section { break-before: page }`;
   forced breaks before "Pregenerati" and "Prima della sessione".
3. **Edge tabs:** a strip in the right margin (`@right-top`) with Notte, S1…Sn,
   Schede; the current one is filled in the accent colour. Built as a running
   element (`position: running(linguetta)`, `content: element(linguetta)`), so
   it repeats on every page of a scene.
4. **Running footer:** "Title · section name" bottom left, from `string-set`
   on a hidden `.piede` element and `string(sezione)`.
5. **Page number:** bottom right, `counter(page)`. No "of N".
6. **Cross-references with page numbers:** `→ Schede: Nome` becomes a link;
   `target-counter(attr(href), page)` adds ", p. 11". Used in threat boxes and
   in the text.
7. **Side column:** 58 mm, floated right, main column with a 64 mm right
   margin, `.sotto` cleared below both.
8. **Boxes:** shaded (`.riquadro`, `.leggi`), bordered (`.prova`, `.scheda`,
   `.pregenerato`), dashed handout (`.documento`); all
   `break-inside: avoid`.
9. **Threat boxes:** name, grade, rows of 3 mm checkboxes for wounds (in groups
   of three) and afflictions, short talents, link to the full sheet with its
   page.
10. **Checklists:** `- [ ]` items become checkboxes.
11. **Tables:** full width, dark header row, zebra rows, rows never split,
    reaction tables with a bold 38 % first column. Header rows repeat when a
    table breaks.
12. **Keep with next:** headings `break-after: avoid`.
13. **Two columns** for "Regole della notte" (`columns: 2`).
14. **Fonts:** Spectral, IM Fell English, IBM Plex Sans Condensed; eight TTF
    files, OFL.
15. **Colour and backgrounds** (needs `printBackground`).
16. **Typography:** uppercase tracked labels, justified opening text.
17. **Widows and orphans:** not set; engine defaults (2) apply.
18. **Not used today:** named pages, footnotes, page floats, `counter(pages)`,
    left/right pages, bleed. Images are planned (design.md says the script
    "can now include the images"); the version read here has none.

Hard requirements: 1 to 11. Without 3, 4 and 6 the PDF is not usable at the
table.

## Per-engine evaluation

### Chromium `printToPDF` + Paged.js

- **Fidelity:** all of 1 to 16 work with `stile.css` unchanged (measured).
  Supports margin boxes, running elements, `string-set`, `target-counter`,
  named pages, footnotes. Weak on fragmenting floats and grids (the S5 page).
- **Predictability:** layout is Chromium's, pinned by the Electron version, so
  the same app version gives the same pages on one OS. Across OSes it is not
  verified: Chromium uses platform font back ends, and glyph advances can
  differ with hinting or subpixel settings, mainly on Linux and Windows.
  Bundled fonts remove the biggest cause, not all of them. Paged.js measures
  the DOM, so fonts must be loaded before it runs.
- **Offline in Electron:** yes. A hidden `BrowserWindow` loads the HTML, waits
  for Paged.js, then `webContents.printToPDF({ preferCSSPageSize: true,
printBackground: true })`. Optional `generateDocumentOutline` and
  `generateTaggedPDF` (both experimental).
- **Bundle size:** about 0.5 MB minified (Chromium is already in Electron).
- **Speed:** 0.3 s layout for 14 pages, warm headless browser. About 0.6 to
  1 s expected for 30 pages (estimate).
- **Live preview:** yes, the Paged.js previewer renders pages as DOM in an
  iframe. Full re-pagination on each change; debounce it. Works in the browser
  shell too (Chrome best).
- **Maintenance and licence:** MIT. npm `latest` is 0.4.3 (2023-07-06); beta
  0.5.0-beta.2 (2024-10-04). The GitHub repo gets occasional merges (two in
  September and October 2026). Coko stopped funding it in 2025; NLnet funds a
  rebuild (version 2: cssOM instead of CSSTree, web-component pages, a separate
  chunker). The rebuild lives in new repos (`fragmentainers`,
  `@pagedjs/paged-layout`, `paged-page`) with no release of Paged.js 2 yet.
  Risk: a future Electron Chromium breaks 0.4.3 and no fix ships.
- **Effort to parity:** low. Port `impagina.py` (about 350 lines) to TypeScript,
  fix the side-column float.
- **Author control:** CSS classes emitted by the TypeScript step; `stile.css`
  edits. Claude writes CSS fluently.

### Chromium `printToPDF` + Vivliostyle.js

- **Fidelity:** all of 1 to 16 work with `stile.css` unchanged (measured). Its
  feature list is the widest of the browser engines: margin boxes, running
  elements, `string-set`, `target-counter`, `target-text`, `leader()`, named
  pages, `:nth()` page selectors, footnotes with `@footnote`, page floats
  (`float-reference: page`), widows and orphans, its own root multicol.
  Fragmented the grid version of the side column better than Paged.js.
- **Predictability:** same as Paged.js (Chromium layout underneath).
- **Offline in Electron:** yes. Load `@vivliostyle/core` (the `CoreViewer`) in
  a hidden window, wait for the "complete" state, then `printToPDF`. The CLI
  does exactly this with Playwright; the app would do it with Electron. Fonts
  must be referenced by relative URL from the served document.
- **Bundle size:** about 0.8 MB for the core.
- **Speed:** 1.9 s with the CLI including browser start; layout alone not
  measured. Expect about 1 s in a warm Electron window (estimate).
- **Live preview:** yes, Vivliostyle Viewer renders pages in the browser,
  with page navigation. Works in the browser shell.
- **Maintenance and licence:** AGPL-3.0. Very active: core 2.45.2
  (2026-09-23), CLI 11.3.3, pushes this week. Backed by the Vivliostyle
  Foundation. AGPL means: if the app is distributed, its source must be
  available under AGPL-compatible terms. For a single-user app that is never
  distributed, no obligation applies.
- **Effort to parity:** low, same as Paged.js.
- **Author control:** same as Paged.js; plus page floats and footnotes if the
  layout grows.

### Native Chromium, no polyfill

- **Fidelity:** margin boxes, `counter(page)`, `counter(pages)` (Chrome 131+),
  named pages (`page:` property) and margin-box backgrounds work (tested in
  Chromium 147). Missing: running elements, `string()`, `target-counter()`.
- **How the layout would map:** the TypeScript step emits one named page per
  scene (`page: s3`) and a generated `@page s3 { … }` rule with that scene's
  footer text and an SVG tab strip as the `@right-top` background. Page
  numbers in references need two passes: print, read each target's page from
  the PDF, inject the numbers, print again. A Chromium design-docs thread from
  2026 mentions work on `target-counter()`; status unverified.
- **Pros:** no third-party layout engine; nothing to break on a Chromium
  update. **Cons:** more custom code; two-pass references; the float problem
  remains. A fallback if both polyfills fail, not a first choice.

### Typst (WASM or native)

- **Fidelity:** every hard requirement maps to a built-in feature:
  - page: `set page(paper: "a4", margin: …)`;
  - page per scene: a `scene()` function that sets the page, so each scene
    starts a new page;
  - edge tabs: `set page(foreground: …)` with `place()`, active tab passed as
    an argument (works on overflow pages);
  - footer: `set page(footer: …)` with `counter(page).display()`;
  - "p. N": `ref(<label>, form: "page")` or `locate(<label>).page()`;
  - side column: `grid(columns: (1fr, 58mm))`; grid rows break across pages;
  - boxes: `block(fill:, stroke:, breakable: false)`;
  - checkboxes: `box(width: 3mm, height: 3mm, stroke: …)`;
  - tables: `table` with `table.header(repeat: true)`;
  - keep with next: `block(sticky: true)`;
  - two columns: `columns(2)`;
  - widows and orphans: `text(costs: (widow:, orphan:))`.

  No text wrap around floats (packages `wrap-it`, `meander` exist), but the
  layout does not need it: the side column is a column. Footnotes are
  built in.

- **Predictability:** best of all. Own layout engine, own shaping, fonts loaded
  from the bundled files only (`--ignore-system-fonts`, or no default fonts in
  WASM). Typst 0.15 made floating-point maths deterministic across platforms
  (changelog). Measured here: repeat runs byte-identical; native and WASM
  identical in layout. Not measured on Linux and Windows.
- **Offline in Electron:** three ways, all offline:
  1. typst.ts WASM in a worker (28.8 MB `.wasm`, 10.5 MB npm tarball). Same
     code runs in the browser shell. Must call `disableDefaultFontAssets()`,
     or it fetches fonts from a CDN.
  2. `@myriaddreamin/typst-ts-node-compiler` (napi, prebuilt per platform) in
     the main process.
  3. The official `typst` CLI as a sidecar (43 MB binary on macOS arm64;
     14 to 22 MB compressed per platform).
- **Speed:** fastest by far. 31 pages in 0.04 to 0.09 s native, 0.16 s WASM
  after init.
- **Live preview:** yes. typst.ts renders pages to SVG or canvas, with
  incremental compilation; at 0.16 s per full compile, preview on every
  keystroke pause is realistic. Identical in Electron and in the browser shell.
- **Maintenance and licence:** Apache-2.0. Typst is very active (0.15.1,
  2026-07). typst.ts lags: stable 0.7.0, the 0.8 release candidate tracks Typst
  0.15.0-rc.1. Pin both.
- **Source into Typst:** keep the TypeScript port of the parsing step, but emit
  data instead of HTML: a JSON model of the adventure (scenes, fields, threats)
  read by a Typst template with `json()`. Markdown fragments inside fields go
  through `cmarker` (a Typst package with pulldown-cmark compiled to a WASM
  plugin; tables and task lists supported), vendored into the app since
  `@preview` packages are downloaded on first use. Alternative: a TypeScript
  emitter from the Markdown AST to Typst markup (needs careful escaping).
  Pandoc is not needed.
- **Effort to parity:** medium. Rewrite `stile.css` (119 lines) as a Typst
  template (about 200 to 300 lines; the proof below covers a scene page in
  60). The skill keeps WeasyPrint and CSS unless it moves to Typst too (the
  Typst CLI would also remove Pango from the skill).
- **Author control:** functions with arguments (`scene()`, `threat()`), set and
  show rules. Clear error messages with line numbers. Claude knows Typst less
  well than CSS but writes it adequately; the proof needed two small fixes.

### WeasyPrint (revisited)

- **Fidelity:** the reference. 13 pages, everything works.
- **Builds in 2026:** v70.0 (2026-09-08) ships official Windows executables
  only (onefile 31.5 MB, onedir 32.3 MB, built with MSYS2). No macOS or Linux
  executables. No WASM build found: Pyodide has no Pango.
- **Verdict:** the rejection stands, narrowed. Windows is solved upstream; macOS
  needs a self-made PyInstaller bundle with Homebrew Pango dylibs relocated,
  signed and notarised; Linux needs an AppImage or a Pango dependency. Three
  release pipelines instead of none. A sidecar process also means slower
  start-up and no in-editor preview of pages.

### Others

- **Prince:** best CSS paged-media support. Desktop licence USD 495 per user and
  computer; redistribution inside an app needs an OEM licence quoted case by
  case. The free licence adds a watermark. Native binary per OS. Not worth it.
- **pdfmake, @react-pdf/renderer, pdf-lib:** programmatic, MIT. pdfmake and
  react-pdf are active; pdf-lib was last released in 2022. No running headers from content, no page
  cross-references without two passes, own box model; every `stile.css` rule
  becomes code. pdf-lib is low-level drawing only. Reject.
- **LaTeX in WASM:** SwiftLaTeX last pushed 2024, AGPL; busytex is active but
  experimental and large (a TeX Live subset in WASM). Slow, hard to theme for
  Claude. Reject.
- **Quarto:** a CLI that bundles Pandoc, Deno and Typst; too large for an
  in-app step, and it would only add Pandoc in front of Typst. Reject.

## Comparison

Scores: ● good, ◐ partial, ○ poor.

| Criterion                       | Paged.js                | Vivliostyle      | Native Chromium                  | Typst                        | WeasyPrint      |
| ------------------------------- | ----------------------- | ---------------- | -------------------------------- | ---------------------------- | --------------- |
| Required features, as CSS today | ● (measured)            | ● (measured)     | ◐ (no refs, no running elements) | ● (rewrite needed)           | ● (reference)   |
| Same as WeasyPrint's 13 pages   | ◐ 14                    | ◐ 14             | ○ 18 as is                       | not tested                   | ● 13            |
| Same input, same pages, one OS  | ●                       | ●                | ●                                | ● byte-identical             | ●               |
| Same pages across OSes          | ◐ unverified            | ◐ unverified     | ◐ unverified                     | ● by design, unverified here | ◐ Pango differs |
| Offline in Electron             | ●                       | ●                | ●                                | ●                            | ◐ sidecar       |
| Added size                      | ● 0.5 MB                | ● 0.8 MB         | ● 0                              | ◐ 29 MB WASM                 | ○ 30 MB+ per OS |
| Speed, 30 pages                 | ● about 1 s             | ● about 1 to 2 s | ● under 1 s                      | ● 0.16 s                     | ● about 1 s     |
| Live preview in the editor      | ●                       | ●                | ◐ screen only                    | ● same in browser            | ○               |
| Maintenance                     | ○ no release since 2023 | ● monthly        | ● (Chromium)                     | ● (typst.ts lags)            | ●               |
| Licence                         | ● MIT                   | ◐ AGPL-3.0       | ● BSD                            | ● Apache-2.0                 | ● BSD-3         |
| Effort to parity                | ● low                   | ● low            | ◐ medium                         | ◐ medium                     | n/a             |
| Reuses `stile.css`              | ●                       | ●                | ◐                                | ○                            | ●               |

## Recommendation

1. **Keep the HTML route and swap Paged.js for Vivliostyle.js.** Same CSS, same
   output as Paged.js today, active upstream, wider spec coverage. Accept AGPL
   while the app is personal; revisit if it is ever distributed.
2. **Fallback without AGPL:** Paged.js 0.4.3 pinned. It passed the same test.
   Plan for it to stay frozen.
3. **Fix the side column first.** The float is the one real gap between
   WeasyPrint and Chromium. Try a grid or flex layout per scene and check S5.
4. **Run the cross-OS check before building more.** Render the L'ancora HTML in
   Electron on macOS, Linux and Windows (CI runners are enough) and compare
   page count and text per page. If pages drift, switch to Typst: the
   TypeScript parsing step stays, only the output changes from HTML to a JSON
   model plus a Typst template.
5. **Change the parity goal in design.md:** "same structure as `impagina.py`"
   (page per scene, tabs, footers, references), not "match page by page". No
   engine except WeasyPrint itself gives 13 identical pages.

The current proposal stands in shape (TypeScript port, `stile.css`, fonts,
`printToPDF`). Only the polyfill changes.

## Proofs

### One scene page in CSS (Vivliostyle or Paged.js)

An excerpt of `stile.css` and the HTML that `impagina.py` emits. The full
stylesheet rendered correctly in both engines.

```html
<style>
  @page {
    size: A4;
    margin: 12mm 15mm 14mm 14mm;
    @right-top {
      content: element(linguetta);
      vertical-align: top;
      width: 15mm;
    }
    @bottom-left {
      content: "L'Ancora di Sabaoth · " string(sezione);
    }
    @bottom-right {
      content: counter(page);
    }
  }
  section {
    break-before: page;
  }
  .piede {
    string-set: sezione attr(data-testo);
    height: 0;
    overflow: hidden;
  }
  .linguetta {
    position: running(linguetta);
    width: 10mm;
    margin-left: 5mm;
    padding-top: 8mm;
  }
  .linguetta .t {
    height: 10mm;
    margin-bottom: 1mm;
    background: #ebe6dc;
  }
  .linguetta .t.on {
    background: #7b2d26;
    color: #fff;
  }
  .laterale {
    float: right;
    width: 58mm;
    margin: 0 0 4mm 6mm;
  }
  .principale {
    margin-right: 64mm;
  }
  .minaccia {
    border: 0.45mm solid #1c1a17;
    padding: 3mm;
    break-inside: avoid;
  }
  .box {
    display: inline-block;
    width: 3mm;
    height: 3mm;
    border: 0.35mm solid #1c1a17;
  }
  .m-rimando a::after {
    content: ", p. " target-counter(attr(href), page);
  }
</style>
<section class="scena">
  <div class="linguetta">
    <div class="t">S2</div>
    <div class="t on">S3</div>
    <div class="t">S4</div>
  </div>
  <div class="piede" data-testo="S3. Il cordone di Donato"></div>
  <h2>Il cordone di Donato</h2>
  <aside class="laterale">
    <div class="minaccia">
      Tenente Donato · Minaccia Straordinaria<br />
      Ferite <span class="box"></span><span class="box"></span
      ><span class="box"></span>
      <div class="m-rimando">
        <a href="#scheda-tenente-donato">scheda completa</a>
      </div>
    </div>
  </aside>
  <div class="principale">
    <p>Donato ha preso il controllo della piazza…</p>
  </div>
</section>
```

### One scene page in Typst

Compiled as written with Typst 0.15.1:
`typst compile --ignore-system-fonts --font-path <skill>/scripts/fonts scena.typ`.
Two pages: the S3 scene with its tab lit, a threat box with checkboxes and
"scheda completa, p. 2", and the reference page it points to.

```typst
#let ink = rgb("#1c1a17")
#let accent = rgb("#7b2d26")
#let paper = rgb("#f1ede4")
#let grey = rgb("#4a463f")
#let tabs = ("Notte", "S1", "S2", "S3", "S4", "S5", "Schede")
#let sans = (font: "IBM Plex Sans", stretch: 87.5%)

#set text(font: "Spectral", size: 9.5pt, fill: ink, lang: "it")
#set text(costs: (widow: 100%, orphan: 100%))
#let label-style(body) = text(..sans, weight: 600, size: 8.5pt, tracking: 0.08em, fill: accent, upper(body))

// The tab column on the right edge; `active` is lit.
#let edge-tabs(active) = place(top + right, dy: 20mm,
  stack(spacing: 1mm, ..tabs.map(t => box(
    width: 10mm, height: if t.len() > 3 { 18mm } else { 10mm },
    fill: if t == active { accent } else { rgb("#ebe6dc") },
    align(center + horizon, text(..sans, weight: 600, size: 8.5pt,
      fill: if t == active { white } else { grey }, t))))))

#let checkbox = box(width: 3mm, height: 3mm, stroke: 0.35mm + ink, baseline: 0.4mm)
#let boxes(n) = range(n).map(_ => checkbox).join(h(0.6mm))

#let threat(name, grade, wounds, afflictions, sheet) = block(
  stroke: 0.45mm + ink, inset: 3mm, width: 100%, breakable: false, {
  text(font: "IM FELL English", size: 14pt, name); linebreak()
  text(..sans, size: 8.5pt, fill: grey, [Minaccia #grade])
  v(1.5mm)
  grid(columns: (13mm, auto), row-gutter: 1mm,
    text(..sans, size: 8.5pt)[Ferite],
    range(calc.quo(wounds, 3)).map(_ => boxes(3)).join(h(1.4mm)),
    text(..sans, size: 8.5pt)[Afflizioni], boxes(afflictions))
  v(1.5mm)
  text(..sans, size: 8.5pt, fill: grey, [scheda completa, p. #context locate(sheet).page()])
})

#let scene(id, name, where, side: none, body) = {
  set page(paper: "a4", margin: (top: 12mm, right: 15mm, bottom: 14mm, left: 14mm),
    foreground: edge-tabs(id),
    footer: text(..sans, size: 8.5pt, fill: grey,
      [L'Ancora di Sabaoth · #id. #name #h(1fr) #context counter(page).display()]))
  grid(columns: (auto, 1fr), column-gutter: 4mm, align: bottom,
    text(font: "IM FELL English", size: 36pt, fill: accent, id),
    [#text(font: "IM FELL English", size: 22pt, name) \ #text(size: 9pt, fill: grey, where)])
  line(length: 100%, stroke: 0.6mm + ink)
  grid(columns: (1fr, 58mm), column-gutter: 6mm, body, side)
}

#scene("S3", "Il cordone di Donato", [piazza del Duomo e l'uscita nord della città.],
  side: threat("Tenente Donato", "Straordinaria", 6, 2, <scheda-donato>))[
  #block(fill: paper, inset: (x: 4.5mm, y: 3.5mm), breakable: false)[
    #label-style[Da leggere] \
    #emph[Una piazza di macerie e fuochi, sotto la facciata spaccata del Duomo.]]
  #block(sticky: true, text(font: "IM FELL English", size: 13pt, fill: accent)[Cosa succede da sé])
  - Donato ha preso il controllo della piazza e tiene l'uscita nord.
]

#scene("Schede", "Schede", [])[
  #block[#text(font: "IM FELL English", size: 15pt)[Tenente Donato] <scheda-donato>]
]
```

## Unverified

- Page drift across macOS, Linux and Windows, for Chromium and for Typst. Only
  macOS was tested.
- Vivliostyle and Paged.js inside Electron itself (tested in Chrome for Testing
  147 with Playwright, the same engine family).
- Layout time of Vivliostyle core without browser start.
- Chromium work on `target-counter()` (mentioned in a 2026 design-docs thread).
- Prince prices: the pricing page carries no date.

## Sources

- [design.md, PDF for the table](../design.md#pdf-for-the-table)
- [Paged.js repository](https://github.com/pagedjs/pagedjs) and
  [npm versions](https://www.npmjs.com/package/pagedjs?activeTab=versions)
- [Paged.js: a new chapter in paged.js life (May 2025)](https://pagedjs.org/posts/en/a-new-chapter-in-paged.js-life/)
- [Paged.js NLnet project](https://nlnet.nl/project/PagedJS/)
- [fragmentainers](https://github.com/pagedjs/fragmentainers) and
  [paged-layout](https://github.com/pagedjs/paged-layout)
- [Vivliostyle.js](https://github.com/vivliostyle/vivliostyle.js) and
  [supported CSS features](https://github.com/vivliostyle/vivliostyle.js/blob/master/docs/supported-css-features.md)
- [Vivliostyle CLI](https://github.com/vivliostyle/vivliostyle-cli)
- [Chrome: add content to the margins of printed pages](https://developer.chrome.com/blog/print-margins)
- [Chrome 131 release notes](https://developer.chrome.com/release-notes/131)
- [Electron `webContents.printToPDF`](https://www.electronjs.org/docs/latest/api/web-contents#contentsprinttopdfoptions)
- [Typst repository and releases](https://github.com/typst/typst/releases)
- [Typst 0.15 announcement](https://typst.app/blog/2026/typst-0.15/)
- [Typst `ref`, page form](https://typst.app/docs/reference/model/ref/)
- [typst.ts](https://github.com/Myriad-Dreamin/typst.ts)
- [cmarker.typ](https://github.com/SabrinaJewson/cmarker.typ)
- [WeasyPrint v70.0 release](https://github.com/Kozea/WeasyPrint/releases/tag/v70.0)
- [Prince purchase page](https://www.princexml.com/purchase/)
- [react-pdf](https://github.com/diegomura/react-pdf),
  [pdfmake](https://github.com/bpampuch/pdfmake),
  [pdf-lib](https://www.npmjs.com/package/pdf-lib)
- [SwiftLaTeX](https://github.com/SwiftLaTeX/SwiftLaTeX),
  [busytex](https://github.com/busytex/busytex)
- [Quarto and Typst](https://quarto.org/docs/output-formats/typst.html)
