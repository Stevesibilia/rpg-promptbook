## Context

The editor is in [docs/design.md](../../../docs/design.md) ("Editor", "UI")
and the agreed mockup
[docs/mockups/editor.html](../../../docs/mockups/editor.html) (agreed
2026-10-18: editor first, markers only on the line being edited, Emerald
look). The mockup also shows parts that belong to later issues; this change
builds only what the proposal lists.

What exists, read on 2026-10-19 after #2 merged:

- `packages/web/src/project/Editor.tsx`: CodeMirror 6 with `markdown()`, a
  small `HighlightStyle`, `yCollab(doc.getText('document'), null,
{ undoManager })` and a `Y.UndoManager`. Awareness is `null`.
- `packages/web/src/project/ProjectPage.tsx`: loading and gone states, then
  `LivePage` in `Shell` with breadcrumbs, category, `StatusSelect`, and a
  `.later` notice above the editor.
- `packages/web/src/shell/Shell.tsx`: top bar, banner, rail (projects,
  document, settings), `main.center`, optional `aside.right`, status bar with
  `statusBarSync`.
- `packages/web/src/projects/TodoList.tsx`: `TodoList({ doc })`, the to-do
  editor over the Y.Doc, used by the project panel.
- `promptbook-format`: `parseAdventure(text, { template })` is pure and
  synchronous, runs every check, and returns `{ model, problems }`.
  `Problem { code, severity, message, range, sceneId?, fixes? }`, ranges with
  `offset`, 1-based `line` and UTF-16 `column`; `Fix { title, edits:
TextEdit[] }`, `TextEdit { from, to, insert }` in offsets. The model has
  `meta.range`, `sections[]` (`id`, `name`, `heading`, `known`, `role`,
  `range`, `headingRange`), `scenes[]` (`id`, `title`, `range`,
  `headingRange`, `fields[]`, `readAloud`, `reactions`, `references`),
  `sheets[]`. The acceptance test parses the 33.7 K Sabaoth fixture with a
  150 ms budget; the median on GitHub's runner was about 60 ms.
- `promptbook-project`: `readMeta`, `readDocument`, `currentSeed`,
  `countWords`; `summarize` skips parsing for campaigns and counts words
  after the front matter.
- `@codemirror/{commands,lang-markdown,language,state,view}`,
  `y-codemirror.next` 0.3.6 and `yjs` are already dependencies of
  `promptbook-web`.

## Goals / Non-Goals

**Goals:**

- The editor of the mockup's Document view, working in the browser against
  the server, with live sync as today.
- Problems visible where they are, with their fixes, without slowing typing.
- Moving around and restructuring a long adventure without scrolling.
- The template's rules at hand, generated from the template, never written
  out by hand.

**Non-Goals:**

