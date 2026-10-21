## Context

Issue #31: hide a problem the owner has decided to live with. Since #27
(`checks-never-block`) checks are guidelines and never block a write, but
every problem still shows in five places: the editor's margin dot and
squiggle, the inspector's Checks list, the outline badges, the status bar
counts and the project list's counts. The mockup is
[docs/mockups/problems.html](../../../docs/mockups/problems.html), approved
by the owner on 2026-10-21 (published as a private artifact; the implementer
reads the HTML file, and "The mockup in words" below says what was
approved).

### Owner decisions (2026-10-21, fixed)

- **O1** A full release.
- **O2** A hidden problem is matched by its check code, its scene and its
  text (refined in D2: the whole source lines it covers; the owner was told).
- **O3** Hidden problems sync with the project: every device and the server
  see the same ones.
- **O4** The connector still lists hidden problems, marked as dismissed or
  snoozed.

Below, D1 to D10 are the architect's decisions; D11 onward are the plan's,
each with its reason.

### The code today

- **Problems.** `packages/format/src/model.ts:7-42`: `Point` (`offset`,
  1-based `line`, `column`), `Range`, `Fix`, `Problem` (`code`, `severity`,
  `message`, `range`, optional `sceneId`, optional `fixes`). Codes are
  stable strings such as `scene.field.unknown`, `scene.reactions.missing`,
  `style.dash`, `ref.unresolved`, `callout.quote.plain`. `problem()` in
  `checks/util.ts:4-19` sets `sceneId` only when the check passes one: the
  scene checks do, but `style.dash` (`checks/style.ts:10`), the section,
  limit and sheet checks and some clue and appendix checks do not.
- **Project document.** The layout comment in
  `packages/project/src/doc.ts:30-77` lists every top-level type, with
  `board` and `imagePrompts` added as flat `Y.Map`s of plain JSON values set
  whole, `SCHEMA` staying 1. Readers there distrust values written by other
  clients (`doc.ts:153-155`). `isIsoDateTime` is in `model.ts:158`.
- **Summary.** `packages/project/src/summary.ts:40` `summarize`
  parses the document and counts errors and warnings (`:70-76`).
  Callers: server `insertProject` (`projects.ts:150`) and
  `storeProjectDoc` (`projects.ts:290`, summary at `:296`, run on every
  stored change, `edited_at = now()` at `:305`); desktop `refreshRow`
  (`packages/desktop/src/main/projects.ts:64`, summary at `:71`, scheduled
  by `docChanged` `:49`) and `create.ts:112`.
- **Connector.** `packages/server/src/mcp/edits.ts`: `ProblemOut` (`:19`),
  `problemOut` (`:26`), `check(text, category)` (`:41`), `report`
  (`:143`), `apply` (`:193`, holds the live document `live.doc`),
  `replaceSection` (`:235`), `addScene` (`:271`).
  `mcp/tools.ts`: `list_projects` (`:209`, counts from the row at
  `:230-231`), `get_project` (`:237`, `:265-266`), `get_outline` (`:304`,
  calls `check` and counts per target), `replace_section` (`:348`),
  `add_scene` (`:364`).
- **Editor analysis.** `packages/web/src/editor/analysis/field.ts`:
  `Analysis` (`:31`) holds `doc`, the text the result was computed for, the
  `result`, and `spots`, the problems' ranges mapped to the current text
  (`:40`). `pushDiagnostics` (`cm/problems.ts:60`) replaces the lint
  diagnostics only on a fresh result; `toDiagnostics` (`:34`) builds one per
  problem with `renderMessage` and one action per fix. F8 and Shift-F8 run
  `nextDiagnostic` and `previousDiagnostic` (`EditorPage.tsx:3`, `:116`).
- **Panels.** `editor/Checks.tsx` (`rowsOf` `:32`, rows `:112-120`, mounted
  in `Inspector.tsx:98` with the view only); `editor/outline.ts` (badges
  `:91-102`, cached per `Analysis` object at `:34`, `:43-44`);
  `editor/StatusBar.tsx` (`snapshotOf` `:21`, counts `:97-102`); the
  status bar's counts call `showChecks` (`EditorPage.tsx:185`). Panels read
  editor state through `useViewValue` (`InspectorSection.tsx:7`).
- **Toast.** `packages/web/src/ui/Toast.tsx:5` `useToast()` shows a message
  for 3.2 s. It has no action button.
