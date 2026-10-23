## Why

In the PDF, «Regole della notte» is set in two columns that Typst fills one
after the other: rules shorter than a page stay in the left half and leave
the right half empty. Issue
[Stevesibilia/rpg-promptbook#45](https://github.com/Stevesibilia/rpg-promptbook/issues/45).
The owner chose to lay the section out like a scene page instead: a main
column and a side column the author fills on purpose.

## What Changes

- **Layout:** «Regole della notte» prints its text in the main column and
  its `[!riquadro|laterale]` boxes in the 58 mm side column, as a scene
  does. With no side box, the text runs full width. The two-column flow is
  gone.
- **Format:** the template gives «Regole della notte» the role `rules`, and
  `[!riquadro|laterale]` is allowed there, so it no longer raises
  `callout.place`. The syntax sheet and the slash menu follow from the
  template.

Out of scope: any other section's layout, the connector, the server.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `adventure-format`: side boxes allowed in «Regole della notte».
- `pdf`: the rules page's layout.

## Impact

- `packages/format`: `template/schema.ts` (section role `rules`),
  `template/avventura.ts`.
- `packages/layout`: `src/input.ts` (`rules.sideBoxes`),
  `typst/avventura.typ`.
- Tests: `packages/format/test/checks.references.test.ts`,
  `packages/layout/test/input.test.ts`, `packages/web/test/syntax.test.ts`.
- Release `v0.12.0`.
