## MODIFIED Requirements

### Requirement: History view

The rail's History entry and the top bar's History button SHALL open the
project's History view of
[docs/mockups/connector.html](../../../docs/mockups/connector.html):
the lead «Snapshots of the prep document. Restoring never loses the current
text.», a Save snapshot row with a name field, and the list: Now (the current
text and its words) first, then the snapshots newest first with when, a
chip (Claude, You, Restore), the label, a line on how long it is kept («kept
until <date>», «kept until you delete it», or which snapshot a restore came
from), the words, Compare and Restore, and Delete on the user's own. The hint
SHALL say that Claude's snapshots are kept 30 days and the user's until
deleted. Restore and Delete SHALL ask for a confirm; the restore confirm SHALL
say that the current text is saved as a snapshot first. The list SHALL update
when a snapshot is made on another client or by Claude. In the desktop app
the view SHALL follow
[docs/mockups/desktop.html](../../../docs/mockups/desktop.html): the
list SHALL also hold the snapshots taken on this computer, with a Source
column (Server or This device) and a filter All, Server, This device; the
hint SHALL also say how local snapshots are taken and kept, with a link to
Settings → This device; offline, a line SHALL say «Offline. Server snapshots
are shown as of <time>; new ones appear when you are back online.», Save
snapshot SHALL save on this computer, and the actions on server snapshots
that need the server SHALL be disabled.

#### Scenario: Save a snapshot

- **WHEN** the user types «before the read-through» and presses Save snapshot
- **THEN** the list shows it second, after Now, as You, kept until you delete
  it

#### Scenario: Claude's edit listed live

- **WHEN** History is open and Claude replaces a section
- **THEN** a Claude snapshot naming that section appears without a reload

#### Scenario: Both sources on the desktop

- **WHEN** the desktop app has two hourly snapshots of a project and the
  server has a Claude snapshot of it, and the user picks This device
- **THEN** the list shows Now and the two hourly snapshots only

#### Scenario: Saved offline

- **WHEN** the desktop app is offline and the user saves the snapshot «prima
  della sessione»
- **THEN** it appears as This device with the toast «Snapshot saved on this
  device.»
