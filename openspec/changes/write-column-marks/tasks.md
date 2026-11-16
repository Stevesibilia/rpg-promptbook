# Tasks: write-column-marks

## 1. promptbook-project

- [x] 1.1 Export `columnMarkEdits(text, template)` from `update.ts` and the
      package index, built on `columnInserts` (D1).
- [x] 1.2 Tests: every unmarked part of the built-in template gets its mark;
      a marked part and an invalid mark are left alone; a template that sets
      another column writes that column; applying the edits twice gives no
      second edit; a non-adventure template gives none; the result equals
      `updateEdits(text, t, t, …writeColumns)`.
- [x] 1.3 Test D4: for `packages/layout/test/fixtures/la-lanterna-spenta.md`
      the layout input is the same before and after the edits (put the test
      where both packages are reachable without a new dependency; if none
      is, compare `columnOf` for every part in `promptbook-project`).

## 2. promptbook-web

- [ ] 2.1 `palette.ts`: `marksMissing` option, entry «Write column marks»,
      action kind `columns` (D2); unit tests for presence, absence and
      position.
- [ ] 2.2 `EditorPage.tsx` and `CommandPalette.tsx`: compute `marksMissing`
      when the palette opens; run the command as one transaction (D3).
- [ ] 2.3 `TemplateUpdate.tsx`: option ticked by default (D5); update its
      unit tests.
- [ ] 2.4 Syntax sheet or help text that lists the column commands, if one
      does: add the new command.

## 3. e2e and docs

- [ ] 3.1 `e2e/templates.spec.ts`: the update dialog shows the option
      ticked; a test that unticks it keeps the text unchanged; the palette
      command writes the marks on a document without any, one undo removes
      them all, and the command is no longer listed afterwards.
- [ ] 3.2 `docs/design.md`: one sentence in the «Column marks» bullet.
- [ ] 3.3 Typecheck, all package tests (server with `TEST_DATABASE_URL`),
      e2e, in containers. Sabaoth's four PDF hashes stay as they are.
