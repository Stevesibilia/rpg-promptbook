## Context

Issue #33: help in choosing an adventure's licence. A pane lists the usual
licences with a short explanation of each; picking one sets `licenza` in the
project's front matter, or the default licence in Settings → Author and
licence. The format keeps accepting any SPDX id or free text, and the PDF
keeps printing it as today.

The mockup is [docs/mockups/licence.html](../../../docs/mockups/licence.html),
agreed with the owner (published as a private artifact; the implementer
reads the HTML file, whose `LIC` and `MARKS` arrays and `NOTES` hold the
agreed copy, and "The mockup in words" below says what was agreed).

Below, D1 to D10 are the architect's decisions; D11 onward are the plan's,
each with its reason.

### The code today

- **Shared modal.** `packages/web/src/ui/Modal.tsx` with `ui/modal.css`:
  `.scrim` > `.modal` (`role="dialog"`, `aria-modal`, `aria-label` = title),
  `.mh` with an `h3` and «✕», `.mb`, and an optional `.mf` footer. Escape,
  «✕» and a click on the scrim call `onClose`. No focus trap; callers focus
  themselves: `editor/SyntaxSheet.tsx:12-14` focuses its «✕» on mount.
  `className` adds to `.modal`.
- **Page shortcuts and dialogs.** `editor/panels.ts:43-58` `useShortcuts`
  ignores keys whose target or active element is inside a dialog, so a
  dialog that holds the focus keeps ⌘K, ⌘. and Escape to itself.
- **Palette.** `editor/palette.ts:9-24`: `PaletteAction` (`go`, `shortcut`,
  `status`, `pdf`, `projects`) and `PaletteEntry { key, label, keys, action }`;
  `paletteEntries(items, { checked })` at `:28` lists the commands, then
  «Back to projects» (`:55`), then the outline. `editor/CommandPalette.tsx`
  renders it.
- **Editor page.** `editor/EditorPage.tsx`: `dialog: 'palette' | 'syntax' |
null` at `:63`; `closeDialog` (`:176-179`) sets null and focuses the view;
  `runPalette` (`:183-205`) calls `closeDialog` first, then acts. The
  dialogs render at `:396-399`. The page's CodeMirror extensions are a
  `useMemo` read once when the view is created (`:269-277`); one of them,
  `hideHandler.of(...)`, is a Facet (`cm/problems.ts:19`) fed a function
  that reads a ref, so it never goes stale.
- **Editor view.** `editor/Editor.tsx`: the extensions are read when the view
  is created (`:39-41`, `:52`). Undo is Yjs's (`Y.UndoManager`,
  `yUndoManagerKeymap`, `:47`, `:54`), not CodeMirror's history.
- **Writes.** `editor/writes.ts:13-30` `write(view, edits, { selection,
userEvent, scroll })`: one transaction with `analyseNow`, between two
  `undoBoundary` stops, so one Yjs update and one undo step. `TextEdit` is
  `{ from, to, insert }` (`packages/format/src/model.ts:20-24`). Fixes do
  the same by hand (`cm/problems.ts:27-35`).
- **Front matter in the preview.** `editor/cm/preview.ts`:
  `frontMatterOf(doc)` (`:90-97`) finds a front matter that opens on a `---`
  first line and closes on `---` or `...`, answering `{ from, to, open,
close }` with the fences' line numbers. `KEY` (`:99`) is
  `^([A-Za-z_][\w-]*)[ \t]*:`, top level only. `frontMatterItems(state)`
  (`:106-129`) colours fences and keys and, past the fourth key
  (`SHOWN_KEYS`), adds a `fold` item while no selection is inside
  (`activeLines`, which is empty while the editor has no focus). The
  `PreviewItem` union is at `:23-28`. `frontMatterField` (`:336-343`)
  rebuilds on a doc change, a selection change or a focus change. Widgets:
  `CalloutLabel` and `FoldWidget` (`:262-305`) build their DOM by hand;
  `FoldWidget` listens to `mousedown`, calls `preventDefault` and
  dispatches. `TableWidget` is in `cm/tables.ts:193`.
