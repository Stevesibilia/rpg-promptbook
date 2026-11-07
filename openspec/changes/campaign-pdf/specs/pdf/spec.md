## MODIFIED Requirements

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

## ADDED Requirements

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
