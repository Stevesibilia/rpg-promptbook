## ADDED Requirements

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
