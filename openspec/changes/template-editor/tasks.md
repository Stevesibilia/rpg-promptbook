Two briefs on this branch: **A** builds groups 1 to 5, **B** groups 6 to 9.
Each numbered group is one commit, in Conventional Commits, that leaves
`npm run typecheck` and `npm test` green, with the trailers the brief gives.
The checks are `npm run typecheck`, `npm test` (with `--reporter=default`
when you need passing tests' output) and `npm run e2e`. Prettier only on the
Markdown files you touch (`npx --yes prettier@3 --write <files>`), never on
TypeScript.

## 1. Format: uids, system, changes (brief A)

- [x] 1.1 `template/schema.ts`: optional `uid` on sections, scene fields, callouts, meta keys; optional `system` (adventure) and `copiedFrom` (both kinds) (D7)
- [x] 1.2 `template/changes.ts`: `TemplateChange`, `templateChanges(from, to)` matching by uid, role, then name (D8); exported
- [x] 1.3 Tests: renames by role and by uid, added and removed rows, requirement, form, climax, box places and count, limits, name
- [x] 1.4 Commit `feat(format): template uids and the changes between two templates`

## 2. Project: skeleton, settings, update (brief A)

- [x] 2.1 `settings.ts`: `defaultTemplates` with built-in ids as default (D6)
- [x] 2.2 `skeleton.ts`: the first scene's parts and the strong start's callouts (D9); `system` from the template unless settings set one (D7); kind check (D15)
- [x] 2.3 `update.ts`: `updateEdits` (D10)
- [x] 2.4 Tests: skeletons for both built-ins (update the pinned strings, D9), `updateEdits` on Sabaoth with a renamed strong start and an added section, the kind check
- [x] 2.5 Commit `feat(project): richer starting documents and updates between template versions`

## 3. Server: storage, API, creation (brief A)

- [x] 3.1 `migrations/007_document_templates.sql` (D1)
- [x] 3.2 `templates.ts`: `listTemplates`, `accountTemplates`, id generation (D2, D4); `routes/templates.ts` with the four routes (D3); registered in `app.ts`
- [x] 3.3 `projects.ts`: `template_id`/`template_version` from the summary like gdrarchive (D1); `createProject` with the optional `template` and the default rule (D6); `routes/projects.ts` `createBody`; `seed.ts`
- [x] 3.4 `routes/settings.ts`: `defaultTemplates` optional (D6)
- [x] 3.5 Every server reader passes `accountTemplates` as `extra` (D4): `snapshots.ts`, `mcp/edits.ts`, `mcp/tools.ts`
- [x] 3.6 DB tests: the four routes (409s, kind check, ids), usage counts, creation with and without `template`, `template_unknown`, a settings PUT without `defaultTemplates`, a project on an own template checked by the connector's `get_outline`
- [x] 3.7 Commit `feat(server): account document templates`

## 4. Desktop (brief A)

- [x] 4.1 `router.ts`: `GET /api/templates` cached, writes forwarded, 503 offline (D5)
- [x] 4.2 `create.ts`, `snapshots.ts`: the cached templates; creation follows D6
- [x] 4.3 Tests: cached templates offline, offline create from an own default
- [x] 4.4 Commit `feat(desktop): account templates offline`

## 5. Web data layer (brief A)

- [x] 5.1 `api.ts`: `templates()`, `duplicateTemplate()`, `saveTemplateVersion()`, `deleteTemplate()`; `NewProject.template`
- [x] 5.2 `templates/TemplatesContext.tsx`: `TemplatesProvider`, `useTemplates()` (D4), mounted in the shell
- [x] 5.3 Every web reader passes `extra` (D4); `Editor.tsx` compartments (D14); `ThisScene` and `readAloudOf` degrade (D12); status bar names the template and the not-found case (D13)
- [x] 5.4 Tests: the provider's reload, a reader resolving an own template, the editor keeping undo across a template change
- [x] 5.5 Commit `feat(web): the account's templates reach every reader`
- [x] 5.6 Hand back to the architect (brief A ends)

## 6. The template list (brief B)

- [x] 6.0 Server: `templateUsage` and the delete check count projects in the bin (D17), with a test
- [x] 6.1 `templates/TemplateList.tsx` replaces `DocumentTemplates` in `SettingsPage.tsx`, as "The mockup in words" says; «Make default» saves settings
- [x] 6.2 Commit `feat(web): document template list`

## 7. The template editor (brief B)

- [x] 7.1 `templates/TemplateEditor.tsx` (route `/settings/documents/:id`), its tabs and rows, locks (D11), uids for added items (D7), the preview from `skeletonDocument` (D9), the save bar and save dialog with `templateChanges` (D8), the conflict message, discard on leave (D16)
- [x] 7.2 Commit `feat(web): template editor`

## 8. Projects (brief B)

- [x] 8.1 `NewProjectDialog.tsx`: the Template select (state 9), its preview from the chosen template
- [x] 8.2 Editor top bar «vN available» and the update dialog (state 8), `updateEdits` and `setTemplate` in one transaction, undone in one step (D10, D18)
- [x] 8.3 Commit `feat(web): choose a template and update projects to its latest version`

## 9. Proof and hand-back (brief B)

- [ ] 9.1 `e2e/templates.spec.ts`: duplicate, edit (rename a role section, add a section, require a field), save v2 with a note, a new adventure from it, its PDF prints the renamed strong start, a v3, update the project with both boxes ticked, undo
- [ ] 9.2 `npm run typecheck`, `npm test`, `npm run e2e`: literal results
- [ ] 9.3 Local stack with seeded data and the LAN preview for the owner; wait for the owner's go
- [ ] 9.4 Hand back
