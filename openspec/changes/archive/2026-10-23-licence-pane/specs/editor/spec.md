## MODIFIED Requirements

### Requirement: Command palette

⌘K and the top bar's hint SHALL open a palette that filters, case and accent
insensitive, the outline's items and the commands: toggle outline, toggle
inspector, focus mode, syntax sheet, set status, next and previous problem,
PDF preview and review PDF (adventures and one-shots), choose licence, back
to projects. Arrows SHALL move, Enter SHALL run, Escape SHALL close. Each
command that has a shortcut SHALL show it.

#### Scenario: Go to a scene by name

- **WHEN** the user opens the palette, types «cordone» and presses Enter
- **THEN** the cursor is on the heading of «S3. Il cordone di Donato»

#### Scenario: Choose licence in every project

- **WHEN** the user opens the palette in a campaign and types «licence»
- **THEN** «Choose licence…» is listed, with no shortcut

## ADDED Requirements

### Requirement: Licence pane

The licence pane SHALL be a dialog «Choose a licence», as
[docs/mockups/licence.html](../../../docs/mockups/licence.html) shows it,
listing in order CC0 1.0, CC BY 4.0, CC BY-SA 4.0, CC BY-NC 4.0, CC
BY-NC-SA 4.0, CC BY-ND 4.0, CC BY-NC-ND 4.0 and All rights reserved. Each
row SHALL show its short and plain names, a plain summary, the text it
writes, a «Full text» link to the Creative Commons deed opening in a new tab
(none for All rights reserved), and five marks, Share, Change, Sell, Credit
and Same licence, each yes, no or does not apply, in words for assistive
technology. All rights reserved SHALL write `Tutti i diritti riservati`; the
others their SPDX id. The row equal to the current value SHALL be marked
«Current» and start selected; a current value that is none of them SHALL be
named in a note. ↑, ↓, Home and End SHALL move, Enter or a double-click
SHALL pick, «Use licence» SHALL pick the selected row and SHALL be disabled
with none selected or the current one selected, and Escape, «✕», «Cancel» or
a click outside SHALL close without writing. Closing SHALL give the focus
back to where the pane was opened from. The footer SHALL say «Not legal
advice» and that free text still works.

#### Scenario: Current value selected

- **WHEN** the pane opens on a project whose `licenza` is `CC-BY-NC-SA-4.0`
- **THEN** CC BY-NC-SA 4.0 is selected and marked «Current», and «Use
  licence» is disabled

#### Scenario: Free-text current value

- **WHEN** the pane opens on a project whose `licenza` is `Uso personale`
- **THEN** a note reads «Current: Uso personale, not one of these; picking
  one replaces it.» and no row is selected

#### Scenario: Keyboard pick

- **WHEN** the user presses ↓ until CC BY-SA 4.0 is selected and presses
  Enter
- **THEN** the pane closes and CC-BY-SA-4.0 is picked

#### Scenario: Full text does not pick

- **WHEN** the user clicks «Full text» on CC BY 4.0
- **THEN** the deed opens in a new tab, or the system browser in the desktop
  app, and the selection does not change

### Requirement: Choosing the licence in the editor

The palette's «Choose licence…» SHALL open the licence pane in every
project. While the front matter's `licenza:` line is not folded, it SHALL
end with a faint «Choose…» that opens the pane without moving the cursor.
Picking SHALL replace that line's value with the picked one, removing the
lines of a multi-line value; with no `licenza` line it SHALL add one after
`copyright:`, else last in the front matter; with no front matter it SHALL
add one holding only `licenza`. The change SHALL be one undo step, SHALL
NOT move the cursor and SHALL show no toast. Any other text, free text
included, SHALL stay a valid `licenza` as before.

#### Scenario: Pick from the palette

- **WHEN** the user runs «Choose licence…» with the cursor in a scene and
  picks CC BY-SA 4.0
- **THEN** the front matter reads `licenza: CC-BY-SA-4.0`, the cursor is
  where it was, and ⌘Z brings back the old line in one step

#### Scenario: Line added after copyright

- **WHEN** the front matter has `copyright:` and no `licenza`, and the user
  picks All rights reserved
- **THEN** the line after `copyright:` reads `licenza: Tutti i diritti
riservati`

#### Scenario: Choose… follows the fold

- **WHEN** the cursor is in the front matter of a project with eight keys
- **THEN** the `licenza:` line ends with «Choose…»
- **AND WHEN** the cursor moves to the body
- **THEN** the line is folded with «Choose…»
