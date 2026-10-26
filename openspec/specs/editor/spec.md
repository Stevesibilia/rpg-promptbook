# editor Specification

## Purpose

The project page's editor: live preview, problems and fixes, outline, inspector, insert menu, syntax sheet, command palette, focus mode and status bar, as agreed in the editor mockup.

## Requirements

### Requirement: Project page

Opening a project SHALL show the editor of
[docs/mockups/editor.html](../../../docs/mockups/editor.html)'s Document
view: the top bar with breadcrumbs, category, status menu, outline and
inspector toggles, focus mode, the History button, the PDF button for
adventures and one-shots, the ⌘K hint and the sync pill; the outline on the
left; the prep document in a CodeMirror 6 Markdown editor bound to the
project's Yjs text, in Spectral, about 70 characters wide; the inspector or
the PDF preview on the right; the status bar. The rail SHALL hold Projects,
Document, Inspiration, Research, Images and music (adventures and one-shots
only, as in [docs/mockups/board.html](../../../docs/mockups/board.html)),
Brainstorm log and History, and Settings at the bottom, as in
[docs/mockups/connector.html](../../../docs/mockups/connector.html); the
project entries SHALL be disabled while no project is open. The page SHALL
NOT show export controls.

#### Scenario: Edit in two tabs

- **WHEN** the same project page is open in two tabs and the user types in
  one
- **THEN** the text appears in the other without a reload

#### Scenario: Views of a project

- **WHEN** the user presses Research in the rail, then Document
- **THEN** the Research view of the same project opens, then the editor
  again with the same text

#### Scenario: No board for a campaign

- **WHEN** a campaign is open
- **THEN** the rail shows no Images and music entry, and
  `/projects/<id>/board` opens the Document view instead

### Requirement: Live preview

The editor SHALL hide Markdown marks (heading marks, bold and italic marks,
the quote marks and type of a callout) on every line not touched by a
selection, and show them on the lines that are. Headings, field labels,
bold and italic text SHALL be styled; a callout of a type known to the
template SHALL be drawn as a box with its label and title; the front matter
SHALL fold to its first four keys and a «▸ N more keys» control while the
cursor is outside it; a table SHALL be drawn as a table while no selection
touches its lines, and as source while one does. The document text SHALL
NOT change for display.

#### Scenario: Table drawn and edited

- **WHEN** the cursor is outside the table of «Mappa delle scene»
- **THEN** it shows as a table with a header row and no `|` or `---`
- **AND WHEN** the user clicks one of its cells
- **THEN** the table shows as source with the cursor in that cell's text

#### Scenario: Marks follow the cursor

- **WHEN** the cursor is on a line that is not `### S1. La casa che cede`
- **THEN** that heading shows without `###`
- **AND WHEN** the cursor moves onto the heading line
- **THEN** `###` shows

#### Scenario: Callout box

- **WHEN** a scene holds `> [!documento] La lettera di Neri` and the cursor
  is elsewhere
- **THEN** it shows as a box headed «Documento da consegnare · La lettera di Neri»

### Requirement: Problems in the editor

For an adventure or a one-shot, the editor SHALL show every problem found by
the format package with the adventure template, except the problems the user
has hidden: a dot in the margin, an underline coloured by severity, and a
tooltip with the message, one action per fix, and the actions to hide it.
Hidden problems SHALL have no dot, no underline and no tooltip, and F8 and
Shift-F8 SHALL skip them. Parsing SHALL NOT run on the main thread while the
user types. A fix SHALL be applied as one edit, undone in one step, and
SHALL NOT be applied to text it was not computed for. Campaigns SHALL show
no problems.

#### Scenario: Unknown field fixed

- **WHEN** a scene holds `**Se il tempo stringe:** …`
- **THEN** the line is underlined as a problem
- **AND WHEN** the user chooses one of its fixes in the tooltip
- **THEN** the text changes as the fix says and the problem is gone

#### Scenario: Campaign not checked

- **WHEN** a campaign is opened
- **THEN** no problem is shown and the status bar says «Campaign · not
  checked»

#### Scenario: Hidden problem not drawn

- **WHEN** the problem of `**Se il tempo stringe:** …` is dismissed
- **THEN** its line has no underline and no margin dot, and F8 does not stop
  on it

### Requirement: Outline

The outline SHALL list the front matter, the sections, the scenes under the
scenes section and, under the sheets section in text order, the sheets and
the pregenerated characters block (named as the template names it), with
each pregenerated character one level deeper, each with a badge counting its
own problems that are not hidden, coloured by the worst severity among them.
The item holding the cursor SHALL be highlighted. Clicking an item SHALL move
the cursor to its heading and scroll it into view. Scenes SHALL be reordered
by dragging or with Alt+↑ and Alt+↓, as one edit that keeps every other byte
of the text and does not renumber scene ids. The outline SHALL collapse and
open with ⌘1 and its button, remembered in the browser. For a campaign it
SHALL list the `##` and `###` headings without badges or moves.

#### Scenario: Jump to a scene

- **WHEN** the user clicks «S4» in the outline
- **THEN** the cursor is on the `### S4.` heading and it is in view

