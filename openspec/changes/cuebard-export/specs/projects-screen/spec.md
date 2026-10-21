## MODIFIED Requirements

### Requirement: Project panel

Clicking a row SHALL select it and show the project panel on the right:
title, editable in place; category; status as a menu; system; for adventures
and one-shots the campaign as a menu (Stand-alone and the user's campaigns);
Open; the current seed; the to-do list with its progress, where items can be
ticked, added, renamed, reordered by dragging, given a note or a due date,
and deleted; for adventures and one-shots the document's scenes, words,
errors and warnings; and the actions Export as a Markdown folder, Export for
CueBard and Delete. Changes made in the panel SHALL go through the project's
Yjs document. Double-clicking a row, Enter on a selected row, or Open SHALL
open the project's page.

#### Scenario: Tick from the panel

- **WHEN** the user ticks «Brani scelti» in the panel of «L'Ancora di
  Sabaoth»
- **THEN** the panel shows 6/9 at once, and the row in the list shows 6/9
  once the change is stored

#### Scenario: Export for CueBard from the panel

- **WHEN** the user opens Actions in the panel of «L'Ancora di Sabaoth» and
  clicks «Export for CueBard…», under «Export as a Markdown folder…»
- **THEN** the dialog «Export for CueBard» opens with the summary of that
  project's pack
