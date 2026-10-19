## Why

The owner still prints every adventure with the `impagina-avventura` skill
(Python and WeasyPrint, outside the app). The design moves that into
Promptbook with Typst, and the editor mockup already shows the PDF preview
beside the editor and the full-screen review
([docs/mockups/editor.html](../../../docs/mockups/editor.html)). The owner
moved the PDF ahead of the connector (#4) and the desktop app (#6), so it is
built in the web client now, with Typst's WASM build; the desktop app will
reuse the same package.

Scope agreed with the owner on 2026-10-19: the full-screen review, the
preview pane, layout checks and print options are all in. Versions of the
PDF wait for snapshots (#4); the Images option and image placement wait for
the asset board (phase 2).

## What Changes

- **A new `promptbook-layout` package:** the Typst template ported from
  `stile.css` and `impagina.py`, its fonts, and an engine that turns the
  format package's model into a PDF, page positions and layout checks. It
  runs the same in a browser worker and in Node.
- **PDF preview pane** (top bar **PDF**): takes the inspector's place and
  shows the page under the cursor, rebuilt as the user types.
- **Full-screen review** (⌘⇧P or **Review**): thumbnails with their section,
  single page, spread or fit width, zoom, layout checks, options, Save PDF
  and Print. Double-click on a page jumps to that text in the editor; Esc
  goes back.
- **Layout checks:** half-empty page at the end of a scene, a scene running
  to three pages or more.
- **Print options:** paper (A4 or Letter), ink saver, pregenerated sheets on
  or off, and the template (one today).
- **Footer and cover** carry the author, copyright and licence from the
  front matter, as the design decided on 2026-10-18.
- **Serving:** the server allows WebAssembly in its content security policy,
  serves pre-compressed assets and caches hashed ones.

Out of scope: earlier PDF versions and compare (#4); images in the PDF and
the missing-image check (phase 2); A5 booklet; the desktop app (#6);
replacing WeasyPrint in the `impagina-avventura` skill (a later change in
the plugin repository).

## Capabilities

### New Capabilities

- `pdf`: the PDF of an adventure, its preview, review, layout checks,
  options, save and print.

### Modified Capabilities

- `editor`: the project page now shows the PDF button and pane; the command
  palette gains the PDF commands.

## Impact

- New workspace `packages/layout` (`promptbook-layout`), with vendored fonts
  (SIL Open Font License) and the `cmarker` Typst package (MIT).
- `packages/web`: a PDF worker, the preview pane, the review screen, palette
  and shortcut entries.
- `packages/server`: content security policy, pre-compressed static files
  and cache headers. No new route, no schema change.
- New dependencies, pinned exactly: `@myriaddreamin/typst.ts`,
  `@myriaddreamin/typst-ts-web-compiler` and
  `@myriaddreamin/typst-ts-renderer`, all `0.8.0-rc3` (Typst 0.15.0). The
  compiler is 28.8 MB of WASM (7.6 MB with Brotli), loaded only when a PDF is
  first opened.
- The image grows by about 50 MB (the WASM and its compressed copies).
- No change to the format package's model, the project document or sync.
