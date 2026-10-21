## Context

Issue #32: an optional link from a Promptbook project to its campaign in
gdrarchive, so the archive is one click away while prepping. It shows in the
project panel and in the editor's top bar, and opens gdrarchive in a new tab.
Projects without it look as today. Pushing items to gdrarchive ("Send to
gdrarchive", `docs/design.md:544-547`) stays a later feature. The link goes
one way only: nothing of the prep reaches gdrarchive, so players with
gdrarchive access still see no prep (`docs/design.md:27`).

The mockup is
[docs/mockups/gdrarchive-link.html](../../../docs/mockups/gdrarchive-link.html),
approved by the owner on 2026-10-21 (published as a private artifact; the
implementer reads the HTML file, and "The mockup in words" below says what
was approved).

### Owner decisions (2026-10-21, fixed)

- **O1** A full release.
- **O2** Any project may carry a link. An adventure or a one-shot inside a
  Promptbook campaign, with no link of its own, inherits the campaign's.
- **O3** A pasted address: no picker, nothing called on gdrarchive.
- **O4** Stored in the project document.
- **O5** An optional label.

Below, D1 to D9 are the architect's decisions; D10 onward are the plan's,
each with its reason.

### The code today

- **Project metadata.** The layout comment in
  `packages/project/src/doc.ts:30-31` lists the `meta` keys: schema, id,
  title, category, status, campaignId, system, createdAt. No meta key has
  been added since the first release. The rule for later additions is at
  `doc.ts:43-44`: `SCHEMA` stays 1, an older client leaves new parts alone,
  an older document reads them as empty. `SCHEMA = 1` is at `model.ts:5`;
  `ProjectMeta` at `model.ts:19-29`. `readMeta` (`doc.ts:167-185`) distrusts
  every value (`:161-163`). The writers are `setTitle` (`:220`), `setStatus`
  (`:224`) and `setCampaign` (`:230-235`), one transaction each.
- **Writes.** Metadata is written only through Yjs. The REST API has no
  route that changes it (`packages/server/src/routes/projects.ts`).
- **Summary and row.** `Summary` (`summary.ts:9-26`) and `summarize`
  (`:44-85`); `ProjectRow` (`row.ts:7-13`) and `projectRow` (`row.ts:18-31`).
- **Server table.** `projects` in `packages/server/migrations/001_init.sql:35-55`;
  the latest migration is `005_files.sql`. In `packages/server/src/projects.ts`:
  `DbRow` (`:30-48`), `toRow` (`:52-76`), `SELECT` with its campaign join
  (`:81-88`), `summaryParams` (`:122-135`), the `INSERT` of `insertProject`
  (`:155-160`) and the `UPDATE` of `storeProjectDoc` (`:302-307`).
- **Desktop rows.** JSON in SQLite's `projects.summary`
  (`packages/desktop/src/main/store.ts:97-104`, parsed at `:649`): no SQLite
  migration is needed. `refreshRow` (`desktop/src/main/projects.ts:64-84`)
  rebuilds a row from the document with `summarize`. For a downloaded
  document, `apply` keeps the local row and takes only the server's dates
  (`:135-142`).
- **Web panel.** `ProjectPanel.tsx`: `LivePanel` (`:68-154`) reads live meta
  (`:81`); the "In" campaign row is at `:95-99`. `controls.tsx`:
  `StatusSelect` (`:10`), `CampaignSelect` (`:23-49`), `TitleInput` (`:53`).
  The campaign rows come from `ProjectsPage.tsx:92` through `:113-116`.
- **Web top bar.** `project/top.tsx`: `ProjectCrumbs` (`:11-27`) calls
  `useProjects` to find the campaign's title; `ProjectMetaControls`
  (`:29-36`) renders `.top-meta.hide-in-focus`. Both are used in
  `editor/EditorPage.tsx:285-286` and `project/ProjectShell.tsx:29-30`, so
  every view of a project shares them. `useProjects` (`useProjects.ts`)
  fetches the list and polls every 10 s.
- **Existing external links.** `research/ResearchView.tsx:267` and
  `inspiration/InspirationView.tsx:286` use `target="_blank"
rel="noopener noreferrer"`. `ui/icons.tsx:114` has `ExternalIcon`, the
  mockup's icon.
- **Electron.** `packages/desktop/src/main/window.ts:29-32`:
  `setWindowOpenHandler` sends every http or https URL to
  `shell.openExternal` and denies the new window. A `target="_blank"` link
  already opens in the system browser. No change needed.
- **Connector.** `packages/server/src/mcp/tools.ts`: `list_projects`
  (`:210-236`), `get_project` (`:238-276`), which already reads the
  campaign's row (`:247`). No tool updates metadata.
- **Export.** `exportProject` (`packages/project/src/export.ts:248-275`)
  writes `project.json` with the campaign by title. Import reads the note's
  front matter only, never `project.json` (`import.ts`).
- **Helpers.** `isWebUrl` (`model.ts:168-176`); `LIMITS` (`model.ts:127`).
- **gdrarchive.** Campaign pages are `/campaigns/:id`
  (`~/Homelab/gdrarchive/packages/frontend/src/App.tsx:91`). Campaign ids are
  UUIDs (`packages/backend/migrations/003_campaigns.sql:2`, `uuid ...
default gen_random_uuid()`). The public origin is
  `https://gdrarchive.siberio.eu` (`charts/gdrarchive/values-homelab.yaml:37`).

### Corrections to the brief's facts

1. **The schema rule is at `doc.ts:43-44`**, not `:44-45`.
2. **`LIMITS` starts at `model.ts:127`**; `:131` is its `url` entry.
3. **`gdrarchiveOf` needs the campaign's id** to answer `from: { id, title }`:
   its campaign argument is `{ id, title, gdrarchive }` (D4).
4. **`migrations.test.ts:55`** lists every migration after 001 by name: it
   gains `006_gdrarchive.sql`.
5. **Test fixtures that build a `ProjectRow` by hand** gain
   `gdrarchive: null`: `packages/web/test/list.test.ts:13`. The desktop's
   `rowOf` (`desktop/test/unit/helpers.ts:77`) builds through `summarize` and
   needs nothing.
6. **The mockup's example id `12` is not a real id**: gdrarchive's ids are
   UUIDs. The rule accepts both (D2). See Open Questions.

## Goals / Non-Goals

**Goals:**

- One click from any project to its gdrarchive campaign, in the panel and
  the top bar.
- Set once on a campaign, shown on every adventure and one-shot in it.
- Projects without a link look as today, apart from one faint line in the
  panel.

**Non-Goals:**

- A picker over gdrarchive's campaigns, or any call to gdrarchive.
- Links to a gdrarchive session, character or codex entry.
- A connector tool that writes the link.
- Reading the link back on import.

## The mockup in words

The approved mockup has six views. Its project titles, campaign ids and
labels are illustrative.

- **1 · Campaign linked.** In the panel header of the campaign «Kulthos»,
  under the status row, a line holds the link «gdrarchive · Kulthos»: accent
  colour, medium weight, an external-link icon after it, the label cut with
  an ellipsis past about 220 px. Its tooltip is «Opens <url> in a new tab».
  After it, a faint text button «Change…» (title «Change or remove the
  gdrarchive link»). A campaign with a link and no label shows «gdrarchive
  campaign».
- **2 · Inherited.** The adventure «L'Ancora di Sabaoth», in Kulthos, has no
  link of its own. Under its "In" campaign row it shows Kulthos's link, then
  «from campaign Kulthos» in faint type, then «Set its own…» (title «Give
  this adventure a link of its own»). Changing "In" to another campaign or to
  Stand-alone changes what it inherits at once.
- **3 · Editing.** «Change…», «Set its own…» or «Link to gdrarchive…» opens an
  inline form in place of the line, on a slightly raised box:
  - a heading «gdrarchive campaign»;
  - «Address», a URL field, focused on open. Its placeholder is the
    inherited address, else `https://gdrarchive.siberio.eu/campaigns/12`;
  - «Label · optional, a short name», at most 40 characters, placeholder
    «e.g. Kulthos»;
  - a faint preview: «Shows as **gdrarchive · <label>**, opening in a new
    tab.» or «Shows as **gdrarchive campaign**, …»; with the address empty on
    a project that inherits, «Left empty, it keeps the link of campaign
    <title>.»;
  - «Save» (primary), «Cancel», and at the right «Remove link» (danger) only
    when the project has a link of its own. Its title is «Back to the
    campaign's link» when the project's campaign has a link, else «The
    project keeps no link».
  - Enter in either field saves; Escape cancels. A wrong address on Save
    marks the field red (`aria-invalid`) and shows, under it, «Paste a
    gdrarchive campaign address, like
    https://gdrarchive.siberio.eu/campaigns/12» (`role="alert"`, tied to the
    field by `aria-describedby`). The mark clears while typing as soon as the
    address is right. A trailing slash is accepted and dropped.
