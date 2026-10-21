## ADDED Requirements

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

Following [docs/mockups/problems.html](../../../docs/mockups/problems.html),
the lint tooltip SHALL offer «Snooze a week» and «Dismiss» in a row after the
quick fixes, looking secondary to them, with the problem's code. Each row of
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

Under the Checks list, a disclosure «Hidden (n)», collapsed at first and
absent when no problem of the document is hidden, SHALL list the hidden
problems in document order, dimmed, each with a hollow dot of its severity,
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

## MODIFIED Requirements

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
scenes section and the sheets under the sheets section, each with a badge
counting its own problems that are not hidden, coloured by the worst
severity among them. The item holding the cursor SHALL be highlighted.
Clicking an item SHALL move the cursor to its heading and scroll it into
view. Scenes SHALL be reordered by dragging or with Alt+↑ and Alt+↓, as one
edit that keeps every other byte of the text and does not renumber scene
ids. The outline SHALL collapse and open with ⌘1 and its button, remembered
in the browser. For a campaign it SHALL list the `##` and `###` headings
without badges or moves.

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
