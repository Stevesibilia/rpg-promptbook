## MODIFIED Requirements

### Requirement: Templates for new projects

A new project SHALL start with a copy of its category's to-do template from
the user's settings, and with a skeleton prep document built from its
category's default document template: adventures and one-shots from
`avventura@1` (front matter with the title, system, format, campaign when
set, author, copyright and licence from the settings; the template's
sections; one scene `### S1. Prima scena` with empty fields; the images and
music appendix), campaigns from `campagna@1` (front matter, then
`## Premessa`, `## Fronti`, `## PNG ricorrenti`, `## Fili aperti`,
`## Sessioni`). The project SHALL record the template's id and version in
its metadata, and every reader of its document SHALL use that template. A
project with no template recorded SHALL read as its category's built-in.
Editing a template SHALL NOT change existing projects.

#### Scenario: New adventure in a campaign

- **WHEN** the user creates the adventure «Il ballo dei Lorenzetti» in the
  campaign «Blacksad - Il Continentale» with system «Not The End»
- **THEN** its document starts with front matter holding `titolo`, `sistema`,
  `formato: avventura`, `campagna`, `autore` and `licenza`, its to-do list is
  a copy of the adventure template, its metadata records the template
  `avventura` version 1, and parsing the document with the format package
  reports no error with a code starting `meta.`, `section.` or `scene.id.`

#### Scenario: Project made before templates were recorded

- **WHEN** a one-shot created before this change is opened
- **THEN** its metadata reads the template `avventura` version 1, and its
  problems and PDF are the same as before

#### Scenario: Template edited later

- **WHEN** the adventure to-do template gets a new item
- **THEN** projects created before keep their lists unchanged and the next
  new adventure includes the item
