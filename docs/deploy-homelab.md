# Deploying to the homelab

Promptbook runs at `https://promptbook.siberio.eu` on the homelab cluster. A
`v*` tag on `main` builds the image, installs the Helm chart and checks that the
live site reports the new version. This page covers the setup, a release,
single sign-on and the way in when Authentik is down, a rollback, a restore
and the yearly token renewal.

## What runs where

- **GitHub** (`Stevesibilia/rpg-promptbook`) holds the code, the reviews and
  the tests. The workflow `mirror.yml` pushes `main` and each `v*` tag to GitLab.
- **GitLab** (`utilities/rpg-promptbook` on `gitlab.siberio.eu`) holds the
  image registry and the deploy pipeline. GitLab Community Edition cannot pull
  from GitHub, which is why GitHub pushes.
- **The cluster** runs one server pod (API, web client and the `/sync`
  websocket), a Service and an Ingress in the namespace `rpg-promptbook`, and
  a CloudNativePG cluster `rpg-promptbook-db` with WAL archiving and a daily
  backup to the bucket `cnpg-rpg-promptbook` on Silo, kept 30 days.
- **Authentik** (`auth.siberio.eu`) signs people in. Its application
  `rpg-promptbook` lets in the members of the group `Promptbook` only. Both,
  and the Secret `rpg-promptbook-oidc` holding the client, come from the
  `homelab/kubernetes_cluster` repository.

The chart is `charts/rpg-promptbook`; `values-homelab.yaml` holds the homelab
settings. The pipeline is `.gitlab-ci.yml`, and only a tag `vX.Y.Z` starts it.

