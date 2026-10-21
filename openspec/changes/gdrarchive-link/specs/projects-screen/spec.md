## ADDED Requirements

### Requirement: gdrarchive link in the project panel

The project panel SHALL show the project's gdrarchive link in its header,
under the campaign row, or under the status row for a campaign, as
[docs/mockups/gdrarchive-link.html](../../../docs/mockups/gdrarchive-link.html)
shows it. The link SHALL read «gdrarchive · <label>», or «gdrarchive
campaign» with no label, and open the address in a new tab. An inherited
link SHALL be marked «from campaign <title>».

#### Scenario: Campaign link opens gdrarchive

- **WHEN** the user selects the campaign «Kulthos», linked with the label
  «Kulthos», and clicks «gdrarchive · Kulthos»
- **THEN** its gdrarchive campaign page opens in a new tab, or in the system
  browser in the desktop app

#### Scenario: Inherited link in the panel

- **WHEN** the user selects the adventure «L'Ancora di Sabaoth» in Kulthos,
  with no link of its own
- **THEN** the panel shows «gdrarchive · Kulthos», «from campaign Kulthos»
  and «Set its own…»

#### Scenario: No link

- **WHEN** the user selects a stand-alone one-shot with no link
- **THEN** the panel is as before this change, plus a faint «Link to
  gdrarchive…»

### Requirement: Editing the gdrarchive link

An own link SHALL be followed by «Change…», an inherited one by «Set its
own…», and a project with no link SHALL show only a faint «Link to
gdrarchive…». Each SHALL open an inline form with Address, an optional
Label, a preview of the link, Save and Cancel, and «Remove link» only when
the project has a link of its own. Enter SHALL save and Escape SHALL cancel.
Removing an own link SHALL bring back the campaign's link, if any.

#### Scenario: Own link over the inherited one

- **WHEN** the user opens «Set its own…» on «L'Ancora di Sabaoth», pastes
  another campaign's address and saves
- **THEN** the panel shows that link with «Change…» and without «from
  campaign»

#### Scenario: Remove brings back the campaign's link

- **WHEN** the user opens «Change…» on that adventure and clicks «Remove
  link»
- **THEN** the panel shows Kulthos's link again, from campaign Kulthos

### Requirement: gdrarchive address checked on Save

The form SHALL refuse a wrong address on Save with «Paste a gdrarchive
campaign address, like https://gdrarchive.siberio.eu/campaigns/12», and
store nothing. Saving with the address empty SHALL keep the inherited link,
or close the form when the project has no link at all.

#### Scenario: Wrong address

- **WHEN** the user pastes `https://gdrarchive.siberio.eu/sessions/48` and
  presses Enter
- **THEN** the form stays open with the message, and nothing is stored

#### Scenario: Empty address keeps the inherited link

- **WHEN** the user opens «Set its own…» on «L'Ancora di Sabaoth» and saves
  with the address empty
- **THEN** the form closes and the adventure still shows Kulthos's link
