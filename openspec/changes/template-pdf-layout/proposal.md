## Why

Issue
[Stevesibilia/rpg-promptbook#34](https://github.com/Stevesibilia/rpg-promptbook/issues/34),
plan p17, change 3 of 4. Change 2 (`template-editor`, v0.13.0) lets the
owner add sections to a template, but the PDF drops every section without a
role: «Atmosfera» added in the editor never prints. The agreed mockup
[docs/mockups/templates.html](../../../docs/mockups/templates.html) has an
«In the PDF» column on the Sections tab that change 2 left out.

## What Changes

- **Own sections print.** A template section without a role prints in
  document order: after the part that holds the role section before it in
  the document. By default it starts a new page, with its heading as the
  template writes it.
- **PDF options per section.** Sections get an optional `pdf` object in the
  template: `print` (all sections but the appendix), `newPage` and
  `sideColumn` (own sections only). A role section left out drops its part
  of the PDF; an own section with «Side column» prints its
  `[!riquadro|laterale]` boxes beside its text, as «Regole della notte»
  does.
- **The editor's «In the PDF» column**, as the mockup shows: a fixed tag
  with the role's place and a «Printed / Left out» toggle for role sections
  (none for the appendix); «Printed / Left out», «New page» and «Side
  column» for own sections; nothing for campaigns. The preview marks
  sections left out «not in the PDF». The save dialog lists «PDF options of
  «X»».
- **Checks.** A side box in an own section with «Side column» on is not a
  `callout.place` warning.

Out of scope: sections the template does not know (`section.unknown`) still
do not print; PDF options for campaigns (no campaign PDF); connector tools
(change 4); a Game systems page.

## Capabilities

### Modified Capabilities

- `pdf`: own sections print; sections can be left out.
- `document-templates`: the «In the PDF» column and its options.
- `adventure-format`: the section's `pdf` options; side boxes allowed in an
  own section printed with a side column.

## Impact

`packages/format` (schema, changes, callout check), `packages/layout`
(input and the Typst template), `packages/web` (Sections tab, preview,
change text). No migration: stored template bodies are JSON and the new key
is optional. The built-in templates gain no `pdf` key, so Sabaoth's PDF
keeps its bytes.
