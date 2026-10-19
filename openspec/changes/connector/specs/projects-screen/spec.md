## MODIFIED Requirements

### Requirement: Built from the agreed mockup

The web client SHALL follow [docs/mockups/projects.html](../../../docs/mockups/projects.html)
in the browser shell: the Emerald tokens of the mockups (dark by default,
light available), Barlow, Barlow Condensed, Spectral and IBM Plex Mono served
by the app itself, the top bar, the rail, the status bar, and the screens
below. Parts the mockup tags 2b and the rail's Images and music entry SHALL
NOT appear. The rail's Inspiration, Research, Brainstorm log and History
entries SHALL appear as
[docs/mockups/connector.html](../../../docs/mockups/connector.html) shows
them, enabled only while a project is open. The ⌘K hint SHALL appear only on
the project page, where the command palette exists.

#### Scenario: Fonts offline from the internet

- **WHEN** the app is opened on a network with no internet access
- **THEN** every font loads from the app's own origin

### Requirement: Settings page

The gear in the rail SHALL open Settings with the sections To-do templates
(a tab per category; items renamed in place, reordered by dragging, added and
removed; a note that editing never changes existing projects), Document
templates (read-only description of both skeletons), Author and licence
(author, copyright, licence, default system), Account (display name, change
password), Connected apps (the apps the user allowed, as the connector
capability defines), Sync and storage (the server address and Export all
projects), and Appearance (Dark, Light, System, remembered in the browser).

#### Scenario: Template edit is saved

- **WHEN** the user adds «Stampare le schede» to the one-shot template and
  reloads the page
- **THEN** the item is still there

#### Scenario: Connected apps section

- **WHEN** the user opens Settings and presses Connected apps
- **THEN** the address is `/settings/apps` and the section lists the user's
  approved apps and how to connect Claude
