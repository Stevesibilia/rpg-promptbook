## ADDED Requirements

### Requirement: Hidden problems left out of counts

The connector SHALL leave the problems the user has hidden out of every
error and warning count it reports: `get_outline`'s counts, the counts of
`list_projects` and `get_project`, and the counts before and after an edit
in the results of `replace_section` and `add_scene`. No tool SHALL hide or
restore a problem.

#### Scenario: Outline counts

- **WHEN** Claude calls `get_outline` on a project with one error in S2,
  dismissed
- **THEN** S2 counts no error and the document's error count leaves it out

### Requirement: Hidden problems marked in edit results

The results of `replace_section` and `add_scene` SHALL still list a hidden
problem of the edited text, marked `hidden` with `dismissed` or `snoozed`,
and for a snoozed one `until`, the time its snooze ends. The descriptions of
`get_outline`, `replace_section` and `add_scene` SHALL say that hidden
problems are left out of the counts and listed marked, and that Claude
leaves them alone unless the user asks.

#### Scenario: Hidden problem in an edit result

- **WHEN** the user has dismissed S3's missing «Reazioni» warning and Claude
  replaces S3 keeping it without «Reazioni»
- **THEN** the result lists that warning marked `hidden: "dismissed"`, and
  its warning counts before and after leave it out

#### Scenario: Snoozed problem marked with its end

- **WHEN** a problem of S3 is snoozed until 28 Oct and Claude replaces S3
  keeping it
- **THEN** the result lists it marked `hidden: "snoozed"` with `until` on 28
  Oct
