# inspiration Specification

## Purpose

The spark a project started from: the seed with its dated versions, and the sources of inspiration, kept apart from the prep document.

## Requirements

### Requirement: Inspiration view

The rail's Inspiration entry SHALL open the project's Inspiration view of
[docs/mockups/connector.html](../../../docs/mockups/connector.html): the
seed, then the sources of inspiration, with the lead «The spark this project
started from. Prep only: never printed.» The seed SHALL show as rendered
Markdown with Edit and a Versions menu listing every version, newest first,
with its date, the first one marked «first idea» and the latest «current».
Edit SHALL open a text area; «Save as a new version» SHALL add a dated
version and Cancel SHALL leave the seed unchanged. View on a version SHALL
show its text read-only. The view SHALL say that Claude can read the seed but
never rewrites it.

#### Scenario: Seed edited

- **WHEN** the user edits the seed of «L'Ancora di Sabaoth» and saves it as a
  new version
- **THEN** the new text is the current seed, and the Versions menu lists one
  more version with the earlier text still readable

#### Scenario: Cancel keeps the seed

- **WHEN** the user opens Edit, changes the text and presses Cancel
- **THEN** the seed and its versions are unchanged

### Requirement: Sources of inspiration

A project SHALL keep a list of sources of inspiration in its Yjs document.
Each item SHALL have a kind (Link, Quote, Image link or Note), a text (the
title of a link or image, the quote, or the note), a URL for a link or an
image link, a line on why it matters, who added it (the user or Claude) and
its date. The view SHALL list the items newest first with their kind, text,
the URL's host as a link that opens in a new tab, why it matters, who and
when, and a count. An add row SHALL take the kind, the text or URL and why it
matters; Add item SHALL refuse an empty text, and for a Link or an Image link
an address that is not http or https. Each item SHALL have Delete with a
confirm. The items SHALL never go into the table PDF or the `.cbpack`.

#### Scenario: Quote added by hand

- **WHEN** the user picks Quote, types «Sotto la Sicilia ci sono tre
  colonne…» and why it matters, and presses Add item
- **THEN** the item is first in the list as a Quote by you with today's date,
  and the count goes up by one

#### Scenario: Link refused

- **WHEN** the user picks Link and types `javascript:alert(1)`
- **THEN** Add item refuses it and nothing is added

#### Scenario: Item added by Claude appears live

- **WHEN** the Inspiration view is open and Claude adds a Link item through
  the connector
- **THEN** the item appears in the list, marked Claude, without a reload
