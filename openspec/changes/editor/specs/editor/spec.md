## ADDED Requirements

### Requirement: Project page

Opening a project SHALL show the editor of
[docs/mockups/editor.html](../../../../../docs/mockups/editor.html)'s Document
view: the top bar with breadcrumbs, category, status menu, outline and
inspector toggles, focus mode, the ⌘K hint and the sync pill; the outline on
the left; the prep document in a CodeMirror 6 Markdown editor bound to the
project's Yjs text, in Spectral, about 70 characters wide; the inspector on
the right; the status bar. The rail SHALL keep Projects, Document and
Settings only. The page SHALL NOT show History, export or PDF controls.

#### Scenario: Edit in two tabs

- **WHEN** the same project page is open in two tabs and the user types in
  one
- **THEN** the text appears in the other without a reload

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
the format package with the adventure template: a dot in the margin, an
underline coloured by severity, and a tooltip with the message and one action
per fix. Parsing SHALL NOT run on the main thread while the user types. A fix
SHALL be applied as one edit, undone in one step, and SHALL NOT be applied to
text it was not computed for. Campaigns SHALL show no problems.

#### Scenario: Unknown field fixed

- **WHEN** a scene holds `**Se il tempo stringe:** …`
- **THEN** the line is underlined as a problem
- **AND WHEN** the user chooses one of its fixes in the tooltip
- **THEN** the text changes as the fix says and the problem is gone

#### Scenario: Campaign not checked

- **WHEN** a campaign is opened
- **THEN** no problem is shown and the status bar says «Campaign · not
  checked»

### Requirement: Outline

The outline SHALL list the front matter, the sections, the scenes under the
scenes section and the sheets under the sheets section, each with a badge
counting its own problems, coloured by the worst severity. The item holding
the cursor SHALL be highlighted. Clicking an item SHALL move the cursor to its
heading and scroll it into view. Scenes SHALL be reordered by dragging or
with Alt+↑ and Alt+↓, as one edit that keeps every other byte of the text and
does not renumber scene ids. The outline SHALL collapse and open with ⌘1 and
its button, remembered in the browser. For a campaign it SHALL list the `##`
and `###` headings without badges or moves.

#### Scenario: Jump to a scene

- **WHEN** the user clicks «S4» in the outline
- **THEN** the cursor is on the `### S4.` heading and it is in view

#### Scenario: Move a scene

- **WHEN** the user drags S2 below S3
- **THEN** the document has S3 before S2, the ids are unchanged, and another
  tab shows the same order

### Requirement: Inspector

The inspector SHALL hold sections that open and close: This scene, Checks,
To-do and Seed. This scene SHALL list, for the scene holding the cursor, each
of the template's scene fields in order, ticked when present and with an
Insert button when missing, plus the read-aloud row, and buttons to insert a
read-aloud, a handout, a box, a side box, a sheet reference and a reactions
table. Checks SHALL list every problem with its place; clicking one SHALL
select it in the editor. To-do SHALL be the project's to-do list with its
count. Seed SHALL show the current seed with a link to edit it in the project
panel. The inspector SHALL collapse and open with ⌘2 and its button,
remembered in the browser. For a campaign it SHALL show To-do and Seed only.

#### Scenario: Insert a missing field

- **WHEN** the cursor is in a scene without «Prove e regole» and the user
  presses its Insert
- **THEN** `**Prove e regole:** ` is added after the last present field that
  comes before it in the template, with the cursor after it

#### Scenario: Problem from the list

- **WHEN** the user clicks a problem in Checks
- **THEN** its text is selected and in view

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
back to projects. Arrows SHALL move, Enter SHALL run, Escape SHALL close.
Each command SHALL show its shortcut.

#### Scenario: Go to a scene by name

- **WHEN** the user opens the palette, types «cordone» and presses Enter
- **THEN** the cursor is on the heading of «S3. Il cordone di Donato»

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
column, the error and warning counts (a click opens Checks), the word count of
the text after the front matter, and the template's name and version, or
«Campaign · not checked»; and, as today, the sync state and last sync.

#### Scenario: Counts follow the text

- **WHEN** the user adds an unknown field to a scene
- **THEN** the error or warning count in the status bar goes up by one