- **4 · No link.** A stand-alone one-shot with no link: the panel as today,
  plus one faint button «Link to gdrarchive…». The top bar shows nothing.
- **5 · Editor bar.** In the adventure's top bar, the link sits inside
  `.top-meta` after the status menu, as a small pill with a thin accent
  border. It hides in focus mode. When inherited, the crumbs already name
  the campaign, so the mark is in the tooltip only: «From campaign Kulthos.
  Opens <url> in a new tab». It is read-only.
- **6 · One-shot linked.** A stand-alone one-shot with its own link («Serate
  Kulthos») behaves like a campaign's link: «Change…» in the panel, the pill
  in the top bar. Nothing inherits from it. A one-shot placed "In" a
  Promptbook campaign with no link of its own inherits the campaign's,
  exactly like an adventure; its own link, when set, wins.

The mockup's own departures, approved with it:

1. «Remove link» appears only when the project has a link of its own.
2. Saving with the address empty keeps the inherited link, or cancels when
   there is none. With a link of its own, an empty address on Save shows the
   wrong-address message: removing is «Remove link»'s job.
3. The editor's top bar is read-only: the link is edited from the panel.

## Decisions

### D1. Storage: one meta key, set whole (architect)

One new key `gdrarchive` in the `meta` `Y.Map`, a plain JSON value set
whole:

