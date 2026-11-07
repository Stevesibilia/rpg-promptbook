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

The project page of every project SHALL have a **PDF** button in the top bar
that opens a pane in place of the inspector, showing the page under the
cursor and rebuilt while the user types. Its header SHALL read «PDF preview
· page N of M · follows the cursor», with «Review» and close. A build error
SHALL show «The PDF could not be built.» with the error's message. In a
campaign, while the cursor is in a section that does not print, the header
SHALL read «PDF preview · the appendix is not printed» for the appendix and
«PDF preview · «X» is not printed» for a section left out, and the page
shown SHALL be dimmed.

#### Scenario: Follows the cursor

- **WHEN** the pane is open and the user moves the cursor from S1 to S4
- **THEN** the pane shows the page where that text of S4 is printed

#### Scenario: Campaign pane

- **WHEN** the user opens a campaign and presses **PDF**
- **THEN** the pane shows the campaign's PDF, following the cursor

#### Scenario: Cursor in the appendix

- **WHEN** the cursor is under «## Appendice: stile visivo e sonoro» in a
  campaign on «Campagna» v2
- **THEN** the header reads «PDF preview · the appendix is not printed» and
  the page is dimmed

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
three pages or more, each with its scene and pages; for a campaign, the
sections that start a page after the twelfth tab, with the page of the
first one. Clicking one SHALL show its page, and its thumbnail SHALL carry
a mark. These checks SHALL NOT join the editor's problems.

#### Scenario: Short scene

- **WHEN** S2 ends in the top half of page 7 and S3 starts on page 8
- **THEN** the review lists «Half of page 7 is empty: S2 ends early»

#### Scenario: Too many tabs

- **WHEN** a campaign's template starts fourteen sections on a new page
- **THEN** the thirteenth and fourteenth print without a tab, and the review
  lists one check on the thirteenth's page

### Requirement: Print options

The review SHALL offer paper (A4 or Letter), ink saver (tints removed),
pregenerated sheets (on or off, adventures and one-shots only) and the
template (the project's, by name and version, not changeable), kept per
project on the device. Changing one SHALL rebuild the preview, and Save and
Print SHALL use them.

#### Scenario: Letter paper

- **WHEN** the user picks Letter
- **THEN** the pages in the review and the saved PDF are US Letter

#### Scenario: Campaign options

- **WHEN** the user opens the review of a campaign on the built-in «Campagna»
  v2
- **THEN** the options are Paper, Ink saver and Template «Campagna v2», with
  no «Pregenerated sheets»

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

### Requirement: PDF of a campaign

The app SHALL build the PDF of a campaign from its document, in the browser,
with the Typst template «campagna». It SHALL print every `##` section in
document order, whether or not the template lists it, except the appendix
and the sections the template leaves out; linked adventures SHALL NOT be
printed. A section the template lists SHALL print under the template's
heading. The front matter's `sistema` and `formato` SHALL print on the line
above the title when set; the title SHALL come from the title key, else the
project's title; `autore`, `copyright` and `licenza` SHALL print on the
credits line and in the footer as the adventure prints them. Two builds of
the same text with the same options SHALL give the same bytes. «Save PDF»
SHALL name the file after the project's title.

#### Scenario: Sections in document order

- **WHEN** a campaign on «Campagna» v2 has «## Premessa», «## Appunti del
  master», «## Fronti» and «## Appendice: stile visivo e sonoro», in that
  order
- **THEN** the PDF prints Premessa, then «Appunti del master» flowing after
  it, then Fronti on a new page, and not the appendix

#### Scenario: Save a campaign

- **WHEN** the user clicks «Save PDF» in the review of «Prima che arrivi la
  legge»
- **THEN** the browser downloads `prima-che-arrivi-la-legge.pdf`

#### Scenario: Desktop offline

- **WHEN** the desktop app is offline and the user opens a campaign's PDF
- **THEN** the PDF builds as it does online

### Requirement: Campaign pages

Page 1 of a campaign's PDF SHALL print the line above the title, the title,
the credits line, then a box «In questa campagna» listing every printed
section in three columns with its page number, a ▸ before each section that
starts a page. Sections SHALL flow under the adventure's section heading; a
section whose template sets «New page» SHALL start a page. A `### X. Name`
subheading whose X is one to three capital letters and a number SHALL print
the ID large in the accent colour beside the name, as a scene's header, and
stay with the block after it; other subheadings SHALL print as small
headings. A paragraph whose only formatted text is bold SHALL print it as a
label; task lists SHALL print drawn checkboxes; tables SHALL print as the
adventure's, smaller from six columns; quotes and callouts SHALL print in
the tinted quote box. Paper and ink saver SHALL apply as for adventures.

#### Scenario: Contents

- **WHEN** a campaign on «Campagna» v2 fills its twelve printed sections
- **THEN** page 1 lists the twelve with their pages, with ▸ before Fronti,
  PNG ricorrenti, Archi and Fili aperti

#### Scenario: Front with an ID

- **WHEN** «## Fronti» holds `### F1. La Compagnia` with `**Obiettivo:** …`
  and a task list
- **THEN** the PDF prints «F1» large beside «La Compagnia», «OBIETTIVO:» as a
  label, and a checkbox before each task

### Requirement: Campaign tabs and footer

A campaign's pages SHALL carry an edge tab for each section that starts a
page, up to twelve, labelled with the first word of its title, with the
current section's tab filled and none filled before the first. The footer
SHALL show the title and the section the page opens in, then the author,
the copyright and the short licence when set, then the page number. The
review's thumbnails SHALL be labelled with the section in progress.

#### Scenario: Tabs

- **WHEN** a campaign on «Campagna» v2 is printed
- **THEN** every page shows the tabs «Fronti», «PNG», «Archi» and «Fili», and
  page 1 has none filled

#### Scenario: A page that opens inside a section

- **WHEN** «Fronti» runs onto page 3 and «Fazioni» starts lower on it
- **THEN** page 3's footer reads «<title> · Fronti» and its «Fronti» tab is
  filled