- **Dates.** `packages/web/src/dates.ts`: `Intl.DateTimeFormat('en-GB')`
  formatters, no weekday format yet.
- **Not touched:** the PDF review's layout checks
  (`packages/layout/src/checks.ts`, `LayoutCheck`, no code), the import
  dialog's convert report, and the format package's parse and check
  functions.

### Corrections to the brief's facts

1. **`Toast.tsx` has no Undo.** D8 needs an action button: `useToast`
   gains an optional action (D16).
2. **Some problems have no `sceneId`.** For them the fingerprint's scene
   part is empty (D2): `style.dash` among others. Two such problems are
   still told apart by their line text; two identical lines with the same
   problem in different scenes share a key and hide together. See Open
   Questions.
3. **`summarize` has no clock.** It gains an optional `now` (D15).
4. **The outline badges are at `outline.ts:91-102`** and cached per
   `Analysis`; the cache must also key on the hidden state (D13).

## Goals / Non-Goals

**Goals:**

- Hide one problem, for good or for a day or a week, from every place it
  shows, on every device.
- See the hidden problems and bring them back, one or all, with Undo.
- Keep the hide tied to its spot: edits elsewhere never bring it back.

**Non-Goals:**

- Hiding the PDF review's layout checks or the import report's notices.
- A tool for Claude to hide or restore problems.
- Hiding every problem with one code at once.
- A server timer that refreshes stored counts when a snooze ends (D7).

## The mockup in words

The approved mockup has four states. Its check codes and messages are
illustrative and are not the format package's: `clue.text.long` is not a
real code, `callout.plain` is `callout.quote.plain`, `ref.unknown` is
`ref.unresolved`, `scene.derail.missing` and `scene.mustsee.missing` are
`scene.field.missing`. Real codes and messages come from `packages/format`.
The mockup's grey "detail" line under the message in the tooltip does not
exist (a `Problem` has a message only) and is not built.

- **Editor.** A hidden problem has no margin dot and no squiggle.
- **Tooltip** (hovering a squiggle). The message, coloured by severity, then
  the quick-fix buttons as today, then a row under a thin top border
  (`.hide-acts`): two quiet text buttons, «Snooze a week» and «Dismiss»,
  separated by «·», in a smaller, muted type, and the problem's code in
  monospace, faint, at the right end of the row. They read as secondary to
  the quick fixes, which keep their bordered look.
- **Checks rows.** Each row of the Checks list keeps its dot, message and
  where-line («S2 · line 44»). A «⋯» button sits at the row's right edge,
  shown on hover or focus of the row and while its menu is open
  (`aria-haspopup="menu"`, `aria-expanded`, label «More actions», title
  «Snooze or dismiss»). It opens a menu (`role="menu"`, items
  `role="menuitem"`) under the button, aligned to its right edge:
  «Snooze for a day» with the hint «until Thu 22 Oct», «Snooze for a week»
  with «until Wed 28 Oct», a divider, «Dismiss» with «for good». The hints
  sit right-aligned and faint. Opening focuses the first item; Escape, a
  click outside, or scrolling the inspector closes it.
- **Hidden list.** Under the list, after a dashed divider, a disclosure
  «Hidden (n)», collapsed by default and absent when n is 0. Its rows are
  dimmed (full opacity on hover or focus), with a hollow dot outlined in
  the severity's colour, the message, the where-line, and a status line
  «Dismissed» or «Snoozed until Mon 26 Oct». Each row has a «Restore»
  button at its right. Under the rows, a «Restore all» link button when n
  is 2 or more. Clicking a hidden row jumps to its spot as a shown row
  does. Rows are in document order.
- **Status bar.** After the error and warning counts, a quiet button with an
  eye-off icon and «n hidden» (title «Show the hidden problems»), absent
  when n is 0. It opens the inspector at Checks with Hidden expanded and
  scrolled into view, its summary briefly in the accent colour.
- **Outline.** Badges count shown problems only; a scene whose problems are
  all hidden has no badge.
- **Toast.** At the bottom centre: «Problem dismissed», «Snoozed until Wed
  28 Oct», «Problem restored», «2 problems restored», each with an «Undo»
  button. Undo puts back the previous state and shows «Undone» with no
  button. Hiding closes the tooltip and the menu.

Today in the mockup is Wed 21 Oct 2026: a day later is «Thu 22 Oct», a week
later «Wed 28 Oct».

## Decisions

### D1. Storage: a flat `Y.Map` in the project (architect)