- **Front matter as written.** `packages/project/src/skeleton.ts:29-46`
  writes the keys in the template's order
  (`packages/format/src/template/avventura.ts:27-28`: `copyright`, then
  `licenza`, last) for every category, campaigns included. An empty default
  is written as `licenza:` with nothing after it.
- **The format's rule.** `packages/format/src/parse/frontmatter.ts:93-104`:
  the value becomes `meta.licence = { text, spdx }`; `meta.licence.unknown`
  warns only for a token that looks like an SPDX id
  (`/^[A-Za-z0-9][A-Za-z0-9.+-]*$/`) and is not one. Free text with spaces
  passes silently. All seven CC values are in `spdx-license-ids`.
  `packages/layout/src/licence.ts`: `licenceShort`, `licenceUrl`
  (spdx.org). No curated list exists anywhere.
- **Settings.** `packages/project/src/settings.ts:5`, `licence: string`.
  `settings/SettingsPage.tsx:236-275` `AuthorDefaults`: uncontrolled inputs
  (`defaultValue`), saved on blur when the trimmed value differs, through
  `onSave({ ...settings, [key]: value })`; Enter blurs. The page renders it
  as `<AuthorDefaults key={state?.revision} …/>` (`:95`): a failed save
  bumps `revision` and remounts the card. `settings/saver.ts` sends one
  request at a time. The card sits in `NeedsServerGroup`
  (`desktop/NeedsServer.tsx:24-34`), a `<fieldset disabled>` while the
  desktop app is offline.
- **Read-only editor.** None: no `readOnly` or `editable` facet anywhere in
  `packages/web/src`; history shows snapshots in `history/HistoryView.tsx`
  without CodeMirror.
- **Tests.** Unit tests in `packages/web/test/*.test.ts` run without a DOM
  (`palette.test.ts`, `preview.test.ts`, `fixes.test.ts`, `inserts.test.ts`,
  `saver.test.ts`). E2E: `e2e/editor.spec.ts` (`projectWith` at `:37`
  creates a project with a given text; palette test at `:243`), settings
  pages in `sso.spec.ts:42` and `connector.spec.ts:248`.

### Corrections to the brief's facts

1. **Undo is Yjs's,** not CodeMirror's history. `write()` already stops
   capturing before and after, so a pick is one undo step; ⌘Z is
   `yUndoManagerKeymap`.
2. **`frontMatterField` rebuilds on doc, selection and focus changes,** not
   on every state change.
3. **The editor has no read-only state** today: the "not offered read-only"
   rule of D7 and D8 has nothing to attach to. Nothing is added for it.
4. **`yaml` is not a dependency of `packages/web`.** The round-trip test of
   D6 parses with `parseAdventure` from `promptbook-format`, which the web
   already depends on, and which also checks the SPDX rule.
5. **The mockup's free-text note uses a dash** («Current: X — not one of
   these…»). The app writes «Current: <value>, not one of these; picking
   one replaces it.»
6. **The widget shows when its line is not folded,** a finer rule than "the
   front matter is not folded": with four keys or fewer, or with `licenza`
   among the first four, the line is never folded (D8).

## Goals / Non-Goals

**Goals:**

- Choosing a licence without leaving the app, in plain words.
- One pane for the project's `licenza` and the Settings default.
- Free text keeps working exactly as today.

**Non-Goals:**

- ORC, OGL or any other game licence in the list (D12).
- Checking `licenza` against the list, or any change to the format's rule.
- Links from the PDF to the Creative Commons deeds (they stay on spdx.org).
- A licence field in the inspector or the project panel.

## The mockup in words

The mockup has five states, a «Free-text current» toggle and a «Folded front
matter» toggle. Its project, author and values are illustrative.

- **1 · Settings.** Settings → Author and licence, as today, except the
  Licence field: the input and, on the same row at its right, a button
  «Choose…» (`tb line`, `aria-haspopup="dialog"`). The hint «An SPDX id, or
  free text.» stays under the row. The input stretches; the button keeps its
  width.
