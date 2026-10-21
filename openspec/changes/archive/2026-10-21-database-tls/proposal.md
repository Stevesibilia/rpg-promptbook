## Why

The deployed server connects to its CloudNativePG database without TLS: the
operator's `uri` has no `sslmode` (#12). The homelab policy asks applications
to connect with TLS (`sslmode=require`). With the current `pg`, `sslmode=require`
alone means full certificate verification and fails against the operator's
own CA, so the fix must hand the client that CA.

## What Changes

- **Chart:** the server and the wait-for-database init container connect with
  `sslmode=verify-full`, verified against the CA the operator writes for the
  cluster (`<cluster>-ca`, key `ca.crt`), mounted read-only.
- **Value:** `cnpg.tls.verify` (default `true`); `false` keeps the plain
  connection string, as a way back.
- **CI:** the chart job checks that the rendered Deployment carries the
  verified connection string.
- **Docs:** the runbook and README name the setting.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deployment`: the server connects to its database over verified TLS.

## Impact

- `charts/rpg-promptbook` (values, deployment template), `.github/workflows/ci.yml`
  (chart job), docs. No server code: `pg` and libpq both read `sslmode` and
  `sslrootcert` from the connection string.
- A release `v0.9.1`. The compose stack and the desktop app are not touched.
