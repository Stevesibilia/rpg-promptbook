## MODIFIED Requirements

### Requirement: Board view

The rail's Images and music entry SHALL open `/projects/<id>/board` for an
adventure or one-shot, following
[docs/mockups/board.html](../../../docs/mockups/board.html): the heading
«Images and music», the lead «Image prompts for scenes, PCs, NPCs and
handouts; music for each scene. For the table and the CueBard export.»,
«How matching works», «Export for CueBard…» and «Add files…», then the
category tabs. The Scenes tab SHALL show one row per `### S…` of the
appendix, in its order.

#### Scenario: Rows from the appendix

- **WHEN** the user opens the board of «L'Ancora di Sabaoth», whose appendix
  has rows S1 to S6
- **THEN** the Scenes tab shows six rows, each with its id and title and
  «Open the scene in the document»

#### Scenario: Rows follow the document

- **WHEN** the user renames S4's appendix row in the Document view and opens
  the board
- **THEN** the S4 row shows the new title and keeps its prompts and files

#### Scenario: Export from the board

- **WHEN** the user clicks «Export for CueBard…» in the board's header
- **THEN** the dialog «Export for CueBard» opens with the summary of the
  pack
