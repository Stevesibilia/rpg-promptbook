## MODIFIED Requirements

### Requirement: Project page

Opening a project SHALL show the editor of
[docs/mockups/editor.html](../../../docs/mockups/editor.html)'s Document
view: the top bar with breadcrumbs, category, status menu, outline and
inspector toggles, focus mode, the History button, the PDF button for
adventures and one-shots, the ⌘K hint and the sync pill; the outline on the
left; the prep document in a CodeMirror 6 Markdown editor bound to the
project's Yjs text, in Spectral, about 70 characters wide; the inspector or
the PDF preview on the right; the status bar. The rail SHALL hold Projects,
Document, Inspiration, Research, Brainstorm log and History, and Settings at
the bottom, as in
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

### Requirement: Inspector

The inspector SHALL hold sections that open and close: This scene, Checks,
To-do, Research and Seed. This scene SHALL list, for the scene holding the
cursor, each of the template's scene fields in order, ticked when present and
with an Insert button when missing, plus the read-aloud row, and buttons to
insert a read-aloud, a handout, a box, a side box, a sheet reference and a
reactions table. Checks SHALL list every problem with its place; clicking one
SHALL select it in the editor. To-do SHALL be the project's to-do list with
its count. Research SHALL list the research notes that match the scene
holding the cursor, as the research capability defines. Seed SHALL show the
current seed with a link to edit it in the Inspiration view. The inspector
SHALL collapse and open with ⌘2 and its button, remembered in the browser.
For a campaign it SHALL show To-do and Seed only.

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
