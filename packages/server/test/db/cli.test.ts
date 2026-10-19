import { describe, expect, it } from 'vitest';
import { hashToken } from '../../src/accounts/sessions.js';
import { verifyPassword } from '../../src/accounts/passwords.js';
import { findUserByUsername } from '../../src/accounts/users.js';
import { runCli, type CliIo } from '../../src/cli.js';
import { runMigrations } from '../../src/migrate.js';
import { db, signedIn, startApp, steve } from './helpers.js';

function io(env: Record<string, string> = {}, answers: string[] = []): CliIo & { lines: string[] } {
  const lines: string[] = [];
  return { env, lines, out: (line) => lines.push(line), askPassword: async () => answers.shift() ?? '' };
}

describe('command line', () => {
  it('migrate reports an up-to-date database', async () => {
    const out = io();
    expect(await runCli(['migrate'], db, out)).toBe(0);
    expect(out.lines).toEqual(['The database is up to date.']);
    expect((await db.query<{ name: string }>('select name from _migrations')).map((r) => r.name)).toEqual([
      '001_init.sql',
    ]);
    expect(await runMigrations(db)).toEqual([]);
  });

  it('user:create takes the password from PROMPTBOOK_PASSWORD', async () => {
    const out = io({ PROMPTBOOK_PASSWORD: 'correct horse battery' });
    expect(await runCli(['user:create', 'steve', '--display-name', 'Stefano Sibilia'], db, out)).toBe(0);
    expect(out.lines).toEqual(['Created the account "steve".']);
    const user = await findUserByUsername(db, 'steve');
    expect(user).toMatchObject({ username: 'steve', displayName: 'Stefano Sibilia' });
    expect(await verifyPassword(user!.passwordHash, 'correct horse battery')).toBe(true);
  });

  it('user:create asks twice when there is no variable, and refuses a mismatch or a short password', async () => {
    expect(await runCli(['user:create', 'anna'], db, io({}, ['a long password', 'a long password']))).toBe(0);
    expect((await findUserByUsername(db, 'anna'))?.displayName).toBe('anna');
    await expect(runCli(['user:create', 'bea'], db, io({}, ['a long password', 'another one']))).rejects.toMatchObject({
      code: 'mismatch',
    });
    await expect(runCli(['user:create', 'bea'], db, io({ PROMPTBOOK_PASSWORD: 'short' }))).rejects.toMatchObject({
      code: 'weak_password',
    });
    await expect(runCli(['user:create', 'ANNA'], db, io({ PROMPTBOOK_PASSWORD: 'a long password' }))).rejects.toMatchObject({
      code: 'username_taken',
    });
  });

  it('user:password sets the password and ends the sessions', async () => {
    await steve();
    const app = await startApp();
    const token = await signedIn(app);
    const out = io({ PROMPTBOOK_PASSWORD: 'a brand new password' });
    expect(await runCli(['user:password', 'Steve'], db, out)).toBe(0);
    expect(out.lines).toEqual(['Set the password of "steve" and ended 1 session(s).']);
    expect(await db.query('select * from sessions where token_hash = $1', [hashToken(token)])).toEqual([]);
    const user = await findUserByUsername(db, 'steve');
    expect(await verifyPassword(user!.passwordHash, 'a brand new password')).toBe(true);
    await expect(runCli(['user:password', 'nobody'], db, out)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('prints the usage for an unknown command', async () => {
    const out = io();
    expect(await runCli(['user:delete', 'steve'], db, out)).toBe(2);
    expect(out.lines[0]).toMatch(/^Usage: cli <command>/);
    expect(await runCli(['user:create'], db, io())).toBe(2);
  });
});
