## 1. Layout package and engine (brief A)

- [ ] 1.1 `packages/layout` workspace `promptbook-layout`; typst.ts packages pinned at `0.8.0-rc3`; fonts copied from `impagina-avventura/scripts/fonts/` with an `OFL.txt` per family; `cmarker` 0.1.10 vendored with its licence (decision 1)
- [ ] 1.2 `engine.ts` and `assets.ts`: `createEngine`, `build` through `runWithWorld`, `pdf` with `format: 1`, diagnostics returned (decision 4)
- [ ] 1.3 `positions.ts`, `checks.ts`, `licence.ts` (decisions 5, 7, 8)
- [ ] 1.4 Tests: engine on a small document; unit tests of positions, checks and licence

## 2. Template (brief A)

- [ ] 2.1 `input.ts`: `toLayoutInput` (decision 2)
- [ ] 2.2 `typst/avventura.typ`: every part of `impagina.py`'s `costruisci` with `stile.css`'s look, tabs, footer, cover, sheet page references, `pos` calls, options (decisions 3, 5, 6)
- [ ] 2.3 Tests: Sabaoth as decision 16 lists; `toLayoutInput` unit tests
- [ ] 2.4 Write the Sabaoth PDF to a scratch path, look at it page by page against `~/Downloads/Ancora-di-Sabaoth-A4.pdf`, and list the differences in the hand-back
- [ ] 2.5 Checks (`npm run typecheck`, `npm test -w promptbook-layout`, `npm test`) and hand-back of brief A

## 3. Web: worker and pane (brief B)

- [ ] 3.1 `editor/pdf/pdf.worker.ts` and `client.ts` (decision 9)
- [ ] 3.2 Page drawing (decision 10)
- [ ] 3.3 PDF button, pane, panels state, inspector interplay, loading and error states (decision 11)
- [ ] 3.4 Unit tests: spread pairing, options storage, anything pure added here

## 4. Web: review, shortcuts, server (brief B)

- [ ] 4.1 Review screen: thumbnails, stage, checks, options, Save PDF, Print (decision 12)
- [ ] 4.2 Jump from the PDF (decision 13); `pdfReview` shortcut and palette commands (decision 14)
- [ ] 4.3 Server: content security policy, pre-compressed files, cache headers, `.wasm` type (decision 15); a server test for the headers
- [ ] 4.4 `e2e/pdf.spec.ts` (decision 16); the whole e2e suite passes

## 5. Preview and docs (brief B)

- [ ] 5.1 Owner preview: the compose stack reachable on the LAN; URL and steps in a status note; wait for the owner's go
- [ ] 5.2 `docs/design.md`: PDF built in the browser too, typst.ts version, Print opens a tab, images and versions later; Prettier on the files touched
- [ ] 5.3 Checks and hand-back of brief B

## 6. Release (architect)

- [ ] 6.1 Pull request, CI green, merge; tag `v0.3.0`; GitLab pipeline green
- [ ] 6.2 Live check on promptbook.siberio.eu: the engine arrives compressed, a PDF of a real project builds and saves
- [ ] 6.3 Archive the change; close #20
