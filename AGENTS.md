# RPG Promptbook: agent instructions

RPG Promptbook is a prep tool for tabletop game masters: an Electron desktop
app (Mac, Linux, Windows) that works offline, a web client, and a server on the
owner's homelab. The design lives in [docs/design.md](docs/design.md); read it
before planning any change. Research behind the decisions is in
[docs/research/](docs/research/), UI mockups in [docs/mockups/](docs/mockups/).

## Repository

- GitHub: `Stevesibilia/rpg-promptbook`, public. Default branch `main`.
- Full name "RPG Promptbook"; inside the app it is just "Promptbook".
- Never use the npm scope `@promptbook`: it belongs to an unrelated project.

## Workflow

- Every change is an OpenSpec change under `openspec/changes/`, on its own
  branch (`feat/<issue>-<slug>`, `fix/…`, `docs/…`), linked to a GitHub issue.
  The proposal is the branch's first commit (`docs(openspec): propose <change>`);
  archiving the change is its last commit, before the merge
  (`chore(openspec): archive <change>`). Nothing goes straight to `main`.
- Two roles: an **architect** session plans, reviews, opens and merges pull
  requests, and cuts releases; an **implementer** session writes code on the
  branch named in the architect's brief, in its own git worktree, and may commit
  and push to that branch only.
- **UI changes start from a mockup** in `docs/mockups/`, agreed with the owner
  before the change is specified or built.
- Commits follow Conventional Commits, with the trailers
  `Refs: Stevesibilia/rpg-promptbook#<n>` (or `Closes:`) and
  `Assisted-by: <agent>/<model-id>`.
- Format Markdown with Prettier on the files you touched only
  (`npx --yes prettier@3 --write <files>`), never the whole `openspec/` tree.

## Language

Code, docs, commits and the UI are in English. Adventure content and the
template's field names (`Luogo e momento`, `[!leggi]`…) are in Italian, as in
the owner's existing adventures.
