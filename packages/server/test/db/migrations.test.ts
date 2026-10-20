import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findUserByUsername } from '../../src/accounts/users.js';
import { hashPassword, verifyPassword } from '../../src/accounts/passwords.js';
import { createDb, type Db } from '../../src/db.js';
import { MIGRATIONS, runMigrations } from '../../src/migrate.js';
import { testDatabaseUrl } from './guard.js';
import { db, PASSWORD, seedDesktopClient } from './helpers.js';

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

// A database of its own, stopped at 001 the way a v0.1 server left it, then
// upgraded: the shared one already has every migration.
const url = new URL(testDatabaseUrl());
const name = `${url.pathname.replace(/^\//, '').replace(/_test$/, '')}_upgrade_test`;
const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
const upgradeUrl = new URL(url);
upgradeUrl.pathname = `/${name}`;

async function admin(sql: string): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

let old: Db;

beforeAll(async () => {
  await admin(`drop database if exists ${quote(name)} with (force)`);
  await admin(`create database ${quote(name)}`);
  old = createDb(upgradeUrl.toString());
});

afterAll(async () => {
  await old.close();
  await admin(`drop database if exists ${quote(name)} with (force)`);
});

describe('migrations', () => {
  it('002 keeps a password account signing in, and adds identities beside it', async () => {
    await old.query('create table _migrations (name text primary key, applied_at timestamptz not null default now())');
    await old.query(await readFile(new URL('001_init.sql', MIGRATIONS), 'utf8'));
    await old.query("insert into _migrations (name) values ('001_init.sql')");
    // The account as v0.1 created it.
    await old.query("insert into users (username, display_name, password_hash) values ('steve', 'Stefano', $1)", [
      await hashPassword(PASSWORD),
    ]);

    expect(await runMigrations(old)).toEqual(['002_oidc.sql', '003_connector.sql', '004_desktop.sql', '005_files.sql']);

    const user = await findUserByUsername(old, 'steve');
    expect(user).toMatchObject({ username: 'steve', displayName: 'Stefano' });
    expect(await verifyPassword(user!.passwordHash!, PASSWORD)).toBe(true);
    expect(
      await old.queryOne('select oidc_issuer, oidc_subject, email from users where id = $1', [user!.id]),
    ).toEqual({ oidc_issuer: null, oidc_subject: null, email: null });

    await old.query(
      "insert into users (username, display_name, oidc_issuer, oidc_subject) values ('anna', 'Anna', 'https://idp/', 'a')",
    );
    // One account per identity, and an issuer never without its subject.
    await expect(
      old.query("insert into users (username, display_name, oidc_issuer, oidc_subject) values ('bea', 'Bea', 'https://idp/', 'a')"),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      old.query("insert into users (username, display_name, oidc_issuer) values ('bea', 'Bea', 'https://idp/')"),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('004 seeds the desktop client as the tests do, and takes the app scope and a device name', async () => {
    const columns = 'client_id, kind, client_name, client_uri, redirect_uris, first_party';
    const seeded = await old.query(`select ${columns} from oauth_clients`);
    expect(seeded).toEqual([
      {
        client_id: 'promptbook-desktop',
        kind: 'registered',
        client_name: 'Promptbook desktop',
        client_uri: null,
        redirect_uris: ['http://127.0.0.1/callback'],
        first_party: true,
      },
    ]);
    await seedDesktopClient(db);
    expect(await db.query(`select ${columns} from oauth_clients`)).toEqual(seeded);

    const user = await findUserByUsername(old, 'steve');
    const grant = (scope: string, device: string | null) =>
      old.query(
        `insert into oauth_grants (user_id, client_id, scope, device_name)
         select $1, id, $2, $3 from oauth_clients where client_id = 'promptbook-desktop'`,
        [user!.id, scope, device],
      );
    await grant('app', 'studio-mac');
    await grant('read', null);
    await expect(grant('admin', null)).rejects.toMatchObject({ code: '23514' });
    await expect(grant('app', 'x'.repeat(81))).rejects.toMatchObject({ code: '23514' });
  });
});
