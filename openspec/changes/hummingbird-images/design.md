## Context

`Dockerfile` has four stages (`deps`, `build`, `prod-deps`, `runtime`), all
`FROM node:26-alpine`, runs as `node` (1000) and health-checks with `wget`.
The chart (`charts/rpg-promptbook`) runs the pod as 1000:1000 with a
read-only root filesystem and waits for the database with
`postgres:18-alpine` (`waitForDatabase.image` in `values.yaml`).

Measured by the architect on 2026-10-19 (arm64, OrbStack):

- Tags on `registry.access.redhat.com/hi/nodejs`: `26` and `26-builder`
  (26.11.1 today), also `-fips` variants; every image is published for amd64
  and arm64. No sign-in needed to pull.
- `hi/nodejs:26-builder`: user 65532, group 0, `HOME=/tmp`, workdir `/app`,
  bash, npm 11.20.0, glibc 2.43, no `which`. `hi/nodejs:26`: user 65532,
  entrypoint `docker-entrypoint.sh`, has `sh`, no `wget` or `curl`, 168 MB
  (`node:26-alpine` is 181 MB). `os.userInfo()` throws there (no passwd
  entry); the server does not call it.
- `hi/postgresql:18`: user `postgres`, has `sh` and `pg_isready`, which
  answered "accepting connections" under `--read-only`.
- A prototype `Dockerfile` with the changes below built in a few minutes and
  gave a 211 MB image (224 MB today). Run with
  `--read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges`
  against `postgres:18-alpine`: migration applied, admin account created,
  `/api/health` 200 with the version, `/` 200, `POST /api/auth/login` 200
  (so the glibc build of `@node-rs/argon2` loads), Docker health `healthy`,
  `process.getuid()` 65532. The prototype is at
  `/private/tmp/claude-501/-Users-steve-Homelab-rpg-promptbook/71beaef1-edab-4934-8c70-2a9293814a32/scratchpad/hb/Dockerfile`.

## Goals / Non-Goals

**Goals:** every image the software runs on: the server image, its init
container, the compose and CI databases, on Hummingbird images, with the same
behaviour and the same hardening.

**Non-Goals:** the CloudNativePG database image;
FIPS variants; pinning by digest.

## Decisions

### 1. Base images by major tag

`FROM registry.access.redhat.com/hi/nodejs:26-builder AS deps`, the same for
`prod-deps` (`build` stays `FROM deps`), and
`FROM registry.access.redhat.com/hi/nodejs:26 AS runtime`. The major tag, as
`node:26-alpine` was: each release build picks up Hummingbird's rebuilds with
their security fixes, and Node 26 matches `.nvmrc`. Rejected: digest pins
(nothing here would bump them; Renovate does not run on this repository);
FIPS variants (no requirement).

### 2. Build stages write as 65532

The builder runs as 65532 and `COPY` writes files owned by root, so
`esbuild` cannot create `packages/server/dist` (measured: "mkdir
/app/packages/server/dist: permission denied"). Every `COPY` in `deps`,
`build` and `prod-deps` gets `--chown=65532:0`. The npm cache mounts move to
the builder's home: `--mount=type=cache,target=/tmp/.npm,uid=65532`. The
runtime stage keeps plain `COPY`: its files stay owned by root and read-only
to the server, as today.

### 3. Runtime user and health check

Drop `USER node`: the image's default user is 65532, non-root. The
`HEALTHCHECK` uses Node, since the image has no `wget`:

```dockerfile
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
```

`CMD` is unchanged. The comment at the top of the file says glibc instead of
musl (`@node-rs/argon2` ships a prebuilt glibc binary for both
architectures) and where the base images come from.

### 4. Chart

- `templates/deployment.yaml`: pod `runAsUser: 65532`, `runAsGroup: 65532`
  (rather than the image's group 0: the server writes only to `/tmp`, an
  `emptyDir`, and needs no group access).
- `values.yaml`: `waitForDatabase.image.repository:
registry.access.redhat.com/hi/postgresql`, `tag: "18"`. Its script needs
  `sh`, `date` and `pg_isready`, all present. The pod's `runAsUser`
  overrides the image's `postgres` user, as it did for `postgres:18-alpine`.
- `Chart.yaml`: `version: 0.1.1`.

### 5. Local and CI databases

`compose.yaml`'s `postgres` service and the `postgres` service of the `check`
job in `.github/workflows/ci.yml` use `registry.access.redhat.com/hi/postgresql:18`.
Measured by the architect: same `POSTGRES_USER`, `POSTGRES_PASSWORD` and
`POSTGRES_DB` variables as the official image, `pg_isready` in the image, a
password-only start (as in CI) works. Two differences from `postgres:18-alpine`:
`PGDATA` is `/var/lib/postgresql/data` (the volume stays mounted at
`/var/lib/postgresql`), and it runs as uid 999 (Alpine's is 70). A local volume
made by the old image therefore does not carry over: the new image would not
find the old data and could not write there. These are developer and test
databases, so the fix is a fresh volume (`docker compose down -v`), said in a
comment above the service in `compose.yaml`; do not migrate them.

### 6. Proof and release

CI's `e2e` job builds the image on GitHub's amd64 runner and runs the
end-to-end tests against it: that is the amd64 proof. The arm64 proof is the
architect's prototype run repeated by the implementer on the final file.
Released as `v0.1.1`; the pipeline's `verify` job and a sign-in on
`promptbook.siberio.eu` are the live check.

## Risks / Trade-offs

- **Red Hat's registry is a new dependency** for every build, on GitHub and
  on the GitLab runner. If it is down, a release waits. Accepted.
- **`hi/nodejs:26` moves often** (several rebuilds a week). A release built
  on a broken rebuild fails in `verify`, and the fix is a re-run once a fixed
  image is out. Accepted.
- **The ExperimentalWarning about `localStorage`** printed at start comes
  from Node 26, not from the base image. If it does not also appear with
  `node:26-alpine`, report it.
