## ADDED Requirements

### Requirement: Generate through and the Atelier card

Settings → Image generation SHALL start with a "Generate through" card offering
Atelier and OpenRouter, each with a line saying whether its credentials work; a
choice whose credentials are missing, or Atelier on a server without an Atelier
address, SHALL be disabled. An Atelier card SHALL follow, before the OpenRouter
key card, with the server's Atelier address (read only) and the API token
field, or a line saying the server has no Atelier address.

#### Scenario: Both set up

- **WHEN** the account has a working Atelier token and OpenRouter key and opens
  Settings → Image generation
- **THEN** both choices are enabled, the chosen one is marked, and choosing the
  other shows "Generate now goes through OpenRouter."

#### Scenario: Server without Atelier

- **WHEN** the server has no `ATELIER_URL`
- **THEN** the Atelier choice is disabled with "Not available on this server"
  and the Atelier card says "This Promptbook server has no Atelier address.
  Whoever runs it sets ATELIER_URL."
