# Source format for adventures: research for Promptbook

Researched 2026-10-18. The question: in which text format should an adventure
be stored, so that the GM and Claude can edit it, Yjs can sync it, the app can
validate it, and the desktop app can turn it into a predictable, richly laid-out
PDF? And does a project already do this?

Rendering engines are covered in a parallel note,
[pdf-engines.md](pdf-engines.md). This note touches engines only where a format
implies one.

## Method and limits

- Inputs: `docs/design.md`; the `enhanced-avventure-rpg` template
  (`references/modello.md`, `references/esempio.md`, `scripts/controlla.py`);
  the `impagina-avventura` skill (`SKILL.md`, `scripts/impagina.py`,
  `scripts/stile.css`); the real adventure `avventure/l-ancora-di-sabaoth.md`.
- Library versions and dates come from npm and the GitHub API, read on
  2026-10-18. Licences come from the repos.
- Project features come from official pages or repos where reachable. Claims
  that rest on a third-party page or on memory are marked **(unverified)**.
- "How well Claude writes it" is a judgement from training-data presence and
  error tolerance. Nothing here is a measured benchmark. The only Typst evidence
  found is anecdotal forum posts.

## Requirements

### Elements the PDF needs

From `modello.md`, `impagina.py` and `stile.css`:

1. **Header metadata:** title and subtitle; system, format, duration, players;
   setting; timings; campaign, arc, fronts and threads for a campaign episode.
2. **Fixed sections**, in order: La vicenda in breve, Antefatto (optional), A
   colpo d'occhio (with the revelations list R1…), Da non perdere stasera,
   Orologio, Verità del mondo, Inizio forte, Mappa delle scene, Regole della
   notte (optional), Scene, Indizi, PNG, Schede, Prima della sessione, Appendice.
3. **Scenes** with an id (S1, S2…) and a name. One page per scene.
4. **Scene fields:** Luogo e momento, In gioco, Da non perdere qui, Cosa
   succede da sé, Chi c'è, Indizi qui, Prove e regole, Se deragliano, and for
   the climax Regole della situazione and Cosa decide la notte.
5. **Read-aloud block:** one per scene, plus the one in Inizio forte. Printed on
   a tinted background, in italics, labelled "Da leggere".
6. **Handout:** a document to give the players. Dashed box, labelled
   "Documento da consegnare".
7. **Sidebar:** a side column on the scene page (Da non perdere qui, Chi c'è,
   threat boxes) and on the overview page (Da non perdere stasera,
   Rivelazioni).
8. **Boxes:** tinted boxes (`riquadro`), the bordered "Prove e regole" box.
9. **Threat box:** name, grade, a row of checkboxes for Ferite and one for
   Afflizioni (Kulthos: Ordinaria 3/1, Straordinaria 6/2, Leggendaria 9/3,
   wounds grouped by 3), short talents, "branco" flag, and a link "scheda
   completa, p. N".
10. **Cross-references** from a scene to an NPC or threat sheet, printed with
    the target page number.
11. **Checklists** `- [ ]` printed as empty boxes (Da non perdere, Orologio).
12. **Tables:** the "Se i PG… | Allora…" reactions table, the scene map, the
    clue tracker with a ✓ column, the NPC table, the pregenerated stats table.
13. **Ids:** S1… for scenes, R1… for revelations, I1… for clues, with
    clue→revelation and clue→scene links.
14. **Sheets:** one per threat or NPC; pregenerated characters as cards.
15. **Scene tabs** on the page edge: an opening tab ("Notte"), one per scene,
    "Schede". The current scene's tab is highlighted.
