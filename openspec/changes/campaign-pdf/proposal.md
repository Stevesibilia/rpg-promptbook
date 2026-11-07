## Why

Issue
[Stevesibilia/rpg-promptbook#55](https://github.com/Stevesibilia/rpg-promptbook/issues/55)
asks for a PDF of a campaign's document, with the preview, review, save and
print adventures have. Today a campaign has no PDF button
(`packages/web/src/editor/EditorPage.tsx:62`, `:355`), campaign templates
refuse every PDF option (`packages/format/src/template/schema.ts:223`) and
the layout has one Typst template, for adventures.

The owner agreed the mockup
[docs/mockups/campaign-pdf.html](../../../docs/mockups/campaign-pdf.html),
drawn from the owner's campaign «Prima che arrivi la legge», with these
answers: full release; campaign sections get the per-section PDF options;
the PDF prints the campaign's own sections only, not its linked adventures.

## What Changes

- **A PDF for every project.** Campaigns get the **PDF** button, the preview
  pane, ⌘⇧P, the palette entries, «Save PDF» and «Print…», built in the same
  browser worker as adventures, so the desktop app has it offline.
- **What a campaign's PDF prints.** Every `##` section in document order,
  listed in the template or not, except the appendix and the sections the
  template leaves out. The front matter gives the line above the title, the
  title, the credits line and the footer, as for adventures.
- **A layout for campaigns** (new `campagna.typ`): page 1 with the title
  block and a contents box «In questa campagna» with page numbers; flowing
  sections under the adventure's section heading; sections marked «New
  page» start a page and get an edge tab; `### F1. Name` subheadings get the
  scene's big ID mark; labels, task lists, tables and quotes as in the
  adventure. Paper and ink saver work; there is no pregenerated option.
- **Built-in «Campagna» v2**, following the owner's `campagna-rpg` model,
  with thirteen sections and their PDF options. v1 stays for the projects
  that use it; new campaigns get v2. The template list shows one «Campagna».
- **PDF options for campaign sections.** Campaign templates accept «Printed
  / Left out» and «New page» on every section but the appendix, which never
  prints; «Side column» stays an adventure option. The template editor shows
  the «In the PDF» column for campaigns; the preview marks «not in the PDF»
  and «new page».
- **Connector.** Tool texts say what campaign sections accept;
  `list_templates`, `get_template`, `duplicate_template` and `create_project`
  handle a built-in with two versions.

Out of scope: linked adventures in the campaign's PDF; checks for campaigns
(they stay unchecked); moving a project from campagna@1 to v2 in the app (no
update path exists for built-ins); the status bar counts the mockup's
chrome shows («3 fronts · 3 arcs · 7 threads»); images in the PDF.

## Capabilities

### Modified Capabilities

- `pdf`: the campaign PDF, its layout, tabs and footer; the pane, the review
  options and the layout checks for campaigns.
- `document-templates`: the «In the PDF» column for campaigns; built-ins
  with more than one version.
- `adventure-format`: `campagna` v2; campaign section PDF options; reading a
  campaign's document.
- `editor`: the PDF button and palette entries for campaigns; ID badges in a
  campaign's outline.
- `connector`: template tools with a built-in in two versions; PDF options
  in campaign templates.

## Impact

- `packages/format`: `template/schema.ts`, `template/pdf.ts`,
  `template/campagna.ts`, `template/registry.ts`, `template/changes.ts`,
  `checks/callouts.ts`, new `parse/campaign.ts`, `parse/blocks.ts` and
  `parse/frontmatter.ts` (context types), `index.ts`, a new fixture.
- `packages/layout`: new `src/campaign.ts`, `src/engine.ts`, `src/assets.ts`,
  `src/input.ts` (options type), `src/checks.ts`, `src/index.ts`, new
  `typst/campagna.typ`, `typst/avventura.typ` (helpers moved to top level,
  bytes unchanged).
- `packages/project`: `template.ts`, `skeleton.ts` (comment).
- `packages/web`: the PDF worker, protocol, `usePdf`, `PdfPane`,
  `PdfReview`, `EditorPage`, `palette.ts`, `outline.ts`,
  `TemplatesContext.tsx`, the template list, editor, rows, marks and
  preview.
- `packages/server`: `templates.ts` (usage of projects that record no
  template), `mcp/templates.ts`.
- No database migration. The desktop main process and the server routes do
  not change. Sabaoth's four PDF hashes do not change.
