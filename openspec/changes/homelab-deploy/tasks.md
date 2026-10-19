## 0. Outside the repository (architect, before the brief)

- [ ] 0.1 GitLab project `utilities/rpg-promptbook`, protected tags `v*`, deploy token, CI variables, mirror token as the GitHub secret `GITLAB_MIRROR_TOKEN` (design decision 7)
- [ ] 0.2 Merge request on `homelab/kubernetes_cluster` (namespace, DNS record, backup consumer), merged and applied

## 1. Version in the health check

- [ ] 1.1 `APP_VERSION` in `packages/server/src/config.ts`; `healthRoutes` reports `version`, `"dev"` when unset (decision 4)
- [ ] 1.2 Tests: 200 with the version, 503 with the version, `"dev"` without `APP_VERSION`

## 2. Helm chart

- [ ] 2.1 `charts/rpg-promptbook`: `Chart.yaml`, `values.yaml`, `values-homelab.yaml`, `_helpers.tpl`, `NOTES.txt` (decision 3)
- [ ] 2.2 `deployment.yaml` (init container, probes, security context, environment table), `service.yaml`, `ingress.yaml`
- [ ] 2.3 `cnpg.yaml` from gdrarchive's, renamed, schedule `0 15 2 * * *`
- [ ] 2.4 The read-only root filesystem check of the risks, with the image from `Dockerfile` and the compose database
- [ ] 2.5 Job `chart` in `.github/workflows/ci.yml` (decision 5); `helm lint` and `helm template` pass with both values files

## 3. Pipelines

- [ ] 3.1 `.github/workflows/mirror.yml` (decision 1)
- [ ] 3.2 `.gitlab-ci.yml` (decision 2); `glab ci lint` against `utilities/rpg-promptbook` passes
- [ ] 3.3 `actionlint` (or `docker run rhysd/actionlint`) passes on both workflows

## 4. Runbook and hand-back

- [ ] 4.1 `docs/deploy-homelab.md` (decision 8) and the link in `README.md`; Prettier on the Markdown files touched
- [ ] 4.2 Checks: typecheck, server tests, `helm lint`, `helm template`, `glab ci lint`, `actionlint`, `openspec validate homelab-deploy --strict`; push; hand back with the results as printed and the `sslmode` answer

## 5. Release (architect)

- [ ] 5.1 `workflow_dispatch` run of the mirror: `main` reaches GitLab, no pipeline starts
- [ ] 5.2 Pull request, CI green, merge; tag `v0.1.0` on `main`; GitHub Release
- [ ] 5.3 Watch the GitLab pipeline; live check: sign in, create a project, edit in two browsers, a sync socket open past ten minutes, `rpg-promptbook-db` Ready with WAL archiving and a completed first backup
- [ ] 5.4 Follow-up issue for the shared client address; archive the change; close #9
