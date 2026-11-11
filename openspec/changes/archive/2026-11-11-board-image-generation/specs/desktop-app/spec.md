## MODIFIED Requirements

### Requirement: Actions that need the server

While offline, actions that only the server can do SHALL be shown disabled
with the hint «Needs the server»: Import Markdown, the bin and restoring from
it, deleting a project, the Markdown folder export, restoring, undoing and
deleting server snapshots, Connected apps, account changes, and saving
settings. Generate on the board SHALL be shown disabled with the title
«Generating needs the server. It comes back when this computer is online.»,
the board SHALL say «Offline. Choosing, editing and dropping files still
work. Generate comes back when this computer is online.», and Settings →
Image generation SHALL show only «Image generation is kept on the server.
Connect this computer to change it.»; generations SHALL NOT be queued
offline. Reading the projects list, settings, the account and the server
snapshots last seen SHALL work offline from what the app last fetched. The
CueBard export SHALL work offline and SHALL NOT be shown disabled. The
OpenRouter key and its status SHALL never be kept on this computer.

#### Scenario: Import offline

- **WHEN** the app is offline and the user looks at Import Markdown
- **THEN** the button is disabled with the hint Needs the server

#### Scenario: CueBard export offline

- **WHEN** the app is offline and the user opens Actions in a project's
  panel
- **THEN** «Export as a Markdown folder…» is disabled with the hint Needs
  the server, and «Export for CueBard…» is enabled

#### Scenario: Generate offline

- **WHEN** the app is offline and the user looks at a prompt on the board
- **THEN** Generate is disabled with the title «Generating needs the server.
  It comes back when this computer is online.», and the board's «Generated
  here» total is hidden

#### Scenario: Image generation settings offline

- **WHEN** the app is offline and the user opens Settings → Image generation
- **THEN** the section reads «Image generation is kept on the server.
  Connect this computer to change it.» with no key field

#### Scenario: Generate online

- **WHEN** the app is online and the user generates 2 images
- **THEN** the request reaches the server with the app's token and the
  images arrive on the board by sync
