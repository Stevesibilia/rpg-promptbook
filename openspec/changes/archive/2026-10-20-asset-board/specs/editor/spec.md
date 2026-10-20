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

## ADDED Requirements

### Requirement: Opening a scene from another view

The Document view SHALL accept a scene id in its address
(`/projects/<id>?scene=S3`) and open with that scene's heading in view and
the cursor on it, as the outline's jump does; an unknown id SHALL open the
document at the top.

#### Scenario: From the board

- **WHEN** the user presses «Open the scene in the document» on the board's
  S3 row
- **THEN** the Document view opens with S3's heading in view
