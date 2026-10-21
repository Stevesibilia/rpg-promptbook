## MODIFIED Requirements

### Requirement: Actions that need the server

While offline, actions that only the server can do SHALL be shown disabled
with the hint «Needs the server»: Import Markdown, the bin and restoring from
it, deleting a project, the Markdown folder export, restoring, undoing and
deleting server snapshots, Connected apps, account changes, and saving
settings. Reading the projects list, settings, the account and the server
snapshots last seen SHALL work offline from what the app last fetched. The
CueBard export SHALL work offline and SHALL NOT be shown disabled.

#### Scenario: Import offline

- **WHEN** the app is offline and the user looks at Import Markdown
- **THEN** the button is disabled with the hint Needs the server

#### Scenario: CueBard export offline

- **WHEN** the app is offline and the user opens Actions in a project's
  panel
- **THEN** «Export as a Markdown folder…» is disabled with the hint Needs
  the server, and «Export for CueBard…» is enabled
