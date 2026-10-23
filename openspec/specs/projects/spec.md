# projects Specification

## Purpose

What a project holds (category, status, campaign, seed, to-do list and prep document), the templates and settings a new project starts from, the summary the list is built from, the bin, and ownership.

## Requirements

### Requirement: A project is one Yjs document

Each project SHALL be one Yjs document holding everything the user edits: its
metadata, its seed, its to-do list, its prep document, its sources of
inspiration, its research topics and notes, its brainstorm log, its board's
prompts and choices, the list of its images and tracks, and the problems the
user has hidden. The document's shape SHALL be defined once, in the
`promptbook-project` package, and used by the server, the web client and the
desktop app. The shape SHALL carry a schema version. The row the projects
list shows SHALL also be defined in that package, so the server and the
desktop app build the same row from a document's summary. Snapshots of the
prep document SHALL live on the server, outside the document, and on the
desktop app also in its local store. The bytes of images and tracks SHALL
live outside the document, in the server's file store and on the desktop
app's disk.

#### Scenario: Shape read by every client

- **WHEN** the server creates a project and the web client opens it
- **THEN** both read the title, category, status, seed, to-do items and
  document text through the same package functions

#### Scenario: Older document read

- **WHEN** a project created before this change is opened
- **THEN** its inspiration items, research, brainstorm log, board, file list
  and hidden problems read as empty and nothing else changes

#### Scenario: Same row offline

- **WHEN** the desktop app, offline, ticks a to-do item of a project with 5
  of 9 items done
- **THEN** its projects list shows 6/9, and once synced the server's list
  shows the same row

#### Scenario: Board edits merge

- **WHEN** the desktop app, offline, writes S3's image prompt while Claude
  writes S3's music prompt, and the app comes back online
- **THEN** S3 holds both prompts

#### Scenario: Hides merge

- **WHEN** the desktop app, offline, dismisses a problem in S1 while the
  browser snoozes a problem in S3, and the app comes back online
- **THEN** both problems are hidden on both

### Requirement: Category, status and campaign

A project SHALL have a category, one of campaign, adventure or one-shot,
chosen at creation and not changed afterwards. It SHALL have a status, one of
draft, in progress or complete, set only by the user. An adventure or a
one-shot SHALL either stand alone or belong to one campaign; a campaign SHALL
NOT belong to another campaign.

#### Scenario: Status set by the user only

- **WHEN** every to-do item of a project is ticked
- **THEN** its status stays what the user last chose

#### Scenario: Campaign link

- **WHEN** an adventure is moved into the campaign «Blacksad - Il
  Continentale»
- **THEN** the list shows it under that campaign, and choosing «Stand-alone»
  moves it back to the top level

#### Scenario: A campaign cannot be nested

- **WHEN** a campaign's document names another campaign, or a project that is
  not a campaign, as its campaign
- **THEN** the summary treats it as stand-alone, and the web client never
  offers such a choice

### Requirement: Seed kept with its versions

A project SHALL keep its seed, the original idea, as a list of dated versions.
Changing the seed SHALL add a version and never rewrite an earlier one. The
current seed SHALL be the latest version.

#### Scenario: First idea kept

- **WHEN** a project created with a seed later gets a new seed text
- **THEN** both texts are kept with their dates, and the panel shows the new
  one

### Requirement: To-do list

A project SHALL have an ordered to-do list. An item SHALL hold a text, a done
flag, an optional short note and an optional due date. The user SHALL be able
to add, rename, reorder, delete and tick items. Items SHALL never tick
themselves. Concurrent edits to different items, or to different fields of
the same item, SHALL both survive.

#### Scenario: Two tabs edit the list

- **WHEN** one tab ticks «Prompt Suno» while another adds «Stampare le
  schede»
- **THEN** after sync both tabs show the item ticked and the new item

### Requirement: Templates for new projects

A new project SHALL start with a copy of its category's to-do template from
the user's settings, and with a skeleton prep document built from its
category's default document template: adventures and one-shots from
`avventura@1` (front matter with the title, system, format, campaign when
set, author, copyright and licence from the settings; the template's
sections; one scene `### S1. Prima scena` with empty fields; the images and
music appendix), campaigns from `campagna@1` (front matter, then
`## Premessa`, `## Fronti`, `## PNG ricorrenti`, `## Fili aperti`,
`## Sessioni`). The project SHALL record the template's id and version in
its metadata, and every reader of its document SHALL use that template. A
project with no template recorded SHALL read as its category's built-in.
Editing a template SHALL NOT change existing projects.

#### Scenario: New adventure in a campaign

- **WHEN** the user creates the adventure «Il ballo dei Lorenzetti» in the
  campaign «Blacksad - Il Continentale» with system «Not The End»
- **THEN** its document starts with front matter holding `titolo`, `sistema`,
  `formato: avventura`, `campagna`, `autore` and `licenza`, its to-do list is
  a copy of the adventure template, its metadata records the template
  `avventura` version 1, and parsing the document with the format package
  reports no error with a code starting `meta.`, `section.` or `scene.id.`

#### Scenario: Project made before templates were recorded

- **WHEN** a one-shot created before this change is opened
- **THEN** its metadata reads the template `avventura` version 1, and its
  problems and PDF are the same as before

#### Scenario: Template edited later