#### Scenario: Move a scene

- **WHEN** the user drags S2 below S3
- **THEN** the document has S3 before S2, the ids are unchanged, and another
  tab shows the same order

#### Scenario: Badge without hidden problems

- **WHEN** S2 has one problem and the user dismisses it
- **THEN** S2 has no badge in the outline

#### Scenario: Pregenerated characters listed

- **WHEN** `## Schede` holds `### Pregenerati` with `#### Ada Rossi` and
  `#### Bruno Valli`, and Ada's text has one problem
- **THEN** the outline lists «Pregenerati» under «Schede» at the sheets'
  level, with «Ada Rossi» and «Bruno Valli» one level deeper, and the badge
  is on «Ada Rossi»

#### Scenario: Jump to a pregenerated character

- **WHEN** the user clicks «Bruno Valli» in the outline
- **THEN** the cursor is on the `#### Bruno Valli` heading, it is in view,
  and the status bar shows «Pregenerati · Bruno Valli»

### Requirement: Inspector

The inspector SHALL hold sections that open and close: This scene, Checks,
To-do, Research and Seed. This scene SHALL list, for the scene holding the
cursor, each of the template's scene fields in order, ticked when present and
with an Insert button when missing, plus the read-aloud row, and buttons to
insert a read-aloud, a handout, a box, a side box, a sheet reference and a
reactions table. Checks SHALL list every problem that is not hidden with its
place, and its heading SHALL count only those; clicking one SHALL select it
in the editor; under them SHALL be the hidden problems list. To-do SHALL be
the project's to-do list with its count. Research SHALL list the research
notes that match the scene holding the cursor, as the research capability
defines. Seed SHALL show the current seed with a link to edit it in the
Inspiration view. The inspector SHALL collapse and open with ⌘2 and its
button, remembered in the browser. For a campaign it SHALL show To-do and
Seed only.

#### Scenario: Insert a missing field

- **WHEN** the cursor is in a scene without «Prove e regole» and the user
  presses its Insert
- **THEN** `**Prove e regole:** ` is added after the last present field that
  comes before it in the template, with the cursor after it

#### Scenario: Problem from the list

- **WHEN** the user clicks a problem in Checks
- **THEN** its text is selected and in view

#### Scenario: Seed edit link

- **WHEN** the user presses Edit in the inspector's Seed section
- **THEN** the project's Inspiration view opens

### Requirement: Insert menu and sheet completion

The editor SHALL open an insert menu when, in an adventure or a one-shot, `/`
is typed as the only character of a line. The menu SHALL list the inserts allowed at that place: the missing fields of
the scene first, then callouts allowed there, sheet reference, reactions
table and new scene. Choosing an entry SHALL replace the `/` with the same
text the inspector's buttons insert; Escape SHALL leave the `/`. After
`→ Schede: ` the sheet names of the document SHALL complete. In a campaign
`/` SHALL offer headings only.

#### Scenario: New scene from the menu

- **WHEN** the scenes section has S1 to S5 and the user types `/` on an empty
  line in it and chooses New scene
- **THEN** the line becomes `### S6. ` with the cursor after it

### Requirement: Syntax sheet

⌘/ SHALL open a dialog listing, from the template's own data, the front
matter keys, the sections, the scene fields, the callouts with their syntax
and limits, the reference marker, the reactions table, the sheet keys and the
id prefixes, each with its requirement.

#### Scenario: Sheet matches the template

- **WHEN** the user opens the syntax sheet
- **THEN** every scene field of the adventure template is listed in order

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

### Requirement: Focus mode

⌘. and its button SHALL toggle focus mode, which hides the rail, the outline,
the inspector, the breadcrumbs and the top-bar controls except the focus button and the sync pill,
keeping the text and the status bar. Escape SHALL leave focus mode when no
dialog is open.

#### Scenario: Focus and back

- **WHEN** the user presses ⌘. and then Escape
- **THEN** the panels are hidden and then shown again as they were

### Requirement: Status bar

The status bar SHALL show the current scene or section, the cursor's line and
column, the error and warning counts of the problems that are not hidden (a
click opens Checks), «<n> hidden» with an eye-off icon when n problems are
hidden (a click opens Checks with the hidden problems list expanded), the
word count of the text after the front matter, and the template's name and
version, or «Campaign · not checked»; and, as today, the sync state and last
sync.

#### Scenario: Counts follow the text

- **WHEN** the user adds an unknown field to a scene
- **THEN** the error or warning count in the status bar goes up by one

#### Scenario: Hidden count opens the list

- **WHEN** two problems are hidden and the user clicks «2 hidden»
- **THEN** the inspector shows Checks with «Hidden (2)» expanded and in view

### Requirement: Opening a scene from another view

The Document view SHALL accept a scene id in its address
(`/projects/<id>?scene=S3`) and open with that scene's heading in view and
the cursor on it, as the outline's jump does; an unknown id SHALL open the
document at the top.

#### Scenario: From the board

- **WHEN** the user presses «Open the scene in the document» on the board's
  S3 row
- **THEN** the Document view opens with S3's heading in view

### Requirement: Hiding a problem

