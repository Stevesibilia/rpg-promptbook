create table users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  display_name text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index users_username_key on users (lower(username));

create table sessions (
  token_hash text primary key,
  user_id uuid not null references users on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user_idx on sessions (user_id);

create table login_failures (
  id bigserial primary key,
  username text not null,
  ip inet not null,
  at timestamptz not null default now()
);
create index login_failures_at_idx on login_failures (at);

create table user_settings (
  user_id uuid primary key references users on delete cascade,
  settings jsonb not null,
  updated_at timestamptz not null default now()
);

create table projects (
  id uuid primary key,
  owner_id uuid not null references users on delete cascade,
  title text not null,
  category text not null check (category in ('campaign','adventure','one-shot')),
  status text not null check (status in ('draft','in-progress','complete')),
  campaign_id uuid,
  system text not null default '',
  seed text not null default '',
  todo_done int not null default 0,
  todo_total int not null default 0,
  next_due date,
  scenes int,
  words int,
  errors int,
  warnings int,
  created_at timestamptz not null default now(),
  edited_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index projects_owner_idx on projects (owner_id) where deleted_at is null;

-- campaign_id has no foreign key on purpose: it mirrors the document, which
-- may name a campaign in the bin or one that is gone.

create table project_docs (
  project_id uuid primary key references projects on delete cascade,
  state bytea not null,
  updated_at timestamptz not null default now()
);
