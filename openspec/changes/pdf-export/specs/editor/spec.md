## MODIFIED Requirements

### Requirement: Project page

Opening a project SHALL show the editor of
[docs/mockups/editor.html](../../../docs/mockups/editor.html)'s Document
view: the top bar with breadcrumbs, category, status menu, outline and
inspector toggles, focus mode, the PDF button for adventures and one-shots,
the ⌘K hint and the sync pill; the outline on the left; the prep document
in a CodeMirror 6 Markdown editor bound to the project's Yjs text, in
Spectral, about 70 characters wide; the inspector or the PDF preview on the
right; the status bar. The rail SHALL keep Projects, Document and Settings
only. The page SHALL NOT show History or export controls.

#### Scenario: Edit in two tabs

- **WHEN** the same project page is open in two tabs and the user types in
  one
- **THEN** the text appears in the other without a reload

### Requirement: Command palette

⌘K and the top bar's hint SHALL open a palette that filters, case and accent
insensitive, the outline's items and the commands: toggle outline, toggle
inspector, focus mode, syntax sheet, set status, next and previous problem,
PDF preview and review PDF (adventures and one-shots), back to projects.
Arrows SHALL move, Enter SHALL run, Escape SHALL close. Each command SHALL
show its shortcut.

#### Scenario: Go to a scene by name

- **WHEN** the user opens the palette, types «cordone» and presses Enter
- **THEN** the cursor is on the heading of «S3. Il cordone di Donato»
