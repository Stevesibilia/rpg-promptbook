## Context

Issue #12. The chart creates the CloudNativePG cluster `<fullname>-db`
(`charts/rpg-promptbook/templates/cnpg.yaml`) with the operator's own
certificates, so the operator writes the Secret `<fullname>-db-ca` holding the
CA as `ca.crt`, and the server certificate names the Services
`<cluster>-rw`, `<cluster>-rw.<namespace>` and `<cluster>-rw.<namespace>.svc`.
Both containers of the Deployment read `DATABASE_URL` from the `uri` key of
`<fullname>-db-app` (`templates/deployment.yaml:74-78` and `:100-104`), which
names the host `<cluster>-rw.<namespace>` and has no query string. The homelab
policy is in kubernetes_cluster `AGENTS.md:125`.

No kubeconfig for the Talos cluster exists on the architect's machine, so the
cluster side was not read live; the client side was proved locally (below).

### Proof (architect, 2026-10-21)

A throwaway Postgres 18 with TLS, its certificate signed by a throwaway CA and
naming `rpg-promptbook-db-rw.promptbook`, reached from containers on the same
Docker network:

| Client                          | Connection string                       | Result                            |
| ------------------------------- | --------------------------------------- | --------------------------------- |
| `pg` 8.23.1 (Node 24)           | no `sslmode`                            | connects, `pg_stat_ssl.ssl` false |
| `pg` 8.23.1                     | `?sslmode=verify-full&sslrootcert=<CA>` | connects, TLSv1.3                 |
| `pg` 8.23.1                     | same, another CA                        | `UNABLE_TO_VERIFY_LEAF_SIGNATURE` |
| `pg` 8.23.1                     | same, host not in the certificate       | `ERR_TLS_CERT_ALTNAME_INVALID`    |
| `pg` 8.23.1                     | `?sslmode=require`                      | `UNABLE_TO_VERIFY_LEAF_SIGNATURE` |
| `pg_isready` (hi/postgresql:18) | `?sslmode=verify-full&sslrootcert=<CA>` | accepting connections, exit 0     |
| `pg_isready`                    | same, another CA                        | no response, exit 2               |

The password held `@`, `:` and `/`, percent-encoded as the operator writes it.

## Goals / Non-Goals

**Goals:** TLS on every connection the deployed server and its init container
make to the database, verified against the cluster's CA and host name.

**Non-Goals:** gdrarchive (same state, another repository); client
certificates; the compose stack and CI databases, which run on one host
without TLS; a change to `pg_hba` on the cluster.

## Decisions

### D1. The verified connection string is composed in the chart

Each container first reads the operator's `uri` into `DATABASE_URI`, then sets

```yaml
- name: DATABASE_URL
  value: "$(DATABASE_URI)?sslmode=verify-full&sslrootcert=/etc/promptbook/db-ca/ca.crt"
```

Kubernetes expands `$(DATABASE_URI)` because it is defined earlier in the
same `env` list. **Why:** `pg` (through `pg-connection-string`) and libpq
(`pg_isready` in the init container) both read `sslmode` and `sslrootcert`
from the connection string, as proved above, so neither the server nor the
CLI (`cli.ts`, run with `kubectl exec` in the same container) changes.
**Rejected:** `sslmode=require&uselibpqcompat=true`, which encrypts without
verifying; a `DATABASE_CA_FILE` setting read by the server, which is more code
and would still need the URL parameters for the init container.

### D2. The CA comes from the operator's Secret, one key only

A volume `db-ca` from the Secret `<cluster>-ca` with `items: [{ key: ca.crt,
path: ca.crt }]`, mounted read-only at `/etc/promptbook/db-ca` in the init
container and the server. The helper `rpg-promptbook.databaseCaSecretName`
gives `<cluster>-ca`. **Why:** only the public CA reaches the pod; the Secret
also holds the CA's private key, which `items` leaves out. The operator
renews the server certificate under the same CA; a CA rotation needs a pod
restart, like the other Secrets the chart reads (`deployment.yaml:30-31`).

### D3. A value to turn it off

`cnpg.tls.verify`, default `true`. With `false` the chart renders the
`DATABASE_URL` exactly as today (straight from `uri`) and no `db-ca` volume.
**Why:** a quick way back if the live cluster disagrees with the proof
(Risks), without reverting the release.

### D4. CI checks the rendered Deployment

The chart job gains a step that renders the homelab values and fails unless
the output contains `sslmode=verify-full&sslrootcert=/etc/promptbook/db-ca/ca.crt`
twice (init container and server) and the Secret name `rpg-promptbook-db-ca`;
and one that renders with `--set cnpg.tls.verify=false` and fails if
`sslmode` appears. **Why:** `helm lint` and `helm template` alone pass on a
template that drops the setting.

### D5. A patch release

`v0.9.1`. The deploy itself is the real proof: the pipeline fails unless
`/api/health` reports `v0.9.1`, and the server cannot start its migrations
without a verified connection.

## What is not touched

Server code, the compose stack, CI's Postgres services, the desktop app, the
CNPG Cluster spec (`cnpg.yaml`), gdrarchive.

## Risks / Trade-offs

Report it, do not work around it:

- **The live certificate does not name the `uri` host.** The proof used the
  names from CloudNativePG's documentation; the cluster was not read. The
  init container then waits `waitForDatabase.timeoutSeconds` (300 s) and the
  pod fails; the Deployment's `Recreate` strategy means the site is down until
  a fix. Way back: re-run the GitLab deploy of `v0.9.0`, or release with
  `cnpg.tls.verify: false` in `values-homelab.yaml`. The architect watches
  the deploy.
- **A CA rotation** by the operator needs a pod restart.
