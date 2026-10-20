## ADDED Requirements

### Requirement: Desktop installers on each release

The same tag `vX.Y.Z` on `main` that deploys the server SHALL build the
desktop app at version `X.Y.Z` on GitHub Actions (Mac dmg and zip for arm64
and x64, Windows NSIS x64, Linux AppImage and deb x64, named
`RPG-Promptbook-<version>-<os>-<arch>.<ext>`), unsigned on Windows and Linux
and ad-hoc signed on Mac, and SHALL create the GitHub Release for the tag
with generated notes and those files, with the update manifests
(`latest.yml`, `latest-mac.yml`, `latest-linux.yml`) and their blockmaps. A
tag on a commit that is not on `main` SHALL build nothing. A pull request to
`main` that changes a package SHALL build an unpacked Linux app as a check,
and a manual run SHALL build all three platforms without releasing.

#### Scenario: A release tag

- **WHEN** the architect pushes the tag `v0.5.0` on the head of `main`
- **THEN** the GitHub Release `v0.5.0` exists with the Mac, Windows and Linux
  installers and the update manifests, and the GitLab pipeline deploys the
  server as before

#### Scenario: A tag off main

- **WHEN** a `v*` tag is pushed on a commit that `main` does not contain
- **THEN** the desktop workflow fails before building and no release is
  created

#### Scenario: Pull request check

- **WHEN** a pull request breaks the desktop packaging
- **THEN** its desktop check fails
