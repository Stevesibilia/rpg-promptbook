## MODIFIED Requirements

### Requirement: Column marks on a template update

The update dialog SHALL offer, ticked by default, to write the column marks where the text has none, when at least one part of the document that takes a column has no mark. With the option, updating SHALL write the new version's
column as a mark on each such part, in the same undo step as the update.
With or without the option, updating SHALL NOT change a mark already in the
text. The dialog's change list SHALL include the column changes between the
two versions.

#### Scenario: Marks written

- **WHEN** a project on v2 whose text has `## Orologio` and
  `## Verità del mondo {laterale}` is updated to v3 without touching the
  options
- **THEN** the text reads `## Orologio {principale}`, the heading
  `## Verità del mondo {laterale}` is unchanged, and one undo restores the
  text and v2

#### Scenario: Option unticked

- **WHEN** v3 moved «Orologio» to the side column and the user unticks the
  option before updating
- **THEN** the text is unchanged and the PDF prints «Orologio» in the side
  column
