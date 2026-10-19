## Context

The homelab deploys its own applications (gdrarchive, cronista) with GitLab CI
on the self-hosted `gitlab.siberio.eu` (GitLab 19.5, Community Edition): a
`v*` tag runs the shared components `dockerbuild/docker-build` and
`helmdeploy/helmdeploy` from `homelab/ci-cd`, builds into
`registry.siberio.eu`, and installs the application's own Helm chart through
the GitLab agent of the `utilities` group. ArgoCD and Renovate play no part in
those releases. The reference is gdrarchive:

- `~/Homelab/gdrarchive/.gitlab-ci.yml` (component versions, `KUBE_CONTEXT`,
  `prepare-secrets` at :221-266, `verify` at :298-322);
- `~/Homelab/gdrarchive/charts/gdrarchive/` (`templates/cnpg.yaml`,
  `templates/backend-deployment.yaml`, `templates/_helpers.tpl`,
  `values.yaml`, `values-homelab.yaml`);
- `~/Homelab/gdrarchive/docs/deploy-homelab.md` (runbook, restore at
  :251-412);
- `~/Homelab/kubernetes_cluster/AGENTS.md` :119-127 (database policy).

Promptbook differs from gdrarchive in three ways that shape this plan: the
repository is on GitHub; one image holds the server and the built web client
(`Dockerfile`, `WEB_DIST=/app/web`); and the server holds live Yjs documents
in memory and serves the sync websocket at `/sync`, so it runs as exactly one
replica.

Facts measured on 2026-10-19:

- GitLab CE has no pull mirroring, so GitLab cannot fetch from GitHub by
  itself.
- `gitlab.siberio.eu` resolves publicly to `home.siberio.eu`
  (93.43.229.235), the same address the cluster's Traefik answers on.
- The utilities group sets `DEVELOP_GITLAB_AGENT_PROJECT` and
  `DEVELOP_GITLAB_AGENT_ID`; its agent's `ci_access.groups: utilities` covers
  any new project in the group.
- Traefik (`traefik-ingress` namespace, class `traefik-ingress`) proxies
  websockets natively; `websecure` has
  `respondingTimeouts.readTimeout=600`. Its Service has
  `externalTrafficPolicy: Cluster`, so the server sees node addresses, not
  client addresses.
- Cluster nodes are mixed amd64 and arm64; applications are pinned to amd64,
  and the runners build amd64 only.
- Backup slots used (UTC): 01:15, 01:30, 01:45 (twice), 02:00.

## Goals / Non-Goals

**Goals:** a tag on `main` ends with the new version live at
`https://promptbook.siberio.eu`, with its database backed up, and a runbook
the owner can follow without this conversation.

