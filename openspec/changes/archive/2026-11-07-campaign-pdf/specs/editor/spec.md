## MODIFIED Requirements

### Requirement: Project page

Opening a project SHALL show the editor of
[docs/mockups/editor.html](../../../docs/mockups/editor.html)'s Document
view: the top bar with breadcrumbs, category, status menu, outline and
inspector toggles, focus mode, the History button, the PDF button, the ⌘K
hint and the sync pill; the outline on the left; the prep document in a
CodeMirror 6 Markdown editor bound to the project's Yjs text, in Spectral,
about 70 characters wide; the inspector or the PDF preview on the right; the
status bar. The rail SHALL hold Projects,
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

#### Scenario: PDF button in a campaign

- **WHEN** a campaign is open
- **THEN** the top bar shows the PDF button, and the status bar still reads
  «Campaign · not checked»

### Requirement: Command palette

⌘K and the top bar's hint SHALL open a palette that filters, case and accent
insensitive, the outline's items and the commands: toggle outline, toggle
inspector, focus mode, syntax sheet, set status, next and previous problem
(adventures and one-shots), PDF preview and review PDF, choose licence,
back to projects. Arrows SHALL move, Enter SHALL run, Escape SHALL close.
Each command that has a shortcut SHALL show it.

#### Scenario: Go to a scene by name

- **WHEN** the user opens the palette, types «cordone» and presses Enter
- **THEN** the cursor is on the heading of «S3. Il cordone di Donato»

#### Scenario: Choose licence in every project

- **WHEN** the user opens the palette in a campaign and types «licence»
- **THEN** «Choose licence…» is listed, with no shortcut

#### Scenario: Review a campaign's PDF

- **WHEN** the user opens the palette in a campaign and types «pdf»
- **THEN** «PDF preview» and «Review PDF» are listed, and no problem command

## ADDED Requirements

### Requirement: Campaign outline IDs

The outline of a campaign SHALL show, for a `### X. Name` heading whose X
is one to three capital letters followed by a number, X as the item's ID and
Name as its name.

#### Scenario: A front in the outline

- **WHEN** a campaign has `### F1. La Compagnia` under «## Fronti»
- **THEN** the outline lists «F1» «La Compagnia» one level under «Fronti»
