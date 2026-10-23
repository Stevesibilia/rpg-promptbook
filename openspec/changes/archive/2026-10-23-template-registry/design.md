## Context

Issue #34, plan p17, change 1 of 4: templates as data, with no visible
change. The mockup [docs/mockups/templates.html](../../../docs/mockups/templates.html)
was agreed with the owner for the whole plan; this change builds none of its
UI, only the ground the editor (change 2), the PDF options (change 3) and
the connector tools (change 4) stand on. Read the mockup's `NOTES` for the
whole picture; in this change, only "Roles, shown with a lock" and "Game
systems move out" matter.

### The code today

- **One template, imported everywhere.** `templates.avventura`
  (`packages/format/src/index.ts:29`) is imported in 20 places:
  `desktop/src/main/snapshots.ts:34`, `layout/src/input.ts:170`,
  `project/src/summary.ts:80`, `appendix.ts:8`, `skeleton.ts:40,56,58`,
  `targets.ts:47,59`, `board.ts:810`, `server/src/mcp/edits.ts:69,323`,
  `server/src/snapshots.ts:73`, `server/src/mcp/tools.ts:83`,
  `web/src/editor/SyntaxSheet.tsx:6`, `PdfReview.tsx:12`,
  `Editor.tsx:58,63`, `analysis/field.ts:131`, `StatusBar.tsx:53`,
  `analysis/parse.worker.ts:10`, `pdf/pdf.worker.ts:39`, `ThisScene.tsx:12`.
- **Labels in code.** `layout/src/input.ts:177-186` maps eight scene fields
  by label (`FIELD`), and `:406,412,442,443` find «Antefatto», «Prima della
  sessione», «Orologio», «Verità del mondo» by name.
  `web/src/editor/inserts.ts:11` `READ_ALOUD_AFTER = 'Da non perdere qui'`.
  Roles exist already for some: section roles in `template/schema.ts:11-23`,
  field roles `cast` and `clues` (`:55`), each unique per template
  (`:153-160`).
- **Systems inside the template.** `template.systems` is read by
  `parse/sheets.ts:58`, `checks/sheets.ts:16`, `convert/index.ts:460`.
- **Campaign skeleton in code.** `project/src/skeleton.ts:22`
  `campaignSections`; campaigns are never parsed.
- **Project meta.** `project/src/model.ts:21` `ProjectMeta`;
  `doc.ts:173` `readMeta`, `doc.ts:140` `createProjectDoc`; the gdrarchive
  link (`doc.ts:85-87,247`) is the pattern for a plain JSON value set whole
  in `meta`.

## Goals / Non-Goals

**Goals:** every consumer gets its template from the project; code finds
sections and fields by role; systems are a separate list; a campaign
template exists; projects record their template.

**Non-Goals:** user templates, their storage and sync, any UI, template
versions other than the built-ins, PDF options per section, checks for
campaigns, connector tools. The Typst template is not touched.

## Decisions

### D1. Roles for every section and field the code needs (architect)

Section roles gain `backstory` (Antefatto), `clock` (Orologio), `truths`
(Verità del mondo), `before` (Prima della sessione). Scene field roles gain
`place` (Luogo e momento), `inPlay` (In gioco), `mustHave` (Da non perdere
qui), `happens` (Cosa succede da sé), `tests` (Prove e regole), `derail` (Se
deragliano), `situation` (Regole della situazione), `decides` (Cosa decide
la notte), beside `cast` and `clues`. `avventura.ts` sets them. `FIELD` in
`layout/src/input.ts` becomes a role lookup, the four `section('…')` calls
become `role('…')`, and `READ_ALOUD_AFTER` becomes the label of the
`mustHave` field of the template in hand.

Reason: the editor (change 2) lets users rename sections and fields; the
role is what stays. A role stays optional in the schema: a user template
may lack one, and the readers already handle a missing section or field.

### D2. Game systems are a list beside the template (architect)

`systems` leaves the template schema. New `packages/format/src/systems.ts`
holds `systemSchema` (moved from `template/schema.ts`), `defineSystems` with
the same validation (unique names, unique grades), and `builtinSystems`
(Kulthos, as today). `parseAdventure(text, { template, systems })` takes
them, `systems` defaulting to `builtinSystems`. `convert/index.ts` uses
`builtinSystems`. `SystemDefinition` keeps its name and is exported from
the package as today.

