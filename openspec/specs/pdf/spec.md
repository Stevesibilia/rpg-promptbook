# pdf Specification

## Purpose

The PDF of an adventure or one-shot, built in the browser with Typst: its preview, review, layout checks, print options, save and print.

## Requirements

### Requirement: PDF of an adventure

The app SHALL build the PDF of an adventure or one-shot from its document,
in the browser, with the Typst template ported from `impagina-avventura`:
cover and opening, the night, strong start and scene map, rules, one scene
per page start with edge tabs, and the references (clues, NPCs, sheets with
threat boxes, pregenerated). References to a sheet SHALL print the sheet's
page number. The seed, the inspiration items and the research notes SHALL
NOT be printed. Two builds of the same text with the same options SHALL
give the same bytes.

#### Scenario: Sabaoth

- **WHEN** the PDF of «L'Ancora di Sabaoth» is built with the default
  options
- **THEN** it has no build error, and each of its scenes starts on a new
  page with its tab marked

#### Scenario: Reference to a sheet

- **WHEN** a scene says `→ Schede: Tenente Donato`
- **THEN** the PDF prints «Tenente Donato, p. N» with the page of that sheet

### Requirement: Footer and cover

Every page footer SHALL show the title and the current section, then the
author, the copyright and the short licence when the front matter sets
them, then the page number. The cover SHALL show the author, the copyright
and the licence in full, with the licence's link for an SPDX id. A `CC-`
SPDX id SHALL print in its short form («CC BY-NC-SA 4.0»); free text SHALL
print as written; a missing key SHALL leave its part out.

#### Scenario: Creative Commons licence

- **WHEN** the front matter has `autore: Stefano Sibilia` and
  `licenza: CC-BY-NC-SA-4.0`
- **THEN** every footer shows «Stefano Sibilia · CC BY-NC-SA 4.0», and the
  cover links `https://spdx.org/licenses/CC-BY-NC-SA-4.0.html`

### Requirement: PDF preview pane

The project page of an adventure or one-shot SHALL have a **PDF** button in
the top bar that opens a pane in place of the inspector, showing the page
under the cursor and rebuilt while the user types. Its header SHALL read
«PDF preview · page N of M · follows the cursor», with «Review» and close.
A build error SHALL show «The PDF could not be built.» with the error's
message. Campaigns SHALL NOT show the button.

#### Scenario: Follows the cursor

- **WHEN** the pane is open and the user moves the cursor from S1 to S4
- **THEN** the pane shows the page where that text of S4 is printed

### Requirement: PDF review

⌘⇧P, the pane's «Review» and the palette SHALL open the whole PDF full
screen: page thumbnails labelled with their section, single page, spread or
fit width, zoom, layout checks, options, «Save PDF» and «Print…». Esc and
«← Editor» SHALL close it. Double-clicking a page in the review or the pane
SHALL put the cursor in the editor on the text printed there.

#### Scenario: Jump to the text

- **WHEN** the user double-clicks the read-aloud on S2's page in the review
- **THEN** the review closes and the cursor is in S2's read-aloud in the
  editor

#### Scenario: Save

- **WHEN** the user clicks «Save PDF»
- **THEN** the browser downloads a PDF named after the project's title,
  built with the current options

#### Scenario: Print

- **WHEN** the user clicks «Print…»
- **THEN** the PDF opens in a new tab, ready to print from the browser

### Requirement: Layout checks

The review SHALL list as warnings a scene whose end leaves more than half
of its last page empty before the next scene's page, and a scene running to
three pages or more, each with its scene and pages; clicking one SHALL show
its page, and its thumbnail SHALL carry a mark. These checks SHALL NOT join
the editor's problems.

#### Scenario: Short scene

- **WHEN** S2 ends in the top half of page 7 and S3 starts on page 8
- **THEN** the review lists «Half of page 7 is empty: S2 ends early»

### Requirement: Print options

The review SHALL offer paper (A4 or Letter), ink saver (tints removed),
pregenerated sheets (on or off) and the template (one today), kept per
project on the device. Changing one SHALL rebuild the preview, and Save and
Print SHALL use them.

#### Scenario: Letter paper

- **WHEN** the user picks Letter
- **THEN** the pages in the review and the saved PDF are US Letter

### Requirement: PDF engine loading

The PDF engine SHALL load only when a PDF is first opened on a page, with
«Loading the PDF engine…» shown until it is ready. The server SHALL allow
WebAssembly in its content security policy, serve compressed copies of the
web build's files to clients that accept them, and let browsers cache
hashed assets for a year.

#### Scenario: Editor without PDF

- **WHEN** the user opens a project and never opens the PDF
- **THEN** the browser does not download the PDF engine

### Requirement: Every read-aloud prints

The PDF SHALL print every read-aloud callout of a scene in the scene's
read-aloud place, in the order written, and every read-aloud of «Inizio
forte» in that section, in order. Double-clicking any of them in the review
SHALL jump to that callout in the editor.

#### Scenario: Two read-alouds in a scene

- **WHEN** S2 has two `[!leggi]` callouts
- **THEN** S2's page shows both read-aloud boxes, one after the other, in
  the read-aloud place

#### Scenario: Two read-alouds in «Inizio forte»

- **WHEN** «Inizio forte» has two `[!leggi]` callouts
- **THEN** the PDF shows both, in order, styled as read-alouds

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