- Snapshots and history, research notes (#4). The top bar has no History
  button and the inspector no Research section.
- The Inspiration view and sources of inspiration (later); the rail keeps
  Projects, Document and Settings.
- PDF preview and review (phase 4): no PDF button.
- Remote cursors and selections: awareness stays `null`.
- Any change to `promptbook-format`, `promptbook-project`, the server or the
  document shape. If the format package turns out to need a change (a wrong
  range, a missing field in the model), report it; do not change it in this
  branch without asking.
- The converter on paste: pasting into the editor pastes text as it is.
  Importing old notes stays in the import dialog.

## Decisions

### 1. Where the code lives

A new folder `packages/web/src/editor/`, replacing
`src/project/Editor.tsx`:

- `EditorPage.tsx`: the live project page (today's `LivePage`), composing
  the shell, outline, editor, inspector, palette and sheet.
  `ProjectPage.tsx` keeps the loading and gone states and renders it.
- `cm/`: the CodeMirror extensions: `preview.ts` (live preview),
  `problems.ts` (diagnostics and fixes), `slash.ts` (insert menu and sheet
  completion), `keymap.ts` (the shortcuts of decision 11), `theme.ts`.
- `analysis/`: `parse.worker.ts`, `client.ts` (the worker's client), and the
  `analysis` state field (decision 3).
- Pure modules, tested in Node: `outline.ts` (decision 6), `inserts.ts`
  (decision 8), `moveScene.ts` (decision 7), `fixes.ts` (decision 5),
  `palette.ts` (filter and commands list), `syntax.ts` (the syntax sheet's
  data from the template).
- Components: `Outline.tsx`, `Inspector.tsx` (with `ThisScene.tsx`,
  `Checks.tsx`, `SeedView.tsx`), `CommandPalette.tsx`, `SyntaxSheet.tsx`,
  `StatusBar.tsx`, `editor.css`.

`TodoList` is reused as it is in the inspector. Why pure modules: the logic
that writes text (inserts, moves, fixes) is where a bug corrupts a document,
and it can be tested without a browser.

### 2. Which documents are checked

Adventures and one-shots are parsed with `templates.avventura`, like
`summarize`. Campaigns are not parsed: no diagnostics, no This scene, no
Checks section, no `/` inserts except headings, and an outline built from
the Markdown headings (`##` and `###`) of CodeMirror's syntax tree. The
status bar says «Campaign · not checked». Why: the campaign skeleton is
plain and unchecked by the owner's decision of 2026-10-19; parsing it with
the adventure template would show only false errors.

### 3. Parsing off the main thread

- `parse.worker.ts` imports `parseAdventure` and `templates`, and answers
  `{ version, text }` with `{ version, model, problems }`. Created with
  `new Worker(new URL('./parse.worker.ts', import.meta.url), { type:
'module' })`, so Vite bundles it as a same-origin file (no blob URL: the
  server's CSP would block it).
- The client sends the text 250 ms after the last change, keeps at most one
  request in flight, and when an answer arrives for an older version than the
  latest sent it waits for the newer one instead of applying it.
- The result goes into a CodeMirror `StateField` (`analysis`) with the
  `Text` object it was computed for. It is **fresh** when that `Text` is the
  current `state.doc`, **stale** otherwise. The outline, inspector, status
  bar and palette read the latest result, fresh or stale; positions they show
  are mapped through the changes since (the field maps a few anchor positions
  per item, not the whole model).
- Everything that **writes** (fixes, inserts, moves) never uses a stale
  result: when the field is stale it calls `parseAdventure` synchronously on
  `state.doc.toString()` first. One parse on a click is acceptable; one per
  keystroke is not.
- Diagnostics are pushed with `@codemirror/lint`'s `setDiagnostics` only for
  a fresh result; between results the lint state maps the existing
  diagnostics through the edits, so they do not jump or vanish while typing.

Rejected: `linter()` with a synchronous source on the main thread (a 60 ms
parse after every pause drops frames on the Sabaoth document); parsing on
every keystroke; incremental parsing (the format package is not built for
it, and the worker makes it unnecessary).

### 4. Live preview

Decorations only: the document text never changes for display, and copy
copies the source. Built by a `ViewPlugin` from CodeMirror's Markdown syntax
tree (not from the format model, so it follows every keystroke), only for
`view.visibleRanges`.

- **Active lines** are the lines touched by any selection range. On them
  every mark shows; off them:
  - heading marks (`##`, `###`) are hidden; heading lines take the mockup's
    sizes (`.src h2`, `.src h3` in editor.html);
  - `**` and `*`/`_` marks are hidden, the text bold or italic; a bold run
    at the start of a line ending in `:` or alone on its line is styled as a
    field label (the mockup's `.fl`);
  - blockquote marks (`> `) are hidden on callout lines.
- **Callouts:** a blockquote whose first line matches
  `> [!type]` or `> [!type|meta]` plus an optional title, where type and
  meta are one of the template's `callouts`, gets a line decoration on each
  of its lines (`cm-callout`, `cm-callout-<role>`, `cm-callout-side` for
  `column: 'side'`), drawn as the mockup's boxes. Off the active lines its
  first line shows the callout's `label` and title as a widget (for example
  «Documento da consegnare · La lettera di Neri») in place of `[!documento] La lettera di
Neri`. An unknown type is a plain quote; the checks flag it.
- **Front matter:** with no selection inside it, it shows its fences faint,
  its first four key lines, and a «▸ N more keys» widget; a click on the
  widget, or the cursor entering the front matter, shows every line. With
  four keys or fewer nothing is folded.
- Lists, tables, links and images stay as source, in the prose font, with
  list marks kept (they are content).
- Prose in Spectral 17 px, about 70 characters wide, as today; `lang="it"`
  and spellcheck stay.

Why from the syntax tree: the preview must follow typing instantly; the
format model arrives 250 ms later and can be stale.

### 5. Problems and fixes

- Each problem becomes a diagnostic at `range.start.offset` to
  `range.end.offset` (a zero-length range is widened to the end of its line),
  severity kept, message as written by the format package.
- `lintGutter()` gives the margin dot; the underline and tooltip are themed
  with the tokens (`--danger` for errors, `--amber` for warnings).
- Each `Fix` becomes a diagnostic action named by its `title`. Applying it,
  in `fixes.ts`:
  - if the analysis is fresh, apply its `edits` as one transaction;
  - otherwise parse synchronously, find the problem with the same `code` whose
    start offset equals the diagnostic's current (mapped) `from`, and apply
    its fix with the same title;
  - if there is none, apply nothing and show «The text changed: check the
    problem again» in the tooltip.
- Edits are applied in one transaction, so they reach Yjs as one update and
  undo as one step.
- F8 and Shift-F8 go to the next and previous problem (`@codemirror/lint`'s
  `nextDiagnostic` and `previousDiagnostic`).

### 6. Outline

`outline.ts` builds a tree from the model:

- «Front matter» when `meta.range` is set;
- each section by its heading text, in document order;
- under the section with role `scenes`, each scene as «S1 La casa che
  cede» (id and title), or the heading when it has no id;
- under the section with role `sheets`, each sheet by name.

Each item has a range and a **badge**: the problems whose start lies in the
item's range and not in one of its children, coloured by the worst severity
among them. The item containing the cursor is highlighted. A click puts the
cursor at the start of the item's heading, scrolls it to the top and focuses
the editor. The outline collapses with ⌘1; its state is remembered in
`localStorage` (`promptbook.editor.outline`), like the theme.

For campaigns the tree comes from the `##` and `###` headings, with no
badges and no moves.

### 7. Moving scenes

`moveScene(text, model, sceneId, targetIndex)` returns the changes that move
one scene among the scenes of the `scenes` section:

- A scene's block runs from the start of its heading line to the start of
  the next scene's heading, or to the end of the `scenes` section for the
  last one.
- The moved block ends with exactly one blank line before the next heading;
  the rest of the text is byte-identical.
- Scene ids are not renumbered: ids are stable by design, and references to
  them (`Dove` columns, the appendix) would break.
- One transaction, one Yjs update, one undo step. Always computed from a
  fresh parse (decision 3).

In the outline, scenes are dragged with the pointer (a handle `⠿` as in the
mockup) and moved with Alt+↑ and Alt+↓ when a scene item has the keyboard
focus. Other items do not move.

### 8. Inspector and inserts

The right panel, collapsed with ⌘2, remembered in `localStorage`
(`promptbook.editor.inspector`). Its sections open and close, remembered too
(`promptbook.editor.sections`):

- **This scene** (adventures and one-shots): the scene containing the
  cursor, titled «This scene · S1». One row per template scene field, in the
  template's order, ✓ when the scene has it and ○ with **Insert** when it does
  not; optional fields are muted. A row «Da leggere `[!leggi]` · 1 per
  scene» is ✓ when `scene.readAloud` is set. Then the buttons Read-aloud,
  Handout, Box, Side box, → Sheet, Reactions table, and the line «Full syntax:
  ⌘/ · type / at the start of a line to insert». With the cursor outside any
  scene: «Put the cursor in a scene to see its fields.»
- **Checks:** «1 error · 2 warnings» in the heading; one row per problem in
  document order with its message and place («S5 · line 44», or the section
  name, or «Front matter»); a click selects the problem's range and scrolls
  to it.
- **To-do:** `TodoList` with a «5 / 9» count in the heading.
- **Seed:** the current seed (`currentSeed`), read-only, with an **Edit**
  link to the project panel (`/?p=<id>`); «No seed yet.» when empty.

`inserts.ts` holds every insert, used by This scene, the `/` menu and the
palette, so each writes the same text:

| Insert                | Text                                                      | Where                                                                              |
| --------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Inline field          | `**Label:** ` and the cursor after it                     | template order (below)                                                             |
| Block field           | `**Label**`, a blank line, `- ` and the cursor            | template order                                                                     |
| Read-aloud (row)      | `> [!leggi]`, a newline, `> ` and the cursor              | after «Da non perdere qui» if present, else as a field before «Cosa succede da sé» |
| Read-aloud (button)   | as above                                                  | as its own block after the cursor's block                                          |
| Handout               | `> [!documento] ` with the cursor for the title, `> `     | after the cursor's block                                                           |
| Box, Side box         | `> [!riquadro] `, `> [!riquadro\|laterale] `, then `> `   | after the cursor's block                                                           |
| → Sheet               | `→ Schede: ` and the sheet completion opened              | at the cursor, on its own line                                                     |
| Reactions table       | `\| Se i PG… \| Allora… \|`, the separator, one empty row | after the cursor's block                                                           |
| New scene (menu only) | `### S<n>. ` with the next free number                    | at the cursor's line, in the scenes section                                        |

**Template order:** a missing field goes right after the last present field
that comes before it in the template's `sceneFields`, or right after the
heading line when none does. Every insert keeps one blank line between
blocks, never two, and places the cursor where the user types next. Strings
come from the template (labels, callout types and labels, the reactions
table's first header, the references marker, the scene id prefix), not from
literals in the web package.

### 9. The `/` menu and sheet completion

`@codemirror/autocomplete` with two sources, adventures and one-shots only:

- `/` typed as the only character of a line opens the menu: in a scene, its
  missing fields first, then the other inserts of decision 8 allowed there
  (callouts by their template `allowedIn`), then New scene; outside a scene,
  the callouts allowed in that section, and New scene in the scenes section.
  Choosing an entry replaces the `/`; Escape leaves the `/` as typed.
- After the references marker (`→ Schede: `), the sheet names from the model
  complete.

For campaigns `/` offers only `## ` and `### ` headings.

### 10. Syntax sheet and command palette

- **Syntax sheet** (⌘/): a dialog generated by `syntax.ts` from the template:
  front matter keys with their requirement, sections in order with
  requirement, scene fields with form and requirement, callouts with their
  syntax, label, where they are allowed and how many per scene, the
  references marker, the reactions table, sheet keys, and the id prefixes. For
  a campaign it opens with a line saying campaigns are not checked.
- **Command palette** (⌘K, and the ⌘K hint in the top bar as in the mockup):
  a dialog with a text field and a list. Entries: every outline item («Go to
  S3 Il cordone di Donato»), Toggle outline, Toggle inspector, Focus mode,
  Syntax sheet, Set status (Draft, In progress, Complete), Next problem,
  Previous problem, Back to projects. Typing filters by words in order,
  case and accent insensitive (`palette.ts`, no new dependency). ↑ ↓ move,
  Enter runs, Escape closes. Each row shows its shortcut.

### 11. Shortcuts, panels and focus mode

One table in `cm/keymap.ts`, used by the editor, the tooltips and the
palette (Mod is ⌘ on the Mac, Ctrl elsewhere):

| Keys          | Action                      |
| ------------- | --------------------------- |
| Mod-1         | toggle outline              |
| Mod-2         | toggle inspector            |
| Mod-.         | focus mode                  |
| Mod-/         | syntax sheet                |
| Mod-k         | command palette             |
| F8 / Shift-F8 | next / previous problem     |
| Escape        | close a dialog, leave focus |

Mod-/ replaces CodeMirror's `toggleComment` from `defaultKeymap`. The
shortcuts also work when focus is outside the editor (a document-level
handler), except while a dialog has focus.

**Focus mode** hides the rail, the outline, the inspector, the breadcrumbs
and the top-bar controls except the focus button and the sync pill; the status bar stays; the
text stays centred. It is not remembered across reloads.

The top bar of the project page: breadcrumbs, category, status, the outline
and inspector toggles, focus mode, the ⌘K hint, the sync pill. No History,
no export, no PDF.

`Shell` gets an optional `left` panel and a `focus` flag; the projects,
bin and settings pages are unchanged.

### 12. Status bar

Left to right: the current place («S1 · La casa che cede», or the section
name), «Ln 27, Col 84», error and warning counts (a click opens the
inspector's Checks), words (`countWords` of the text after the front matter,
as in the summary), «Template: Avventura v1» (from the template's `name` and
`version`) or «Campaign · not checked»; on the right, the sync text as
today.

### 13. Tests

- Vitest in Node for the pure modules, against the Sabaoth fixture
  (`packages/format/fixtures/l-ancora-di-sabaoth.converted.md`) and the
  adventure skeleton:
  - `outline.ts`: the tree and its badges;
  - `inserts.ts`: each insert's text and position, including a field missing
    between two present ones, a field in an empty scene, and blank lines kept
    to one;
  - `moveScene.ts`: moving S2 after S3 then back is byte-identical; a reparse
    after a move has the same scenes and no new problems; moving the last
    scene keeps the next section intact;
  - `fixes.ts`: fresh fix, stale fix found again, stale fix gone;
  - `palette.ts` filtering, accents included; `syntax.ts` covers every
    field, section and callout of the template;
  - the preview's hidden ranges for a given `EditorState` and selection
    (heading, bold, callout header, front matter fold), with the
    decoration builder written as a function of the state so it runs without
    a DOM.
- Playwright, `e2e/editor.spec.ts`, against the compose stack and its seed,
  one test per scenario of the `editor` spec.
- The existing `projects.spec.ts` keeps passing (it types in `.cm-content`).

## Risks / Trade-offs

- **Browsers reserve some shortcuts.** Chrome and Firefox switch tabs on
  Mod-1 and Mod-2 before the page sees them. The bindings stay (the desktop
  app, #6, receives them); in the browser the top-bar toggles and the palette
  do the job. If another shortcut of decision 11 cannot be caught in Chromium,
  report it; do not invent a replacement.
- **Hidden marks and cursor motion:** replacing marks on inactive lines can
  make vertical motion and clicks land oddly near a heading or a callout
  header. Keep marks visible on every line a selection touches and do not
  make hidden ranges atomic; if a case stays wrong, report it with the steps.
- **Stale analysis:** every write path re-parses when stale (decision 3). A
  write that uses a stale model is a bug, not a trade-off.
- **Worker and CSP:** the server's helmet CSP must allow a same-origin module
  worker. If it does not, adding `worker-src 'self'` to it is the one server
  change allowed; say so in the hand-back with the console error it fixed.
  Nothing looser.
- **Parse time:** if typing in the Sabaoth project shows main-thread tasks
  over 50 ms (Chrome performance panel or a `PerformanceObserver` in the
  e2e), report the numbers before optimising.
- **Format package surprises:** a range that does not match the text, or a
  model field missing for the inspector, is reported to the architect, not
  patched around in the web package.

## Migration Plan

None: no stored data changes. The plain editor is replaced on deploy.

## Open Questions

None.