Reason: the owner chose systems as their own Settings list (mockup state 1
note), so any template can use any system.

### D3. Template kinds and the campaign template (architect)

The schema gains `kind: 'adventure' | 'campaign'`. An `adventure` template
is today's shape. A `campaign` template has `id`, `version`, `name`, `kind`,
`meta` and `sections` only: a separate zod object in a discriminated union
on `kind`. `defineTemplate` accepts both; `AdventureTemplate` and
`CampaignTemplate` are exported types, and `Template` is their union.
`parseAdventure` takes an `AdventureTemplate`.

New `template/campagna.ts`: `campagna@1`, name «Campagna», `meta` = today's
front matter keys a campaign skeleton writes (`titolo`, `sistema`,
`formato`, `autore`, `copyright`, `licenza`, in that order), `sections` =
Premessa, Fronti, PNG ricorrenti, Fili aperti, Sessioni, each `optional`,
no role. `skeleton.ts` builds the campaign skeleton from it, so the text it
writes is byte for byte today's.

Reason: the owner wants campaign templates (mockup state 6); campaigns stay
unchecked, so the campaign kind holds only what the skeleton needs.

### D4. Registry (architect)

New `template/registry.ts`:

```ts
export interface TemplateRef {
  id: string;
  version: number;
}
export const builtinTemplates: readonly Template[]; // avventura@1, campagna@1
export function resolveTemplate(
  ref: TemplateRef,
  extra: readonly Template[] = [],
): Template | undefined;
export function defaultTemplateRef(kind: Template["kind"]): TemplateRef;
```

`resolveTemplate` looks in `extra` first, then the built-ins, matching id
and version exactly. `templates` in `index.ts` stays as an alias of the
built-ins by id for tests and fixtures; product code stops using it (a
lint-free rule: the implementer greps `templates.avventura` under
`packages/*/src` at the end and finds none outside `format`).

Reason: change 2 passes the account's templates as `extra`; nothing else in
the readers changes then.

### D5. The project records its template (architect)

`ProjectMeta` gains `template: TemplateRef`. In the doc it is `meta.template`,
a plain JSON value `{ id, version }` set whole (doc.ts header comment
updated, like the gdrarchive entry). `readMeta` reads it; a missing or
malformed value reads as `defaultTemplateRef` of the category's kind
(`campaign` for campaigns, `adventure` otherwise). `createProjectDoc` writes
the default ref. A setter `setTemplate(doc, ref)` is added for change 2;
nothing calls it yet.

Reason: per-project pinning is the owner's choice (question 3). The default
on read means no migration: every existing project reads `avventura@1` or
`campagna@1`, which is what it uses today.

### D6. One way to get a project's template (plan)

New `packages/project/src/template.ts`:

```ts
export function templateOf(meta: Pick<ProjectMeta, 'template' | 'category'>, extra?: readonly Template[]): Template;
export function adventureTemplateOf(meta: …, extra?: …): AdventureTemplate;
```

`templateOf` resolves the ref; when it resolves to nothing, or to a kind
that does not match the category, it answers the category's built-in.
`adventureTemplateOf` is for readers that parse (they never see campaigns).
Every consumer listed under "The code today" calls one of them with the
project's meta it already has, or takes the template as a parameter from
its caller. Where a module holds `const template = templates.avventura` at
top level (`appendix.ts`, `input.ts`, `tools.ts`, `SyntaxSheet.tsx`,
`PdfReview.tsx`, `StatusBar.tsx`, `ThisScene.tsx`), the functions take the
template as an argument instead.

Reason: one fallback rule in one place. A project whose template is missing
(change 2: a deleted user template on a desktop that never synced it) still
opens.

### D7. Workers get the template with the text (plan)

`ParseRequest` (`web/src/editor/analysis/client.ts`) gains `template:
AdventureTemplate`; the worker parses with it. The PDF worker's request
gains the template the same way. The template is a few kilobytes of plain
data, so sending it with every request costs nothing worth a cache.

Reason: change 2's user templates reach the workers with no worker change.

### D8. Connector descriptions stay on the built-in (plan)

`server/src/mcp/tools.ts:83` builds tool descriptions from template labels
once, before any project is known. They keep using the built-in
`avventura@1`. The tools that parse a project's document (`edits.ts`,
snapshots, targets) use the project's template.

