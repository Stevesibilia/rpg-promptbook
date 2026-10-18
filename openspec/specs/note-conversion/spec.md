# note-conversion Specification

## Purpose

How a note written in the conventions used before RPG Promptbook is converted into the adventure format, with a report of what changed and what still needs a human.

## Requirements

### Requirement: Converting a note to the format

The format package SHALL provide a function that takes the text of a note
written in today's conventions, and optionally its title, and returns the
converted text, the list of edits made, and a report. The conversion SHALL
change only what the rules below name and SHALL leave every other character
as it was.

#### Scenario: Untouched content

- **WHEN** a note is converted
- **THEN** every line outside the header, the converted blockquotes, the
  `Tipo` lines and the HTML comments is identical in the output

### Requirement: Header to front matter

The converter SHALL turn into YAML front matter the `# Title` line and the bold header lines that follow it (`**Sistema:** … ·
**Formato:** …`, `**Ambientazione:**`, `**Tempi:**`, `**Campagna:** … · **Arco:** …`), using the template's keys. A
subtitle in parentheses or after a colon in the title SHALL become
`sottotitolo`. When the note has no `# Title` line, the title passed by the
caller (for example the Joplin note title) SHALL become `titolo`.

#### Scenario: Joplin note without a title line

- **WHEN** a note whose body starts with `**Sistema:** Kulthos` is converted
  with the title `L'Ancora di Sabaoth`
- **THEN** the output starts with front matter holding `titolo: L'Ancora di
Sabaoth` and `sistema: Kulthos`

### Requirement: Quotes become callouts

In each scene, the first plain blockquote SHALL become a `[!leggi]` callout and
each later one a `[!documento]` callout with an empty title, reported for the
owner to add a title. In «Inizio forte», the blockquote SHALL become `[!leggi]`.
Blockquotes that are already callouts SHALL be left as they are.

#### Scenario: Scene with a read-aloud and a letter

- **WHEN** a scene has two plain blockquotes
- **THEN** the first becomes `> [!leggi]`, the second `> [!documento]`, and the
  report asks for the second one's title

### Requirement: Threat line split into keys

The converter SHALL split a sheet line `- **Tipo:** Minaccia <Grado>, <natura> · Ferite: … · Afflizioni: …` into separate `Tipo`, `Grado`, `Natura`, `Ferite` and
`Afflizioni` items. A `branco` mention in the `Tipo` line SHALL become
`Branco: sì`. A `Tipo` line that does not match this shape SHALL be left as it
is and reported.

#### Scenario: Extraordinary threat

- **WHEN** a sheet has `- **Tipo:** Minaccia Straordinaria, non risvegliata`
- **THEN** it becomes `- **Tipo:** Minaccia`, `- **Grado:** Straordinaria` and
  `- **Natura:** non risvegliata`

### Requirement: Template comments removed

HTML comments (`<!-- … -->`) SHALL be removed, since in today's notes they are
template instructions, not content. Each removal SHALL be listed in the edits.

#### Scenario: Comment in a section

- **WHEN** a section holds a template comment
- **THEN** the comment is gone from the output and listed in the edits

### Requirement: Idempotent, with a report

Converting an already converted text SHALL produce no edits. After converting,
the function SHALL parse the result against the template and include every
remaining problem in the report, so the report lists both what was changed and
what still needs a human (unknown fields, sheets nested in sheets, unresolved
references, handouts without a title).

#### Scenario: Second run

- **WHEN** the output of a conversion is converted again
- **THEN** the edit list is empty and the text is unchanged

#### Scenario: Remaining problems

- **WHEN** L'Ancora di Sabaoth is converted
- **THEN** the report includes the unknown field «Se il tempo stringe» in S5
  and the sheet nested inside Salvi's sheet
