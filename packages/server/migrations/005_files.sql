-- Images and tracks (openspec change asset-board, design decision 4): the
-- bytes are stored once per content, named by their SHA-256, and a project
-- links the files its board lists. Removing a project for good removes its
-- links; the daily sweep removes a file no project links.

create table files (
  sha256 text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
  size bigint not null check (size > 0),
  mime text not null,
  created_at timestamptz not null default now(),
  created_by uuid references users on delete set null
);

create table project_files (
  project_id uuid not null references projects on delete cascade,
  sha256 text not null references files,
  added_at timestamptz not null default now(),
  -- Set by the sweep when the project's document stopped listing the file,
  -- cleared when it lists it again (D6).
  unreferenced_since timestamptz,
  primary key (project_id, sha256)
);

create index project_files_sha on project_files (sha256);
