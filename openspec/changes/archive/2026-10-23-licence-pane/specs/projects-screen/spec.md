## ADDED Requirements

### Requirement: Choosing the default licence

In Settings → Author and licence, the Licence field SHALL have a «Choose…»
button beside it, as
[docs/mockups/licence.html](../../../docs/mockups/licence.html) shows it,
that opens the licence pane as the editor capability defines it. Picking
SHALL put the value in the field and save it as leaving the field does. The
field SHALL still take free text. In the desktop app offline, the button
SHALL be disabled with the field.

#### Scenario: Default licence picked

- **WHEN** the user presses «Choose…», picks CC BY 4.0 and reloads the page
- **THEN** the Licence field reads `CC-BY-4.0`

#### Scenario: Free text still typed

- **WHEN** the user types «Uso personale» in the Licence field and leaves
  it
- **THEN** it is saved as before this change