- **WHEN** the adventure to-do template gets a new item
- **THEN** projects created before keep their lists unchanged and the next
  new adventure includes the item

### Requirement: Settings

Each user SHALL have settings holding one to-do template per category and the
defaults for author, copyright, licence and system. A new user's settings
SHALL start from built-in defaults: for adventures and one-shots «Scrivere le
scene», «Schede dei PNG», «Prompt Midjourney», «Immagini scelte», «Prompt
Suno», «Brani scelti», «PDF per il tavolo», «Export CueBard», «Rilettura»; for
campaigns «Fronti e minacce», «PNG ricorrenti», «Mappa», «Fili aperti dopo
ogni sessione», «Rileggere le note prima di giocare».

#### Scenario: Defaults copied into front matter

- **WHEN** the settings hold author «Stefano Sibilia» and licence
  `CC-BY-NC-SA-4.0` and a one-shot is created
- **THEN** its front matter has `autore: Stefano Sibilia` and
  `licenza: CC-BY-NC-SA-4.0`

### Requirement: Project summary for the list

The server SHALL keep a summary of each project, updated whenever the
project's document is stored: title, category, status, campaign, system, the
current seed, to-do items done and total, the project's own gdrarchive link,
and the time of the last edit. For adventures and one-shots it SHALL also
hold the number of scenes, the number of words and the counts of errors and
warnings from parsing the document with the format package, leaving out the
problems the user has hidden at the time it is stored. A snoozed problem
SHALL count again from the next store after its snooze ends. The project
list SHALL be built from the summaries without loading the documents.

#### Scenario: Summary follows an edit

- **WHEN** a to-do item is ticked in a project with 5 of 9 items done
- **THEN** the list shows 6/9 for that project once the change is stored

#### Scenario: Hidden problems not counted

- **WHEN** the user dismisses one of a project's 3 warnings
- **THEN** the list shows 2 warnings for that project once the change is
  stored

#### Scenario: Link in the list

- **WHEN** the user links the campaign «Kulthos» to gdrarchive
- **THEN** Kulthos's row in the list carries the link once the change is
  stored, and its adventures show it without opening Kulthos

### Requirement: Bin

Deleting a project SHALL move it to the bin. A project in the bin SHALL be
hidden from the list and its document SHALL refuse new connections. The user
SHALL be able to restore it for 30 days; after 30 days it SHALL be removed for
good. Adventures and one-shots of a campaign in the bin SHALL show as
stand-alone until the campaign is restored.

#### Scenario: Restore

- **WHEN** «L'Ancora di Sabaoth» is deleted and restored the same day
- **THEN** it is back in the list with its document, to-do list and seed
  unchanged

#### Scenario: Purge

- **WHEN** a project has been in the bin for more than 30 days
- **THEN** the server removes its summary and its document

### Requirement: Projects belong to one user

Every project SHALL belong to the user who created it. A user SHALL see,
open, change, export and delete only their own projects.

#### Scenario: Another user's project

- **WHEN** a signed-in user requests a project id that belongs to another
  user
- **THEN** the server answers as if the project did not exist

### Requirement: Link to a gdrarchive campaign

Any project MAY hold one link to a campaign in gdrarchive: an address and an
optional label. The link SHALL be stored in the project's metadata, so it
syncs like the title, and SHALL be set or removed as a whole. Promptbook
SHALL NOT call gdrarchive.

#### Scenario: Link on every device

- **WHEN** the user links the campaign «Kulthos» in the browser while the
  desktop app is open
- **THEN** the desktop app shows the same link once synced

#### Scenario: Older document read

- **WHEN** a project created before this change is opened
- **THEN** it has no link and nothing else changes

### Requirement: gdrarchive address and label

The address SHALL be `https://gdrarchive.siberio.eu/campaigns/<id>`, the id
made of letters, digits, `_` and `-`, at most 64 characters. A trailing
slash SHALL be dropped, and any other address refused. The label SHALL be
trimmed and at most 40 characters. A value another client wrote that breaks
these rules SHALL read as no link.

#### Scenario: Link saved without its trailing slash

- **WHEN** the user links the campaign «Kulthos» to
  `https://gdrarchive.siberio.eu/campaigns/12/` with the label «Kulthos»
- **THEN** the project holds `https://gdrarchive.siberio.eu/campaigns/12`
  with the label «Kulthos»

#### Scenario: Another address refused

- **WHEN** the user tries to link a project to
  `https://gdrarchive.siberio.eu/sessions/48`
- **THEN** nothing is stored

### Requirement: Inherited gdrarchive link

An adventure or a one-shot with no link of its own, inside a campaign of the
user that is not in the bin, SHALL show its campaign's link, marked as coming
from that campaign. A link of its own SHALL win. A campaign SHALL NOT
inherit, and nothing SHALL inherit from a stand-alone project.

#### Scenario: Adventure inherits

- **WHEN** the campaign «Kulthos» has a link and its adventure «L'Ancora di
  Sabaoth» has none
- **THEN** the adventure shows Kulthos's link, from campaign Kulthos

#### Scenario: Own link wins

- **WHEN** a one-shot in Kulthos is given a link of its own
- **THEN** it shows its own link, not Kulthos's

#### Scenario: Moved out of the campaign

- **WHEN** «L'Ancora di Sabaoth», with no link of its own, is made
  stand-alone
- **THEN** it shows no link
