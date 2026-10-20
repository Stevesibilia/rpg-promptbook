## Context

Issue #27. The owner's rule: checks never block the workflow. Today the
only places where a check blocks are the connector's two writing tools
(`packages/server/src/mcp/edits.ts`, `refuseMoreErrors`, used by
`replace_section` and `add_scene`). The editor, the PDF, import and export
never refuse because of problems. Separately, the template
(`packages/format/src/template/avventura.ts`, callout `leggi`) sets
`perPlace: { min: 1, max: 1 }`, and the model keeps a single
`Scene.readAloud`.

## Goals / Non-Goals

**Goals:**

- No check refuses a write anywhere.
- Several read-aloud boxes in any scene and in «Inizio forte», printed in
  order.

**Non-Goals:**

- Changing which problems exist or their severity. A scene with no
  read-aloud is still an error, shown in the editor and the PDF review.
- The converter's quote rule.
- Adding the appendix row automatically in `add_scene`. That is a possible
  later help; Claude now writes the row itself without being refused.

## Decisions

1. **Edits report and never refuse for problems.** `replace_section` and
   `add_scene` run the checks after the edit (adventure and one-shot only, as
   today) and return them. Fields kept or added in the result:
   - `errors` and `warnings` (after);
   - `errorsBefore` and `warningsBefore`;
   - `problems`: the problems inside the edited span, each with line,
     severity, code and message.

   The tool descriptions drop "an edit that adds errors is refused". In its
   place: "problems are reported, never refused; fix them in later edits
   when you can". `ToolRefusal` stays for the structural refusals
   (`changed_since_read`, `invalid_markdown`, `unknown_target`), which keep
   an edit addressable and undoable. The `more_errors` code goes from code,
   tests and the spec.

2. **Read-aloud is a list.** The template's `leggi` gets
   `perPlace: { min: 1, max: null }`. The model's scene read-aloud becomes
   a list of box ids in document order. The implementer may rename the field
   or keep `readAloud` for the first box and add `readAlouds`; the choice
   goes in the hand-back. Any check that counted "more than one" stops
   reporting it; "none" stays an error. «Inizio forte» follows the same
   rule.
3. **PDF: all read-alouds in the slot.** `LayoutScene.readAloud` becomes a
   list printed in order where the single box is printed today
   (`avventura.typ`, the scene template); `boxes` no longer receives extra
   read-alouds. Check «Inizio forte»'s layout prints several boxes in
   order (it may already). Double-click from the review still jumps to the
   box clicked.
4. **Inspector:** the read-aloud row's note drops "· 1 per scene" (it
   already hides the count when `max` is null), and the row reads as
   present when there is at least one.

### Departures accepted in review (2026-10-20)

1. The model's field is `Scene.readAlouds: string[]` (box ids in document
   order); `readAloud` is gone. Layout input, inspector, inserts and writes
   follow it. Inserting the next field goes after the last read-aloud; a jump
   to "the read-aloud" goes to the first.
2. «Inizio forte» has no read-aloud field in the model; its blocks already
   printed in order. A layout test covers two there.
3. The edit result keeps `errors`, `warnings` and `problems` and adds
   `errorsBefore` and `warningsBefore` (null for a campaign).
4. With `max: null`, the `/` menu always offers "Da leggere" and the syntax
   sheet reads "at least 1 per place".
5. The appendix-row tests were not added: in the fixture a missing or orphan
   row is a warning, so they would prove nothing. An edit that removes a
   scene's read-aloud (a `callout.count` error) covers both tools.

## Risks / Trade-offs

- [Claude may leave a document with errors] → The errors are listed in each
  edit's result and in the editor, and the owner decides. This is the
  owner's explicit rule.
- [Changing the model's read-aloud shape touches consumers in format,
  layout and web] → Typecheck finds them all. Unit tests cover two boxes in
  a scene and in «Inizio forte», through the model, the checks and the
  layout input.

## Migration Plan

None: no stored data changes. Ship as v0.5.1 with the usual tag.

## Open Questions

None.
