## MODIFIED Requirements

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
