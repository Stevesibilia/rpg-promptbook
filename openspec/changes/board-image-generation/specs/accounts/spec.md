## ADDED Requirements

### Requirement: OpenRouter key per account

Each account SHALL hold at most one OpenRouter key, stored encrypted on the
server with the server's secret and never sent to any client or written to
any log. `PUT /api/image-generation/key` SHALL check the key with OpenRouter
before storing it: a key OpenRouter refuses SHALL answer 400 `key_rejected`,
no answer from OpenRouter SHALL answer 502 `openrouter_unreachable`, and in
both cases nothing SHALL be stored. `DELETE /api/image-generation/key` SHALL
remove it. `GET /api/image-generation` SHALL answer whether the server is
configured and, for a saved key, only its last four characters, when it was
last checked and the credit left on it. A stored key that cannot be decrypted
SHALL count as no key, with «The saved key can't be read any more. Save it
again.». Without the server's secret these routes SHALL answer 503
`not_configured`, and the GET SHALL answer `configured: false`.

#### Scenario: Save and check

- **WHEN** the user saves a key that OpenRouter accepts with $9.50 left
- **THEN** the key is stored encrypted, and the GET answers its last four
  characters, the time of the check and 9.5 left, never the key

#### Scenario: Key refused

- **WHEN** the user saves a key OpenRouter answers 401 to
- **THEN** the server answers 400 `key_rejected` and no key is stored

#### Scenario: OpenRouter down

- **WHEN** OpenRouter does not answer while the user saves a key
- **THEN** the server answers 502 `openrouter_unreachable` and keeps the key
  saved before, if any

#### Scenario: Remove

- **WHEN** the user removes the key
- **THEN** the GET answers no key and the next Generate asks for one

#### Scenario: Never in the log

- **WHEN** a key is saved, checked and used for a job
- **THEN** neither any answer nor any line of the server's log holds the key

#### Scenario: Server secret changed

- **WHEN** the server restarts with another `PROMPTBOOK_SECRETS_KEY`
- **THEN** the GET answers no key with «The saved key can't be read any
  more. Save it again.», and Generate asks for a key

#### Scenario: Not configured

- **WHEN** the server runs without `PROMPTBOOK_SECRETS_KEY` and a user saves
  a key
- **THEN** the server answers 503 `not_configured`

#### Scenario: Another account's key

- **WHEN** user B asks `GET /api/image-generation`
- **THEN** the answer is about B's key only, never A's