- **2 · Editor line.** The caret is in the front matter, so it is open. The
  `licenza:` line ends with a faint «Choose…» (12 px, faint colour, 12 px
  left margin, small padding and radius; accent colour and a light accent
  tint on hover), title «Choose a licence for this project». With the caret
  outside, the front matter shows four keys and «▸ 4 more keys», and
  `licenza`, the last key, is folded with its «Choose…».
- **3 · Palette.** ⌘K lists «Choose licence…» among the commands, with no
  shortcut, just before «Back to projects». Enter or a click opens the pane.
  It works with the front matter folded.
- **4 · The pane.** A modal 820 px wide (`min(820px, 100vw - 32px)`),
  title «Choose a licence», «✕» at the right.
  - When the current value is not empty and not one of the eight, a note
    on an amber tint above the list: «Current: **<value>**, not one of
    these; picking one replaces it.» (the value in monospace).
  - On wide screens a header row, uppercase faint 10.5 px, sticky at the
    top of the scrolling body: an empty radio column, «Licence», then
    «Share», «Change», «Sell», «Credit», «Same licence», each centred over a
    54 px column and titled with its meaning (below). The header is
    `aria-hidden`.
  - The list (`role="listbox"`, `aria-label="Licences"`, `tabindex="0"`,
    `aria-activedescendant` on the selected row) has eight rows
    (`role="option"`, `aria-selected`). A row is a grid: a radio circle (a
    filled accent dot when selected), the main column, then the five marks.
    The main column holds: the short name in 15 px semibold, the plain name
    in muted 13 px, and «Current» as a small uppercase accent chip on the
    row equal to the current value; the summary in muted 13 px; then a
    faint line «Writes `<value>`» (Settings) or «Writes `licenza: <value>`»
    (editor), with the value as inline code, and «Full text» with the
    external-link icon, accent colour, when the licence has a link. Its
    title is «Opens <url> in a new tab».
  - A selected row has an accent tint and a 3 px accent bar on its left;
    with the list focused by keyboard it also gets a 2 px accent outline. A
    row tints on hover.
  - Each mark is ✓ (accent, «yes»), ✕ (danger, «no») or — (faint, normal
    weight, «does not apply»), with `title` «<meaning>: <word>» and
    `aria-label` «<Mark>: <word>».
  - At 760 px or narrower: no header row; a row is the radio and the main
    column, and the marks wrap under the main column as small bordered chips
    reading «✓ Share», «✕ Sell», «— Same licence», each with its name in
    muted text.
  - The footer: at the left, faint 12.5 px, «Not legal advice. Free text
    still works: type anything in the field.» (Settings) or «… in the front
    matter.» (editor); at the right «Cancel» (`tb line`) and «Use licence»
    (`tb primary`).
- **5 · After picking.** Picked from the widget, only the value on the
  `licenza:` line changed (the tint in the mockup is for the mockup only);
  ⌘Z undoes it in one step; no toast; the caret stays where it was, so the
  front matter stays open. From the palette with the caret in the body, the
  front matter stays folded and the change is out of sight.

The behaviour, from the mockup's script and notes:

- On open the list takes the focus; the row equal to the current value
  starts selected and is scrolled into view; with no match nothing is
  selected.
- A click selects a row. A double-click or Enter picks it. ↑ and ↓ move and
  wrap (from no selection, either goes to the first row); Home and End go to
  the first and last. A click on «Full text» only opens the link.
- «Use licence» is disabled with nothing selected, and when the selected row
  is the current value (title «Already the licence»). Picking the current
  value by Enter or double-click closes the pane and writes nothing.
- Escape, «✕», «Cancel» and a click outside close without writing. The focus
  goes back to where the pane was opened from.
- In Settings, picking puts the value in the field and saves it, as leaving
  the field does; the status shows «Saved».

### The eight entries

Copy exactly as below (`value`, `short`, `name`, `summary`, `url`), in this
order. Marks are Share, Change, Sell, Credit, Same licence; Y yes, N no, —
does not apply.

