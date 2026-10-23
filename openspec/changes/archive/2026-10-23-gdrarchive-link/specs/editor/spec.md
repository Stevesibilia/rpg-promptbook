## ADDED Requirements

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
