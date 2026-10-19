## ADDED Requirements

### Requirement: Hardened server image

The server image SHALL be built on Project Hummingbird's Node.js images
(`registry.access.redhat.com/hi/nodejs`, the builder variant for the build
stages, the runtime variant for the final stage), SHALL run as a non-root user
and SHALL start and serve with a read-only root filesystem and every Linux
capability dropped, writing only to `/tmp`.

#### Scenario: Read-only start

- **WHEN** the image runs with a read-only root filesystem, a writable `/tmp`
  and no capabilities, against an empty database
- **THEN** it applies the migrations, creates the admin account, answers
  `/api/health` with 200, serves the web client and accepts a sign-in, as a
  user other than root
