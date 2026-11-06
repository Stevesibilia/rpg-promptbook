## ADDED Requirements

### Requirement: Threat boxes by sheet kind

The PDF SHALL print each sheet with a kind cited under a scene's `Chi c'è`,
with no required field missing, in that scene as a threat box drawn from its
kind: the sheet's name; a subtitle of the kind's name and its subtitle
fields; its quote fields; then its row fields in the kind's order, each
drawn by its block (boxes in groups, marked boxes filled, numbered boxes,
clocks, stat rows, lists, rows with tokens, write-in lines); and «scheda
completa, p. N» when the sheets print. A field that cannot be read SHALL
print as written. A boxes or clock field shown only in the full sheet SHALL
draw its marks in the full sheet under «Schede».

#### Scenario: Kulthos unchanged

- **WHEN** the PDF of «L'Ancora di Sabaoth» is built with each of the four
  option sets of the layout tests
- **THEN** its text equals the text built before this change, and its
  threat boxes differ only in the tighter leading of wrapped talents

#### Scenario: An Outgunned boss

- **WHEN** a scene's `Chi c'è` cites the Boss «Don Varga» with
  `Grinta: 10 (8, 10)`, `Difesa: Critico` and two talents
- **THEN** its threat box shows «Boss», ten Grinta boxes with the 8th and
  10th filled, the Difesa row and both talents

#### Scenario: Every built-in kind prints

- **WHEN** an adventure for each built-in system cites one sheet of each of
  its sheet kinds
- **THEN** each PDF builds without error, with one threat box per sheet
