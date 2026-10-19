-- The Claude connector (openspec change connector, design decisions 6 and
-- 7): snapshots of the prep document, and the tables of the OAuth 2.1
-- authorization server behind the MCP endpoint, as gdrarchive's
-- 020_oauth.sql has them.

-- Who is asking: a client registered here (RFC 7591) or one known by its
-- client ID metadata document, cached until metadata_expires_at.
create table oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  kind text not null check (kind in ('registered', 'metadata_document')),
  client_name text not null check (length(client_name) between 1 and 200),
  client_uri text,
  logo_uri text,
  -- The exact strings a redirect is matched against, read whole.
  redirect_uris jsonb not null,
  metadata_expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index oauth_clients_created_at_idx on oauth_clients (created_at);

-- One approval of one client by one user at one scope. Revoking it deletes
-- its codes and tokens; deleting the user deletes it.
create table oauth_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  client_id uuid not null references oauth_clients on delete cascade,
  scope text not null check (scope in ('read', 'read_write')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index oauth_grants_user_id_idx on oauth_grants (user_id);
create index oauth_grants_client_id_idx on oauth_grants (client_id);

-- Codes and tokens are stored as the SHA-256 hex of their value only.
create table oauth_codes (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references oauth_grants on delete cascade,
  code_hash text not null unique,
  redirect_uri text not null,
  code_challenge text not null,
  resource text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index oauth_codes_grant_id_idx on oauth_codes (grant_id);
create index oauth_codes_expires_at_idx on oauth_codes (expires_at);

-- A rotated refresh token keeps its row, with rotated_at, so presenting it
-- again is recognised and revokes the whole grant.
create table oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references oauth_grants on delete cascade,
  kind text not null check (kind in ('access', 'refresh')),
  token_hash text not null unique,
  resource text not null,
  expires_at timestamptz not null,
  rotated_at timestamptz,
  created_at timestamptz not null default now()
);
create index oauth_tokens_grant_id_idx on oauth_tokens (grant_id);
create index oauth_tokens_expires_at_idx on oauth_tokens (expires_at);

-- Dynamic registrations per address, counted for the throttle as
-- login_failures are.
create table oauth_registrations (
  id bigserial primary key,
  ip inet not null,
  at timestamptz not null default now()
);
create index oauth_registrations_ip_at_idx on oauth_registrations (ip, at);

-- Snapshots of a project's prep document, server only. A user snapshot is
-- kept until deleted; claude and restore ones for 30 days (purge).
create table snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  kind text not null check (kind in ('claude', 'user', 'restore')),
  -- user: the name; claude: the target and its title; restore: what was restored.
  label text not null,
  text text not null,
  words integer not null,
  -- claude: replace_section or add_scene, the target it edited, the target's
  -- text before the edit ('' for add_scene) and the SHA-256 hex of its text
  -- right after, which undo checks.
  tool text,
  target text,
  before_section text,
  after_hash text,
  grant_id uuid references oauth_grants on delete set null,
  created_at timestamptz not null default now()
);
create index snapshots_project on snapshots (project_id, created_at desc);
create index snapshots_expiry on snapshots (created_at) where kind <> 'user';
