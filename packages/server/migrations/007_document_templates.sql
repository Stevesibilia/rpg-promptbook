-- The account's document templates (openspec change template-editor, design
-- decisions 1 and 2): one row per version, never updated; editing inserts the
-- next version. `body` is the whole template definition, its id and version
-- equal to the row's. Ids are made by the server and never a built-in's.
create table document_templates (
  user_id uuid not null references users(id) on delete cascade,
  id text not null,
  version int not null check (version > 0),
  body jsonb not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, id, version)
);

-- The template a project's document records, from its summary like the
-- gdrarchive link, so a template's projects can be counted. Both set or
-- neither; existing rows read as their kind's built-in until next stored.
alter table projects
  add column template_id text,
  add column template_version int,
  add constraint projects_template_whole check ((template_id is null) = (template_version is null));
