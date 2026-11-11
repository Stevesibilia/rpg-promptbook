## ADDED Requirements

### Requirement: Image generation settings

The server SHALL read `PROMPTBOOK_SECRETS_KEY`, optional, the base64 of
exactly 32 bytes that encrypts stored keys; absent or blank, image
generation SHALL be off; any other value SHALL stop the start with a message
naming the variable. It SHALL read `OPENROUTER_BASE_URL`, an `http` or
`https` URL, by default `https://openrouter.ai/api/v1`. The chart SHALL take
the value `app.secretsKey.secret`, the name of a Secret written outside the
chart holding the key `secrets-key`, and SHALL pass it to the server only
when the value is set. The local compose stack SHALL pass both variables
from its environment.

#### Scenario: Turned off by default

- **WHEN** the chart is rendered with the default values
- **THEN** the server gets no `PROMPTBOOK_SECRETS_KEY` and image generation
  is not configured

#### Scenario: Turned on in the chart

- **WHEN** the chart is rendered with `app.secretsKey.secret` set to
  `rpg-promptbook-secrets`
- **THEN** `PROMPTBOOK_SECRETS_KEY` comes from that Secret's key
  `secrets-key`

#### Scenario: Malformed secret

- **WHEN** the server starts with a `PROMPTBOOK_SECRETS_KEY` of 16 bytes
- **THEN** it stops with a message naming `PROMPTBOOK_SECRETS_KEY`

#### Scenario: Tests point elsewhere

- **WHEN** the server starts with `OPENROUTER_BASE_URL` set to a local fake
- **THEN** every OpenRouter call goes to the fake
