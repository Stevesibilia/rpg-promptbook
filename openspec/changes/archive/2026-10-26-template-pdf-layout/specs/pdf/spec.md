## ADDED Requirements

### Requirement: Own sections print

A section the template defines without a role SHALL print in the PDF
unless its template leaves it out. It SHALL print at the end of the part
that holds the nearest role section before it in the document (the cover
when there is none), in document order, under the template's heading for
it. By default it SHALL start a new page. With «Side column» on, its
`[!riquadro|laterale]` boxes SHALL print in the side column beside its
text; without a side box, its text SHALL run the full width. A section the
template does not know SHALL NOT print.

#### Scenario: An own section after the strong start

- **WHEN** a template adds «Atmosfera», and a project's document has
  «## Atmosfera» with a paragraph after «## Inizio forte»
- **THEN** the PDF prints «Atmosfera» and its paragraph on a new page right
  after the start page, before «Regole della notte» and the scenes

#### Scenario: No new page

- **WHEN** «Atmosfera» has «New page» off
- **THEN** it prints on the start page, under «Mappa delle scene», when it
  fits

#### Scenario: Side column

- **WHEN** «Atmosfera» has «Side column» on and holds two paragraphs and a
  `[!riquadro|laterale] Suoni`
- **THEN** the paragraphs print in the main column and «Suoni» in the side
  column beside them

#### Scenario: Unknown heading

- **WHEN** a document has «## Appunti», which its template does not name
- **THEN** the PDF does not print it, and the checks report
  `section.unknown` as before

### Requirement: Sections left out

A section its template marks «Left out» SHALL NOT print, with what belongs
to it: «A colpo d'occhio» takes its revelations and side boxes, «Scene»
every scene page, «Schede» the sheets and «Pregenerati». References to a
sheet that does not print SHALL print as text without a page number. A part
with nothing left to print SHALL NOT print its heading or its page. The
appendix SHALL never print.

#### Scenario: Leave out «Prima della sessione»

- **WHEN** the template leaves out «Prima della sessione»
- **THEN** the PDF has no «Prima della sessione» page and no build error

#### Scenario: Leave out the sheets

- **WHEN** the template leaves out «Schede» and a scene says
  `→ Schede: Tenente Donato`
- **THEN** the PDF prints no sheet, the scene prints «Tenente Donato»
  without a page number, and the build has no error

#### Scenario: Built-in unchanged

- **WHEN** the PDF of «L'Ancora di Sabaoth» is built with the built-in
  template and the default options
- **THEN** its bytes are the same as before this change
