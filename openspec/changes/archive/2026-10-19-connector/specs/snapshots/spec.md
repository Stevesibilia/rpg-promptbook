## ADDED Requirements

### Requirement: Server snapshots

The server SHALL keep snapshots of each project's prep document text in
Postgres, of three kinds: a snapshot saved by the user with a name, a Claude
snapshot stored before every change Claude makes to the prep document
(naming the tool and the target), and a restore snapshot stored before every
restore. Each SHALL record its date and word count. Claude and restore
snapshots SHALL be removed 30 days after they were made; the user's SHALL be
kept until the user deletes them. Only the user's snapshots SHALL be
deletable. Snapshots SHALL be reachable only by the project's owner, and not
while the project is in the bin; they SHALL go with the project when it is
removed for good.

#### Scenario: Expired Claude snapshot purged

- **WHEN** a Claude snapshot is 31 days old and a snapshot saved by the user
  is a year old
- **THEN** the server's purge removes the first and keeps the second

#### Scenario: Claude snapshot cannot be deleted

- **WHEN** a client asks to delete a Claude snapshot
- **THEN** the server refuses and the snapshot stays

### Requirement: Restore never loses text

Restoring a snapshot SHALL first store a restore snapshot of the current
text, then replace the prep document with the snapshot's text as a change to
the live Yjs document, so open editors show it at once.

#### Scenario: Restore and back

- **WHEN** the user restores a snapshot of 17 October, then restores the
  restore snapshot made by that restore
- **THEN** the document holds again the text it had before the first restore

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
when a snapshot is made on another client or by Claude.

#### Scenario: Save a snapshot

- **WHEN** the user types «before the read-through» and presses Save snapshot
- **THEN** the list shows it second, after Now, as You, kept until you delete
  it

#### Scenario: Claude's edit listed live

- **WHEN** History is open and Claude replaces a section
- **THEN** a Claude snapshot naming that section appears without a reload

### Requirement: Compare

Compare SHALL show a unified line diff from the snapshot's text to the current
text, with three lines of context, line numbers, removed lines in red and
added lines in green, the counts of added and removed lines, the snapshot's
kind and label, «← History», and «Restore this version». The diff SHALL be
computed in the browser.

#### Scenario: Diff of Claude's edit

- **WHEN** Claude added four lines to S3 and removed one, and the user opens
  Compare on the snapshot taken before that edit
- **THEN** the view shows +4 and −1 lines, with the changed lines of S3

### Requirement: Claude edit banner

The Document view SHALL show a banner when the project has a Claude snapshot
newer than the last one dismissed on this device: «Claude edited <target> at
<time>», Compare, Undo, the hint «Undo puts back what Claude replaced», and a
button to dismiss it. Compare SHALL open History's Compare for that snapshot.
Undo SHALL ask for a confirm and then revert only that edit: when the edited
part still reads as Claude left it, the server SHALL save the current text as
a restore snapshot and put back the part's text from before the edit; when
the part changed since, it SHALL change nothing and the banner SHALL say
«This part changed after Claude's edit. Use History to restore the whole
document.» The banner SHALL appear without a reload when Claude edits an open
project. Dismissing or undoing SHALL hide it on this device until the next
Claude edit.

#### Scenario: Banner after Claude's edit

- **WHEN** the Document view is open and Claude replaces S3
- **THEN** the banner names «S3 · Il cordone di Donato» with the time of the
  edit

#### Scenario: Undo

- **WHEN** the user presses Undo on the banner and confirms
- **THEN** S3 reads as before Claude's edit, text typed elsewhere after the
  edit is still there, History lists a restore snapshot holding Claude's
  text, and the banner is gone

#### Scenario: Undo after the part changed

- **WHEN** the user edits S3 after Claude's edit and then presses Undo and
  confirms
- **THEN** the text is unchanged and the banner points to History