A new top-level `Y.Map` named `hiddenProblems` in the project's Y.Doc. Keys
are a problem's fingerprint (D2); values are plain JSON set whole:

```ts
export type HiddenHow = "dismissed" | "snoozed";

export interface HiddenEntry {
  code: string; // the problem's code
  sceneId: string | null; // the problem's sceneId, null when it has none
  how: HiddenHow;
  until: string | null; // ISO date-time for a snooze, null when dismissed
  at: string; // ISO date-time of the hide
}
```

The layout comment in `doc.ts:30-77` gains, in the same style as the board
and image-categories entries:

```
// and, from the hide-problems change (its design decision 1), read and
// written by hidden.ts:
//   hiddenProblems  Y.Map, keys "<code>|<sceneId>|<hash>" (hidden.ts
//          problemKey), plain JSON values set whole:
//            { code, sceneId, how: dismissed|snoozed, until, at }
//          One key per hidden problem: hides of different problems merge;
//          two writes of one key keep the last. Restoring deletes the key.
```

`SCHEMA` stays 1: an older client leaves the type alone, and an older
document reads it as empty, as with `board` and `imagePrompts`.

**Why:** the owner chose sync (O3), and the project's Y.Doc is what syncs.
A flat map with one key per problem merges concurrent hides of different
problems; two writes of the same key keep the last, which is acceptable for
a hide. **Rejected:** per-device storage (the owner chose sync); a
`Y.Array` (a delete by index races with a concurrent insert).

### D2. Fingerprint (architect)

`problemKey(problem, text)` answers `${code}|${sceneId ?? ''}|${hash}`.
`hash` is FNV-1a 32-bit, written as 8 lowercase hex digits, over the
UTF-16 code units of the source lines the problem's range covers, whole
lines, from the line holding `range.start` to the line holding
`range.end`, with every run of whitespace collapsed to one space and the
ends trimmed.

**Why:** matching only the flagged span fails for tiny spans: `style.dash`
flags one dash, and hiding it would hide every dash in the scene. The whole
line keeps the hide on its spot, and edits elsewhere in the document, which
shift offsets and line numbers, do not disturb it. Rewriting the line
brings the problem back, by design (O2). Two identical problems on
identical lines in the same scene share a key and hide together: accepted.

**Plan decision:** the lines are cut by offset, not by line number:
`text.lastIndexOf('\n', start.offset - 1) + 1` to
`text.indexOf('\n', end.offset)` (or the end of the text). **Why:** the
same bytes, without building a line index; the `text` passed must be the
text the problem was computed for (D12).

### D3. One pure module (architect)

`packages/project/src/hidden.ts`, exported from `index.ts`, used by the
summary, the server and the web:

```ts
export const SNOOZE_MS = { day: 86_400_000, week: 604_800_000 } as const;

export function problemKey(problem: Problem, text: string): string;
export function readHidden(doc: Y.Doc): ReadonlyMap<string, HiddenEntry>;
export function isActive(entry: HiddenEntry, now: Date): boolean;
export function hideProblem(
  doc: Y.Doc,
  problem: Problem,
  text: string,
  how: HiddenHow,
  until: string | null,
  now: Date,
): { key: string; previous: HiddenEntry | null };
export function restoreProblem(
  doc: Y.Doc,
  key: string,
  now: Date,
): HiddenEntry | null;
export function restoreAll(
  doc: Y.Doc,
  keys: readonly string[],
  now: Date,
): Map<string, HiddenEntry>;
export function putHidden(
  doc: Y.Doc,
  entries: ReadonlyMap<string, HiddenEntry | null>,
  now: Date,
): void;
export function partitionProblems(
  problems: readonly Problem[],
  text: string,
  hidden: ReadonlyMap<string, HiddenEntry>,
  now: Date,
): {
  shown: Problem[];
  hidden: Array<{ problem: Problem; entry: HiddenEntry; key: string }>;
};
export function nextExpiry(
  hidden: ReadonlyMap<string, HiddenEntry>,
  now: Date,
): Date | null;
```

- An entry is **active** when `how === 'dismissed'`, or when it is snoozed
  and `until` is later than `now`. An expired snooze counts as absent.
- Each writer runs in one transaction and, in it, deletes every expired
  snooze (housekeeping; safe, since they are never shown).
- Entries whose problem no longer exists stay: a problem can vanish while
  the user is mid-edit and come back. They are small and harmless.
- `partitionProblems` keeps the problems' order in both lists.

