## Why

The owner asked on 2026-10-19 for the image to be built on the base images
of [Project Hummingbird](https://hummingbird-project.io/) where possible:
minimal, hardened images with a smaller attack surface than
`node:26-alpine`. The architect checked it the same day: Hummingbird
publishes Node 26 and PostgreSQL 18 for amd64 and arm64, and a prototype of
the image on them builds, starts read-only and signs in.

## What Changes

- **Image:** the build stages of `Dockerfile` use
  `registry.access.redhat.com/hi/nodejs:26-builder`, the runtime stage
  `registry.access.redhat.com/hi/nodejs:26`. The image moves from musl to
  glibc and runs as Hummingbird's non-root user 65532.
- **Chart:** the pod runs as 65532, and the `wait-for-database` init
  container uses `registry.access.redhat.com/hi/postgresql:18`.
- **Runbook:** a line on where the base images come from.

Not in this change: the PostgreSQL image of `compose.yaml` and of the CI
service (developer and test databases, not the build); the database image
CloudNativePG runs, which the cluster's `postgresql` ImageCatalog owns.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deployment`: a requirement for the hardened server image. No behaviour of
  the application changes.

## Impact

- Changed: `Dockerfile`, `charts/rpg-promptbook/values.yaml`,
  `charts/rpg-promptbook/templates/deployment.yaml`,
  `docs/deploy-homelab.md`.
- Released as `v0.1.1`.
