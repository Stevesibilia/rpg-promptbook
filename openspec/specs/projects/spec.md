# projects Specification

## Purpose

What a project holds (category, status, campaign, seed, to-do list and prep document), the templates and settings a new project starts from, the summary the list is built from, the bin, and ownership.

## Requirements

### Requirement: A project is one Yjs document

Each project SHALL be one Yjs document holding everything the user edits: its
metadata, its seed, its to-do list, its prep document, its sources of
inspiration, its research topics and notes, and its brainstorm log. The
document's shape SHALL be defined once, in the `promptbook-project` package,
and used by the server, the web client and later the desktop app. The shape
SHALL carry a schema version. Snapshots of the prep document SHALL live on
the server, outside the document.

#### Scenario: Shape read by every client

- **WHEN** the server creates a project and the web client opens it
- **THEN** both read the title, category, status, seed, to-do items and
  document text through the same package functions

#### Scenario: Older document read

- **WHEN** a project created before this change is opened
- **THEN** its inspiration items, research and brainstorm log read as empty
  lists and nothing else changes

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
the user's settings, and with a skeleton prep document for its category:
adventures and one-shots from the `avventura@1` template (front matter with
the title, system, format, campaign when set, author, copyright and licence
from the settings; the template's sections; one scene `### S1. Prima scena`
with empty fields; the images and music appendix), campaigns from a fixed
plain skeleton (front matter, then `## Premessa`, `## Fronti`,
`## PNG ricorrenti`, `## Fili aperti`, `## Sessioni`). Editing a template
SHALL NOT change existing projects.

#### Scenario: New adventure in a campaign

- **WHEN** the user creates the adventure «Il ballo dei Lorenzetti» in the
  campaign «Blacksad - Il Continentale» with system «Not The End»
- **THEN** its document starts with front matter holding `titolo`, `sistema`,
  `formato: avventura`, `campagna`, `autore` and `licenza`, its to-do list is
  a copy of the adventure template, and parsing the document with the format
  package reports no error with a code starting `meta.`, `section.` or
  `scene.id.`

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
current seed, to-do items done and total, and the time of the last edit. For
adventures and one-shots it SHALL also hold the number of scenes, the number
of words and the counts of errors and warnings from parsing the document with
the format package. The project list SHALL be built from the summaries
without loading the documents.

#### Scenario: Summary follows an edit

- **WHEN** a to-do item is ticked in a project with 5 of 9 items done
- **THEN** the list shows 6/9 for that project once the change is stored

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