| value                       | short               | name                                    | url                                                | marks     |
| --------------------------- | ------------------- | --------------------------------------- | -------------------------------------------------- | --------- |
| `CC0-1.0`                   | CC0 1.0             | Public Domain Dedication                | https://creativecommons.org/publicdomain/zero/1.0/ | Y Y Y N N |
| `CC-BY-4.0`                 | CC BY 4.0           | Attribution                             | https://creativecommons.org/licenses/by/4.0/       | Y Y Y Y N |
| `CC-BY-SA-4.0`              | CC BY-SA 4.0        | Attribution-ShareAlike                  | https://creativecommons.org/licenses/by-sa/4.0/    | Y Y Y Y Y |
| `CC-BY-NC-4.0`              | CC BY-NC 4.0        | Attribution-NonCommercial               | https://creativecommons.org/licenses/by-nc/4.0/    | Y Y N Y N |
| `CC-BY-NC-SA-4.0`           | CC BY-NC-SA 4.0     | Attribution-NonCommercial-ShareAlike    | https://creativecommons.org/licenses/by-nc-sa/4.0/ | Y Y N Y Y |
| `CC-BY-ND-4.0`              | CC BY-ND 4.0        | Attribution-NoDerivatives               | https://creativecommons.org/licenses/by-nd/4.0/    | Y N Y Y — |
| `CC-BY-NC-ND-4.0`           | CC BY-NC-ND 4.0     | Attribution-NonCommercial-NoDerivatives | https://creativecommons.org/licenses/by-nc-nd/4.0/ | Y N N Y — |
| `Tutti i diritti riservati` | All rights reserved | No licence, copyright only              | none                                               | N N N — — |

Summaries, in the same order:

1. «You give up your rights: anyone may copy, change and sell the
   adventure, even without naming you.»
2. «Anyone may copy, change and sell it, as long as they credit you.»
3. «Anyone may copy, change and sell it, crediting you. Changed versions
   must carry this same licence.»
4. «Anyone may copy and change it, crediting you, but not sell it or use it
   to make money.»
5. «Anyone may copy and change it, crediting you, but not for money.
   Changed versions must carry this same licence.»
6. «Anyone may pass it on as it is, even for money, crediting you. Nobody
   may share a changed version.»
7. «The narrowest CC licence: anyone may pass it on as it is, crediting
   you, not for money. No changed versions.»
8. «Nobody may copy, change or pass it on without asking you first. Free
   text: the PDF prints it as written, with no link.»

The marks' names and meanings (the header's titles, and the first half of
each mark's title):

| Mark         | Meaning                                                         |
| ------------ | --------------------------------------------------------------- |
| Share        | Copy it and pass it on                                          |
| Change       | Share changed versions (adaptations)                            |
| Sell         | Use it commercially, for money                                  |
| Credit       | Credit required: anyone using it must name you                  |
| Same licence | Same licence required: changed versions must carry this licence |

## Decisions

### D1. The list is UI data in the web (architect)

New `packages/web/src/licence/licences.ts`:

```ts
export type Mark = boolean | null; // null: does not apply
export interface LicenceMarks {
  share: Mark;
  change: Mark;
  sell: Mark;
  credit: Mark;
  sameLicence: Mark;
}
export interface LicenceEntry {
  value: string; // what is written
  short: string;
  name: string;
  summary: string;
  url: string | null;
  marks: LicenceMarks;
}
export const LICENCES: readonly LicenceEntry[]; // the eight, in order
export const LICENCE_MARKS: readonly {
  key: keyof LicenceMarks;
  label: string; // "Share"
  meaning: string; // "Copy it and pass it on"
}[];
```

The copy is the table above, word for word.

**Why:** only the web and desktop UI need the list. The format and the PDF
keep accepting any SPDX id or free text, so their rules do not change.
**Rejected:** the list in `packages/format` (the format's rules would not
change, and the connector does not need it); a list fetched from SPDX or
Creative Commons (the app works offline, and the summaries are ours).

### D2. «All rights reserved» writes Italian free text (architect)

Its `value` is `Tutti i diritti riservati`. **Why:** the PDF is Italian and
prints free text as written, with no link; the owner saw it in the mockup.
The format accepts it silently (it has spaces, so it does not look like an
SPDX id).

