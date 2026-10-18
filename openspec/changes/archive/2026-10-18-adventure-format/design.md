## Context

The format was chosen in [docs/research/source-format.md](../../../docs/research/source-format.md)
and recorded in [docs/design.md](../../../docs/design.md), "Source format":
CommonMark plus GFM, YAML front matter, callouts for typed boxes, a closed
grammar checked against the template. Today's two Python scripts in the
owner's `rpg-prep` plugin are the specification of what the template means:
`controlla.py` (the checks) and `impagina.py` (what the PDF reads). The
template itself is the plugin's `enhanced-avventure-rpg/references/modello.md`.

This package is the only code that reads an adventure. The editor (lint,
outline, live preview), the Typst PDF, the asset board, the `.cbpack` export
and the MCP connector all consume its model and its problem list. It runs in
the Electron renderer, in the browser and in Node on the server, offline.

## Goals / Non-Goals

**Goals:**

- One function from text to `{ model, problems }`, pure and synchronous.
- Every block of the document is either placed in the model or reported as a
  problem. Nothing is dropped or merged silently.
- Every problem has a stable code, a severity, a position and, where it is
  obvious, a fix expressed as a text edit.
- Templates are data: adding a field, a callout type or a system is a change
  to a definition, not to the parser.
- A converter that brings today's notes into the format with minimal edits.

**Non-Goals:**

- Rendering (HTML, Typst) and the editor integration.
- The campaign template (the `campagna-rpg` skill's document); the definition
  format must allow it, but it ships in a later change.
- Incremental parsing. A full parse of a 30-page adventure must stay fast
  enough to run on every keystroke after a short debounce.
- Writing Markdown back out from the model.

## Decisions

### Package and API

`packages/format`, ESM, TypeScript strict, no Node-only imports. Public API:

- `parseAdventure(text, { template }) → { model, problems }`
- `convertNote(text, { title?, template? }) → { text, edits, report }`, with
  `template` defaulting to `avventura` (amended at review of groups 4b to 6, so
  the result is checked against the caller's template)
- `templates.avventura` and `defineTemplate(definition)`, which validates a
  definition with zod and returns it typed.

Alternatives: a class with state, or async parsing. Rejected: the callers
(CodeMirror lint, MCP tools, the PDF builder) all want a plain call on a
string, and nothing here waits on I/O.

### Parsing stack

`unified` with `remark-parse`, `remark-gfm` and `remark-frontmatter`, then
`yaml` for the front matter. Callouts are an in-house transform over
blockquotes whose first line is `[!type]`, `[!type|meta]` or `[!type] Title`.

Alternatives: an existing callout plugin (not actively released, per the
research); a hand-written line parser like today's scripts (that is exactly
what guesses and drops). Remark gives a real tree with positions for free.

### Model

A plain, serializable object (JSON-safe, so it can cross the Electron IPC and
the MCP boundary): `meta`, `sections[]`, `scenes[]` (id, title, fields, boxes,
read-aloud, reactions table, references, images), `sheets[]` (key, title,
fields, threat data), `revelations[]`, `clues[]`, `tracker[]`, `sceneMap[]`,
`appendix[]` (scene id, visual, mood), `reminders[]`, `npcs[]`,
`pregenerated`, and `unplaced[]` for content the model does not understand.
Every item has a `range` with start and end offsets and 1-based line and
column. A scene's `readAloud` is the id of its read-aloud box (`S1.2`), not a
copy of it. (Amended at review of tasks 1–3: `reminders`, `npcs` and
`pregenerated` were added because the checks and the PDF read them; an id
keeps the box in one place.)

Ids are stable across edits that do not touch them: scenes by their `S` id,
sheets by a slug of their title before the comma, sections by name, boxes by
scene id plus index. Later changes key assets and MCP edits on these. Sheet
names must be unique for this; the checks report a duplicate.

`→ Schede:` references are resolved by the parser, after every section is
read and before the checks run: each reference that matches exactly one sheet
gets that sheet's id. The checks only read it, so they stay read-only over the
model, and the editor and the PDF get the resolution without running them.
(Amended at review of task group 4.)

### Template definition

A zod-validated object, versioned (`avventura@1`):

- `meta`: front matter keys with their requirement level and type, and an
  optional role (`title`, `system`) so the code finds the title and the game
  system without naming `titolo` or `sistema`.
- `sections`: name, requirement level, position in the order, and a role
  saying what they contain (synopsis, overview, scenes, sheets, tables…).

(Amended at review of tasks 1–3: meta keys, sections and scene fields share one
requirement level, `required | recommended | optional`, for one rule across the
definition; the meta role was added so the sheets can find the system.)

- `sceneFields`: label, inline (`**Label:** text`) or block (`**Label**` then a list or a table), requirement level (`required`, `recommended` or `optional`; a missing recommended field is a warning), climax only. In avventura@1: required Luogo e momento, In gioco, Da non perdere qui, Cosa succede da sé, Se deragliano; recommended Indizi qui; optional Chi c'è, Prove e regole and the climax fields, as controlla.py allows scenes without clues, NPCs or rolls.
- `callouts`: type, label, where allowed, how many per scene.
- `sheetKeys`, and per system a grade table (Kulthos: Ordinaria 3 wounds and 1
  affliction, Straordinaria 6 and 2, Leggendaria 9 and 3).
- `limits`: the word and line limits from `controlla.py`, and the clue minima
  (3 clues per revelation, in at least 2 scenes).
- `style`: forbidden characters (the em and en dash, per the owner's Italian
  writing rules).

The checks read the template; none of the Italian labels appear in parser
code. This is what lets the editor offer "Add to the template" as a fix later.

### Problems

`{ code, severity: 'error' | 'warning', message, range, sceneId?, fixes? }`.
`code` is stable (`scene.field.unknown`, `ref.unresolved`…) and is what
callers match on; `message` is English text with the Italian labels quoted.
`fixes` are text edits, so the editor and the MCP connector apply them the
same way. Errors never stop the parse: the model is always returned.

Alternative: throw on the first error, like a compiler. Rejected: the editor
needs every problem at once, and the PDF still has to render a document with
errors.

### Converter

Works on the original text with edits computed from the tree's positions,
not by re-serializing the tree: re-serializing would reformat the whole note
(list markers, line wrapping, table padding) and make the change impossible to
review. It is idempotent: a converted text produces no edits. After
converting, it runs `parseAdventure` and puts the remaining problems in the
report, so the report says both what it changed and what still needs a human.

The report holds counts of edits by kind, notices about what the converter
left alone (an unknown header label, a `Tipo` line of another shape, an
untitled handout), with ranges in the original text, and the remaining
problems, with ranges in the converted text. Each edit carries its kind and a
message. Words of today's notes that are not part of the format ("Minaccia",
"branco", "sì") live in one constant in the converter; the subtitle key is
found through a meta role `subtitle`, since the PDF needs it too. (Amended at
review of groups 4b to 6.)