```ts
export interface GdrarchiveLink {
  url: string; // normalised, as parseGdrarchiveUrl answers it
  label: string; // trimmed, '' when there is none
}
```

The value is a `GdrarchiveLink` or `null`. `ProjectMeta` gains
`gdrarchive: GdrarchiveLink | null`. `readMeta` reads a missing key, `null`,
or any invalid value as `null` (D10). The layout comment in `doc.ts:30-31`
gains `gdrarchive` in the `meta` line and a paragraph in the style of the
later entries:

```
// and, from the gdrarchive-link change (its design decision 1), in meta:
//   gdrarchive  { url, label } | null, a plain JSON value set whole
//          (gdrarchive.ts). url and label change together.
```

`SCHEMA` stays 1: an older client leaves the key alone, and an older
document reads it as absent.

**Why:** the owner chose the document (O4), so the link syncs and shows on
the desktop offline. One value set whole keeps the address and its label
together. **Rejected:** two keys (two devices editing at once could pair one
device's address with the other's label); a top-level Y type (the link is
metadata, like the title).

### D2. The address rule (architect)

In a new `packages/project/src/gdrarchive.ts`:

```ts
export const GDRARCHIVE_ORIGIN = "https://gdrarchive.siberio.eu";
export function parseGdrarchiveUrl(input: string): string | null;
```

The input is trimmed, then must be exactly
`${GDRARCHIVE_ORIGIN}/campaigns/<id>`, optionally followed by one `/`. The
id is `[A-Za-z0-9_-]{1,64}`. No query, no fragment, no other path. The answer
is the address without the trailing slash; anything else answers `null`.

