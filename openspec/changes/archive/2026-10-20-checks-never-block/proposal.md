## Why

Checks are guidelines: they say what a document still needs, and they must
never stop the writing (owner, 2026-10-20, #27). Two places stop it today:

- The connector refuses an edit that raises the document's error count
  (`more_errors`). Some documents grow only through a state with more errors.
  A new scene has no appendix row yet («not in the map»), and a row written
  first points at a scene that does not exist. Claude stopped after S2 of an
  adventure.
- The template allows exactly one `[!leggi]` per scene and in «Inizio forte».
  The owner's notes use more than one: a Joplin Inizio forte had two, and
  Claude had to turn one into a plain paragraph.

## What Changes

- **Connector:** `replace_section` and `add_scene` always write the edit
  once its structure is right: the hash read, the heading level, the scene
  id, exactly one target. The result reports the document's errors and
  warnings, before and after the edit, and the problems in the edited text,
  as information. The `more_errors` refusal is removed, and the tool
  descriptions say that problems never block.
- **Format:** any number of `[!leggi]` callouts in a scene and in «Inizio
  forte»; a scene with none is still an error. Only "more than one" stops
  being a problem.
- **PDF:** every read-aloud of a scene prints in the read-aloud slot, in the
  order written. Today a second one falls into the generic boxes.
- **Editor:** the inspector's read-aloud row no longer says "1 per scene".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `connector`: section-scoped edits are never refused for the problems they
  add.
- `adventure-format`: several read-aloud callouts per place.
- `pdf`: every read-aloud of a scene prints in its slot.

## Impact

- `packages/server/src/mcp` (edits, tools, descriptions) and its tests.
- `packages/format` (the template's `perPlace`, the scene model's
  read-aloud, checks) and its tests.
- `packages/layout` (input model and Typst template) and its tests.
- `packages/web/src/editor` (inspector row).
- The note converter is unchanged: the first plain blockquote of a scene
  still becomes `[!leggi]`, later ones `[!documento]`.
- No server migration and no document change. Released as v0.5.1.
