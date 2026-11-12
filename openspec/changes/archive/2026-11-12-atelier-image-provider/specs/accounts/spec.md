## ADDED Requirements

### Requirement: Atelier API token per account

With an Atelier address and a secrets key on the server, each account SHALL
save at most one Atelier API token, checked with Atelier first: a rejected or
read-only token, or no answer, stores nothing. A stored token SHALL be
encrypted like the OpenRouter key and shown only by its last four characters.
Removing it SHALL stop the account's running Atelier generations.

#### Scenario: A write token

- **WHEN** the user saves a Generate + read token named "promptbook"
- **THEN** it is stored and Settings shows "Works. Write token «promptbook»,
  expires …" with the month against Atelier's cap

#### Scenario: A read-only token

- **WHEN** the user saves a Read only token
- **THEN** nothing is stored and the server answers "This token is read only.
  Make one with Generate + read in Atelier."

#### Scenario: Atelier does not answer

- **WHEN** Atelier cannot be reached while a token is saved
- **THEN** nothing is stored and the server answers "Atelier did not answer.
  Nothing was saved."

### Requirement: Image provider choice

Each account SHALL choose whether Generate goes through Atelier or OpenRouter,
OpenRouter by default and for accounts that never chose. Removing the Atelier
token while Atelier is chosen SHALL switch the choice to OpenRouter when the
account has a working OpenRouter key.

#### Scenario: Default

- **WHEN** an account that set up OpenRouter before this change opens
  Settings
- **THEN** OpenRouter is chosen

#### Scenario: Token removed

- **WHEN** the user removes the Atelier token while Atelier is chosen and an
  OpenRouter key is saved
- **THEN** OpenRouter becomes the choice and a toast says "Token removed.
  Generate now goes through OpenRouter."