### D3. «Full text» links to the Creative Commons deeds (architect)

The eight `url`s are creativecommons.org deeds, which explain the licence in
plain words. The PDF keeps linking spdx.org (`licenceUrl`): unchanged, out
of scope.

### D4. The pane (architect)

`packages/web/src/licence/LicencePane.tsx` with `licence/licence.css`, on
the shared `Modal`, title «Choose a licence», `className="lic"` (820 px).

```ts
export function LicencePane(props: {
  current: string;
  context: "settings" | "editor";
  onPick(value: string): void;
  onClose(): void;
}): JSX.Element;
```

- `current` is compared trimmed and exactly (case-sensitive) with each
  `value`. The equal row is marked «Current» and starts selected. A
  non-empty `current` that matches none shows the free-text note.
- The listbox takes the focus on mount (as `SyntaxSheet` focuses its
  button), so the page's shortcuts stand aside (`useShortcuts`).
- Keys and clicks as in "The mockup in words". A click or double-click on
  «Full text» (`target="_blank" rel="noopener noreferrer"`, `ExternalIcon`
  from `ui/icons.tsx`) never selects or picks.
- «Use licence» calls `onPick(value)` of the selected row; disabled with no
  selection or when it equals `current`, with the title «Already the
  licence» in that case. Enter or double-click on the current row calls
  `onClose` instead.
- «Writes» shows the value, or `licenza: <value>` for `context: 'editor'`;
  the footer note ends «in the field.» or «in the front matter.».
- Marks with `title` and `aria-label` as in the mockup; header and chips as
  in the mockup at wide and narrow widths.
- The pane does not write anything itself: its caller does, then closes it.
  The caller puts the focus back on the opener when it closes.

Styles from the mockup's `.modal.lic`, `.cur-note`, `.lic-head`,
`.lic-row`, `.lic-list`, `.radio`, `.lic-main`, `.lic-t`, `.lic-d`, `.lic-w`
and `.mark` rules, with its 760 px media query, using the app's tokens;
light and dark.

### D5. Settings: «Choose…» beside the Licence field (architect)

In `AuthorDefaults`, the Licence field's input and a «Choose…» button
(`tb line`, `aria-haspopup="dialog"`) share a row (`.with-btn`, in
`settings/settings.css`); the hint stays under it. The button opens the
pane with `context: 'settings'` and `current` set to the input's value at
the click, trimmed. Picking saves exactly as leaving the field does
(`onSave({ ...settings, licence: value })`), the input shows the new value,
and the pane closes with the focus on «Choose…».

The implementer chooses between a ref on the input and a controlled input;
either must keep a typed but unsaved value of the other fields. Offline on
the desktop the button is disabled with the field by the existing
`NeedsServerGroup`; nothing new.

### D6. The front matter edit, pure (architect)

New `packages/web/src/editor/licence.ts`, no DOM:

```ts
import type { Text } from "@codemirror/state";
import type { TextEdit } from "promptbook-format";
export function licenceEdits(doc: Text, value: string): TextEdit[];
export function currentLicence(doc: Text): string;
```

`licenceEdits`:

