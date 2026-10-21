Each numbered group is one commit, Conventional Commits, with the trailers:

```
Refs: Stevesibilia/rpg-promptbook#12
Assisted-by: claude-code/<model-id>
```

## 1. Chart and CI

- [x] 1.1 `charts/rpg-promptbook/values.yaml`: `cnpg.tls.verify: true`, with a comment (D3)
- [x] 1.2 `templates/_helpers.tpl`: `rpg-promptbook.databaseCaSecretName` = `<cluster>-ca` (D2)
- [x] 1.3 `templates/deployment.yaml`: in the init container and the server, `DATABASE_URI` from the `uri` key then the composed `DATABASE_URL` when `cnpg.tls.verify`, else `DATABASE_URL` from `uri` as today (D1, D3); the `db-ca` volume and its read-only mounts at `/etc/promptbook/db-ca` only when on (D2)
- [x] 1.4 `.github/workflows/ci.yml` chart job: the two rendering checks of D4
- [x] 1.5 Checks: `helm lint` and `helm template` with both values files and with `--set cnpg.tls.verify=false` (Helm 4 in a container if not installed); show the rendered env and volumes of both containers in the hand-back

## 2. Docs

- [x] 2.1 The deploy runbook (find it under `docs/`) and README's deployment section: the database connection is verified TLS, the CA's origin, `cnpg.tls.verify` as the way back, and that a CA rotation needs `kubectl rollout restart`
- [x] 2.2 Prettier on the Markdown files touched; hand-back

## 3. Release (architect)

- [x] 3.1 Review, archive, merge, tag `v0.9.1`, watch the deploy and `/api/health`
