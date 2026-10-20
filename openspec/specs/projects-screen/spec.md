# projects-screen Specification

## Purpose

The web client's sign-in page, projects list, project panel, new-project and import dialogs, bin, settings and project page, as agreed in the mockup.

## Requirements

### Requirement: Built from the agreed mockup

The web client SHALL follow [docs/mockups/projects.html](../../../docs/mockups/projects.html)
in the browser shell: the Emerald tokens of the mockups (dark by default,
light available), Barlow, Barlow Condensed, Spectral and IBM Plex Mono served
by the app itself, the top bar, the rail, the status bar, and the screens
below. Parts the mockup tags 2b SHALL NOT appear. The rail's Inspiration,
Research, Brainstorm log and History entries SHALL appear as
[docs/mockups/connector.html](../../../docs/mockups/connector.html) shows
them, and the Images and music entry as
[docs/mockups/board.html](../../../docs/mockups/board.html) shows it, enabled
only while a project is open. The ⌘K hint SHALL appear only on the project
page, where the command palette exists. In the desktop app the same client
SHALL follow [docs/mockups/desktop.html](../../../docs/mockups/desktop.html)
and the desktop parts of `projects.html`: the desktop sign-in and first sync
screens, the device column in the list, the desktop sync states, the update
strip, and the shortcut hint as Ctrl K outside the Mac. One web build SHALL
serve the browser and the desktop app, and the browser's behaviour SHALL NOT
change.

#### Scenario: Fonts offline from the internet

- **WHEN** the app is opened on a network with no internet access
- **THEN** every font loads from the app's own origin

#### Scenario: Browser unchanged

- **WHEN** the web client runs in a browser after this change
- **THEN** it shows no desktop screen, state or setting, and the existing
  end-to-end tests pass unchanged

#### Scenario: Images and music in the rail

- **WHEN** an adventure is open
- **THEN** the rail shows Images and music between Research and Brainstorm
  log

### Requirement: Sign-in page

Without a session the web client SHALL show the sign-in page: the
Promptbook brand, username, password and Sign in, and the server's host name
below. A failed sign-in SHALL show the error under the fields and keep the
username. After signing in the user SHALL land on the page they asked for.

#### Scenario: Deep link

- **WHEN** a signed-out user opens a project's address
- **THEN** after signing in that project's page opens

### Requirement: Projects list

The projects page SHALL list the user's projects with title, a meta line
(system and, for adventures and one-shots, scene count and error and warning
counts when not zero), category, status, to-do progress as a bar and
`done/total`, time of the last edit, and a count in the heading («6 of 8
projects»). It SHALL
offer: a search over titles and seeds; category tabs All, Campaigns,
Adventures, One-shots with counts; status chips Draft, In progress, Complete,
with Complete off at first; Group by campaign, on at first, which lists
adventures and one-shots under their campaign and shows a campaign dimmed
when only its children match; and sort by last edited, title, next due date
or to-do left. Filters, grouping and sort SHALL be remembered in the browser.
An empty result SHALL say «No project matches these filters.»

#### Scenario: Filter by category and status

- **WHEN** the user picks Adventures and turns Complete on
- **THEN** only adventures show, including complete ones, each under its
  campaign when grouping is on

### Requirement: Project panel

Clicking a row SHALL select it and show the project panel on the right:
title, editable in place; category; status as a menu; system; for adventures
and one-shots the campaign as a menu (Stand-alone and the user's campaigns);
Open; the current seed; the to-do list with its progress, where items can be
ticked, added, renamed, reordered by dragging, given a note or a due date,
and deleted; for adventures and one-shots the document's scenes, words,
errors and warnings; and the actions Export as a Markdown folder and
Delete. Changes made in the panel SHALL go through the project's Yjs
document. Double-clicking a row, Enter on a selected row, or Open SHALL open
the project's page.

#### Scenario: Tick from the panel

- **WHEN** the user ticks «Brani scelti» in the panel of «L'Ancora di
  Sabaoth»
- **THEN** the panel shows 6/9 at once, and the row in the list shows 6/9
  once the change is stored

### Requirement: New project dialog

New project (and ⌘N or Ctrl+N) SHALL open a dialog with three category cards
(Campaign, Adventure, One-shot), Title, Campaign (hidden for a campaign),
System with the user's previous systems as suggestions and the default
system from settings pre-filled, Status (Draft or In progress), and an
optional Seed. A preview SHALL show the skeleton document and the to-do list
the project will start with, with links to the settings that define them.
Create and open SHALL create the project and open its page.

#### Scenario: Preview follows the category

- **WHEN** the user switches from Adventure to Campaign
- **THEN** the Campaign field hides and the preview shows the campaign
  skeleton and the campaign to-do template

### Requirement: Import dialog

Import Markdown SHALL open a dialog with two tabs. Files or folder: a drop
zone and Choose files and Choose a folder buttons, then one row per note with
a tick box, title, file name, Category, Campaign and a converter summary
(«14 changes · 2 for you») that expands into the report. Paste: a text area,
Category and Campaign. The import button SHALL say how many projects it will
create. After importing, the list SHALL show the new projects.

#### Scenario: Paste

- **WHEN** the user pastes a note, picks One-shot and imports it
- **THEN** one draft one-shot appears in the list with the converted text as
  its document

### Requirement: Bin in the list

Delete SHALL ask for confirmation, naming the project and saying it can be
restored for 30 days. Below the list a «Bin · n projects» link SHALL show the
projects in the bin with the date each will be removed and a Restore button.

#### Scenario: Delete and restore

- **WHEN** the user deletes a project, opens the bin and restores it
- **THEN** it is back in the list

### Requirement: Settings page

The gear in the rail SHALL open Settings with the sections To-do templates
(a tab per category; items renamed in place, reordered by dragging, added and
removed; a note that editing never changes existing projects), Document
templates (read-only description of both skeletons), Author and licence
(author, copyright, licence, default system), Account (display name, change
password), Connected apps (the apps the user allowed, as the connector
capability defines), Sync and storage (the server address and Export all
projects), and Appearance (Dark, Light, System, remembered in the browser).
In the desktop app Settings SHALL also have This device, after Sync and
storage, as the desktop-app capability defines; Sync and storage SHALL show
the server the app syncs with and the lead «Projects live on this device and
sync with the server when online.» instead of the browser's.

#### Scenario: Template edit is saved

- **WHEN** the user adds «Stampare le schede» to the one-shot template and
  reloads the page
- **THEN** the item is still there

#### Scenario: Connected apps section

- **WHEN** the user opens Settings and presses Connected apps
- **THEN** the address is `/settings/apps` and the section lists the user's
  approved apps and how to connect Claude

#### Scenario: This device only on the desktop

- **WHEN** the user opens Settings in the browser
- **THEN** there is no This device section, and `/settings/device` shows
  To-do templates

### Requirement: Release in the rail

Every page with the rail SHALL show the release at the bottom of the rail,
under Settings, small and muted, as `vX.Y.Z`. In the browser it SHALL be the
server's version from `/api/health`; on the desktop it SHALL be the app's
version. Nothing SHALL show when the version is unknown or is `dev`.

#### Scenario: Release on the web

- **WHEN** the server runs with `APP_VERSION=v0.5.1` and a signed-in user
  opens the projects page
- **THEN** the bottom of the rail reads `v0.5.1`

#### Scenario: Development server

- **WHEN** the server runs without `APP_VERSION`
- **THEN** no release shows in the rail

#### Scenario: Desktop offline

- **WHEN** the desktop app 0.5.1 runs with no server reachable
- **THEN** the bottom of the rail reads `v0.5.1`
