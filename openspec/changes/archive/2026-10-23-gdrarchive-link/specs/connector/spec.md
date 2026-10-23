## ADDED Requirements

### Requirement: gdrarchive link in get_project

`get_project` SHALL return the project's gdrarchive link as `gdrarchive`,
with its address, its label and `inherited`, true when it comes from the
project's campaign, or null when there is none. No tool SHALL write the
link, and `list_projects` SHALL NOT return it.

#### Scenario: Inherited link returned

- **WHEN** Claude calls `get_project` on «L'Ancora di Sabaoth», in Kulthos,
  with no link of its own
- **THEN** the result's `gdrarchive` holds Kulthos's address and label with
  `inherited: true`

#### Scenario: No link

- **WHEN** Claude calls `get_project` on a stand-alone project with no link
- **THEN** the result's `gdrarchive` is null
