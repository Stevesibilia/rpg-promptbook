## Why

The owner preps in Promptbook and logs play in gdrarchive. While prepping, the
campaign's archive (sessions, characters, codex) is several clicks away, in
another app. Issue
[Stevesibilia/rpg-promptbook#32](https://github.com/Stevesibilia/rpg-promptbook/issues/32)
asks for an optional link from a Promptbook project to its campaign in
gdrarchive, shown in the project panel and the editor's top bar. Projects
without it look as today. Pushing items to gdrarchive ("Send to gdrarchive"
in `docs/design.md`) stays a later, separate feature.

The owner approved the mockup
[docs/mockups/gdrarchive-link.html](../../../docs/mockups/gdrarchive-link.html)
on 2026-10-21 and decided: a full release; any project may carry a link, and
an adventure or a one-shot inside a Promptbook campaign with no link of its
own inherits the campaign's; the link is a pasted address, with no picker and
no call to gdrarchive; it is stored in the project document; the label is
optional. The architect took the remaining decisions; they are in the design.

## What Changes

- **The link in the project:** one new meta key, `gdrarchive`, in the
  project's Y.Doc: `{ url, label }` set whole, or null. It syncs with the
  project like the title. `SCHEMA` stays 1.
- **An address rule:** only `https://gdrarchive.siberio.eu/campaigns/<id>` is
  accepted, a trailing slash dropped. The label is optional, at most 40
  characters.
- **Inheritance:** one pure helper in `packages/project` resolves the link a
  project shows: its own, else its campaign's, marked as inherited. A
  campaign never inherits. The panel, the top bar and the connector use it.
- **The list row:** each project's summary and row carry its own link, so an
  adventure can show its campaign's link without opening the campaign's
  document. The server's `projects` table gains two nullable columns.
- **Project panel:** under the campaign row (or the status row of a
  campaign), the link «gdrarchive · <label>» or «gdrarchive campaign»,
  «from campaign <title>» when inherited, and «Change…», «Set its own…» or a
  faint «Link to gdrarchive…». An inline form sets, changes or removes it.
- **Editor top bar:** the link as a read-only pill after the status, on every
  view of a project, hidden in focus mode.
- **Connector:** `get_project` returns the resolved link, marked
  `inherited`. No tool writes it.
- **Export:** `project.json` carries the project's own link when it has one.

Out of scope: a picker reading gdrarchive's campaigns, any call to
gdrarchive, changes to gdrarchive, links to anything but a campaign, reading
the link back on import, the CueBard pack and the PDF.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `projects`: a project may hold a link to a gdrarchive campaign, with the
  address rule and inheritance; the summary for the list carries it.
- `projects-screen`: the project panel shows the link and edits it.
- `editor`: the top bar of a project shows the link.
- `connector`: `get_project` returns the link.
- `markdown-import-export`: `project.json` in the export carries the link.

## Impact

- `packages/project`: new `gdrarchive.ts` (`GDRARCHIVE_ORIGIN`,
  `GdrarchiveLink`, `ResolvedGdrarchive`, `parseGdrarchiveUrl`,
  `readGdrarchive`, `gdrarchiveOf`), exported from `index.ts`;
  `model.ts` (`ProjectMeta.gdrarchive`, `LIMITS.gdrarchiveLabel`); `doc.ts`
  (layout comment, `readMeta`, new `setGdrarchive`); `summary.ts` (`Summary`,
  `summarize`); `export.ts` (`exportProject`). No change to `SCHEMA`.
- `packages/server`: new `migrations/006_gdrarchive.sql`; `projects.ts`
  (`DbRow`, `toRow`, `SELECT`, `summaryParams`, `insertProject`,
  `storeProjectDoc`); `mcp/tools.ts` (`get_project`).
- `packages/desktop`: no code change. Rows are JSON in SQLite and
  `refreshRow` builds them through `summarize`; links already open in the
  system browser (`window.ts:29-32`).
- `packages/web`: the panel (`projects/ProjectPanel.tsx`), the top bar
  (`project/top.tsx`), new `projects/gdrarchive.ts` and
  `projects/GdrarchiveLink.tsx`, styles in `projects/projects.css` and
  `editor/editor.css`.
- Tests in `packages/project`, `packages/server`, `packages/desktop`,
  `packages/web`, `e2e/projects.spec.ts`; README and `docs/design.md`.
  Release `v0.10.0`.
