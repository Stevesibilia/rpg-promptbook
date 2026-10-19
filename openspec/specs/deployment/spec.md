# deployment Specification

## Purpose

How a release of RPG Promptbook reaches the homelab, what the running server reports about itself, and how its database is backed up.

## Requirements

### Requirement: Release by tag

A release SHALL be a tag `vX.Y.Z` on a commit of `main` in the GitHub
repository. The tag SHALL be mirrored to the GitLab project
`utilities/rpg-promptbook`, whose pipeline SHALL build the image
`registry.siberio.eu/utilities/rpg-promptbook:vX.Y.Z`, install it on the
homelab cluster in the namespace `rpg-promptbook`, and fail unless
`https://promptbook.siberio.eu/api/health` then reports that version. A tag on
a commit that is not on `main` SHALL NOT be mirrored.

#### Scenario: A release tag

- **WHEN** the architect pushes the tag `v0.1.0` on the head of `main`
- **THEN** the GitLab pipeline for `v0.1.0` builds, deploys and verifies, and
  the live health check reports `"version": "v0.1.0"`

#### Scenario: A tag off main

- **WHEN** a `v*` tag is pushed on a commit that `main` does not contain
- **THEN** the mirror workflow fails and nothing is pushed to GitLab

### Requirement: Version in the health check

`GET /api/health` SHALL answer `{ "ok": true, "version": <version> }` while
the database can be reached, and 503 with `{ "ok": false, "version":
<version> }` when it cannot. The version SHALL be the value of `APP_VERSION`,
or `"dev"` when it is not set.

#### Scenario: Deployed server

- **WHEN** the server runs with `APP_VERSION=v0.1.0` and its database is up
- **THEN** `GET /api/health` answers 200 with `{ "ok": true, "version": "v0.1.0" }`

#### Scenario: Local server

- **WHEN** the server runs without `APP_VERSION`
- **THEN** the health check reports `"version": "dev"`

### Requirement: Database backups

The deployed database SHALL be a CloudNativePG cluster `rpg-promptbook-db`
with continuous WAL archiving and a daily base backup to the bucket
`cnpg-rpg-promptbook` on Silo, kept 30 days. Uninstalling the chart SHALL NOT
delete the database cluster.

#### Scenario: After the first deploy

- **WHEN** the first release is installed
- **THEN** the cluster `rpg-promptbook-db` is Ready, WAL archiving reports no
  failure, and the scheduled backup `rpg-promptbook-db-daily` exists with a
  completed first backup

### Requirement: Hardened server image

The server image SHALL be built on Project Hummingbird's Node.js images
(`registry.access.redhat.com/hi/nodejs`, the builder variant for the build
stages, the runtime variant for the final stage), SHALL run as a non-root user
and SHALL start and serve with a read-only root filesystem and every Linux
capability dropped, writing only to `/tmp`.

#### Scenario: Read-only start

- **WHEN** the image runs with a read-only root filesystem, a writable `/tmp`
  and no capabilities, against an empty database
- **THEN** it applies the migrations, creates the admin account, answers
  `/api/health` with 200, serves the web client and accepts a sign-in, as a
  user other than root
