## Why

The server and the web client only run from a local docker compose stack, so
the owner cannot prep with Promptbook yet, and the desktop app (#6) has no
server to sign in to. This change puts Promptbook on the homelab cluster at
`https://promptbook.siberio.eu`, deployed the way gdrarchive and cronista are:
a `v*` tag builds the image, applies the secrets, installs the Helm chart and
checks the live site.

Decided with the owner on 2026-10-19: the repository stays on GitHub and a
workflow mirrors each release tag to a GitLab project, whose pipeline uses the
homelab's shared CI components and GitLab agent; the server is public at
`promptbook.siberio.eu`; the architect opens and merges the change to
`homelab/kubernetes_cluster` that adds the namespace, the backup bucket and
the DNS record.

## What Changes

- **Release mirror:** a GitHub workflow that, on a `v*` tag on `main`, pushes
  `main` and the tag to the GitLab project `utilities/rpg-promptbook`.
- **Deploy pipeline** (`.gitlab-ci.yml`, tags only): build the image into
  `registry.siberio.eu`, create the pull and credentials secrets, `helm
upgrade --install`, check the live version, the database and its backup.
- **Helm chart** `charts/rpg-promptbook`: the server (which serves the web
  client and the sync websocket), its Service and Ingress, and a
  CloudNativePG cluster with WAL archiving and a daily backup to Silo.
- **Version in the health check:** `GET /api/health` reports the running
  version, so the pipeline can prove the new release is live.
- **Chart checks on pull requests:** `helm lint` and `helm template` in CI.
- **Runbook** `docs/deploy-homelab.md`: one-time setup, release, rollback,
  restore, token renewal.

Not in this change: single sign-on (#6), a multi-arch or public image, real
client addresses behind Traefik (the cluster's `externalTrafficPolicy`),
changes to the local compose stack.

## Capabilities

### New Capabilities

- `deployment`: how a release reaches the homelab and what the running server
  reports about itself.

### Modified Capabilities

None.

## Impact

- New: `charts/rpg-promptbook/`, `.gitlab-ci.yml`,
  `.github/workflows/mirror.yml`, `docs/deploy-homelab.md`.
- Changed: `packages/server/src/config.ts`,
  `packages/server/src/routes/health.ts` and its test,
  `.github/workflows/ci.yml`, `README.md` (a link to the runbook).
- Outside the repository, done by the architect: the GitLab project, its
  protected tags, deploy token and CI variables; the GitHub secret
  `GITLAB_MIRROR_TOKEN`; a merge request on `homelab/kubernetes_cluster`.