The label is trimmed and at most 40 characters (`LIMITS.gdrarchiveLabel`,
counted as `String.length`, as the input's `maxlength` counts); an empty
label is `''`.

**Why:** the link must lead to the archive, and one owner has one archive.
The constant makes a move to another host a one-line change. gdrarchive's
ids are UUIDs, which the id rule accepts. **Rejected:** a configurable host
(nothing to configure for one archive); any https address (the link must be
the archive).

### D3. One writer (architect)

```ts
export function setGdrarchive(doc: Y.Doc, link: GdrarchiveLink | null): void;
```

In `doc.ts`, one transaction. It throws when `parseGdrarchiveUrl(link.url)`
is null or differs from `link.url` (callers pass the normalised address), or
when the label is not trimmed or is longer than 40 characters. `null` sets
the key to `null`. It is allowed for every category, campaigns included.

**Why:** the same shape as `setStatus`: writers refuse what readers would
drop.

### D4. Inheritance in one pure helper (architect)

```ts
export interface ResolvedGdrarchive extends GdrarchiveLink {
  from: { id: string; title: string } | null; // the campaign it comes from
}
export function gdrarchiveOf(
  own: GdrarchiveLink | null,
  category: Category,
  campaign: {
    id: string;
    title: string;
    gdrarchive?: GdrarchiveLink | null;
  } | null,
): ResolvedGdrarchive | null;
```

Own link wins, with `from: null`. Otherwise, for a project that is not a
campaign, with a campaign that has a link: that link, with `from` set.
Otherwise null. A campaign never inherits. The caller passes the campaign
only when it is a live campaign of the user: a row from the list whose
category is `campaign`, the same row the crumbs use.

Callers:

- **Panel:** own from live meta (`useDocValue(doc, readMeta)`), campaign
  from the panel's `campaigns` rows by the live `meta.campaignId`.
- **Top bar:** own from the page's live meta, campaign from the list as
  `ProjectCrumbs` does today (D13).
- **Connector:** own from the document, campaign from its row (D7).

**Why:** one rule, tested once, used by all three. **Rejected:** writing
the campaign's link into each adventure (it would go stale, and adventures
moved between campaigns would carry the old one).

### D5. The list carries each project's own link (architect)

`Summary` gains `gdrarchive: GdrarchiveLink | null`, from `readMeta`, for
every category. `ProjectRow` gets it through `Summary`; `projectRow` passes
it unchanged.

- **Server:** `migrations/006_gdrarchive.sql` adds `gdrarchive_url text` and
  `gdrarchive_label text`, both nullable, to `projects`, with a check that
  both are null or both are set (D11). `summaryParams` gains the two values
  (`label` stored as `''` when the link has none). The `INSERT` of
  `insertProject` and the `UPDATE` of `storeProjectDoc` write them; `SELECT`
  reads them; `toRow` builds `{ url, label }` or `null`.
- **Desktop:** no migration (the row is JSON). `refreshRow` already rebuilds
  the row from `summarize`.

A campaign's row changes on its next store, so an adventure's inherited
link follows within the list's next refresh: `useProjects` polls every 10 s
and refetches when the server stores an open project. Accepted.

**Why:** an adventure must show its campaign's link without opening the
campaign's document. **Rejected:** opening the campaign's document from the
panel and the top bar (a second sync session per view, for one string).

### D6. Web UI, as approved (architect)

- **Panel:** in `LivePanel`'s header, a `GdrarchiveField` under the "In"
  row (or under the status row for a campaign), before «Open». It shows the
  three states of the mockup (own, inherited, none) and switches to the
  inline `GdrarchiveForm` in place. Texts, titles, keys and the error
  message as in "The mockup in words". «Remove link» only for an own link.
- **Top bar:** a read-only `GdrarchiveLink` pill inside `.top-meta`, after
  the status menu, so focus mode hides it. Its title is «Opens <url> in a
  new tab», preceded by «From campaign <title>. » when inherited. No pill
  when there is no link.
- **Links** use `target="_blank" rel="noopener noreferrer"` and the
  `ExternalIcon`, like the research and inspiration links.
- **Desktop:** the window's open handler (`window.ts:29-32`) already sends
  https links to the system browser. No change.

### D7. Connector (architect)

`get_project` gains:

```ts
gdrarchive: { url: string; label: string; inherited: boolean } | null;
```

