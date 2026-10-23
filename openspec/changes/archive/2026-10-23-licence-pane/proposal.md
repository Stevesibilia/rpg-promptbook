## Why

The front matter's `licenza` takes an SPDX id or free text, and the PDF
prints it, linked when it is an SPDX id. Nothing in the app says what each
licence allows, so choosing one means reading the Creative Commons site.
Issue
[Stevesibilia/rpg-promptbook#33](https://github.com/Stevesibilia/rpg-promptbook/issues/33)
asks for a pane that lists the usual licences with a short explanation of
each, and sets `licenza` in a project or the default licence in Settings.

The owner agreed the mockup
[docs/mockups/licence.html](../../../docs/mockups/licence.html): the pane
opens from both places, lists the seven Creative Commons licences and «All
rights reserved», each with a plain summary, five marks and a link to the
full text. The architect took the remaining decisions; they are in the
design.

## What Changes

- **The list:** eight licences as UI data in the web client, in the
  mockup's order: CC0 1.0, CC BY, BY-SA, BY-NC, BY-NC-SA, BY-ND, BY-NC-ND
  (all 4.0) and «All rights reserved», which writes the Italian free text
  `Tutti i diritti riservati`. Each has a short name, a plain name, a
  summary, a link to the Creative Commons deed and five marks: Share,
  Change, Sell, Credit, Same licence.
- **The licence pane:** a dialog «Choose a licence» on the shared modal. A
  keyboard listbox; the current value starts selected and is marked
  «Current»; a free-text current value gets a note. «Use licence» picks.
- **Settings:** a «Choose…» button beside the Licence field of Author and
  licence. Picking saves the default as leaving the field does.
- **Editor:** a palette command «Choose licence…» for every project, and a
  faint «Choose…» at the end of the `licenza:` line while the front matter
  is open. Picking rewrites that line's value, or adds the line, in one
  transaction and one undo step.
- Free text keeps working everywhere: nothing checks the value against the
  list.

Out of scope: ORC, OGL and other game licences; any change to the format's
licence rule, the PDF's links (they stay on spdx.org), the connector, the
server or the desktop's main process.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `editor`: the licence pane, the palette command and the `licenza:` line's
  «Choose…».
- `projects-screen`: Settings → Author and licence gains «Choose…».

## Impact

- `packages/web`: new `licence/licences.ts` (`LICENCES`, `LICENCE_MARKS`),
  `licence/LicencePane.tsx`, `licence/licence.css`; new
  `editor/licence.ts` (`licenceEdits`, `currentLicence`);
  `editor/palette.ts` (new action), `editor/EditorPage.tsx` (dialog, palette
  run, the widget's handler), `editor/cm/preview.ts` (the widget),
  `editor/editor.css`; `settings/SettingsPage.tsx` (`AuthorDefaults`),
  `settings/settings.css`.
- Tests: `packages/web/test/licences.test.ts` and `licence.test.ts` (new),
  `palette.test.ts`, `preview.test.ts`; `e2e/editor.spec.ts` and a settings
  test.
- No change in `packages/format`, `layout`, `project`, `server`, `desktop`
  or the connector. Release `v0.11.0`.