**Plan decisions:** `hideProblem`, `restoreProblem` and `restoreAll` answer
what they replaced, and `putHidden` writes a key's previous value back (or
deletes it for null): this is Undo (D8), which "puts back the previous
entries exactly". `readHidden` skips a value that is not an object with a
string `code`, a `sceneId` string or null, a known `how`, an `until` that
`isIsoDateTime` accepts for a snooze and null for a dismissal, and an
`at` date-time, as the other readers distrust other clients' values
(`doc.ts:153-155`). `nextExpiry` is the earliest `until` of the active
snoozes, for the web's timer (D7). `isActive` lets the web decide per
problem index (D12).

### D4. Snooze lengths (architect)

«A day» is `now` plus 24 hours, «a week» `now` plus 7 days, as exact
timestamps (`SNOOZE_MS`). The UI shows the date, «Snoozed until Wed 28
Oct», with the full date and time in a `title` tooltip.

**Plan decision:** a new `snoozeDate(iso)` in `packages/web/src/dates.ts`,
`Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month:
'short' })`, «Wed 28 Oct», with the year added when it is not this year
(as `dayOf` does); the tooltip uses `dateAndTime`.

### D5. Where hidden problems are left out (architect)

Left out: the editor's diagnostics (no margin dot, no squiggle; F8 and
Shift-F8 skip them because they are not diagnostics), the Checks list, the
outline badges, the status bar counts, the project list's counts
(`summarize` leaves out active hidden ones, so the server's
`storeProjectDoc` and `insertProject` and the desktop's `refreshRow` get
them through it), and the connector's counts (`get_outline`, `list_projects`
and `get_project`, which read the summary row, and edit results).

Not affected: the PDF review's layout checks (`LayoutCheck` in
`packages/layout/src/checks.ts`, a different type with no code), the
import dialog's convert report, and the format package's parse and check
functions, which stay pure functions of the text.

### D6. Connector (architect)

`ProblemOut` (`edits.ts:19`) gains `hidden?: 'dismissed' | 'snoozed'` and
`until?: string` (snoozed only). Edit results keep hidden problems in their
`problems` list, marked; their `errors`, `warnings`, `errorsBefore` and
`warningsBefore` leave them out. `check()` (`edits.ts:41`) takes the hidden
entries and `now`:

```ts
export interface Check {
  errors: number; // shown problems only
  warnings: number;
  problems: Problem[]; // every problem
  hidden: ReadonlyMap<Problem, HiddenEntry>; // the active entry of each hidden one
}
export function check(
  text: string,
  category: Category,
  hidden: ReadonlyMap<string, HiddenEntry>,
  now: Date,
): Check | null;
```

`apply` (`edits.ts:193`) reads `readHidden(live.doc)` and one `now` before
planning and passes them to the plan; `report` passes them to both
`check` calls. `get_outline` reads them from the document it already
loads and counts only shown problems, per target and in total. No new MCP
tool: Claude cannot hide or restore problems (not asked for; a later issue
if wanted). The descriptions of `get_outline`, `replace_section` and
`add_scene` gain: «Counts leave out problems the user hid; results still
list them, marked hidden (dismissed, or snoozed until a date): leave them
alone unless the user asks.»

### D7. Stale counts after a snooze ends (architect)

The stored summary row (server and desktop) is computed again on the next
store of the document, so a snoozed problem coming back shows in the
project list only after the project is next edited or opened. Accepted and
documented; no timer on the server. In the open editor the web client
schedules one re-evaluation at `nextExpiry` (D3) so the problem comes back
without a reload; the timer is replaced on every change of the hidden
entries and cleared when the view goes.

### D8. Web UI, as approved (architect)

