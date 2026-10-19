# promptbook-format

Reads an RPG Promptbook adventure into a model and lists its problems, and
converts notes written in today's conventions into the format. Pure and
synchronous, no Node-only imports: it runs in Electron, the browser and Node.
The format is described in [docs/design.md](../../docs/design.md), "Source
format".

## API

```ts
import {
  convertNote,
  defineTemplate,
  parseAdventure,
  templates,
} from "promptbook-format";

const { model, problems } = parseAdventure(text, {
  template: templates.avventura,
});
const {
  text: converted,
  edits,
  report,
} = convertNote(note, { title: "L’Ancora di Sabaoth" });
```

- `parseAdventure(text, { template })` returns `{ model, problems }`. The
  model is plain JSON-safe data; every item has a `range` with offsets and
  1-based line and column. Errors never stop the parse.
- `convertNote(text, { title?, template? })` returns the converted text, the
  `edits` it made (against the original text, sorted, each with a `kind` and a
  message) and a `report`: `counts` of edits by kind (`frontMatter`, `callout`,
  `threat`, `comment`), `notices` for what the conversion left to a human
  (ranges in the original text), and the `problems` of the converted text. It
  is idempotent: a converted text gives no edits. `template` defaults to
  `templates.avventura`.
- `templates.avventura` is the template `avventura@1`; `defineTemplate(definition)`
  validates another one and returns it typed, or throws a `TemplateError`
  naming every bad entry.
- `checks` and `runChecks` expose the checks the parse runs.

A problem is `{ code, severity, message, range, sceneId?, fixes? }`. Callers
match on `code`, which is stable; `message` is English with the template's
Italian labels quoted. `fixes` are text edits.

## Problem codes

| Code                      | Severity         | When                                                                                         |
| ------------------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| `content.unplaced`        | error            | Content the template does not place (before the first section, inside a scene, an appendix). |
| `meta.yaml`               | error            | The front matter is not valid YAML, or not a list of keys.                                   |
| `meta.type`               | error            | A front matter value of the wrong type.                                                      |
| `meta.required`           | error or warning | A required (error) or recommended (warning) key is missing.                                  |
| `meta.unknown`            | warning          | A front matter key the template does not have.                                               |
| `meta.licence.unknown`    | warning          | `licenza` looks like an SPDX id but is not one.                                              |
| `section.unknown`         | warning          | A `##` section the template does not have; kept as a plain section.                          |
| `section.missing`         | error or warning | A required or recommended section is missing.                                                |
| `section.order`           | error            | A section out of the template's order.                                                       |
| `section.synopsis.first`  | error            | «La vicenda in breve» does not open the document.                                            |
| `scene.id.missing`        | error            | A scene heading without `S<n>.`.                                                             |
| `scene.id.duplicate`      | error            | Two scenes with the same id.                                                                 |
| `scene.field.unknown`     | error            | A bold label in a scene that is not a scene field; the fix turns it into a box.              |
| `scene.field.missing`     | error or warning | A required or recommended scene field is missing.                                            |
| `scene.reactions.missing` | error or warning | A scene without its «Se i PG» table.                                                         |
| `field.blank-line`        | error            | A field label with no blank line before it.                                                  |
| `callout.malformed`       | error            | A `[!…` first line that is not `[!type]`, `[!type] Title` or `[!type\|meta] Title`.          |
| `callout.count`           | error            | A place with too few or too many boxes of a type (one `[!leggi]` per scene).                 |
| `callout.title.missing`   | warning          | A `[!documento]` without a title.                                                            |
| `callout.type.unknown`    | error            | A callout type the template does not have.                                                   |
| `callout.place`           | warning          | A known callout type where its definition does not allow it.                                 |
| `callout.quote.plain`     | warning          | A plain quote in a scene; the fixes mark it as a read-aloud or a handout.                    |
| `ref.unresolved`          | error            | A `→ Schede:` name that matches no sheet.                                                    |
| `ref.ambiguous`           | error            | A `→ Schede:` name that matches more than one sheet.                                         |
| `ref.threat.outside`      | warning          | A graded sheet cited in a scene but not under «Chi c'è», so it gets no threat box.           |
| `sheet.grade.counts`      | warning          | `Ferite` or `Afflizioni` disagree with the grade's table.                                    |
| `sheet.nested-threat`     | warning          | A `####` heading or a graded threat written inside another sheet.                            |
| `sheet.name.duplicate`    | error            | Two sheets with the same name (the part before the comma).                                   |
| `clue.revelation.count`   | error            | A revelation with fewer clues than the minimum (3).                                          |
| `clue.revelation.scenes`  | warning          | A revelation's clues in fewer scenes than the minimum (2).                                   |
| `clue.revelation.missing` | error            | A clue pointing at a revelation that does not exist.                                         |
| `clue.scene.missing`      | error            | A tracker row pointing at a scene that does not exist.                                       |
| `clue.tracker.unwritten`  | error            | A tracker clue written in no scene.                                                          |
| `clue.tracker.scene`      | warning          | The tracker places a clue in another scene than the one it is written in.                    |
| `clue.text.missing`       | error            | A clue with its number and no text.                                                          |
| `map.scene.missing`       | error            | A scene missing from the scene map.                                                          |
| `map.row.orphan`          | error            | A scene map row for a scene that does not exist.                                             |
| `appendix.row.missing`    | warning          | A scene without its appendix row.                                                            |
| `appendix.row.orphan`     | warning          | An appendix row for a scene that does not exist.                                             |
| `appendix.title.mismatch` | warning          | An appendix row whose title differs from its scene's.                                        |
| `appendix.key.missing`    | warning          | An appendix row without `visual:` or `mood:`.                                                |
| `appendix.key.outside`    | error            | `visual:` or `mood:` outside the appendix.                                                   |
| `limit.synopsis.words`    | warning          | The synopsis is outside 300 to 600 words.                                                    |
| `limit.preamble.words`    | warning          | More than 700 words from «A colpo d'occhio» to «Inizio forte».                               |
| `limit.reminders.count`   | error            | More than 5 items in «Da non perdere stasera».                                               |
| `style.dash`              | error            | An em or en dash.                                                                            |

The converter's notices have their own codes: `convert.header.unknown` (a
header label kept under its own name), `convert.header.duplicate`,
`convert.header.position` (a header that does not open the note, left as it
is), `convert.header.key`, `convert.handout.title` (a handout to give a
title) and `convert.threat` (a `Tipo` line left as it is).
