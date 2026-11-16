## Why

Issue
[Stevesibilia/rpg-promptbook#63](https://github.com/Stevesibilia/rpg-promptbook/issues/63).
Where each part of the night page and of a scene page prints is written in
the layout code: «Da non perdere stasera» and the revelations always go to
the side column, «Orologio» and «Verità del mondo» to the main one, and the
same holds for the four block fields of a scene. A side box cannot break
across pages, so a long list in the side column jumps to a page of its own
(the owner's «Fair Play» has a long «A colpo d'occhio» and its «Rivelazioni»
box prints alone on the next page). The owner cannot move a part without a
code change. The agreed mockup is
[docs/mockups/templates.html](../../../docs/mockups/templates.html), states
3, 4, 8 and 10.

## What Changes

- **The template sets the column.** An adventure template says, for the
  night-page parts («Da non perdere stasera», «Orologio», «Verità del mondo»
  and the revelations list of «A colpo d'occhio») and for four scene fields
  («Da non perdere qui», «Cosa succede da sé», «Chi c'è», «Indizi qui»),
  whether the part prints in the main or the side column. The defaults are
  today's places, so the built-in «Avventura» does not change and needs no
  new version.
- **The text overrides with a mark.** `{laterale}` or `{principale}` after a
  `##` heading or after a block field's bold label moves that part:
  `## Orologio {laterale}`, `**Da non perdere qui** {principale}`. A mark on
  a scene field moves it in that scene only. A part without a mark follows
  the template, so every existing document prints as today.
- **The template writes the marks.** A new project's starting document and
  every scene field inserted later carry the mark of the template's column.
- **Nothing moves by itself.** Side boxes stay unbreakable and no part
  changes column when it does not fit. A page whose side column is empty
  prints its main column full width.
- **Checks.** A word that is not a column and a mark on a part that takes no
  column are warnings; the part prints where the template says.
- **Template editor.** A Main / Side switch in «In the PDF» for the three
  night sections, a «↳ Rivelazioni» row, an «In the PDF» column on Scene
  fields, a page sketch under both tables, the marks in the starting
  document.
- **Editor.** The mark shows in its own style on every line; the palette
  gets «Move to side column» and «Move to main column»; the syntax sheet
  lists the marks.
- **Template update.** A third option, off by default, writes the new
  version's column on every part that has no mark. Marks already in the text
  never change. The change list says «…prints in the side column».
- **Connector.** `update_project_template` takes the same option; the texts
  of `add_scene` and `save_template_version` name the marks and the new
  template properties.

Out of scope: campaign documents and templates, the «Side column» option of
own sections, the column of boxes, the look of a part in its default place,
any automatic handling of a part that does not fit.

## Capabilities

### Modified Capabilities

- `adventure-format`: column marks in the text, the column properties of a
  template, two new warnings.
- `pdf`: the night page and the scene page place their parts by column.
- `document-templates`: the column switches, the page sketch, the update
  option.
- `projects`: the starting document carries the marks.
- `editor`: the mark's display, the palette commands, the inserts, the
  syntax sheet.
- `connector`: the update option and the tool texts.

## Impact

`packages/format` (schema, a new `template/placement.ts`, parser, checks,
changes), `packages/project` (skeleton, update), `packages/layout` (input
and `typst/avventura.typ`), `packages/web` (template editor, starting
preview, editor preview, palette, inserts, syntax sheet, update dialog),
`packages/server` (connector tool texts and one option). No migration:
template bodies are JSON and the new keys are optional. The built-in
templates gain no key and the Sabaoth fixture has no mark, so its four
recorded PDF hashes stay. A v0.21 desktop app reads a marked block field as
an inline field until it updates (design.md, Risks). Release v0.22.0.
