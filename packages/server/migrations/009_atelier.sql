-- Atelier as a second image provider (openspec change atelier-image-provider,
-- D3, D7 and D12).

-- An Atelier API token per account, sealed like the OpenRouter key. 008
-- declared the check inline; Postgres named it user_secrets_kind_check.
alter table user_secrets drop constraint user_secrets_kind_check;
alter table user_secrets add constraint user_secrets_kind_check
  check (kind in ('openrouter', 'atelier'));

-- The service each image was asked of; rows written before read OpenRouter.
alter table image_generations
  add column provider text not null default 'openrouter'
  check (provider in ('openrouter', 'atelier'));

-- The Atelier collection of a project, per account (D7).
create table atelier_collections (
  user_id uuid not null references users on delete cascade,
  project_id uuid not null references projects on delete cascade,
  collection_id uuid not null,
  primary key (user_id, project_id)
);
