## 1. Image

- [x] 1.1 `Dockerfile`: base images, `--chown`, cache mounts, `USER`, `HEALTHCHECK`, header comment (design decisions 1 to 3)
- [x] 1.2 Build arm64; run with `--read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges` against `postgres:18-alpine`: migration, health with version, `/`, sign-in, Docker health, uid 65532
- [x] 1.3 The `localStorage` warning compared with the `node:26-alpine` image (risks)

## 2. Chart and runbook

- [x] 2.1 `deployment.yaml` user and group, `values.yaml` wait-for-database image, `Chart.yaml` 0.1.1 (decision 4)
- [x] 2.2 `hi/postgresql:18` init script run as uid 65532 with `--read-only` against the test database
- [x] 2.3 `compose.yaml` and the CI service on `hi/postgresql:18` (decision 5), the volume comment; `docker compose up` on a fresh project name reaches healthy and the app signs in; then `down -v`
- [x] 2.4 `docs/deploy-homelab.md`: where the base images come from; Prettier on it
- [x] 2.5 Checks: `helm lint` and `helm template` with both values files, `docker compose build`, the e2e suite against the compose stack if it runs locally (else say so), `openspec validate hummingbird-images --strict`; push; hand back

## 3. Release (architect)

- [x] 3.1 Pull request, CI green (the `e2e` job builds amd64), merge
- [x] 3.2 Tag `v0.1.1`, GitHub Release, GitLab pipeline green, live sign-in; archive; close #14
