## MODIFIED Requirements

### Requirement: Templates for new projects

A new project SHALL start with a copy of its category's to-do template from
the user's settings, and with a skeleton prep document built from a
document template: the one chosen in the new-project dialog, else its
kind's default in the user's settings, at the latest version, else the
built-in (`avventura@1` for adventures and one-shots, `campagna@1` for
campaigns). An adventure's skeleton SHALL hold front matter with the title,
system, format, campaign when set, author, copyright and licence from the
settings; the template's sections; one scene `### S1. Prima scena` with the
template's required and recommended fields that are not climax-only, the
callouts required in a scene, and an empty reactions table; the callouts
required in «Inizio forte» under it; the images and music appendix. A
campaign's skeleton SHALL hold front matter and the template's sections.
The project SHALL record the template's id and version in its metadata, and
every reader of its document SHALL use that template. A project with no
template recorded SHALL read as its category's built-in. A template that is
unknown or of the wrong kind SHALL be refused at creation with
`template_unknown`. Editing a template SHALL NOT change existing projects.

#### Scenario: New adventure in a campaign

- **WHEN** the user creates the adventure «Il ballo dei Lorenzetti» in the
  campaign «Blacksad - Il Continentale» with system «Not The End»
- **THEN** its document starts with front matter holding `titolo`, `sistema`,
  `formato: avventura`, `campagna`, `autore` and `licenza`, its to-do list is
  a copy of the adventure template, its metadata records the template
  `avventura` version 1, and parsing the document with the format package
  reports no error with a code starting `meta.`, `section.` or `scene.id.`

#### Scenario: New adventure from an own template

- **WHEN** the user creates an adventure choosing «Avventura Kulthos» v3
- **THEN** its metadata records that template at version 3, and its
  document's sections are those of v3

#### Scenario: Project made before templates were recorded

- **WHEN** a one-shot created before templates were recorded is opened
- **THEN** its metadata reads the template `avventura` version 1, and its
  problems and PDF are the same as before

#### Scenario: Template edited later

- **WHEN** the adventure to-do template gets a new item
- **THEN** projects created before keep their lists unchanged and the next
  new adventure includes the item
