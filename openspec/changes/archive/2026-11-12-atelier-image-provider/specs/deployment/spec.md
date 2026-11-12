## ADDED Requirements

### Requirement: Atelier address

The server SHALL read the optional `ATELIER_URL`, an `http` or `https`
address, and SHALL refuse to start when it is set to anything else. The chart
SHALL set it from `app.atelier.url` when that value is not empty, and the
homelab values SHALL set `https://atelier.siberio.eu`.

#### Scenario: Not set

- **WHEN** the server starts without `ATELIER_URL`
- **THEN** it starts, and generating through Atelier is unavailable

#### Scenario: Bad value

- **WHEN** `ATELIER_URL` is `atelier.siberio.eu` without a scheme
- **THEN** the server refuses to start and names the variable
