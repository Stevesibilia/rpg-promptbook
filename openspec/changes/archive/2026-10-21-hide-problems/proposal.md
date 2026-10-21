## Why

Checks are guidelines since #27: they never block a write. But a problem the
owner has decided to live with keeps showing everywhere: the margin dot and
the squiggle in the editor, the Checks list, the outline badges, the status
bar and the project list's counts. Issue
[Stevesibilia/rpg-promptbook#31](https://github.com/Stevesibilia/rpg-promptbook/issues/31)
asks for a way to hide one problem for good (Dismiss), to hide it for a while
(Snooze, a day or a week), and to see hidden problems and bring them back.

The owner approved the mockup
[docs/mockups/problems.html](../../../docs/mockups/problems.html) on
2026-10-21 and decided: a full release; a hidden problem is matched by its
check code, its scene and its text; hidden problems sync with the project;
the connector still lists hidden problems, marked as dismissed or snoozed.
The architect took the remaining decisions; they are in the design.

## What Changes

- **Hidden problems in the project:** a new top-level `Y.Map`
  `hiddenProblems` in the project's Y.Doc, one key per hidden problem, so
  every device and the server see the same hidden problems. `SCHEMA` stays 1.
- **A fingerprint per problem:** check code, scene id, and a short hash of
  the whole source lines the problem covers. Edits elsewhere do not disturb
  it; rewriting the flagged line brings the problem back.
- **One pure module** in `packages/project` reads, writes and applies the
  hidden entries; the editor, the summary and the connector all use it.
- **Editor:** the lint tooltip gains «Snooze a week» and «Dismiss»; each
  Checks row gains a «⋯» menu with «Snooze for a day», «Snooze for a week»
  and «Dismiss»; a «Hidden (n)» list under Checks restores one or all; the
  status bar shows «n hidden»; a toast with Undo follows each hide and
  restore. Hidden problems leave the margin, the squiggles, F8, the Checks
  list, the outline badges and the status bar counts.
- **Counts:** the project list's errors and warnings, and the connector's
  counts, leave out hidden problems.
- **Connector:** edit results still list hidden problems, marked
  `hidden: 'dismissed' | 'snoozed'` with `until` for a snooze. No new tool:
  Claude cannot hide or restore a problem.

Out of scope: hiding the PDF review's layout checks, hiding problems from
Claude, a project-wide "hide every problem with this code", and a server
timer that refreshes the project list when a snooze ends.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `editor`: problems in the editor, the outline badges, the inspector's
  Checks and the status bar leave out hidden problems; new requirements
  for hiding a problem, keeping it on its spot, the hide actions, the toast
  with Undo, the hidden problems list and restoring.
- `projects`: the project's Y.Doc holds the hidden problems; the summary's
  counts leave them out.
- `connector`: new requirements for hidden problems left out of counts and
  marked in edit results.

## Impact

- `packages/project`: new `hidden.ts` (`problemKey`, `readHidden`,
  `hideProblem`, `restoreProblem`, `restoreAll`, `putHidden`,
  `partitionProblems`, the types), exported from `index.ts`; the layout
  comment in `doc.ts` (`:30-77`); `summary.ts` `summarize` leaves out
  hidden problems and takes an optional `now`. No change to `SCHEMA`.
- `packages/server`: `mcp/edits.ts` (`ProblemOut`, `problemOut`, `check`,
  `report`, `apply`), `mcp/tools.ts` (`get_outline` and the descriptions of
  `get_outline`, `replace_section`, `add_scene`). `storeProjectDoc` and
  `insertProject` (`projects.ts`) get the new counts through `summarize`
  with no change.
- `packages/desktop`: no code change; `refreshRow`
  (`main/projects.ts:64`) gets the new counts through `summarize`.
- `packages/web`: a hidden-problems state field and the hide actions in the
  editor (`editor/cm/problems.ts`, `editor/Editor.tsx`,
  `editor/EditorPage.tsx`), `editor/Checks.tsx`, `editor/Inspector.tsx`,
  `editor/StatusBar.tsx`, `editor/outline.ts`, `ui/Toast.tsx` (an action
  button), `dates.ts` (the snooze date), `editor/editor.css`.
- Tests in `packages/project`, `packages/server`, `packages/web`,
  `e2e/editor.spec.ts`; README and `docs/design.md`. No database migration.
  Release `v0.9.0`.