resolved with `gdrarchiveOf`: own from the document's meta, campaign from
the campaign row it already reads (`tools.ts:247`), only when that row is
not in the bin. `list_projects` is unchanged, to keep it small. No tool
writes the link. The `get_project` description gains one sentence: «gdrarchive
is the gdrarchive campaign the project links to, its own or inherited from
its campaign.»

**Why:** Claude has a GDR Archive connector of its own; the id in the
address lets it look the campaign up there.

### D8. Export (architect)

`project.json` gains `gdrarchive: { url, label }` with the project's own
link, and omits the key when there is none. An inherited link is not
written: the campaign's folder carries it. Import is unchanged: it never
reads `project.json`.

### D9. Tests (architect)

- **`packages/project/test/gdrarchive.test.ts`** (new): `parseGdrarchiveUrl`
  accepts a UUID id and a short id, drops one trailing slash, trims spaces;
  refuses http, another host, `www.`, a query, a fragment, a session path, an
  empty id, a 65-character id, two trailing slashes. `gdrarchiveOf`: own
  wins over the campaign's; an adventure inherits; a one-shot in a campaign
  inherits; a stand-alone project with no link answers null; a campaign
  never inherits; a campaign row with no link (or with the field missing)
  answers null.
- **`packages/project/test/doc.test.ts`:** `readMeta` reads a missing key as
  null and reads null for a string, a wrong host, a label over 40 or not a
  string, a missing label (beside `:52`); `setGdrarchive` sets, changes and
  clears, and throws on an unnormalised address or a long label (beside
  `:60`); a campaign may hold a link (beside `:71`).
- **`packages/project/test/summary.test.ts`** and **`row.test.ts`:** the
  summary and the row carry the own link, for a campaign and an adventure.
- **`packages/project/test/export.test.ts`:** `project.json` has the link
  when set, and no `gdrarchive` key when not.
- **`packages/server/test/db/migrations.test.ts`:** the list at `:55` gains
  `006_gdrarchive.sql`; after migrating, a row with only one of the two
  columns set is refused.
- **`packages/server/test/db/projects.test.ts`** or **`sync.test.ts`**
  (beside `:109`): after a link is stored, `GET /api/projects` shows it;
  after it is cleared, `null`.
- **`packages/server/test/db/mcp.test.ts`** (beside `:316-332`): `get_project`
  answers the own link with `inherited: false`, an adventure's campaign link
  with `inherited: true`, and `null` with no link.
- **`packages/desktop/test/unit/router.test.ts`** (beside `:278`): a row
  rebuilt after a local `setGdrarchive` carries the link.
- **Web unit tests** for the pure helpers of D12 in
  `packages/web/test/gdrarchive.test.ts`.
- **E2E** in `e2e/projects.spec.ts`, on a campaign and an adventure the test
  creates itself (not the seeded «Blacksad - Il Continentale», which other
  tests share): set a labelled link on the campaign from the panel; the
  adventure in it shows «from campaign <title>»; a wrong address shows the
  message; «Set its own…» on the adventure overrides; «Remove link» brings
  back the inherited one; the editor's top bar shows the link with the right
  `href`, `target="_blank"` and the «From campaign» title; a reload keeps it.
  Run normally and with `E2E_CPU_THROTTLE=3` before hand-back.

### D10. What `readMeta` distrusts (plan)

`readGdrarchive(value: unknown): GdrarchiveLink | null` in `gdrarchive.ts`,
used by `readMeta`. It answers the value only when it is an object with a
string `url` for which `parseGdrarchiveUrl(url) === url`, and a string
`label` that is trimmed and at most 40 characters. Anything else is `null`,
whole. **Why:** as D1, every reader distrusts other clients' values; a half
link would show a wrong label or a broken address.

### D11. Both columns or neither (plan)

`006_gdrarchive.sql` adds `check ((gdrarchive_url is null) =
(gdrarchive_label is null))`. **Why:** the database then holds the same
"set whole" rule as the document, and `toRow` needs no third case. Existing
rows read as no link, which is right: no older document has one.

### D12. Pure UI helpers in the web (plan)

`packages/web/src/projects/gdrarchive.ts`, no React:

