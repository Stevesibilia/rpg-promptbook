## ADDED Requirements

### Requirement: Link to a gdrarchive campaign

Any project MAY hold one link to a campaign in gdrarchive: an address and an
optional label. The link SHALL be stored in the project's metadata, so it
syncs like the title, and SHALL be set or removed as a whole. Promptbook
SHALL NOT call gdrarchive.

#### Scenario: Link on every device

- **WHEN** the user links the campaign «Kulthos» in the browser while the
  desktop app is open
- **THEN** the desktop app shows the same link once synced

#### Scenario: Older document read

- **WHEN** a project created before this change is opened
- **THEN** it has no link and nothing else changes

### Requirement: gdrarchive address and label

The address SHALL be `https://gdrarchive.siberio.eu/campaigns/<id>`, the id
made of letters, digits, `_` and `-`, at most 64 characters. A trailing
slash SHALL be dropped, and any other address refused. The label SHALL be
trimmed and at most 40 characters. A value another client wrote that breaks
these rules SHALL read as no link.

#### Scenario: Link saved without its trailing slash

- **WHEN** the user links the campaign «Kulthos» to
  `https://gdrarchive.siberio.eu/campaigns/12/` with the label «Kulthos»
- **THEN** the project holds `https://gdrarchive.siberio.eu/campaigns/12`
  with the label «Kulthos»

#### Scenario: Another address refused

- **WHEN** the user tries to link a project to
  `https://gdrarchive.siberio.eu/sessions/48`
- **THEN** nothing is stored

### Requirement: Inherited gdrarchive link

An adventure or a one-shot with no link of its own, inside a campaign of the
user that is not in the bin, SHALL show its campaign's link, marked as coming
from that campaign. A link of its own SHALL win. A campaign SHALL NOT
inherit, and nothing SHALL inherit from a stand-alone project.

#### Scenario: Adventure inherits

- **WHEN** the campaign «Kulthos» has a link and its adventure «L'Ancora di
  Sabaoth» has none
- **THEN** the adventure shows Kulthos's link, from campaign Kulthos

#### Scenario: Own link wins

- **WHEN** a one-shot in Kulthos is given a link of its own
- **THEN** it shows its own link, not Kulthos's

#### Scenario: Moved out of the campaign

- **WHEN** «L'Ancora di Sabaoth», with no link of its own, is made
  stand-alone
- **THEN** it shows no link

## MODIFIED Requirements

### Requirement: Project summary for the list

The server SHALL keep a summary of each project, updated whenever the
project's document is stored: title, category, status, campaign, system, the
current seed, to-do items done and total, the project's own gdrarchive link,
and the time of the last edit. For adventures and one-shots it SHALL also
hold the number of scenes, the number of words and the counts of errors and
warnings from parsing the document with the format package, leaving out the
problems the user has hidden at the time it is stored. A snoozed problem
SHALL count again from the next store after its snooze ends. The project
list SHALL be built from the summaries without loading the documents.

#### Scenario: Summary follows an edit

- **WHEN** a to-do item is ticked in a project with 5 of 9 items done
- **THEN** the list shows 6/9 for that project once the change is stored

#### Scenario: Hidden problems not counted

- **WHEN** the user dismisses one of a project's 3 warnings
- **THEN** the list shows 2 warnings for that project once the change is
  stored

#### Scenario: Link in the list

- **WHEN** the user links the campaign «Kulthos» to gdrarchive
- **THEN** Kulthos's row in the list carries the link once the change is
  stored, and its adventures show it without opening Kulthos
