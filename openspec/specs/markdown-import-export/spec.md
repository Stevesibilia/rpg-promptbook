# markdown-import-export Specification

## Purpose

How Markdown notes become projects through the converter, and how projects are exported as folders of Markdown files.

## Requirements

### Requirement: One project per note

Importing SHALL turn each Markdown note into one new project. A note SHALL be
a `.md` file chosen or dropped, every `.md` file inside a chosen or dropped
folder and its subfolders, or text pasted in the import dialog. Importing
SHALL never merge a note into an existing project, even when the titles
match; a matching title SHALL be reported next to the note.

#### Scenario: A folder of notes

- **WHEN** the user drops a folder with three adventure notes and a shopping
  list
- **THEN** the dialog lists four notes, the three adventure notes ticked and
  the shopping list unticked as «not an adventure note»

#### Scenario: Duplicate title

- **WHEN** a note's title matches the existing project «Il pozzo di Ganzirri»
- **THEN** the note is listed with a notice that a project with this title
  exists, and importing it creates a second project

### Requirement: Notes go through the converter

Each note SHALL be converted with the format package's `convertNote` by the
server when it is stored; the web client SHALL run the same conversion to
preview it. The dialog SHALL show the converter's report per note:
the changes made and what still needs the user. A note SHALL count as an
adventure note when the original note has front matter, when the converted
front matter holds a key other than `titolo`, or when the converted text has
at least one scene heading `### S<n>.`. Nothing in a note SHALL be dropped:
what the converter cannot place stays in the text.

#### Scenario: Report

- **WHEN** a note with an unknown field «Se il tempo stringe» in S5 is
  imported
- **THEN** its report lists the changes made and, under «Needs you», the
  unknown field in S5, and the stored document still contains the field's
  text

### Requirement: Category and campaign from the note

For each note the dialog SHALL propose a category and a campaign. The
category SHALL come from the converted front matter's `formato` (`one-shot`
gives One-shot, `avventura` or `campagna` give Adventure or Campaign), and
otherwise SHALL be left for the user to choose; a ticked note without a
category SHALL block the import button. The campaign SHALL be the user's
campaign whose title equals the front matter's `campagna`, and otherwise
Stand-alone. The title SHALL come from the front matter's `titolo`, then the
first `#` heading, then the file name without extension.

#### Scenario: Campaign recognised

- **WHEN** a note has `campagna: Cronaca del Gabbiano` and that campaign
  exists
- **THEN** the note is proposed as an adventure in «Cronaca del Gabbiano»

### Requirement: Imported projects start like new ones

An imported project SHALL get the to-do template of its category, status
draft, and the note's converted text as its document. Images referenced by a
note SHALL stay as references in the text; the import SHALL report how many
images were not brought in, since assets come in a later change.

#### Scenario: Images in a Joplin export

- **WHEN** a note references two images in a `_resources` folder
- **THEN** the project is created with the two references unchanged and the
  report says 2 images were not imported

### Requirement: Export as a Markdown folder

The user SHALL be able to export one project, or every project not in the
bin, as a zip. Each project SHALL be a folder named after its title with
`document.md` (the prep document as stored), `todo.md` (a GFM task list with
notes and due dates), `seed.md` (every seed version, newest first, with its
date) and `project.json` (id, title, category, status, campaign title,
system, dates and schema version). Export SHALL lose no text the user wrote.

#### Scenario: Round trip of the document

- **WHEN** a project created by import is exported and its `document.md` is
  imported again
- **THEN** the new project's document is byte-identical to the first one's,
  since a second conversion makes no edits
