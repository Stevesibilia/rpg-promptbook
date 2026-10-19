-- Single sign-on (openspec change single-sign-on, design decision 3). A
-- password account has a password_hash and no identity; a single sign-on
-- account has an identity, keyed by the token's issuer and subject, and no
-- password. email is shown, never looked up.
alter table users alter column password_hash drop not null;
alter table users add column oidc_issuer text, add column oidc_subject text,
  add column email text;
alter table users add constraint users_oidc_pair
  check ((oidc_issuer is null) = (oidc_subject is null));
create unique index users_oidc_identity on users (oidc_issuer, oidc_subject)
  where oidc_issuer is not null;

-- A sign-in in flight: its own secrets stay here, and the browser that
-- started it holds only a cookie whose SHA-256 is browser_hash.
create table oidc_logins (
  state text primary key,
  browser_hash text not null,
  nonce text not null,
  code_verifier text not null,
  return_to text not null,
  expires_at timestamptz not null
);