- `linkText(label)`: «gdrarchive · <label>» or «gdrarchive campaign».
- `linkTitle(link, inBar)`: «Opens <url> in a new tab», with «From campaign
  <title>. » before it in the top bar when inherited.
- `formPreview(address, label, inherited)`: the preview line.
- `saveAction(address, label, own, inherited)`: `'cancel'`, `'invalid'`,
  `'unchanged'` or the `GdrarchiveLink` to write, following the departures
  above. `'unchanged'` closes the form without writing.

The components live in `packages/web/src/projects/GdrarchiveLink.tsx`
(`GdrarchiveLink`, `GdrarchiveField`, `GdrarchiveForm`); styles from the
mockup's `.gdr*` rules in `projects/projects.css` and, for the pill,
`editor/editor.css` beside `.top-meta`. **Why:** the web's unit tests run
without a DOM (`vitest.config.ts`); the texts and the save rule are what
can go wrong. Skipping a write when nothing changed avoids a needless store
and edit time.

### D13. One list fetch for the top bar (plan)

`top.tsx` gains `useCampaignRow(meta): ProjectRow | undefined`, which calls
`useProjects` and answers the row of `meta.campaignId` when its category is
`campaign`. `EditorPage` and `ProjectShell` call it once and pass the row to
`ProjectCrumbs` and `ProjectMetaControls` as a `campaign` prop.
`ProjectCrumbs` stops calling `useProjects` itself. **Why:** two components
each calling `useProjects` would poll the list twice every 10 s. The crumb
also stops naming a project that is not a campaign, which the summary
already treats as stand-alone.

### D14. Focus after the form (plan)

Opening the form focuses «Address». Saving, cancelling or removing puts the
focus on the line's button («Change…», «Set its own…» or «Link to
gdrarchive…») that shows next. **Why:** the focus would otherwise fall to
the page's body when the form goes.

## What is not touched

- **gdrarchive:** no change, no call, no token.
- **Import:** neither the note's front matter nor `project.json` is read for
  a link.
- **The CueBard pack and the PDF.**
- **`list_projects`** and every other connector tool.
- **The desktop's main process:** no code change.

## Risks / Trade-offs

Report it, do not work around it:

- **Electron external links.** Already handled (`window.ts:29-32`): an
  https link with `target="_blank"` goes to `shell.openExternal`. If the
  desktop app opens the link inside its window, or not at all, stop and
  report.
- **The campaign's row lags.** An adventure's inherited link follows its
  campaign on the campaign's next store and the list's next refresh, up to
  about 10 s (D5). Accepted.
- **Rows stored before this change.** Desktop rows in SQLite, and rows from
  a server not yet upgraded, have no `gdrarchive` field. Readers treat a
  missing field as `null` (`gdrarchiveOf`'s `gdrarchive?`); the desktop
  rebuilds a row on the document's next change.
- **gdrarchive's id format.** Ids are UUIDs today, inside
  `[A-Za-z0-9_-]{1,64}`. If gdrarchive moves to slugs with other characters,
  the rule needs a change. Report a real address the rule refuses.
- **gdrarchive moves host.** `GDRARCHIVE_ORIGIN` is one line; stored links
  keep the old host and read as `null` until set again.
- **Edit time.** Setting a link is a change to the project, so it moves up
  in "last edited", as hide-problems D17 accepted.

## Migration Plan

`006_gdrarchive.sql` adds two nullable columns and a check; existing rows
read as no link. `SCHEMA` stays 1; older documents read no link. Release
`v0.10.0`. Rolling back leaves two unused columns and a meta key older code
ignores.

## Settled questions

- **The example in the error message** (architect, 2026-10-21). The approved
  text stays, with `https://gdrarchive.siberio.eu/campaigns/12`. **Why:** it
  reads at a glance; the rule accepts the real UUID ids, and the owner pastes
  an address copied from gdrarchive, never types one.
- **Owner preview** (architect, 2026-10-21). Screenshots published as a
  private page, not a LAN preview: the owner reviews away from this
  machine's browser. Task 3.6's screenshots cover views 1 to 6, light and
  dark, and the merge waits for the owner's go.