**Non-Goals:** single sign-on (#6); a multi-arch image or a public image on
ghcr.io; real client addresses (a cluster-wide Traefik change); tests on
GitLab (they stay on GitHub pull requests); Renovate; changes to
`compose.yaml`.

## Decisions

### 1. GitHub mirrors each release to GitLab

`.github/workflows/mirror.yml`, on `push` of tags `v*` and on
`workflow_dispatch` (which pushes `main` only, to test the token and the
route without a release):

- checkout with `fetch-depth: 0`;
- for a tag, fail unless `git merge-base --is-ancestor "$TAG" origin/main`;
- push `origin/main` to `refs/heads/main` and, for a tag, `refs/tags/$TAG` to
  `https://gitlab.siberio.eu/utilities/rpg-promptbook.git`;
- authenticate with the secret `GITLAB_MIRROR_TOKEN` (a project access token,
  Maintainer, `write_repository`) passed through an environment variable and
  `http.extraHeader` or a credential helper, never in a command line that is
  echoed; `permissions: contents: read`;
- `concurrency: mirror`, not cancelling a running push.

Reason: GitHub is where the code, reviews and the Electron releases (#6) live;
GitLab is where the deploy tooling, the registry and the cluster agent live.
Pushing from GitHub needs one token and keeps the homelab pattern intact.
Rejected: pushing tags to both remotes by hand (a release then only works from
a checkout with both remotes); building on GitHub and triggering a deploy-only
GitLab pipeline (two pipelines to debug, the cluster still needs the GitLab
agent).

### 2. The GitLab pipeline runs on release tags only

`.gitlab-ci.yml` at the repository root, with
`workflow: rules: - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/`. The push of
`main` alone creates no pipeline. Stages `build`, `secrets`, `deploy`,
`verify`:

- **build:** `homelab/ci-cd/components/dockerbuild/docker-build`, at the
  version gdrarchive pins, `app_name: $CI_PROJECT_PATH`, the root
  `Dockerfile` and context, `platform: linux/amd64`. Image
  `registry.siberio.eu/utilities/rpg-promptbook:$CI_COMMIT_TAG`.
- **prepare-secrets:** same image and agent context as gdrarchive's job.
  `kubectl create secret … --dry-run=client -o yaml | kubectl apply -f -`
  into namespace `rpg-promptbook`:
  - `rpg-promptbook-registry`, type docker-registry, server
    `registry.siberio.eu`, from `PB_REGISTRY_USER` and
    `PB_REGISTRY_PASSWORD`;
  - `rpg-promptbook-credentials`, keys `admin-username` and
    `admin-password`, from `PB_ADMIN_USERNAME` and `PB_ADMIN_PASSWORD`.
    The job fails with a clear message when a variable is missing.
- **deploy:** `homelab/ci-cd/components/helmdeploy/helmdeploy`, at
  gdrarchive's version, `namespace: rpg-promptbook`,
  `release_name: rpg-promptbook`, `chart_path: charts/rpg-promptbook`,
  `values_file: charts/rpg-promptbook/values-homelab.yaml`, `context` as
  gdrarchive passes it.
- **verify:** like gdrarchive's: retry for up to two minutes until
  `curl -fsS https://promptbook.siberio.eu/api/health` returns `.ok == true`
  and `.version == $CI_COMMIT_TAG`; then the CNPG cluster
  `rpg-promptbook-db` is Ready and the ScheduledBackup
  `rpg-promptbook-db-daily` exists.

Credentials never go through `helm --set`. Reason: same pattern, same
components, same failure modes as the owner's other applications.

### 3. One chart, one workload, one replica

`charts/rpg-promptbook/` written for this application (no subchart),
modelled on gdrarchive's chart with the frontend removed:

- `Chart.yaml` (`name: rpg-promptbook`, `version: 0.1.0`,
  `appVersion: "0.1.0"`), `values.yaml` with neutral defaults,
  `values-homelab.yaml` with the homelab settings, `templates/_helpers.tpl`
  (fullname, labels, image reference resolving
  `.Values.image.tag | default .Chart.AppVersion`, as gdrarchive does),
  `NOTES.txt`.
- `templates/deployment.yaml`: `replicas: 1`, `strategy: Recreate`,
  `nodeSelector: kubernetes.io/arch: amd64`, `imagePullSecrets`
  `rpg-promptbook-registry`, `checksum/` annotation on the values that feed
  the environment. Security context: `runAsNonRoot`, user and group 1000
  (`node`), no privilege escalation, all capabilities dropped,
  `readOnlyRootFilesystem: true` with an `emptyDir` on `/tmp`.
- An init container `wait-for-database` (`pg_isready`, as gdrarchive's), so
  migrations do not crash-loop while the database starts.
- Probes: `startupProbe` and `readinessProbe` on `GET /api/health` (it checks
  the database); `livenessProbe` a `tcpSocket` on 3000, so a database outage
  marks the pod unready without restarting it and dropping every open sync
  connection.
- Resources: requests 50m CPU and 192Mi, memory limit 768Mi (gdrarchive's
  backend).
- `templates/service.yaml`: ClusterIP, port 3000.
- `templates/ingress.yaml`: class `traefik-ingress`, annotation
  `cert-manager.io/cluster-issuer: le-cloudflare-dns`, host
  `promptbook.siberio.eu`, path `/` Prefix to the Service, TLS secret
  `rpg-promptbook-tls`. No websocket annotation: Traefik upgrades by itself.
- `templates/cnpg.yaml`: gdrarchive's, renamed. Cluster
  `rpg-promptbook-db` (PostgreSQL 18 from the `postgresql`
  ClusterImageCatalog, one instance, `ur-default`, 2Gi,
  `helm.sh/resource-policy: keep`, `bootstrap.initdb` database and owner
  `promptbook`), Barman Cloud plugin ObjectStore to
  `s3://cnpg-rpg-promptbook/` at `http://192.168.2.8:9900` with the Secret
  `cnpg-backup-s3`, retention `30d`, ScheduledBackup
  `rpg-promptbook-db-daily` at `0 15 2 * * *` (UTC: a free slot, 03:15 or
  04:15 in Rome) with `immediate: true`, PodMonitor with
  `release: prometheus-community`.

Environment of the server container:

| Variable                                                  | Value                                                   |
| --------------------------------------------------------- | ------------------------------------------------------- |
| `DATABASE_URL`                                            | key `uri` of the Secret `rpg-promptbook-db-app`         |
| `PUBLIC_URL`                                              | `https://promptbook.siberio.eu` (from values)           |
| `TRUST_PROXY_HOPS`                                        | `1` (Traefik is the only proxy)                         |
| `APP_VERSION`                                             | the image tag the chart resolves                        |
| `PROMPTBOOK_ADMIN_USERNAME` / `PROMPTBOOK_ADMIN_PASSWORD` | keys of `rpg-promptbook-credentials`, `optional: false` |

Reason for one replica and `Recreate`: Hocuspocus keeps each open document in
the process, and two servers would each hold their own copy. Migrations
already take an advisory lock, but there is no second process to race.
Rejected: gdrarchive's pre-upgrade `pg_dump` hook. WAL archiving gives a
point-in-time restore to just before any upgrade, and the cluster policy asks
new applications for no dump jobs.

### 4. The health check carries the version

`config.ts` gains `APP_VERSION: z.string().min(1).optional()`. `healthRoutes`
receives the version and answers `{ ok: true, version }` or 503
`{ ok: false, version }`; `"dev"` when unset. Reason: the pipeline needs proof
that the new image is the one serving, not just a 200 (gdrarchive checks its
`/api/auth/config` the same way). Public, as the check already is: the
version of an open-source server is not a secret.

### 5. Chart checks on every pull request

A job `chart` in `.github/workflows/ci.yml`: `azure/setup-helm` pinned to a
version, then `helm lint charts/rpg-promptbook` and
`helm lint charts/rpg-promptbook -f charts/rpg-promptbook/values-homelab.yaml`
and `helm template` with each values file. Not a required check yet. Reason:
the chart otherwise only meets a parser on a release tag.

### 6. Releases and versions

Semantic versions from `v0.1.0`. The architect tags the head of `main` after
a merge that changes what is deployed, and creates a GitHub Release with
generated notes. Tags on GitHub are the source; GitLab only receives them.
The desktop app (#6) will share these versions.

### 7. Outside the repository (architect)

Done before the brief, so the implementer can lint against the real project:

- GitLab project `utilities/rpg-promptbook`, private; protected tags `v*`;
  deploy token with `read_registry`; masked and protected CI variables
  `PB_REGISTRY_USER`, `PB_REGISTRY_PASSWORD`, `PB_ADMIN_USERNAME`,
  `PB_ADMIN_PASSWORD`; project access token for the mirror (Maintainer,
  `write_repository`, one year), stored as the GitHub secret
  `GITLAB_MIRROR_TOKEN`.
- Merge request on `homelab/kubernetes_cluster`: `infra/terraform/
app_rpg_promptbook.tf` with the namespace through `modules/namespaces` and
  the record `cloudflare_dns_record.promptbook_siberio` (CNAME to
  `home.siberio.eu`, not proxied); `rpg-promptbook =
module.ns_rpg_promptbook.name` in `cnpg_backup_consumers`. Merged and
  applied before the first tag, because the backup Secret is written into the
  namespace.

### 8. Runbook

`docs/deploy-homelab.md`, written for the owner: what runs where; the
one-time setup of decision 7; cutting a release; watching it
(`glab ci status` with `GITLAB_HOST=gitlab.siberio.eu`); rollback (re-run the
deploy job of an older tag's pipeline; migrations are forward-only, so a
rollback across a migration needs a restore); restore (point-in-time into a
new cluster, linking gdrarchive's runbook and
`kubernetes_cluster/docs/postgres-restore.md` for the commands); the yearly
renewal of `GITLAB_MIRROR_TOKEN` and the deploy token; the known limit below.
`README.md` links it.

## Risks / Trade-offs

- **The CNPG `uri` and TLS.** The cluster policy says applications connect
  with `sslmode=require`, and `pg`'s connection-string parser treats
  `sslmode=require` as full verification, which fails against the operator's
  own CA. Copy whatever gdrarchive's backend does and say which in the
  hand-back; if it needs a server code change, stop and ask.
- **The read-only root filesystem.** If the server writes outside `/tmp` at
  start, it fails in the cluster only. Check with
  `docker run --read-only --tmpfs /tmp` against the compose database; if it
  fails, report what it writes rather than turning the setting off.
- **Websockets and Traefik's 600 s read timeout.** If it applies to upgraded
  connections, sync sockets drop every ten minutes and the client reconnects.
  The architect checks a socket held open past ten minutes after the first
  deploy; a drop is a follow-up, not a blocker.
- **Shared client address.** With `externalTrafficPolicy: Cluster` every
  outside client looks like a node address to the sign-in throttle, so 30
  failed sign-ins from anyone lock sign-in for 15 minutes for everyone. Open
  sessions are unaffected. Known limit in the runbook, follow-up issue; not
  fixed here.
- **GitHub to GitLab reachability.** If GitHub's runners cannot reach
  `gitlab.siberio.eu` on 443, decision 1 fails. The architect runs the
  workflow by hand (`workflow_dispatch`) before the first tag.
- **Component inputs.** If the pinned component versions do not accept an
  input this plan names, follow gdrarchive's usage and report the difference;
  do not change `homelab/ci-cd`.

## Departures accepted at review

Recorded by the architect after the build (2026-10-19):

- **No TLS to the database, as gdrarchive.** The CNPG `uri` carries no
  `sslmode`, so `pg` connects in plain text inside the cluster, which CNPG's
  `host all all all scram-sha-256` rule accepts. gdrarchive does the same.
  `sslmode=require` alone would mean full verification in
  `pg-connection-string` 2.14 and fail on the operator's CA;
  `sslmode=require&uselibpqcompat=true` would work without a code change.
  This does not meet `kubernetes_cluster/AGENTS.md` ("connects with
  `sslmode=require`"), which gdrarchive does not meet either: a follow-up for
  both applications, not this change.
- **`Config.appVersion` is a string** (`"dev"` when unset) and `healthRoutes`
  takes the config, rather than an optional field: one default in one place.
- **`prepare-secrets` does not create the namespace.** It fails with a clear
  message when the namespace is missing, because `homelab/kubernetes_cluster`
  owns it; creating it here would fight that repository.
- **The registry server is the literal `registry.siberio.eu`**, as this
  design names it.
- **`PORT` and `SESSION_TTL_HOURS` are set from values**; the pod adds
  `seccompProfile: RuntimeDefault`; `wait-for-database` uses
  `postgres:18-alpine`, the server's major.
- **The chart keeps gdrarchive's `cnpg.restore` values** (`serverName`,
  `targetTime`, `archiveServerName`) for the runbook's restore, and drops
  `cnpg.enabled` and `useForApp`: the database is always the CNPG cluster.
  Jobs are `build`, `prepare-secrets`, `helm-deploy`, `verify`.
- **`checksum/config` covers the values that feed the environment**; the
  credentials Secret is written outside Helm, so a rotated password needs
  `kubectl rollout restart`, as the runbook says.
- **The mirror passes the token through `GIT_CONFIG_COUNT`/`KEY`/`VALUE`**
  (`http.extraHeader`, basic auth, user `mirror`), masked, with
  `persist-credentials: false`.