- The front matter is the one `frontMatterOf` finds.
- **A `licenza` line:** the first line between the fences whose `KEY` match
  is `licenza`. Its whole text after `licenza:` (an empty value included)
  is replaced, so the line reads `licenza: <value>`. The indented lines
  that follow it (continuation lines of a multi-line value, or a block
  scalar's lines) are removed, up to the next line that is not indented or
  the closing fence.
- **No `licenza` line:** `licenza: <value>` is inserted as a new line after
  the first `copyright:` line (and its indented continuation lines), else
  as the last line before the closing fence.
- **No front matter:** `---\nlicenza: <value>\n---\n` is inserted at the
  start of the document.
- When the result would leave the text unchanged, it answers `[]`.

The eight values are plain YAML scalars: no quoting. A unit test applies
the edit for each value and parses the result with `parseAdventure`:
`meta.licence.text` is the value, `spdx` is true for the seven CC values and
false for «Tutti i diritti riservati», and no `meta.licence.unknown`
problem appears.

`currentLicence` answers the value of that same line for the pane (D13), or
`''` when there is none.

**Why:** the edit is what can go wrong, and pure functions are tested
without a browser, like `inserts.ts`. Reusing `frontMatterOf` and `KEY`
keeps one idea of the front matter in the editor.

### D7. The palette command (architect)

`PaletteAction` gains `{ kind: 'licence' }`. `paletteEntries` adds
`{ key: 'licence', label: 'Choose licence…', keys: null, action: { kind:
'licence' } }` just before «Back to projects», for every category:
campaigns have `licenza` too. `runPalette` opens the pane:
`setDialog('licence')` after its `closeDialog()` (one React batch, so the
pane opens).

Picking runs, on the document as it is at the pick:

```ts
write(view, licenceEdits(view.state.doc, value), {
  userEvent: "input.licence",
});
```

with no `selection`, so CodeMirror maps the caret through the change and it
does not move. One transaction, one undo step, no toast (fixes and inserts
have none). Then `closeDialog()`, which focuses the editor. An empty edit
list writes nothing.

`dialog` becomes `'palette' | 'syntax' | 'licence' | null`; the pane renders
beside the others with `context: 'editor'` and `current` read with
`currentLicence` when it opens.

### D8. «Choose…» on the `licenza:` line (architect)

`PreviewItem` gains `{ kind: 'licence'; at: number }`. `frontMatterItems`
emits it at the end of the first `licenza:` key line when no `fold` item
covers that line (the front matter is open, or the line is among the first
four keys). `toDecorations` maps it to
`Decoration.widget({ widget: new LicenceChoose(), side: 1 })` at `at`.

`LicenceChoose` is a `WidgetType` whose `eq` is always true for another
`LicenceChoose`, so rebuilding the field keeps its DOM. `toDOM` builds a
`<button type="button" class="cm-fm-licence" aria-haspopup="dialog"
title="Choose a licence for this project">Choose…</button>`; on
`mousedown` it calls `preventDefault()` (the caret and the fold stay as
they are) and asks the page to open the pane through a Facet,
`licenceHandler: Facet<() => void>`, read from the view's state.
`ignoreEvent` answers true. Styles from the mockup's `.lic-choose` rule in
`editor/editor.css`.

`EditorPage` provides `licenceHandler.of(() => latestOpenLicence.current())`
in its `extensions` memo, as it does `hideHandler`: the extensions are read
once, so the function reads a ref. No global events. Keyboard users have
the palette.

### D9. Desktop (architect)

No desktop-specific code. The editor path works offline; the Settings
path is disabled offline by the existing `NeedsServerGroup`. The desktop's
window handler already sends `target="_blank"` https links to the system
browser (`packages/desktop/src/main/window.ts:29-32`).

### D10. What is not touched (architect)

`packages/format`, `layout`, `project`, `server`, the desktop's main
process and the connector. No migration, no API change.

### D11. Tests (plan)

- **`packages/web/test/licences.test.ts`** (new): eight entries in the
  order of the table; values unique; the seven CC values are SPDX ids and
  «Tutti i diritti riservati» is free text (through `parseAdventure`, as
  D6); each entry's marks equal the table; CC entries have a
  `https://creativecommons.org/` url and «All rights reserved» none;
  `LICENCE_MARKS` has the five keys in order.
- **`packages/web/test/licence.test.ts`** (new), `licenceEdits`: replace a
  value; replace an empty `licenza:`; replace a multi-line value
  (continuation lines and a `>-` block scalar); a `licenza` inside the body
  or indented under another key is ignored; insert after `copyright:`;
  insert before a `---` and a `...` closing fence when there is no
  `copyright`; no front matter; the same value twice answers `[]`; each of
  the eight values round-trips through `parseAdventure` (D6).
  `currentLicence`: plain, quoted, empty, missing, multi-line, no front
  matter. CodeMirror's `Text` keeps no line endings in `line.text`, so a
  CRLF case is needed only if the implementer finds a document whose
  `Y.Text` holds `\r`; report it if so.
- **`packages/web/test/palette.test.ts`:** «Choose licence…» sits just
  before «Back to projects», with no keys, for `checked` true and false.
- **`packages/web/test/preview.test.ts`:** the `licence` item appears on the
  `licenza:` line when the selection is in the front matter; not when that
  line is folded; present unfolded when `licenza` is among the first four
  keys; never for a `licenza:` line in the body; never without a front
  matter. `hiddenRanges` is unchanged by it.
- **E2E, `e2e/editor.spec.ts`,** on a project the test makes with
  `projectWith`: the palette picks CC BY-SA 4.0 and the `licenza:` line
  reads `licenza: CC-BY-SA-4.0`; ⌘Z brings back the old line in one step;
  the caret did not move; the widget is visible with the caret in the front
  matter and absent with it in the body; a free-text value shows the note
  and no «Current» chip; a document with no `licenza` gets the line after
  `copyright:`.
- **E2E, Settings** (`e2e/projects.spec.ts`, beside the other settings
  flows): «Choose…» opens the pane with the current row selected; picking
  CC BY 4.0 puts `CC-BY-4.0` in the field; a reload keeps it; the test puts
  the previous default back at the end, because other tests create
  projects from it.
- All e2e runs once normally and once with `E2E_CPU_THROTTLE=3`.

### D12. No ORC, OGL or other game licences (plan)

The list is the agreed eight. **Why:** neither ORC nor the OGL has an SPDX
id (`spdx-license-ids` has only government licences named OGL), so the PDF
could not link them; they cover game rules shared between publishers, not
an adventure's own text; and free text still writes them. **Rejected:**
adding them with a hand-made link (a second link rule beside the PDF's).

### D13. What `currentLicence` reads (plan)

The text after `licenza:` on its line, trimmed, with one pair of matching
surrounding quotes (`"` or `'`) removed. A multi-line value answers its
continuation lines joined by single spaces, with a block indicator (`|`,
`>`, with `-` or `+`) dropped. **Why:** the value is only shown in the note
and compared with the list; parsing YAML in the web for it is not worth a
dependency, and campaigns are never parsed by the format.

### D14. Focus (plan)

The pane focuses its listbox on open. Closing (pick, Cancel, Escape, «✕»,
outside click) puts the focus back on the opener: «Choose…» in Settings,
the editor view in the editor (`closeDialog`). **Why:** as D14 of
gdrarchive-link, the focus would otherwise fall to the body.

## Risks / Trade-offs

Report it, do not work around it:

- **Widget stability.** `frontMatterField` rebuilds its decorations on
  every doc, selection and focus change. `LicenceChoose.eq` must keep the
  DOM, so the caret and the fold do not flicker. If the button is redrawn
  on each keystroke, or the line jumps, stop and report.
- **The widget on a line being edited.** `mousedown` with `preventDefault`
  must not move the caret, fold the front matter or start a selection. If
  CodeMirror still moves the caret (for example on touch), report it.
- **A pick racing a save in Settings.** Clicking «Choose…» blurs the
  Licence input, which saves a typed value; the pick then saves again with
  `{ ...settings, licence }`. The saver sends one request at a time and the
  latest object wins, so the pick should land last. If a failed save bumps
  `revision` while the pane is open, `AuthorDefaults` remounts: the pane
  may close, or the input may show the confirmed value and not the pick.
  Report what happens; do not add a second store of the value.
- **No focus trap.** Tab can leave the dialog, as in every other dialog of
  the app (`Modal` has none). Accepted; do not add a trap only here.
- **The value of another device.** The pane reads `current` when it opens,
  and the edit is computed on the document at the pick, so a change made
  meanwhile by another device is replaced, not merged into. Accepted.
- **Shortcuts with the pane open.** The pane holds the focus, so
  `useShortcuts` stands aside, as for the Syntax sheet. If ⌘K, ⌘. or
  Escape in focus mode act on the page while the pane is open, report it.

## Migration Plan

None: no stored data changes. Release `v0.11.0` (minor), by the architect.
Rolling back removes the pane; values it wrote stay valid `licenza` text.

## Open Questions

None.
