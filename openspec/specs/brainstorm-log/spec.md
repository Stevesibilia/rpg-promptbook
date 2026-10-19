# brainstorm-log Specification

## Purpose

A dated log per project of ideas, decisions, rejected ideas and open questions, written by the user or by Claude, read first by a new chat.

## Requirements

### Requirement: Brainstorm log

A project SHALL keep a brainstorm log in its Yjs document: dated entries,
each with a title, ideas, decisions, rejected ideas each with why, open
questions, who wrote it (Claude or the user), and whether its open questions
went to the to-do list. The rail's Brainstorm log entry SHALL open the view
of [docs/mockups/connector.html](../../../docs/mockups/connector.html):
the lead «Dated entries, newest first. Claude writes one at the end of a
chat; you can too.», the note «A new chat with Claude reads this log first.»,
and the entries newest first with date and time, title, «via Claude» or «by
you», and the four parts, each shown only when it has items.

#### Scenario: Entry from Claude appears live

- **WHEN** the Brainstorm log view is open and Claude adds an entry through
  the connector
- **THEN** the entry appears first, marked via Claude, without a reload

### Requirement: Entries by hand

New entry SHALL open an empty entry by you for editing, dated now. Edit SHALL
make an entry's title and its four lists editable, one item per line, a
rejected idea with its why; Done SHALL save it and an entry without a title
SHALL be refused. Delete SHALL remove an entry after a confirm that says a new
chat will no longer read it.

#### Scenario: Entry written by hand

- **WHEN** the user presses New entry, types a title and one open question,
  and presses Done
- **THEN** the entry is first in the log, by you, with that question

#### Scenario: Entry deleted

- **WHEN** the user deletes the entry «Il finale a Capo Peloro» and confirms
- **THEN** it is gone from the log on every open client

### Requirement: Open questions to the to-do list

An entry with open questions SHALL have «Add open questions to the to-do
list», which adds one to-do item per question, at the end of the list, and
marks the entry. A marked entry SHALL show «Added to the to-do list ✓»
disabled instead, on every client. An entry without open questions SHALL not
show the button.

#### Scenario: Questions become to-do items

- **WHEN** the user presses «Add open questions to the to-do list» on an entry
  with two open questions
- **THEN** the to-do list gains those two items at its end, and the button
  becomes «Added to the to-do list ✓»