16. **Running footer:** title and section; page number.
17. **Images**, now that the script can include them (design.md, "PDF for the
    table").
18. **Asset appendix:** per scene, `visual:` and `mood:` lines. Not printed;
    read by the asset board and the `.cbpack` export.

### What today's script infers, and what drops out

`impagina.py` reads structure from conventions. When a note departs from them,
the PDF changes without any warning. Found by reading the script against the
Sabaoth note:

| Convention                                      | Inferred as                                      | What goes wrong, silently                                                                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First line `# Titolo`                           | Cover title; `(…)` or `: …` becomes the subtitle | A Joplin note has its title outside the body: no cover title. A blank line or comment before it: same.                                                                                      |
| First lines under the title                     | First line above the title, the rest as meta     | The order of the header lines decides what is printed where.                                                                                                                                |
| `## Name` matched by exact name                 | One of the fixed pages                           | Any other `##` section is not printed. No warning.                                                                                                                                          |
| `### S1. Name` inside `## Scene`                | Scene id and tab                                 | A heading without `S1.` gets no id: no tab is lit.                                                                                                                                          |
| A paragraph starting with a known bold label    | A scene field                                    | An unknown label is appended to the previous field. Sabaoth S5: **Se il tempo stringe** lands inside "Regole della situazione". Text before the first label goes to a bucket never printed. |
| First blockquote of a scene                     | Read-aloud                                       | A handout written before the read-aloud becomes the read-aloud.                                                                                                                             |
| Later blockquotes                               | Handouts                                         | A quote meant as a plain quote becomes a handout. A handout has no title.                                                                                                                   |
| Every line starting with `\|`                   | The reactions table                              | A second table in a scene is glued to the reactions table.                                                                                                                                  |
| `→ Schede: Nome` in Chi c'è                     | Link plus threat box                             | In Da non perdere qui it is printed as raw text. Sabaoth S5: "→ Schede: Sabaoth, «Cosa offre»" appears verbatim, and Sabaoth gets no box.                                                   |
| `→ Schede: Nome` matching                       | Exact name, or a sheet title that starts with it | A name that matches nothing stays as text. Two sheets sharing a prefix: the first wins.                                                                                                     |
| `- **Tipo:** Minaccia Ordinaria/…`              | Grade, hence the boxes                           | Counts come from the grade table, never from the text ("Ferite: 2 contatori da 3" is ignored). Salvi's Avatar, written inside Salvi's sheet, gets no box.                                   |
| Bold keys in a sheet without a `Talenti:` line  | Talents                                          | Every key not in a hard-coded list (written for Sabaoth: "Al rito", "Se un PG viene cucito"…) becomes a talent in the box.                                                                  |
| `**Rivelazioni**` paragraph in A colpo d'occhio | Split point for the sidebar                      | Written with a colon or another case: no revelations sidebar.                                                                                                                               |
| `### Pregenerati` with `####` cards             | Pregenerated cards                               | Sabaoth uses a table and bullets: no cards, only the intro.                                                                                                                                 |
| Tab and footer labels                           | Fixed "Notte" / "La notte"                       | Wrong for a daytime adventure (Sabaoth runs from dawn to sunset).                                                                                                                           |
| Appendix `### S1. Name`                         | Asset board row                                  | Matched by heading text, so a renamed scene loses its row.                                                                                                                                  |

`controlla.py` already catches part of this (missing sections, scene titles,
missing fields, clue tracker consistency), but it is a separate script the GM
has to run, and it does not know the layout rules above.

### Other requirements

- **Yjs:** the document is a Y.Text in CodeMirror 6 (`y-codemirror.next`), or
  the format must justify a different binding.
- **Claude through MCP:** writes one section at a time; must get the syntax
  right first time, or get an error it can fix.
- **Offline:** parser and validator run in Electron and in the browser, in
  TypeScript, with no native binaries.
- **Readable elsewhere:** Joplin, Obsidian, GitHub, any text editor. A clean
  Markdown export.
- **Migration:** the existing Markdown notes and the Joplin export come in with
  no manual rewrite.
- **Stable ids** for scenes, sheets and boxes, so the asset board, the
  `.cbpack` and MCP edits survive renames and reordering.

## Formats evaluated

### 1. Plain Markdown with conventions (today)

- **Explicit?** No. Read-aloud vs handout is decided by order, threat data is
  prose inside a bullet, sidebar content is decided by the script.
- **Validation:** only by custom regex (`controlla.py`). No schema.
- **Claude:** the best case. Headings, bold labels, quotes, tables and task
  lists are the most common Markdown in training data. Errors are mild: the
  text still reads.
- **Plain text:** excellent. Diffable, Y.Text, Obsidian and Joplin read it.
- **Parser:** any CommonMark parser. `markdown-it` 15.0.3 (Oct 2026), `remark`
  / `micromark` (`mdast-util-from-markdown` 2.1.0, Oct 2026), `@lezer/markdown`
  1.8.0 for CodeMirror (Oct 2026). All MIT, all maintained.
- **Section edits and ids:** headings give sections; S1… gives scene ids;
  sheets have no id beyond their title.
- **Preview:** CodeMirror source plus a rendered pane.

The problem is not the format. It is a parser that guesses and stays silent.

### 1b. Markdown with callouts (`> [!type] Title`)

A variant of 1. Obsidian callouts: a blockquote whose first line is `[!type]`,
with an optional title and a `+`/`-` fold marker. Obsidian falls back to `note`
for an unknown type. GitHub supports five fixed types as "alerts".

- **Explicit?** Yes for prose boxes: `> [!leggi]`, `> [!documento] Lettera`.
  No attributes beyond type, title and fold.
- **Validation:** the type is a closed vocabulary the app can check.
- **Claude:** very common now (GitHub alerts, Obsidian). Forgiving: a callout
  ends where the quote ends, so there is no closing marker to forget.
- **Plain text:** best degrade path of all extensions. Any viewer shows a
  blockquote with `[!leggi]` on the first line. Obsidian renders it as a box.
- **Parser:** a callout is a plain blockquote in every CommonMark parser; the
  type is read in a small mdast transform. Existing remark plugins
  (`@r4ai/remark-callout` 0.6.2, `remark-obsidian-callout` 1.5.1) last
  released in 2024; `remark-github-blockquote-alert` 2.1.0 (Mar 2026). Writing
  the transform in-house is about fifty lines.

### 2. CommonMark plus generic directives (`remark-directive`)

Syntax from the CommonMark "generic directives" proposal: `:name[label]{attrs}`
inline, `::name{attrs}` leaf, `:::name{attrs}` … `:::` container. Attributes
take `#id`, `.class`, `key="value"`.

- **Explicit?** Yes, every element, with attributes:
  `:::leggi`, `:::documento{titolo="La lettera di Neri"}`,
  `::minaccia{scheda=donato}`.
- **Validation:** none built in. "If directives are not handled, they do not
  emit anything", so the app must check names and attributes itself. Easy on
  the mdast.
- **Claude:** familiar from Docusaurus and VitePress admonitions (`:::note`).
  Attribute syntax is less common. A forgotten closing `:::` swallows the rest
  of the parent block.
- **Plain text:** fine in CodeMirror and Yjs. Obsidian and Joplin show the
  fence lines and attributes as literal text.
- **Parser:** `remark-directive` 4.0.0 (Feb 2025), `micromark-extension-directive`
  4.0.0, `mdast-util-directive` 3.1.1 (Oct 2026). MIT, unified collective.
  Stable rather than busy.
- **Section edits and ids:** `{#id}` gives explicit ids on containers.
- **Preview:** same as Markdown.

### 3. Pandoc Markdown (fenced divs and attributes)

`::: {.leggi}` … `:::`, `# Heading {#s1 .scena}`, `[text]{.ref}`.

- **Explicit?** Yes, everything can carry classes and key-value attributes.
- **Validation:** none. Lua filters can check, but that is code, not schema.
- **Claude:** good; Pandoc and Quarto documents are common.
- **Plain text:** like directives: Obsidian shows `:::` lines literally.
- **Parser:** the only full parser is Pandoc itself (Haskell, 3.12.1, Oct
  2026). In JS: `pandoc-wasm` 1.1.0 from the Pandoc org, 58.6 MB unpacked,
  GPL-2.0-or-later. Approximations: `markdown-it-attrs` 5.0.1 plus
  `markdown-it-container` 4.0.0 (last release 2023); they do not match Pandoc
  exactly.
- **Engine implied:** Pandoc writes Typst and LaTeX directly; Quarto builds on
  this.

### 4. MyST Markdown

Directives as ` ```{name} ` or `:::{name}` with `:option: value` lines; roles
`{name}` `` `text` ``.

- **Explicit?** Yes. Directives have a name, an argument, typed options and a
  body.
- **Validation:** built in. The parser reports `unknown directive`,
  `required argument not provided`, `required body not provided`, unexpected
  arguments (read in `myst-parser/src/directives.ts`). Custom directives are
  declared in a JS plugin with `arg`, `options` (with `type`), `body` and
  `run`.
- **Claude:** good from Sphinx and Jupyter Book, but it tends to mix in
  reStructuredText habits **(unverified)**.
- **Plain text:** backtick-fenced directives show as code blocks in Obsidian
  and on GitHub: a read-aloud would look like code. Colon fences show as text.
- **Parser:** `mystmd` 1.11.0 (Sep 2026), `myst-parser` 1.7.4 on markdown-it,
  `myst-to-typst` 0.0.39, all MIT, all JS, all maintained.
- **Engine implied:** MyST exports to Typst or LaTeX and needs the Typst binary
  installed; `myst-to-typst` is JS, so the Typst source could be produced in
  the app.
- **Fit:** a scientific publishing stack (citations, notebooks, executable
  cells). Most of it is weight Promptbook would carry for nothing.

### 5. Djot

John MacFarlane's Markdown successor. `::: leggi` divs; `{#s1 .scena key="v"}`
attributes before any block or after inline elements.

- **Explicit?** Yes, attributes everywhere, cleanly.
- **Validation:** none; easy to write on its AST.
- **Claude:** weak. Djot changes Markdown basics (`*strong*`, `_emphasis_`), so
  Markdown habits produce silent formatting errors.
- **Plain text:** readable, but not Markdown: Obsidian, Joplin and GitHub
  render it wrong.
- **Parser:** `djot.js`, MIT. Commits in Oct 2026, but the last npm release is
  `@djot/djot` 0.3.2 (Dec 2024). No CodeMirror 6 mode found **(unverified)**.
- **Migration:** every existing note needs a conversion, including emphasis.

### 6. Markdoc

Stripe's Markdown with tags: `{% leggi %}` … `{% /leggi %}`,
`{% minaccia scheda="donato" /%}`, attributes and variables.

- **Explicit?** Yes, all elements.
- **Validation:** the strongest out of the box. `Markdoc.validate(ast, config)`
  reports `tag-undefined`, `attribute-undefined`,
  `attribute-missing-required`, `attribute-type-invalid`,
  `attribute-value-invalid`, `child-invalid`, `tag-placement-invalid`,
  `missing-closing`, each with line numbers; tags can add their own
  `validate` function (read in `src/validator.ts`).
- **Claude:** fair. Less common than MDX or directives. Closing tags must be
  balanced; one missing `{% /scena %}` is a `missing-closing` critical error.
- **Plain text:** fine in Y.Text. Obsidian, Joplin and GitHub show the `{% %}`
  tags as text.
- **Parser:** `@markdoc/markdoc` 0.5.10 (Sep 2026), MIT, built on markdown-it.
  Maintained, still 0.x.
- **Preview:** renders to a tree for HTML or React.

### 7. MDX

Markdown with JSX: `<Leggi>…</Leggi>`, `<Minaccia scheda="donato" />`.

- **Explicit?** Yes.
- **Validation:** components can check props at render time; JSX syntax errors
  stop the whole document from compiling.
- **Claude:** good at JSX. MDX's blank-line rules around Markdown inside JSX
  are a common source of errors.
- **Plain text:** looks like code; Obsidian and Joplin do not render it.
- **Parser:** `@mdx-js/mdx` 3.1.1 (Aug 2025), MIT. It compiles content to
  JavaScript, so the document is code: a document written by Claude would run
  in the app.
- **Fit:** made for developer docs, not for a GM's notebook. Rejected.

### 8. AsciiDoc

Native blocks: sidebars (`****`), example blocks (`====`), quotes
(`[quote]` `____`), admonitions (`NOTE:`, `[NOTE]`), block attributes and
roles (`[#s1.scena,luogo="…"]`), document attributes in the header.

- **Explicit?** Yes. Sidebars and admonitions exist natively; roles carry
  custom types.
- **Validation:** no schema. Asciidoctor warns on some structural errors; the
  rest would be an extension.
- **Claude:** fair. It drifts into Markdown inside AsciiDoc **(unverified)**.
- **Plain text:** readable, but not Markdown. Obsidian and Joplin do not render
  it. Markdown export needs a converter.
- **Parser:** `@asciidoctor/core` 4.1.1 (Oct 2026), MIT, maintained.
  Asciidoctor PDF is Ruby, not JS. CodeMirror support: only the CodeMirror 5
  `codemirror-asciidoc` 2.0.1 (2022).
- **Migration:** every note needs a conversion.

### 9. Typst markup as the source

The adventure written directly as Typst: `#scena(id: "S1", luogo: [...])[...]`,
`#leggi[...]`, `#minaccia(grado: "straordinaria", ...)`.

- **Explicit?** Yes, and layout is fully in the author's hands.
- **Validation:** only as compile errors, plus `assert` and `panic` in the
  template. Messages read like a compiler, not like "S3 has no Luogo e
  momento".
- **Claude:** the weakest of the list. Forum reports say Claude's Typst
  "usually contains some errors"; the language had breaking changes up to
  0.15. Errors are fatal: no PDF until fixed.
- **Plain text:** a programming language. Bracket balance matters, Obsidian
  and Joplin do not render it, Markdown export needs a converter.
- **Parser:** the only parser is Typst's own (Rust). In JS through WASM:
  `typst.ts` 0.7.0 on npm, 0.8.0-rc3 on GitHub (Jun 2026), Apache-2.0.
  CodeMirror: `codemirror-lang-typst` 0.6.0 (Aug 2026).
- **Consumers:** the asset board and the `.cbpack` export would have to read
  Typst. A bad fit.
- **Better role:** Typst as the PDF target generated from the source, if
  pdf-engines.md picks it.

### 10. Structured block model (Tiptap, BlockNote, ProseMirror JSON)

Scenes, sheets and boxes as typed nodes with fields; rich text only inside
fields; stored as a Yjs XML fragment via `y-prosemirror`.

- **Explicit?** Fully. Invalid structure cannot be created.
- **Validation:** by construction. Content rules (a required field left empty)
  still need checks.
- **Claude:** cannot write ProseMirror JSON reliably at length. The MCP server
  would need one typed operation per node kind ("set field", "add clue"), or a
  Markdown round trip.
- **Plain text:** no. No diff, no Obsidian, no Joplin; Markdown only through a
  serializer.
- **Parser and editor:** Tiptap 3 (`@tiptap/markdown` 3.32.0, Oct 2026, MIT),
  BlockNote 0.56.0 (Oct 2026, MPL-2.0; its `xl-*` packages, which include the
  PDF and DOCX exporters, are GPL-3.0 or commercial), `y-prosemirror` (MIT,
  Oct 2026).
- **Section edits and ids:** natural; BlockNote gives every block an id.
- **Preview:** native WYSIWYG.
- **Fit:** reverses the design's decision for a CodeMirror Markdown editor, and
  makes Markdown import a lossy conversion instead of a parse.

## Comparison

Good / fair / poor against Promptbook's needs.

| Format                  | Every element explicit | Validation      | Claude writes it | Plain text, Obsidian | JS parser in 2026         | Section edits, ids | Existing notes migrate |
| ----------------------- | ---------------------- | --------------- | ---------------- | -------------------- | ------------------------- | ------------------ | ---------------------- |
| Markdown, conventions   | poor                   | custom regex    | good             | good                 | good                      | fair               | already there          |
| Markdown + callouts     | good for prose boxes   | custom, easy    | good             | good                 | good (own transform)      | fair               | automatic              |
| CommonMark + directives | good                   | custom, easy    | fair             | fair                 | good, slow-moving         | good (`{#id}`)     | automatic              |
| Pandoc Markdown         | good                   | Lua filters     | fair             | fair                 | poor (58 MB GPL WASM)     | good               | automatic              |
| MyST                    | good                   | good, built in  | fair             | poor (code fences)   | good                      | good               | automatic              |
| Djot                    | good                   | custom          | poor             | poor                 | fair (no release in 2026) | good               | full conversion        |
| Markdoc                 | good                   | good, built in  | fair             | fair                 | good, 0.x                 | good               | automatic              |
| MDX                     | good                   | runtime only    | fair             | poor                 | good                      | fair               | automatic, fragile     |
| AsciiDoc                | good                   | weak            | fair             | poor                 | good, no CM6 mode         | good               | full conversion        |
| Typst as source         | good                   | compile errors  | poor             | poor                 | WASM only                 | fair               | full conversion        |
| Structured block model  | good                   | by construction | poor without API | poor                 | good                      | good               | lossy conversion       |

## Existing projects

### The Homebrewery (naturalcrit)

- **Format:** Markdown with "Homebrewery Flavored Markdown". V3 adds `{{ }}`
  as a replacement for `<div>` and `<span>`: `{{note … }}` blocks with classes,
  ids and inline CSS (`{{purple,#book,text-align:center …}}`), single-brace
  attribute injection after an element, `\page` and `\column` breaks, `::`
  vertical space, definition lists, variables. The extension is now a separate
  package, `marked-hbfm` 1.0.1 (MIT, Oct 2026), on top of `marked`.
- **Predictability:** high inside its CSS theme, but pages are broken by hand
  with `\page`; content flows into fixed-size page boxes in the browser.
- **Offline:** web app (Node, MongoDB), self-hostable; not an offline desktop
  app. PDF through the browser's print dialog.
- **Licence:** MIT. v3.21.0 (Apr 2026), active (pushes Oct 2026). Its editor
  is CodeMirror 6.
- **Reuse:** the most-known RPG syntax, and `marked-hbfm` is reusable. But
  `{{ }}` is presentational (CSS classes, inline styles), not semantic: it
  says how a box looks, not that it is a read-aloud. Its 5e fonts and themes
  do not fit Kulthos. Worth borrowing: the snippet bar (insert a block from a
  button), the live side-by-side preview.

### GM Binder

- **Format:** Markdown plus HTML and CSS, Homebrewery-like; snippets for
  monster blocks; live preview **(unverified, third-party pages)**.
- **Offline:** no; online service. **Licence:** proprietary. Pricing not found.
- **Reuse:** none beyond ideas already in Homebrewery.

### BrewVault (Obsidian)

- **Format:** Homebrewery-style `{{note}}`, `{{descriptive}}`, `{{monster}}`
  blocks in Obsidian notes; `wide` spans two columns.
- **Output:** styled PDF written directly on desktop; automatic pagination.
- **Offline:** yes. **Licence:** MIT, v0.4.3, created about two months ago, 6
  stars. Small and young.
- **Reuse:** proof that Homebrewery syntax works inside a Markdown vault; little
  code to reuse.

### rpgtex / DND 5e LaTeX Template

- **Format:** LaTeX. Environments `DndReadAloud`, `DndComment`, `DndSidebar`,
  `DndTable`, plus monster blocks (`lib/dndmonster.sty`).
- **Predictability:** very high (TeX).
- **Offline:** yes, but needs a full TeX Live and `lualatex`.
- **Licence:** MIT. Last tagged release v0.8.0 (2020); commits still land
  (Oct 2026).
- **Reuse:** the element vocabulary matches Promptbook's (read-aloud, comment,
  sidebar, monster). No code fits an Electron app.

### Typst Universe packages

- **dragonling** 0.3.1 (Jul 2026, MIT, repo `coljac/typst-dnd5e`): `dndmodule`
  template, `statbox` (stat block from a dictionary, modifiers computed),
  `npcbox`, `spell`, `dndtab`, `breakoutbox(title, contents)`, page-wide
  `topfig`/`bottomfig`.
- **owlbear** 0.0.1 (Mar 2025, AGPL-3.0, GitLab): `book-template`, `dnd-note`,
  `dnd-terms`, `dnd-dialogue`.
- **mythographer-5e**, **wenyuan-campaign** (port of a LaTeX 5e template),
  **pf2e-style** (Pathfinder 2e stat blocks), **tressym-dnd** (character
  sheets). Licences not checked.
- **Lancer Typst template** on itch.io: a system-specific book layout
  **(unverified)**.
- **Reuse:** none of them is a source format; all are Typst functions called
  from Typst. If pdf-engines.md picks Typst, `dragonling`'s MIT `statbox` and
  `breakoutbox` are a model for the threat box and the boxes. Typst as the
  author's source is rejected above.

### Quarto

- **Format:** Pandoc Markdown; callouts as `::: {.callout-note}`.
- **Output:** Typst or LaTeX PDFs, custom Typst formats. "Quarto includes the
  Typst CLI so no separate installation of Typst is required."
- **Offline:** yes, as a CLI. **Licence:** MIT.
- **Reuse:** a model of the "Markdown source → Typst template" pipeline. Too
  big to embed (Pandoc plus Typst plus Deno) and not a library.

### mystmd

Covered under MyST above. Same pipeline idea as Quarto (Markdown → Typst), in
JS, needing the Typst binary for the PDF.

### Obsidian plugins

- **Trolls Printing Press** (MIT, v0.1.5, created Sep 2026, 0 stars):
  Markdown stays canonical; a bundled Typst WebAssembly compiler builds
  print layouts; A5 booklets imposed on A4 for saddle stitching; `✂️---`
  starts a new page or card; `title:`/`subtitle:` front matter; `![[map.png|wide]]`
  spans columns. All local. The closest existing thing to "Markdown in, Typst
  PDF out, offline, in an app" for RPG zines. Too new to depend on; worth
  reading if Typst is chosen.
- **Typst PDF Export:** Pandoc 3.7 for Markdown → Typst, Typst 0.13 for the
  PDF.
- **Better Export PDF**, **PDF Export Enhancer:** generic print exporters
  (headers, footers, outline).
- **Fantasy Statblocks** (MIT, Obsidian TTRPG Community): stat blocks as
  fenced code blocks holding YAML **(syntax from memory, not re-checked)**.
  A precedent for structured data inside a Markdown note.
- **Sly Flourish:** writes one-page Lazy DM prep in Obsidian and exports a
  two-column PDF with a custom stylesheet; his Single Page Lazy DM Prep
  Template lives in Notion.

### Other open-source tools

- **Kartana** (itch.io): a Makefile around Pandoc that builds printable RPG
  booklets from a folder of Markdown.
- **daggerheart-template** (pandoc-templates.org): Pandoc, a LaTeX template and
  Lua filters for two-column campaign PDFs.
- **Scribe** (scribe.pf2.tools): Markdown "with some extras" for Pathfinder 2e
  layouts. Licence and repo not found **(unverified)**.
- No open-source one-page-dungeon or OSR zine layout tool with its own source
  format was found.

### What the projects tell us

- Every RPG layout tool found starts from Markdown and adds one extension for
  boxes. None uses Djot, AsciiDoc, Markdoc or a block model.
- The RPG extensions (Homebrewery, BrewVault) are presentational: classes and
  CSS. None models "scene", "read-aloud", "handout" or "threat" as content
  types, and none validates an adventure against a template.
- The predictable PDFs come from LaTeX or Typst templates, fed from Markdown
  (Quarto, mystmd, Trolls Printing Press, Kartana).
- Promptbook's semantic, validated scene template has no existing equivalent.
  The syntax to adopt is small; the validator is the new part.

## Recommendation

### Format

**Keep CommonMark plus GFM (tables, task lists) as the stored text, with YAML
front matter and one extension: callouts for typed boxes. Turn every
convention of today's template into a closed, validated grammar.** The parser
never guesses: anything it cannot place is an error or a warning the GM sees
in the editor, and nothing is dropped.

Why:

- The current notes are already almost there. The two real guesses (which
  quote is the read-aloud, and threat data buried in prose) are fixed with
  callouts and keyed sheet fields. The rest becomes explicit by being
  validated, not by new syntax.
- Claude writes headings, bold labels, quotes, tables and task lists more
  reliably than any tag syntax, and a callout has no closing marker to forget.
- The text stays readable in Joplin, Obsidian (callouts render as boxes),
  GitHub and any editor. The Markdown export is the document itself.
- Import of the existing notes is a parse plus a mechanical rewrite, not a
  conversion between languages.

Generic directives (`remark-directive` syntax) are the reserved second
extension. Adopt them only when an element needs attributes a callout cannot
carry; the parser stack (remark) already supports them.

### Syntax for each element

Using L'ancora di Sabaoth. Field labels, section names and callout types are
Italian, like the template.

**Header metadata** moves to front matter. It removes the "first line must be
`# Titolo`" rule, survives Joplin's "Markdown + Front Matter" export, and lets
the opening tab say "Giorno" instead of the fixed "Notte".

```markdown
---
titolo: L'Ancora di Sabaoth
sottotitolo: Messina, 1908
sistema: Kulthos
formato: one-shot
durata: 4 ore
giocatori: 3 Dormienti pregenerati
ambientazione: Messina, 28 dicembre 1908, dalle 5:20 al tramonto (16:40 circa)
tempi: "S1 30' · S2 e S3 1 ora e 15' · strada e S4 45' · S5 1 ora · margine 30'"
linguetta: Giorno
---
```

**Sections** stay `## Name` from a closed list. An unknown section is a
warning and is printed as a plain section where it stands, never dropped.

**Scenes** stay `### S1. Name`. The id is `S1`; a scene heading without an id
is an error.

**Scene fields** stay bold labels opening a paragraph, from a closed list per
scene. An unknown label is an error ("S5: unknown field «Se il tempo
stringe»; add it to the template or use a box"). Text before the first label is
an error.

**Read-aloud, handout and boxes** become callouts:

```markdown
### S1. La casa che cede

**Luogo e momento:** casa-biblioteca di Neri, vicino al porto, 5:20 circa.

**In gioco:** chi esce vivo, Neri, la lettera.

**Da non perdere qui**

- [ ] Neri pronuncia le sue due frasi prima di morire.
- [ ] La lettera di Neri è nella sua tasca: si trova senza cercare fra i libri.

> [!leggi]
> Una trave è venuta giù di traverso, fra gli scaffali rovesciati. Sotto, fra
> i libri e la polvere, si muove una mano con gli occhiali spezzati ancora
> stretti fra le dita. Una voce rauca chiama i vostri nomi. Sopra le vostre
> teste, il soffitto scricchiola di nuovo.

> [!documento] La lettera di Neri
> Umberto, non sei pazzo: sei ingannato. Sabaoth non libera, incatena.
```

- `[!leggi]`: read-aloud. Exactly one per scene and one in Inizio forte;
  position in the scene does not matter.
- `[!documento] Title`: handout, printed in the dashed box with its title.
  Any number per scene.
- `[!riquadro] Title`: a tinted box in the main column.
  `[!riquadro|laterale] Title` puts it in the sidebar. The `|` metadata form is
  used by Obsidian themes **(unverified: not on the official help page)**.
- A plain `>` quote is a quote. Inside a scene the validator warns ("untyped
  quote in S2: read-aloud or handout?").
- An unknown callout type is an error with the list of valid ones.

Example of a sidebar box, for the climax:

```markdown
> [!riquadro|laterale] Se il tempo stringe
> Donato e i Quieti restano sulla strada; l'Avatar entra solo se Salvi ha
> perso la fede; la via più corta è l'offerta di Sabaoth, poi la scelta su chi
> pianta.
```

**Cross-references** keep `→ Schede: Nome`. They resolve to exactly one sheet,
by full title or by the part before the comma; anywhere in the document they
become a link with the page number. An unresolved or ambiguous name is an
error. Threat boxes appear in a scene's sidebar for every sheet with a grade
referenced in **Chi c'è**, once each. A graded sheet referenced elsewhere in
the scene gets a warning ("S5 cites Sabaoth outside Chi c'è: no threat box").

```markdown
**Chi c'è**

- **Tenente Donato**, vuole che tutto sia fermo; dice: «Nessuno si muove senza
  permesso.» → Schede: Tenente Donato
- **Pattuglia di Quieti**, respirano all'unisono. → Schede: Pattuglia di Quieti
```

**Sheets** keep `### Name` under `## Schede` and bullet fields with bold keys.
Threat data gets its own keys, so the box is built from data, not prose:

```markdown
### Tenente Donato, il Primo dei Quieti

- **Tipo:** Minaccia
- **Grado:** Straordinaria
- **Natura:** non risvegliata
- **Ferite:** 2 contatori da 3
- **Afflizioni:** 2
- **Volontà:** che tutto sia fermo; chi si muove senza permesso è uno sciacallo.
- **Condotta:** 1. Fermezza · 2. Impeto · 3. Prudenza (fa seguire, non
  insegue) · 4. Acume (è lì che Ignazio può arrivare all'uomo)
- **Talenti:** La Presenza (evoca una Pattuglia di Quieti) · Il Nulla (separa
  i Dormienti)

### Avatar di Sabaoth

- **Tipo:** Minaccia
- **Grado:** Straordinaria
- **Natura:** risvegliata
- **Talenti:** La Materia · Il Timore
```

- `Grado` picks the box counts from a per-system table (Kulthos today).
  `Ferite` and `Afflizioni` are optional; when present they must parse and
  agree with the grade, or the validator says so.
- `Branco: sì` replaces the "branco" substring.
- Talents come only from `Talenti`. No hard-coded list of keys.
- Salvi's Avatar becomes its own sheet, so it can get a box.

**Ids and the rest** stay as they are, now validated: `- **R1.** …` under
`**Rivelazioni**`, `- **I1.** … (R1)` in scenes, the clue tracker table,
`- [ ]` checklists, the reactions table (the table whose first header cell
starts "Se i PG"; any other table prints as a plain table).

**Images:** standard Markdown, `![Capo Peloro al tramonto](asset:s5-capo-peloro)`,
with `asset:` resolving to the project's asset store. Placement is the
template's choice in the first version.

**Asset appendix** matches rows by scene id, not by title:

```markdown
## Appendice: immagini e musica

### S3. Il cordone di Donato

visual: collapsed cathedral facade, soldiers in 1908 Italian uniforms standing
perfectly still among the ruins, survivors kneeling in rows, smoke and grey sky

mood: oppressive, martial, eerie stillness, a single drum
```

A title that no longer matches the scene is a warning, not a lost row.

**No layout markup in the first version:** no `\page`, no column breaks. The
template decides layout from the content types. This is what keeps the PDF
predictable.

### Parsing and validation

- One TypeScript package, used by the editor, the PDF builder, the asset board,
  the `.cbpack` export and the MCP server.
- Stack: `unified` with `remark-parse`, `remark-gfm`, `remark-frontmatter`, and
  an in-house callout transform (the existing callout plugins are not actively
  released).
- A model builder walks the mdast into a typed model: metadata, sections,
  scenes with fields and boxes, sheets, revelations, clues, appendix rows. Each
  item keeps its source range.
- `zod` schemas check the front matter and the sheet fields.
- Rules ported from `controlla.py` (sections and order, required scene fields,
  scene map vs scenes, three clues per revelation, tracker vs scenes,
  appendix rows) plus the layout rules above (unknown fields, untyped quotes,
  unresolved references, grade vs counts, one read-aloud per scene).
- Errors and warnings carry line and column. In the editor they show through
  `@codemirror/lint` 6.9.7; in the outline as a badge on the scene; in MCP as
  the tool result.
- The PDF builder refuses to drop content: it renders from the model, and the
  model holds every node or an error about it.

### Editor and preview

- CodeMirror 6 with `@codemirror/lang-markdown` (GFM), bound to Y.Text with
  `y-codemirror.next` 0.3.6. Callouts are blockquotes to the lezer parser, so
  no grammar work is needed for highlighting.
- Decorations: tint `[!leggi]` and `[!documento]` blocks, show the field
  labels as chips, underline `→ Schede:` references (click to jump).
- Autocomplete for field labels, callout types and sheet names after
  `→ Schede: `.
- Outline from the model: sections, scenes with their errors, sheets.
- Preview: a side pane rendering the model with the same HTML and CSS as the
  PDF. An Obsidian-style inline live preview can come later; WYSIWYG is not
  needed.

### Claude through MCP

- Section-scoped tools from the model's ranges: `get_scene("S3")`,
  `replace_scene("S3", markdown)`, `set_field("S3", "Luogo e momento", text)`,
  `get_sheet("Tenente Donato")`, `replace_section("Orologio", markdown)`.
- Each write is parsed and validated before it is applied as a Yjs update. On
  error the tool returns the messages and applies nothing, so Claude fixes and
  retries.
- A `validate` tool returns the whole-document report.
- A one-page grammar reference served by the MCP server, with `modello.md` and
  `esempio.md` updated to the new syntax.

### Migration of existing notes

An automatic converter, run on Markdown import and on the Joplin folder
export, idempotent, with a dry-run report:

1. Header lines (`**Sistema:** …`) and the `# Titolo` line → front matter.
   Joplin note title → `titolo` when the body has none.
2. In each scene: the first blockquote → `> [!leggi]`; later blockquotes →
   `> [!documento]` with an empty title and a warning to add one. In Inizio
   forte: the blockquote → `> [!leggi]`.
3. `- **Tipo:** Minaccia Straordinaria, non risvegliata · Ferite: … ·
Afflizioni: …` → `Tipo`, `Grado`, `Natura`, `Ferite`, `Afflizioni`.
4. HTML comments are dropped from the import copy (they are template notes).
5. Everything else is left as is, then validated. The report lists what still
   needs a human: unknown fields (Sabaoth S5 "Se il tempo stringe"), sheets
   nested in other sheets (Salvi's Avatar), unresolved references, missing
   handout titles.

Test cases: `l-ancora-di-sabaoth.md` and `esempio.md`. The converted files
must render the same PDF as `impagina.py` today, except where today's output
is a bug from the table above.

### What it costs

Rough sizes, for planning, not estimates.

- **Format package** (callout transform, model builder, zod schemas, about
  thirty rules, tests on the two adventures): the largest piece, medium.
  `controlla.py` and `impagina.py` are the specification.
- **Editor work:** lint wiring, callout and reference decorations,
  autocomplete, outline from the model: small to medium. No custom grammar, no
  WYSIWYG.
- **Converter:** small; the conventions are mechanical.
- **Claude prompting:** small. Update `modello.md`, `esempio.md` and the
  `enhanced-avventure-rpg` skill to callouts, front matter and sheet keys;
  write the grammar page for the MCP server. Claude needs to learn three
  callout types and four sheet keys; everything else it already writes.
- **Ongoing:** the grammar is Promptbook's own. Every new field, box or system
  is a schema change plus a rule plus a line in the grammar page.

### The main trade-off

Markdown with a validated house grammar keeps the text plain, Claude-friendly
and importable, but Promptbook owns the grammar and its validator. No library
provides it, and Obsidian or Joplin cannot check it. Markdoc or MyST would give
schema validation for free, at the cost of tag noise in the text, closing
markers Claude can break, poorer rendering in other tools, and a conversion of
every existing note. A block model would make invalid documents impossible, at
the cost of the plain text, the CodeMirror editor and an MCP API per node
type.

### What would change the recommendation

- If boxes start needing many attributes (placement, size, colour, player
  visibility), add generic directives for them rather than overloading
  callouts.
- If Obsidian or Joplin compatibility stops mattering, Markdoc becomes
  attractive for its validator.
- If the GM wants WYSIWYG editing above all, the block model is the only one
  that delivers it properly.

## Sources

- [The Homebrewery repo (naturalcrit)](https://github.com/naturalcrit/homebrewery)
  and its [V3 syntax guide](https://github.com/naturalcrit/homebrewery/blob/master/client/homebrew/pages/homePage/welcome_msg.md)
- [marked-hbfm (npm)](https://www.npmjs.com/package/marked-hbfm)
- [GM Binder on BackerKit](https://gmbinder.backerkit.com/hosted_preorders/project_updates?page=6)
  and [Stargazer's World review](https://stargazersworld.com/?p=15047)
- [BrewVault (Obsidian)](https://community.obsidian.md/plugins/brewvault),
  [repo](https://github.com/luiserivaldo/BrewVaultPlugin)
- [rpgtex DND 5e LaTeX Template](https://github.com/rpgtex/DND-5e-LaTeX-Template)
- [dragonling (Typst Universe)](https://typst.app/universe/package/dragonling),
  [owlbear](https://typst.app/universe/package/owlbear),
  [mythographer-5e](https://typst.app/universe/package/mythographer-5e),
  [wenyuan-campaign](https://typst.app/universe/package/wenyuan-campaign),
  [pf2e-style](https://typst.app/universe/package/pf2e-style),
  [tressym-dnd](https://typst.app/universe/package/tressym-dnd)
- [Lancer Typst template (itch.io)](https://tetragramm.itch.io/lancer-typst)
- [Quarto Typst output](https://quarto.org/docs/output-formats/typst.html)
- [mystmd: creating PDFs](https://mystmd.org/guide/creating-pdf-documents),
  [JavaScript plugins](https://mystmd.org/guide/javascript-plugins),
  [repo](https://github.com/jupyter-book/mystmd)
- [Trolls Printing Press (Obsidian)](https://community.obsidian.md/plugins/trolls-printing-press),
  [repo](https://github.com/daren-thomas/trolls-printing-press)
- [Typst PDF Export (Obsidian)](https://community.obsidian.md/plugins/typst-pdf-export),
  [Better Export PDF / PDF Export Enhancer](https://community.obsidian.md/plugins/pdf-export-enhancer)
- [Fantasy Statblocks](https://github.com/Obsidian-TTRPG-Community/fantasy-statblocks)
- [Obsidian callouts](https://obsidian.md/help/callouts)
- [Sly Flourish: one page prep notes](https://slyflourish.com/one_page_prep_notes.html),
  [Single Page Lazy DM Prep Template](https://slyflourish.notion.site/Single-Page-Lazy-DM-Prep-Template-979566c3bffa41d8b3ef211ce087de7a)
- [Kartana](https://davemenninger.itch.io/kartana),
  [daggerheart-template](https://pandoc-templates.org/template/daggerheart-template/)
- [pf2e-export-scribe (Foundry), on Scribe's markup](https://foundryvtt.com/packages/pf2e-export-scribe)
- [remark-directive](https://github.com/remarkjs/remark-directive),
  [micromark-extension-directive](https://github.com/micromark/micromark-extension-directive)
- [Markdoc validation](https://markdoc.dev/docs/validation),
  [Markdoc validator source](https://github.com/markdoc/markdoc/blob/main/src/validator.ts)
- [Djot](https://github.com/jgm/djot), [djot.js](https://github.com/jgm/djot.js)
- [MDX](https://github.com/mdx-js/mdx)
- [Asciidoctor.js](https://github.com/asciidoctor/asciidoctor.js),
  [codemirror-asciidoc](https://github.com/asciidoctor/codemirror-asciidoc)
- [Pandoc](https://github.com/jgm/pandoc), [pandoc-wasm](https://github.com/pandoc/pandoc-wasm)
- [Typst](https://github.com/typst/typst), [typst.ts](https://github.com/Myriad-Dreamin/typst.ts),
  [codemirror-lang-typst](https://github.com/kxxt/codemirror-lang-typst)
- [Typst forum: LLM code generation](https://forum.typst.app/t/llm-code-generation/1331),
  [Hacker News thread on LLMs and Typst](https://hn.svelte.dev/item/45693978)
- [BlockNote licence](https://github.com/TypeCellOS/BlockNote/blob/main/LICENSE.txt),
  [Tiptap](https://github.com/ueberdosis/tiptap), [y-prosemirror](https://github.com/yjs/y-prosemirror)
- [y-codemirror.next](https://github.com/yjs/y-codemirror.next)
