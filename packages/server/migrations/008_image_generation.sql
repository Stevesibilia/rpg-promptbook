-- Image generation (openspec change board-image-generation, D1 and D11).

-- One OpenRouter key per account, sealed with AES-256-GCM under the server's
-- PROMPTBOOK_SECRETS_KEY; the additional data is "<user_id>/<kind>", so a row
-- copied to another account does not open.
create table user_secrets (
  user_id uuid not null references users on delete cascade,
  kind text not null check (kind in ('openrouter')),
  ciphertext bytea not null,
  iv bytea not null,
  tag bytea not null,
  -- The key's last four characters, shown masked in Settings.
  hint text not null,
  checked_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

-- One row per image asked of OpenRouter, ok or failed (D11).
create table image_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  project_id uuid references projects on delete set null,
  prompt_id text not null,
  model text not null,
  cost numeric(10, 6),
  sha256 text,
  ok boolean not null,
  error text,
  created_at timestamptz not null default now()
);

create index image_generations_user_time on image_generations (user_id, created_at);
create index image_generations_project on image_generations (project_id);