The server image is built on [Project Hummingbird](https://hummingbird-project.io/)
images from `registry.access.redhat.com/hi`: `hi/nodejs:26-builder` for the
build stages and `hi/nodejs:26` for the runtime, and `hi/postgresql:18` for the
pod's `wait-for-database` init container. Every build pulls them from Red Hat's
registry, which needs no sign-in, and the pod runs as user 65532.

## One-time setup

Done once, before the first tag.

1. **Cluster side.** Merge and apply the change to `homelab/kubernetes_cluster`
   that creates the namespace `rpg-promptbook`, the bucket `cnpg-rpg-promptbook`
   with the Secret `cnpg-backup-s3`, and the DNS record `promptbook.siberio.eu`.
   Then, one after the other, the change that adds the Authentik group
   `Promptbook` (join it in the Authentik UI), and the change that adds the
   Authentik application and writes the Secret `rpg-promptbook-oidc`, with the
   keys `client-id` and `client-secret`, into the namespace. The application
   looks the group up when it is planned, so the group must be applied first.
   The pipeline refuses to run without the namespace or the Secret.
2. **GitLab project.** Create `utilities/rpg-promptbook` (private) and protect
   the tag pattern `v*` under Settings, Repository, Protected tags.
3. **Deploy token.** In the project, create a deploy token with the scope
   `read_registry`. The cluster uses it to pull the image.
4. **CI/CD variables.** Add these as masked and protected variables:
   - `PB_REGISTRY_USER` and `PB_REGISTRY_PASSWORD`: the deploy token.

   Since `v0.2.0` the pipeline no longer reads `PB_ADMIN_USERNAME` and
   `PB_ADMIN_PASSWORD`, nor writes the Secret `rpg-promptbook-credentials`:
   accounts come from Authentik. Both variables and that Secret can be deleted.

5. **Mirror token.** Create a project access token (role Maintainer, scope
   `write_repository`, one year) and store it as the GitHub secret
   `GITLAB_MIRROR_TOKEN`.
6. **Test the route.** Run the workflow Mirror by hand (Actions, Mirror, Run
   workflow). It pushes `main` only, so `main` reaches GitLab and no pipeline
   starts.

The utilities group already provides the GitLab agent variables
`DEVELOP_GITLAB_AGENT_PROJECT` and `DEVELOP_GITLAB_AGENT_ID`.

## Cutting a release

Releases use semantic versions, starting at `v0.1.0`. Tag the head of `main`
after a merge that changes what is deployed:

```sh
git switch main && git pull
git tag v0.1.0
git push origin v0.1.0
```

The tag also starts the Desktop workflow (`.github/workflows/desktop.yml`):
it builds the desktop installers for Mac, Windows and Linux at the tag's
version and creates the GitHub Release with generated notes, the installers
and the update manifests, so the release is not made by hand. A tag on a
commit that `main` does not contain makes both the mirror and the desktop
workflows fail: nothing reaches GitLab and no installer is built.

The GitLab pipeline for the tag runs four stages:

- **build** pushes `registry.siberio.eu/utilities/rpg-promptbook:vX.Y.Z`.
- **secrets** creates the pull secret `rpg-promptbook-registry` from the
  CI/CD variables and checks that the Secret `rpg-promptbook-oidc` exists.
- **deploy** runs `helm upgrade --install` with `values-homelab.yaml`.
- **verify** retries for two minutes until `/api/health` reports
  `"ok": true` and `"version": "vX.Y.Z"`, then checks that the database
  cluster is Ready and the scheduled backup exists.

Watch it from the terminal:

```sh
GITLAB_HOST=gitlab.siberio.eu glab ci status --live -R utilities/rpg-promptbook
```

The server runs as one replica, and a release replaces the pod. Open sync
connections drop once and the clients reconnect. Migrations run as the new
pod starts.

## Single sign-on

`values-homelab.yaml` turns single sign-on on (`app.oidc`): the sign-in page
offers only "Sign in with Authentik", and the server refuses passwords. The
first sign-in of a member of the group `Promptbook` creates their account,
keyed by Authentik's issuer and subject; the username is their Authentik
username, with `-2`, `-3`… added if another account already has it. Someone
outside the group never gets back to Promptbook: Authentik tells them they
have no access. There is no linking to an existing account.

The Authentik provider's subject mode must stay `hashed_user_id`, the
module's default. Accounts are keyed by the subject, so changing it would
make every sign-in create a new, empty account.

A new client secret, after the Terraform writes it, needs a restart of the
pod, which reads it at start:

```sh
kubectl -n rpg-promptbook rollout restart deploy/rpg-promptbook
```

### When Authentik is down

Turn single sign-on off, give your own account a password, and sign in with
it. Your projects are on that account, so they are all there.

1. From a checkout of the tag that is deployed, upgrade the release with
   single sign-on off:

   ```sh
   git switch --detach vX.Y.Z
   helm -n rpg-promptbook upgrade rpg-promptbook charts/rpg-promptbook \
     -f charts/rpg-promptbook/values-homelab.yaml \
     --set image.tag=vX.Y.Z --set app.oidc.enabled=false
   ```

   Or deploy values with `app.oidc.enabled: false` through the pipeline. The
   sign-in page now shows the password form.

2. Give your account a password. `user:create` would make a new, empty
   account; `user:password` sets one on the account you already have. It
   asks for the password, at least 12 characters:

   ```sh
   kubectl -n rpg-promptbook exec -it deploy/rpg-promptbook -- \
     node dist/cli.js user:password <your username>
   ```

3. Sign in at `https://promptbook.siberio.eu` with that username and password.

When Authentik is back, re-run the `helm-deploy` job of the deployed tag's
pipeline: `values-homelab.yaml` turns single sign-on on again, and sign-in
goes through Authentik. The password stays on the account but is refused
while single sign-on is on.

### Deleting an account

`user:delete` removes an account with its sessions, settings and projects,
the bin included, and prints how many projects went with it:

```sh
kubectl -n rpg-promptbook exec deploy/rpg-promptbook -- node dist/cli.js user:delete <username>
```

A sync connection still open for that account ends at its next reconnect.

## Rolling back

Re-run the `helm-deploy` job in the pipeline of an older tag. The chart and
the image tag both come from that pipeline, so the old release comes back whole.
The `verify` job of that pipeline then checks the old version.

Migrations only move forward. If the release you leave behind added a
migration, the older image may not start against the newer schema. In that
case restore the database to a time before the release (below) and roll back
together.

## Changing credentials

A change to `PB_REGISTRY_*` takes effect when the `secrets` job runs again, so
re-run the pipeline of the current tag. The single sign-on client is the
cluster's (see Single sign-on).

## Restoring the database

The cluster `rpg-promptbook-db` archives its WAL continuously and takes a base
backup every day at 02:15 UTC. Together they allow a restore to any moment in
the last 30 days. Uninstalling the chart does not delete the cluster or its
backup configuration.

- **Look at the data as it was, without touching the live database:** follow
  "Point in time, into a temporary cluster" in
  [gdrarchive's runbook](https://gitlab.siberio.eu/utilities/gdrarchive/-/blob/main/docs/deploy-homelab.md),
  with `rpg-promptbook` in place of `gdrarchive`.
- **Rebuild a lost or damaged database:** follow "Point in time, in place" in
  the same runbook, with `rpg-promptbook` for `gdrarchive` and
  `deploy/rpg-promptbook` for the backend. The chart's values for it are
  `cnpg.restore.serverName` (`rpg-promptbook-db`), `cnpg.restore.archiveServerName`
  (a new folder name) and optionally `cnpg.restore.targetTime`. Clear them
  on the next release. `docs/postgres-restore.md` in the `kubernetes_cluster`
  repository explains the bucket layout.

Every restore creates or replaces a database, so ask before running one.

## Renewing tokens

Renew these every year, before they expire:

- **`GITLAB_MIRROR_TOKEN`.** Create a new project access token (Maintainer,
  `write_repository`) and replace the GitHub secret. Until then the mirror
  workflow fails on a tag.
- **The deploy token.** Create a new one with `read_registry`, update
  `PB_REGISTRY_USER` and `PB_REGISTRY_PASSWORD`, and re-run the `secrets` job.
  Until then a restarted pod cannot pull its image.

## Known limits

- **Shared client address.** The Traefik service uses
  `externalTrafficPolicy: Cluster`, so the server sees a node address for every
  outside client. The sign-in throttle keys on that address: 30 failed
  sign-ins from anyone lock sign-in for 15 minutes for everyone. Open sessions
  are not affected. Fixing it is a cluster-wide Traefik change and has its own
  issue.
- **One replica.** The server keeps each open document in memory, so it cannot
  run twice. A pod restart or a release interrupts open editing sessions for
  a few seconds.