Reason: tool lists are per connection, not per project; change 4 revisits
the descriptions.

### D9. No visible change, proved (plan)

Same problems, same skeletons, same PDF bytes. Proof: before the first code
commit, build Sabaoth's PDF on `main` with the layout test helpers and save
its SHA-256 in the task notes; the same build on the branch must match. The
existing format, layout, project, web and server suites stay green
unchanged except for imports and call signatures.

### D10. Front matter keys stay keys (architect, at build)

Product code outside `packages/format` reads front matter keys by name: `layout/src/input.ts` (OVER, UNDER, `autore`, `copyright`), `project/src/skeleton.ts` and `import.ts`, `web/src/editor/licence.ts` and `cm/preview.ts`. They stay as they are here; `input.ts` reads the title and subtitle by their existing meta roles. Change 2 decides between locking those keys in the editor and giving them roles. Reason: D1 is about what the editor can rename first, sections and fields; keys can wait without changing any output.

## Risks / Trade-offs

- **A label that is not in the list.** If the implementer finds another
  Italian label in product code outside `packages/format` that this design
  does not name, add a role for it the same way and say so at hand-back.
- **Byte drift in the PDF.** If the Sabaoth hash differs, stop and report
  with the first differing page; do not adjust the Typst template.
- **Desktop main process.** `desktop/src/main/snapshots.ts` parses without
  the project meta at hand; if reading the meta there means loading the
  doc in a new place, report it instead of adding a second read path.
- **Workers and structured clone.** If posting the template to a worker
  fails because of a non-cloneable value (a function or a zod object inside
  the template), report it; the template must be plain data.

## Migration Plan

None: a missing `meta.template` reads as the category's built-in (D5).

## Open Questions

None.

## Departures accepted at review

The implementer's hand-back listed eight; all accepted.

1. **Callers moved with their callee.** `targetsOf`, `findTarget` and
   `appendixEdit` take the template, so their server and web callers changed
   in group 2 (task 5.1's `edits.ts` part landed there) to keep each commit
   green.
2. **Template, not category.** `targetsOf(text, template)`,
   `findTarget(text, template, name)` and `edits.ts` `check()` use
   `template.kind` where they used the category.
3. **Optional template in the skeleton.** `skeletonDocument(category, input,
template?)` and `ProjectInput.template` default to the category's
   built-in, so the three create paths (desktop, server, web) are unchanged.
4. **Snapshots record the template.** `NewSnapshot.category` became
   `template`; `documentWords` takes a template on server and desktop.
5. **Consumers the plan did not list:** `web/src/board/useBoard.ts`,
   `BoardView.tsx`, `ResearchView.tsx`, and the connector's `get_outline`,
   `read_document` and undo.
6. **Web plumbing.** The template sits in the analysis field's state;
   `StatusBar` and `ThisScene` read it from there. `Editor`, `SyntaxSheet`,
   `PdfReview` and `usePdf` take it as a prop from `EditorPage`, memoised on
   category, id and version. `READ_ALOUD_AFTER` became
   `readAloudAfter(template)`.
7. **One test expectation.** `parse.test` "matches headings by name" now
   expects the roles `clock`, `truths`, `before` (D1).
8. **Layout signature.** `toLayoutInput` takes the template as its fourth
   parameter.

Proof: Sabaoth's PDF hashes (default, ink saver, no pregenerated, US
letter) are identical on `main` and after the layout moved to roles; the
three skeletons are byte-identical before and after.

## Carried to change 2 (template-editor)

From the implementer's reviewer, none live with the built-ins:

- This scene and `readAloudOf` assume the template has a read-aloud, a
  handout and a box callout (`find(...)!`). Require them in the schema or
  degrade.
- `templateOf` silently falls back to the built-in for an unknown or
  wrong-kind ref. Decide whether the UI shows it.
- `resolveTemplate` lets `extra` shadow a built-in with the same id and
  version. Refuse user templates that reuse a built-in id.
- `Editor` recreates the CodeMirror view when the template changes, which
  drops undo. Reconfigure instead when "Update to latest" lands.
- `skeletonDocument` does not check the template's kind against the
  category, and `setTemplate` accepts any well-formed ref.
- Front matter keys read by name (D10).
