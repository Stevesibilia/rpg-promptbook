## Why

The project page has a plain Markdown editor: the format package already finds
every problem in an adventure, but the user cannot see them while writing, has
no outline to move around a 30-page document, and has to remember the
template's fields. This change builds the editor agreed in
[docs/mockups/editor.html](../../../docs/mockups/editor.html), the screen the
owner will spend most of their time in.

Scope agreed with the owner on 2026-10-19: research notes and snapshots wait
for #4 (the connector writes the first and triggers the second); the
inspiration view and its sources wait for a later issue, with only the seed
shown in the inspector; the `/` insert menu, the ⌘/ syntax sheet and the ⌘K
command palette are all in.

## What Changes

- **Live preview in the source editor:** Markdown marks (`##`, `**`, `>`,
  `[!leggi]`) show only on the lines being edited; headings, field labels and
  emphasis are styled; callouts show as coloured boxes with their label; the
  front matter folds to its first keys.
- **Problems in the editor:** the format package's errors and warnings as a
  margin dot and a squiggle, with the message and the quick fixes in a
  tooltip. Parsing runs off the main thread.
- **Outline** (⌘1): front matter, sections, scenes and sheets from the
  document, with error and warning badges, the current place highlighted,
  click to jump, scenes reordered by dragging or with the keyboard.
- **Inspector** (⌘2): This scene (the template's fields ticked or missing,
  with Insert, and buttons for read-aloud, handout, box, side box, sheet
  reference and reactions table), Checks (every problem, click to jump),
  To-do, and the Seed.
- **Insert tools:** `/` at the start of a line opens an insert menu; ⌘/
  opens the full syntax of the template; sheet names complete after
  `→ Schede:`.
- **Command palette** (⌘K): go to a section, scene or sheet, toggle panels,
  focus mode, set the status, jump between problems.
- **Focus mode** (⌘.): only the text, the sync indicator and the status bar.
- **Status bar:** current scene, cursor, error and warning counts, words,
  template, last sync.
- Campaigns use the same editor without checks: their skeleton is plain and
  unchecked.

Out of scope: snapshots and history, research notes (#4); the inspiration
view and its sources (later); PDF preview and review (phase 4); images and
music (phase 2); remote cursors; the desktop app (#6).

## Capabilities

### New Capabilities

- `editor`: the project page's editor: live preview, problems and fixes,
  outline, inspector, insert menu, syntax sheet, command palette, focus mode
  and status bar.

### Modified Capabilities

- `projects-screen`: the ⌘K hint now appears in the top bar of the project
  page; the plain editor requirement is removed, replaced by `editor`.

## Impact

- `packages/web` only: a new `src/editor/` area replacing
  `src/project/Editor.tsx`, a Web Worker for parsing, the shell's left panel
  and focus mode.
- New dependencies: `@codemirror/lint`, `@codemirror/autocomplete`.
- No change to the project document, the server, the format package or the
  sync protocol.
- E2E: a new `editor.spec.ts` against the compose stack.
