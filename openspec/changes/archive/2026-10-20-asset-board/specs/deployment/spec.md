## MODIFIED Requirements

### Requirement: Hardened server image

The server image SHALL be built on Project Hummingbird's Node.js images
(`registry.access.redhat.com/hi/nodejs`, the builder variant for the build
stages, the runtime variant for the final stage), SHALL run as a non-root user
and SHALL start and serve with a read-only root filesystem and every Linux
capability dropped, writing only to `/tmp` and to its data folder `/data`.

#### Scenario: Read-only start

- **WHEN** the image runs with a read-only root filesystem, a writable `/tmp`,
  a writable `/data` and no capabilities, against an empty database
- **THEN** it applies the migrations, creates the admin account, answers
  `/api/health` with 200, serves the web client and accepts a sign-in, as a
  user other than root

#### Scenario: Data folder not writable

- **WHEN** the server starts and its data folder cannot be written
- **THEN** it stops at once with a message naming `PROMPTBOOK_DATA_DIR`

## ADDED Requirements

### Requirement: Files on a persistent volume

The chart SHALL mount a persistent volume claim at `/data` (by default 20 Gi,
ReadWriteOnce, storage class `ur-default`), kept when the chart is
uninstalled, writable by the server's user through `fsGroup` 65532, with one
replica and the `Recreate` strategy. The local compose stack SHALL keep the
app's `/data` on a named volume. Backing up the volume is out of scope and
SHALL be stated as such in `docs/deploy-homelab.md`.

#### Scenario: Files survive a release

- **WHEN** an image is uploaded and the next release is deployed
- **THEN** the image is still served after the new pod starts

#### Scenario: Compose restart

- **WHEN** the local stack is stopped and started again with
  `docker compose up -d`
- **THEN** the files uploaded before are still there

### Requirement: File store settings

The server SHALL read `PROMPTBOOK_DATA_DIR` (the image sets `/data`; a
development server uses `./data`), `PROMPTBOOK_FILES_QUOTA_GB` (a whole
number of at least 1, default 20) and `PROMPTBOOK_FILES_GRACE_DAYS` (a whole
number of at least 1, default 30), and SHALL refuse to start on a malformed
value, naming the variable. The chart SHALL set them from its values.

#### Scenario: Default quota

- **WHEN** the server starts without `PROMPTBOOK_FILES_QUOTA_GB`
- **THEN** each user may store 20 GB of files

#### Scenario: Malformed grace period

- **WHEN** the server starts with `PROMPTBOOK_FILES_GRACE_DAYS=0`
- **THEN** it stops with a message naming `PROMPTBOOK_FILES_GRACE_DAYS`