- **Lint tooltip** (`cm/problems.ts` `toDiagnostics`, `:34`): after the
  message and any quick fix, the divider row with «Snooze a week» and
  «Dismiss» and the code at the right, looking secondary to the quick
  fixes (the mockup's `.hide-acts`). Through `renderMessage` or the
  `actions` list, as the implementer finds works; the order and the look
  must match the mockup (Risks).
- **Checks rows** (`editor/Checks.tsx`): the «⋯» button and its menu, as
  in "The mockup in words". **Plan decision:** Up and Down move between
  the items, Enter or Space chooses, Escape closes and puts the focus back
  on «⋯». **Why:** the usual menu keys; the mockup only focuses the first
  item.
- **Hidden list:** «Hidden (n)», collapsed by default and shown only when
  n > 0; rows greyed with a hollow dot, the message, the where-line and
  «Dismissed» or «Snoozed until <date>»; «Restore» per row; «Restore all»
  when n >= 2. Clicking a hidden row jumps to its spot. n counts the
  problems of the current analysis that are hidden, not the map's entries.
- **Status bar** (`editor/StatusBar.tsx`): counts leave out hidden
  problems; «n hidden» with the eye-off icon, shown only when n > 0, opens
  Checks with Hidden expanded.
- **Toast** after a hide or a restore: «Problem dismissed», «Snoozed until
  <date>», «Problem restored», «<n> problems restored», each with Undo;
  Undo calls `putHidden` with the previous entries and shows «Undone».
- **Outline badges** (`outline.ts:91-102`) count shown problems only.
- The desktop app renders the web UI; its main process needs only
  `summarize`.

### D9. Tests (architect)

- **`packages/project/test/hidden.test.ts`:** the key is stable when text
  is added above the problem and elsewhere; it changes when the flagged
  line is rewritten; the tiny-span case (two lines each with a dash: hiding
  one keeps the other shown); a problem with no `sceneId`; a multi-line
  range; whitespace changes inside the line keep the key; expiry (a snooze
  active one millisecond before `until`, absent at `until`); two replicas
  (`test/helpers.ts` `replica`, `sync`) hiding different problems both
  keep their entries; the same key written on both keeps one; housekeeping
  (a hide deletes an expired snooze, leaves an active one and a dismissal);
  `readHidden` skips each malformed value; `putHidden` restores the
  previous entry and deletes a key whose previous was null; `nextExpiry`.
- **`packages/project/test/summary.test.ts`:** the Sabaoth fixture with one
  error dismissed and one warning snoozed: both counts go down by one; with
  `now` after the snooze, the warning counts again.
- **`packages/server/test/db/mcp.test.ts`:** `replace_section` on a
  document with a dismissed and a snoozed problem in the edited scene: the
  result lists both, marked, `until` on the snoozed one only, and the
  counts leave them out; `get_outline` counts leave them out;
  `list_projects` shows the stored row's counts without them.
- **Web unit tests** (`packages/web/test`): `outline.test.ts` (a badge
  counts shown problems only; hiding the only problem of a scene removes
  its badge); a new `checks.test.ts` (rows split into shown and hidden,
  status lines, the menu's hints from a fixed `now`, «Restore all» only
  from 2); the diagnostics leave out hidden problems; the status bar
  snapshot; `snoozeDate`; the toast's action.
- **E2E** (`e2e/editor.spec.ts`), on a project of the test's own with the
  Sabaoth text: dismiss «Se il tempo stringe» from the tooltip (squiggle,
  Checks row and one count gone; «1 hidden» in the status bar); snooze
  another from the row menu; the Hidden list shows both with their status;
  Restore one, Undo the restore; Restore all; Undo of a dismissal; a reload
  keeps the hides; a second browser context, signed in, on the same
  project sees a hide without reloading. Run normally and with
  `E2E_CPU_THROTTLE=3` before hand-back: past UI plans hit races only
  under throttling.

### D10. Risks named (architect)

See Risks / Trade-offs.

### D11. Text for the fingerprint in the editor (plan)

The editor computes keys against `Analysis.doc` (`field.ts:35`), the text
the result was computed for, never the current text: the problems' ranges
are offsets into that text. Keys are computed once per result, as an array
aligned with `result.problems`, from one `doc.toString()`, and cached per
result object. **Why:** a stale result's offsets do not match the current
text; one string per result costs what the parse already cost.

### D12. Hidden state in the editor (plan)

A CodeMirror `StateField` `hiddenField` in a new
`packages/web/src/editor/cm/hidden.ts` holds `{ entries, now }`, set by a
`setHidden` effect. `Editor.tsx` observes `doc.getMap('hiddenProblems')`
and dispatches `setHidden` with `readHidden(doc)` on every change, and
again when the `nextExpiry` timer fires (with a new `now`). Every panel
reads it from the state, so `useViewValue` and the status bar's `updates`
pick it up with no new wiring. Shown or hidden is decided per problem
index with `isActive`, so `Analysis.spots[i]` still gives each problem's
place, hidden ones included (needed to jump to a hidden row).
`pushDiagnostics` passes only shown problems to `toDiagnostics`; on
`setHidden`, when the analysis is fresh, the diagnostics are rebuilt from
the same result. When it is not fresh, the next result applies the hide.
**Why:** one source of truth in the editor state, as the analysis is; a
hide made from the tooltip happens on a fresh result in practice, and a
stale moment lasts one typing delay.

### D13. Outline cache (plan)

`outlineOf` caches per `Analysis` object (`outline.ts:34`). The cache
becomes two levels, analysis then hidden state, or the badges are computed
outside the cached item list. **Why:** a hide changes the badges without
changing the analysis.

### D14. Hide actions and the toast live in the page (plan)

A hook in `EditorPage.tsx`, `useHiding(doc)`, owns hide, restore, restore
all and Undo, and the toast. It reaches the tooltip through a `Facet`
added to the editor's `extensions` (as `undoBoundary` reaches fixes,
`problems.ts:10`), and the Checks section and the status bar through
props. The page also holds whether Hidden is open, so «n hidden» can open
it; not remembered across visits. `Checks` gets `doc` from `Inspector`.
**Why:** one toast and one Undo for the three entry points.

