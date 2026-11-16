## ADDED Requirements

### Requirement: Column marks in a new project's document

An adventure's or a one-shot's skeleton SHALL write the column its template sets, as a mark, after the heading of each section with the role `reminders`, `clock` or `truths` after the label of each block field of the first scene with the role `mustHave`, `happens`, `cast` or `clues`, and after the revelations label, which it writes under the overview's heading, also when the column is the default. A campaign's skeleton SHALL hold no
mark. The skeleton SHALL parse with its template without any problem whose
code starts with `column.`.

#### Scenario: New adventure from the built-in

- **WHEN** the user creates an adventure from «Avventura» version 1
- **THEN** its document has `## Da non perdere stasera {laterale}`,
  `## Orologio {principale}`, `## Verità del mondo {principale}`,
  `**Rivelazioni** {laterale}` under «A colpo d'occhio»,
  `**Da non perdere qui** {laterale}`, `**Cosa succede da sé** {principale}`
  and `**Indizi qui** {principale}`

#### Scenario: New adventure from a template that moves a part

- **WHEN** the user creates an adventure from a template that sets
  «Orologio» to the side column
- **THEN** its document has `## Orologio {laterale}`

#### Scenario: New campaign

- **WHEN** the user creates a campaign
- **THEN** its document has no `{`
