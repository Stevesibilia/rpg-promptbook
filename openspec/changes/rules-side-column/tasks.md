Each numbered group below is one commit, in Conventional Commits, that leaves
`npm run typecheck` and `npm test` green, with the trailers:

```
Refs: Stevesibilia/rpg-promptbook#45
Assisted-by: claude-code/claude-opus-5-5
```

## 1. Rules page with a side column

- [x] 1.1 `packages/format`: section role `rules` in `template/schema.ts`; «Regole della notte» gets it in `template/avventura.ts`, and `[!riquadro|laterale]` is allowed there
- [x] 1.2 `packages/layout/src/input.ts`: `rules.sideBoxes` holds the section's side boxes, `rules.blocks` the rest
- [x] 1.3 `packages/layout/typst/avventura.typ`: full width without side boxes, `columns-part` with them; the two-column flow removed
- [x] 1.4 Tests: `callout.place` accepts the side box in the rules (format), the split (layout), the syntax sheet's places (web)
- [ ] 1.5 Owner checks the rendered rules page, with and without a side box
- [ ] 1.6 Commit `feat(layout): rules page with a side column`

## 2. Close

- [ ] 2.1 Pull request, merge, archive the change, release `v0.12.0`
