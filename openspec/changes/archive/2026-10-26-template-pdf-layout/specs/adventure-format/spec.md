## ADDED Requirements

### Requirement: Section PDF options

A template section SHALL accept optional PDF options: `print`, for any section but the appendix; `newPage` and `sideColumn`, for sections without a role. Absent
options SHALL read as their defaults: printed, a new page for a section
without a role, no side column. A template that sets `newPage` or
`sideColumn` on a section with a role, any option on the appendix, or any
option in a campaign template SHALL be refused with the option's path.

#### Scenario: Defaults

- **WHEN** a template adds «Atmosfera» with no options
- **THEN** it reads as printed, on a new page, without a side column

#### Scenario: Option on a role section

- **WHEN** a template sets `newPage` on «Inizio forte»
- **THEN** the template is refused at `sections.<n>.pdf.newPage`

### Requirement: Side boxes in an own section

The checks SHALL NOT report `callout.place` for a `[!riquadro|laterale]` box in a section without a role whose template sets «Side column».

#### Scenario: Side box where the template asks for one

- **WHEN** «Atmosfera» has «Side column» on and holds a
  `[!riquadro|laterale] Suoni`
- **THEN** the checks report no `callout.place` for it, while the same box
  in «Atmosfera» with «Side column» off is reported
