# Design: write-column-marks

## Context

`template-placement` gave the parts of the night page and of a scene a
column, set by the template and overridden by a mark in the text
(`{laterale}`, `{principale}`). `updateEdits` in `promptbook-project` can
write the missing marks during a template update (`writeColumns`), through
`columnInserts`. Nothing writes them outside an update.

## Owner decisions (2026-11-16)

- O1. Existing documents get their marks from a palette command, run by hand,
  one project at a time. No automatic write on open, no bulk action.
- O2. The update dialog's option that writes the marks is ticked by default.

## Decisions

- D1. `promptbook-project` exports
  `columnMarkEdits(text: string, template: Template): TextEdit[]`: the mark
  of the template's column for each part of the text that takes a column and
  has no mark. It is what `updateEdits(text, t, t, { addSections: false,
renameHeadings: false, writeColumns: true })` returns, and is built on the
  same `columnInserts`, so the two never disagree. A template that is not an
  adventure template gives no edits. A part with an invalid mark
  (`{latterale}`) has a mark and is left alone: the check already reports it.
  A revelations list without a bare label gets none, as in an update.
- D2. `paletteEntries` takes `marksMissing?: boolean` (default false) and
  lists «Write column marks» (key `columns`, action `{ kind: 'columns' }`)
  right after the «Move to … column» row, or in its place when there is none.
  The palette has no disabled rows: the entry is absent when no mark is
  missing. `EditorPage` computes `marksMissing` from `columnMarkEdits` on the
  current text and the project's resolved template when the palette opens,
  not on every keystroke.
- D3. Running the command reads the text again, dispatches all the edits in
  one CodeMirror transaction (one undo step), leaves the selection where it
  maps to, and returns focus to the editor. No dialog, no toast: the marks
  show in the text.
- D4. The PDF is the same before and after the command: `columnOf` gives the
  template's value when there is no mark, and the command writes that value.
  A test proves it on the layout input of the invented fixture, not on bytes.
- D5. In `TemplateUpdate.tsx` `writeColumns` starts true. The line that
  unticks it when the option is hidden goes away: the option counts only
  while it is shown (`columns = writeColumns && marksToWrite`), and it shows
  again as the owner left it. The comment «Off by default: a mark freezes the
  part…» is replaced by one that says why it is on: the owner wants the
  placement visible in the text.
- D6. The connector's `update_project_template` is not changed. Its
  requirement says `writeColumns` is false by default, and a tool call that
  edits the text should ask for it.

## Risks

- A mark freezes a part where the template puts it today: a later template
  version that moves the part no longer moves it in this document. This is
  the price of O1 and O2, already described in `template-placement` (A6). An
  update never changes a mark in the text.

## Accepted departures

None yet.
