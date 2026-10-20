-- The desktop app (openspec change desktop-app, design decision 8): a
-- first-party native client of the authorization server, signing in for the
-- app resource with the scope app, and the computer's name on its grants.

-- A first-party client gets the app resource and nothing else, skips the
-- consent question, and is never swept.
alter table oauth_clients add column first_party boolean not null default false;

-- The computer a desktop grant was made on, shown in Connected apps.
alter table oauth_grants add column device_name text check (length(device_name) <= 80);

alter table oauth_grants drop constraint oauth_grants_scope_check;
alter table oauth_grants add constraint oauth_grants_scope_check check (scope in ('read', 'read_write', 'app'));

-- A public client like every other here; the loopback redirect matches on
-- any port.
insert into oauth_clients (client_id, kind, client_name, redirect_uris, first_party)
values ('promptbook-desktop', 'registered', 'Promptbook desktop', '["http://127.0.0.1/callback"]', true)
on conflict (client_id) do nothing;
