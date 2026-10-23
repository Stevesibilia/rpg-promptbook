## ADDED Requirements

### Requirement: Rules page

«Regole della notte» SHALL start on a new page and print like a scene page:
its text in the main column and its `[!riquadro|laterale]` boxes, in the
order written, in the side column. When the section holds no side box, its
text SHALL run the full width of the page.

#### Scenario: Rules with a side box

- **WHEN** «Regole della notte» holds three paragraphs and a
  `[!riquadro|laterale] Promemoria`
- **THEN** the paragraphs print in the main column and «Promemoria» in the
  side column beside them

#### Scenario: Rules without a side box

- **WHEN** «Regole della notte» holds only paragraphs
- **THEN** they print full width, with no empty column