For an adventure or a one-shot, the user SHALL be able to hide one problem:
«Dismiss» hides it for good; «Snooze for a day» and «Snooze for a week» hide
it until 24 hours or 7 days from now, after which it shows again without a
reload. Hidden problems SHALL be stored in the project, so every device sees
the same ones.

#### Scenario: Snooze ends

- **WHEN** a snoozed problem's week has passed while the project is open
- **THEN** the problem shows again in the editor, the list, the outline and
  the status bar without a reload

#### Scenario: Seen on another device

- **WHEN** the user dismisses a problem with the project open in two
  browsers
- **THEN** the other browser stops showing it without a reload, and after a
  reload both still hide it

### Requirement: A hidden problem keeps its spot

A hidden problem SHALL be matched by its code, its scene and the text of the
lines it covers. Edits elsewhere in the document SHALL keep it hidden;
rewriting those lines SHALL show it again.

#### Scenario: Edit elsewhere keeps it hidden

- **WHEN** a problem in S3 is dismissed and the user adds a paragraph to S1
- **THEN** the problem in S3 stays hidden

#### Scenario: Rewriting the line shows it again

- **WHEN** the user rewrites the line of a dismissed problem and the problem
  is still found
- **THEN** it shows again

### Requirement: Hide actions

The lint tooltip SHALL offer «Snooze a week» and «Dismiss» in a row after the
quick fixes, looking secondary to them, with the problem's code, following
[docs/mockups/problems.html](../../../docs/mockups/problems.html). Each row of
Checks SHALL have a «⋯» button, shown on hover or focus, that opens a menu
with «Snooze for a day» and «Snooze for a week», each with the date it ends,
and «Dismiss», reachable and closable with the keyboard.

#### Scenario: Dismiss from the tooltip

- **WHEN** the user hovers the squiggle of «Se il tempo stringe» and clicks
  «Dismiss»
- **THEN** its squiggle, margin dot and Checks row are gone, the status bar
  counts one problem less and shows «1 hidden»

#### Scenario: Snooze from the list

- **WHEN** on Wed 21 Oct the user opens a Checks row's «⋯» and chooses
  «Snooze for a week», hinted «until Wed 28 Oct»
- **THEN** the problem leaves the list

### Requirement: Toast with Undo

Each hide and each restore SHALL show a toast with Undo: «Problem
dismissed», «Snoozed until <date>», «Problem restored» or «<n> problems
restored». Undo SHALL put back exactly what was there before and show
«Undone».

#### Scenario: Undo a dismissal

- **WHEN** the user dismisses a problem, the toast says «Problem dismissed»,
  and the user clicks Undo
- **THEN** the problem shows again and the toast says «Undone»

#### Scenario: Snooze toast

- **WHEN** on Wed 21 Oct the user snoozes a problem for a week
- **THEN** the toast says «Snoozed until Wed 28 Oct» with Undo

### Requirement: Hidden problems list

A disclosure «Hidden (n)» SHALL list the hidden problems under the Checks
list, collapsed at first and absent when no problem of the document is
hidden, in document order, dimmed, each with a hollow dot of its severity,
its message, its place, and «Dismissed» or «Snoozed until <date>» with the
date and time in a tooltip. Clicking one SHALL select it in the editor as a
shown problem does.

#### Scenario: Status of each hidden problem

- **WHEN** one problem is dismissed and one is snoozed until Wed 28 Oct
- **THEN** «Hidden (2)» lists them with «Dismissed» and «Snoozed until Wed
  28 Oct»

### Requirement: Restoring hidden problems

Each hidden problem in the list SHALL have a «Restore» button, and «Restore
all» SHALL be offered when two or more are hidden. A restored problem SHALL
show again everywhere.

#### Scenario: Restore one

- **WHEN** the user opens «Hidden (2)» and clicks «Restore» on a dismissed
  problem
- **THEN** the problem shows again everywhere and the disclosure reads
  «Hidden (1)»

#### Scenario: Restore all

- **WHEN** two problems are hidden and the user clicks «Restore all»
- **THEN** both show again, the disclosure is gone, and the toast says «2
  problems restored»

### Requirement: gdrarchive link in the top bar

On every view of a project, the top bar SHALL show the project's gdrarchive
link, its own or inherited, after the status menu, as
[docs/mockups/gdrarchive-link.html](../../../docs/mockups/gdrarchive-link.html)
shows it. It SHALL be read-only and open the address in a new tab. An
inherited link SHALL say «From campaign <title>» in its tooltip. Focus mode
SHALL hide it. A project with no link SHALL show nothing there.

#### Scenario: Inherited link in the top bar

- **WHEN** the user opens «L'Ancora di Sabaoth», in Kulthos, with no link of
  its own
- **THEN** the top bar shows «gdrarchive · Kulthos» after the status, with
  the tooltip «From campaign Kulthos. Opens <address> in a new tab»

#### Scenario: Hidden in focus mode

- **WHEN** the user presses ⌘. on a linked project
- **THEN** the link is hidden with the other top-bar controls

#### Scenario: No link, nothing shown

- **WHEN** the user opens a stand-alone one-shot with no link
- **THEN** the top bar is as before this change

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