### Fixtures and tests

`vitest`, with table-driven tests per rule (one small document per case) plus
two whole adventures:

- the template's own example, `esempio.md`, from the public `rpg-prep` plugin,
  copied into `packages/format/fixtures/` with its source noted;
- L'Ancora di Sabaoth, the owner's adventure in today's conventions, copied
  as it is into `packages/format/fixtures/` (the owner agreed to publish it,
  2026-10-18). It is the converter's main test case, because it carries most of
  the problems the research found.

### Workspace and CI

npm workspaces at the root, TypeScript project references, Node 26 (as
gdrarchive). `packages/format` has two TypeScript projects: `src` with no Node
types, so a Node-only import fails the typecheck, and `test` with Node types,
since the tests read fixtures from disk. TypeScript sits in the root's dev
dependencies because the root script runs `tsc -b`. (Amended at review of
tasks 1–3.) GitHub Actions on pull requests into `main`: install, typecheck,
test, and Prettier check on changed Markdown. Branch protection on `main`
(required check, no direct pushes) is applied by the owner once the workflow
exists.

## Risks / Trade-offs

- [The grammar is Promptbook's own; no other tool can check it] → One grammar
  reference page, generated from the template definition, shared by the
  editor's help and the MCP connector.
- [Obsidian may not render `[!riquadro|laterale]` as a box] → It still renders
  as a quote with a visible label; only Promptbook needs to understand it.
- [Strict checks on old notes produce many problems at once] → The converter
  fixes the mechanical part; the rest are warnings unless the template marks
  them as errors, and none of them blocks saving or the PDF.
- [Remark's positions inside front matter and tables are coarse] → Problems in
  front matter point at the key's line from the YAML parser; table problems
  point at the row.
- [Template churn while the owner keeps refining the skill] → The definition
  is versioned; a document records the template version it was checked
  against.

## Open Questions

- Problem messages are English for now. If the app's interface is translated
  later, the stable codes allow it without touching the package.
