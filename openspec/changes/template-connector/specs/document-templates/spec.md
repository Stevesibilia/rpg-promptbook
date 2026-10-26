## ADDED Requirements

### Requirement: Locks enforced on save

The server SHALL refuse with `invalid_template` any new version that, against
the version it is based on, removes a locked row, changes a row's role, adds
a role, renames a locked front matter key, or lowers to zero the minimum of a
box every place needs. The editor and the server SHALL share one definition
of locked rows.

#### Scenario: Role section renamed

- **WHEN** a version renames the section with the role `strongStart` from
  «Inizio forte» to «Apertura»
- **THEN** the save succeeds

#### Scenario: Locked key renamed

- **WHEN** a version renames the front matter key `licenza`
- **THEN** the save fails with `invalid_template` naming `licenza`

### Requirement: Templates saved elsewhere

The web app SHALL read the account's templates again when its window gets the
focus back, at most once every ten seconds, so a version saved in another
tab or through the connector shows in Settings and in an open project's
«vN available» without a reload. An open template editor SHALL keep its
draft.

#### Scenario: Version saved by Claude

- **WHEN** Claude saves v2 of the template an open project uses at v1, and
  the user comes back to the app's window
- **THEN** the project's top bar shows «v2 available»