### D15. `summarize` takes `now` (plan)

`SummarizeOptions` gains `now?: Date`, default `new Date()`. `summarize`
reads `readHidden(doc)` and counts `partitionProblems(...).shown`. Server
and desktop callers pass nothing. **Why:** tests need a fixed clock; the
callers need the real one.

### D16. Toast with an action (plan)

`useToast` (`ui/Toast.tsx:5`) gains an optional second argument,
`{ label: string; run(): void }`, rendered as a button after the message;
with an action the toast stays 6 s, as in the mockup, otherwise 3.2 s as
today. Existing callers are unchanged. **Why:** the toast has no action
today; one optional argument keeps every other caller as it is.

### D17. Edit time (plan)

A hide or a restore is a change to the project, so the server's
`storeProjectDoc` sets `edited_at` and the desktop's `refreshRow` marks a
local edit: the project moves up in "last edited". Accepted. **Why:** both
treat any stored change as an edit; special-casing one map would need the
store to know what changed.

## What is not touched

- **The format package:** no change; problems, codes and checks as they
  are.
- **The PDF and its layout checks, the import report.**
- **The database:** no migration; the summary row's columns are the same.
- **The desktop's main process:** no code change.
- **Connector tools:** the same twenty-two; no tool hides or restores.

## Risks / Trade-offs

Report it, do not work around it:

- **The tooltip's layout.** `@codemirror/lint` renders `renderMessage`'s
  element before the action buttons, so the divider row may not be
  placeable after the quick fixes through `renderMessage` alone; through
  `actions` the buttons get the quick fixes' look. Read `renderDiagnostic`
  in the installed `@codemirror/lint` (`^6.9.7`) first: an action's
  `markClass`, CSS order inside `.cm-diagnostic`, or `renderMessage` plus
  CSS. If neither gives the mockup's order and look, report it with a
  screenshot before choosing.
- **`summarize` in hot paths.** It runs on every stored change
  (`onStoreDocument`). Reading one map and hashing the problems' lines is
  cheap next to the parse; report if a measurable slowdown appears.
- **A hidden problem fixed elsewhere** simply disappears; its entry stays
  (D3). Fine.
- **Problems with no `sceneId`** share a key across scenes when their
  lines are identical (Corrections, 2).
- **Problems over many lines** (a whole block flagged) are tied to every
  line they cover: any edit inside brings them back. Most checks flag a
  heading or one line.
- **Clocks.** A snooze's `until` comes from the device that wrote it; a
  device with a wrong clock shows it early or late. Accepted.
- **Stale project list counts** after a snooze ends, until the next store
  (D7).

## Migration Plan

None: no database migration, `SCHEMA` stays 1, older documents read no
hidden problems. Release `v0.9.0`; rolling back leaves an unused map in
documents that had hides, which older code ignores.

## Settled questions

- **Scene for problems with no `sceneId`** (architect, 2026-10-21). D2
  stays: `problemKey` uses `problem.sceneId` alone, empty when absent; no
  `model` argument. **Why:** the whole line already ties the hide to its
  spot; two problems of one code on identical lines in different scenes are
  rare, and hiding them together is harmless. **Rejected:** deriving the
  scene from the model's scene ranges, which widens every caller's
  signature for that rare case.
- **Owner preview** (architect, 2026-10-21). Screenshots, not a LAN
  preview: the owner is away from a browser on this machine. Task 3.8's
  screenshots (light and dark) go to the owner as a published page before
  the merge, and the merge waits for their go.
