## ADDED Requirements

### Requirement: Verified TLS to the database

The deployed server and its wait-for-database init container SHALL connect to
the CloudNativePG database with `sslmode=verify-full`, verified against the
CA the operator writes in the Secret `<cluster>-ca`, which the chart SHALL
mount read-only with the key `ca.crt` only. The chart value `cnpg.tls.verify`,
`true` by default, SHALL turn this off when `false`, leaving the operator's
connection string as it is.

#### Scenario: A deploy with the default values

- **WHEN** the chart is rendered with the homelab values
- **THEN** both containers' `DATABASE_URL` end in
  `?sslmode=verify-full&sslrootcert=/etc/promptbook/db-ca/ca.crt`, and the
  `ca.crt` of `rpg-promptbook-db-ca` is mounted at `/etc/promptbook/db-ca`

#### Scenario: A certificate that does not verify

- **WHEN** the database presents a certificate not signed by that CA, or not
  naming the host in the connection string
- **THEN** the server refuses the connection instead of falling back to an
  unverified or plain one

#### Scenario: Turned off

- **WHEN** the chart is rendered with `cnpg.tls.verify=false`
- **THEN** `DATABASE_URL` is the operator's `uri` unchanged and no CA volume
  is mounted
