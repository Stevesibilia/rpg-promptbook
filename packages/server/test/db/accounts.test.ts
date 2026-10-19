import { describe, expect, it } from 'vitest';
import { PUBLIC_ROUTES } from '../../src/accounts/auth.js';
import { hashToken } from '../../src/accounts/sessions.js';
import { TOO_MANY_ATTEMPTS } from '../../src/accounts/throttle.js';
import { createUser, ensureAdmin, findUserByUsername } from '../../src/accounts/users.js';
import { verifyPassword } from '../../src/accounts/passwords.js';
import { WRONG_CREDENTIALS } from '../../src/routes/auth.js';
import { db, ORIGIN, PASSWORD, sessionCookie, signedIn, signIn, startApp, steve } from './helpers.js';

const cookie = (token: string) => ({ cookie: `pb_session=${token}` });

describe('local accounts', () => {
  it('creates the admin account on first start, and it can sign in', async () => {
    const created = await ensureAdmin(db, { username: 'steve', password: '14-characters!' });
    expect(created?.username).toBe('steve');
    const app = await startApp();
    expect((await signIn(app, 'steve', '14-characters!')).statusCode).toBe(200);
  });

  it('ignores the admin variables once an account exists', async () => {
    await ensureAdmin(db, { username: 'steve', password: '14-characters!' });
    const before = await db.query('select * from users order by username');
    expect(await ensureAdmin(db, { username: 'other', password: 'another password' })).toBeNull();
    expect(await ensureAdmin(db, { username: 'steve', password: 'a new password!' })).toBeNull();
    expect(await db.query('select * from users order by username')).toEqual(before);
  });

  it('compares usernames without case and keeps them unique', async () => {
    await steve();
    await expect(createUser(db, { username: 'Steve', password: PASSWORD })).rejects.toMatchObject({
      code: 'username_taken',
    });
    const app = await startApp();
    expect((await signIn(app, 'STEVE')).statusCode).toBe(200);
  });

  it('wants passwords of at least 12 characters, hashed with Argon2id', async () => {
    await expect(createUser(db, { username: 'steve', password: 'elevenchars' })).rejects.toMatchObject({
      code: 'weak_password',
    });
    await createUser(db, { username: 'steve', password: 'twelve chars' });
    const user = await findUserByUsername(db, 'steve');
    expect(user!.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(user!.passwordHash, 'twelve chars')).toBe(true);
  });
});

describe('sign in and sign out', () => {
  it('sets an httpOnly, SameSite=Lax cookie whose token is stored only as its SHA-256', async () => {
    const user = await steve();
    const app = await startApp();
    const response = await signIn(app);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user: { id: user.id, username: 'steve', displayName: 'Stefano' } });
    const set = response.cookies.find((c) => c.name === 'pb_session')!;
    expect(set).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 720 * 3600 });
    expect(set.secure).toBeUndefined();
    expect(set.value).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const rows = await db.query<{ token_hash: string; expires_at: Date }>('select * from sessions');
    expect(rows.map((r) => r.token_hash)).toEqual([hashToken(set.value)]);
    expect(JSON.stringify(rows)).not.toContain(set.value);
    const days = (rows[0]!.expires_at.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);

    const me = await app.inject({ url: '/api/auth/me', headers: cookie(set.value) });
    expect(me.json()).toEqual({ user: { id: user.id, username: 'steve', displayName: 'Stefano' } });
  });

  it('marks the cookie Secure behind a trusted HTTPS proxy, and follows SESSION_TTL_HOURS', async () => {
    await steve();
    const app = await startApp({ trustProxyHops: 1, sessionTtlHours: 2 });
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN, 'x-forwarded-proto': 'https' },
      payload: { username: 'steve', password: PASSWORD },
    });
    expect(response.cookies.find((c) => c.name === 'pb_session')).toMatchObject({ secure: true, maxAge: 7200 });
    const [row] = await db.query<{ expires_at: Date }>('select expires_at from sessions');
    expect((row!.expires_at.getTime() - Date.now()) / 3_600_000).toBeCloseTo(2, 1);
  });

  it('ignores X-Forwarded-Proto from an untrusted peer', async () => {
    await steve();
    const app = await startApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN, 'x-forwarded-proto': 'https' },
      payload: { username: 'steve', password: PASSWORD },
    });
    expect(response.cookies.find((c) => c.name === 'pb_session')!.secure).toBeUndefined();
  });

  it('answers a wrong password and a wrong username the same, without a cookie', async () => {
    await steve();
    const app = await startApp();
    for (const [username, password] of [
      ['steve', 'not the password'],
      ['nobody', 'not the password'],
    ] as const) {
      const response = await signIn(app, username, password);
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'invalid_credentials', message: 'Wrong username or password.' });
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    expect(WRONG_CREDENTIALS).toBe('Wrong username or password.');
  });

  it('spends about the same time on an unknown username as on a wrong password', async () => {
    await steve();
    const app = await startApp();
    const time = async (username: string) => {
      const times: number[] = [];
      for (let i = 0; i < 3; i++) {
        const start = performance.now();
        await signIn(app, username, 'not the password');
        times.push(performance.now() - start);
      }
      return times.sort((a, b) => a - b)[1]!;
    };
    const wrongPassword = await time('steve');
    const unknown = await time('nobody');
    expect(unknown).toBeGreaterThan(wrongPassword * 0.5);
    expect(unknown).toBeLessThan(wrongPassword * 2);
  });

  it('deletes the session on sign-out, and the next request answers 401', async () => {
    await steve();
    const app = await startApp();
    const token = await signedIn(app);
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { ...cookie(token), origin: ORIGIN } });
    expect(out.statusCode).toBe(204);
    expect(out.cookies.find((c) => c.name === 'pb_session')?.value).toBe('');
    expect(await db.query('select * from sessions')).toEqual([]);
    const next = await app.inject({ url: '/api/settings', headers: cookie(token) });
    expect(next.statusCode).toBe(401);
    expect((await app.inject({ url: '/api/auth/me', headers: cookie(token) })).json()).toEqual({ user: null });
  });

  it('refuses an expired session and deletes it', async () => {
    await steve();
    const app = await startApp();
    const token = await signedIn(app);
    await db.query("update sessions set expires_at = now() - interval '1 second'");
    expect((await app.inject({ url: '/api/settings', headers: cookie(token) })).statusCode).toBe(401);
    expect(await db.query('select * from sessions')).toEqual([]);
  });
});

describe('requests are protected by default', () => {
  it('requires a session on every API route but sign-in, the account check and health', async () => {
    const app = await startApp();
    const api = [...app.routeList].filter((route) => route.includes(' /api') && !route.startsWith('HEAD '));
    expect(api.length).toBeGreaterThan(5);
    const answers: string[] = [];
    for (const route of api.filter((r) => !PUBLIC_ROUTES.has(r))) {
      const [method, url] = route.split(' ') as ['GET', string];
      const response = await app.inject({
        method,
        url: url.replace(/:[^/]+/g, '00000000-0000-4000-8000-000000000000'),
        headers: { origin: ORIGIN },
        ...(method === 'GET' ? {} : { payload: {} }),
      });
      answers.push(`${route} ${response.statusCode}`);
    }
    expect(answers).toEqual(api.filter((r) => !PUBLIC_ROUTES.has(r)).map((r) => `${r} 401`));
    expect([...PUBLIC_ROUTES].sort()).toEqual(['GET /api/auth/me', 'GET /api/health', 'POST /api/auth/login']);
    for (const route of PUBLIC_ROUTES) expect(app.routeList.has(route)).toBe(true);
    expect((await app.inject({ url: '/api/health' })).json()).toEqual({ ok: true, version: 'dev' });
    expect((await app.inject({ url: '/api/auth/me' })).json()).toEqual({ user: null });
    expect((await app.inject({ url: '/api/no-such-route' })).statusCode).toBe(401);
  });

  it('refuses a cross-site write and leaves the state as it was', async () => {
    await steve();
    const app = await startApp();
    const token = await signedIn(app);
    for (const headers of [{ origin: 'https://evil.example' }, { referer: 'https://evil.example/page' }]) {
      const response = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { ...cookie(token), ...headers } });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'cross_origin', message: 'Cross-origin request refused.' });
    }
    const put = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: { ...cookie(token), origin: 'http://localhost:8091' },
      payload: {},
    });
    expect(put.statusCode).toBe(403);
    expect(await db.query('select * from sessions')).toHaveLength(1);
    expect(await db.query('select * from user_settings')).toEqual([]);
  });

  it('refuses a cross-site sign-in', async () => {
    await steve();
    const app = await startApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://evil.example' },
      payload: { username: 'steve', password: PASSWORD },
    });
    expect(response.statusCode).toBe(403);
    expect(sessionCookie(response)).toBeNull();
  });

  it('lets a write with neither Origin nor Referer pass, and a same-origin Referer', async () => {
    await steve();
    const app = await startApp();
    const bare = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'steve', password: PASSWORD } });
    expect(bare.statusCode).toBe(200);
    const token = sessionCookie(bare)!;
    const out = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { ...cookie(token), referer: `${ORIGIN}/settings` },
    });
    expect(out.statusCode).toBe(204);
  });
});

describe('sign-in throttling', () => {
  const fail = (app: Awaited<ReturnType<typeof startApp>>, username = 'steve', ip = '127.0.0.1') =>
    signIn(app, username, 'not the password', ip);

  it('refuses the 11th attempt on one account even with the right password, until the window passes', async () => {
    await steve();
    const app = await startApp();
    for (let i = 0; i < 10; i++) expect((await fail(app, 'steve', `10.0.0.${i + 1}`)).statusCode).toBe(401);
    const refused = await signIn(app, 'steve', PASSWORD, '10.0.1.1');
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toEqual({ error: 'too_many_attempts', message: TOO_MANY_ATTEMPTS });
    expect(TOO_MANY_ATTEMPTS).toMatch(/^Wrong username or password\. .*wait 15 minutes/);
    expect(sessionCookie(refused)).toBeNull();
    // Another account is not affected.
    await createUser(db, { username: 'anna', password: PASSWORD });
    expect((await signIn(app, 'anna', PASSWORD, '10.0.1.1')).statusCode).toBe(200);

    await db.query("update login_failures set at = at - interval '15 minutes 1 second'");
    expect((await signIn(app, 'steve', PASSWORD, '10.0.1.1')).statusCode).toBe(200);
  });

  it('refuses an address after 30 failures across accounts', async () => {
    await steve();
    const app = await startApp();
    for (let i = 0; i < 30; i++) expect((await fail(app, `user${i}`, '10.0.0.9')).statusCode).toBe(401);
    expect((await signIn(app, 'steve', PASSWORD, '10.0.0.9')).statusCode).toBe(429);
    expect((await signIn(app, 'steve', PASSWORD, '10.0.0.10')).statusCode).toBe(200);
  });

  it('gives a successful attempt its place back', async () => {
    await steve();
    const app = await startApp();
    for (let i = 0; i < 9; i++) await fail(app);
    for (let i = 0; i < 3; i++) expect((await signIn(app)).statusCode).toBe(200);
    expect(await db.query('select * from login_failures')).toHaveLength(9);
  });

  it('holds the limit for attempts arriving together', async () => {
    await steve();
    const app = await startApp();
    const answers = await Promise.all(Array.from({ length: 14 }, () => fail(app)));
    const codes = answers.map((a) => a.statusCode).sort();
    expect(codes.filter((c) => c === 401)).toHaveLength(10);
    expect(codes.filter((c) => c === 429)).toHaveLength(4);
  });
});

describe('account settings', () => {
  it('changes the display name', async () => {
    await steve();
    const app = await startApp();
    const token = await signedIn(app);
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/auth/me',
      headers: { ...cookie(token), origin: ORIGIN },
      payload: { displayName: '  Stefano S.  ' },
    });
    expect(response.json().user.displayName).toBe('Stefano S.');
    const empty = await app.inject({
      method: 'PATCH',
      url: '/api/auth/me',
      headers: { ...cookie(token), origin: ORIGIN },
      payload: { displayName: ' ' },
    });
    expect(empty.statusCode).toBe(400);
  });

  it('changes the password with the current one and ends every other session', async () => {
    await steve();
    const app = await startApp();
    const here = await signedIn(app);
    const there = await signedIn(app);
    const change = (current: string, next: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/password',
        headers: { ...cookie(here), origin: ORIGIN },
        payload: { current, next },
      });
    expect((await change('not the password', 'a brand new password')).json()).toMatchObject({ error: 'wrong_password' });
    expect((await change(PASSWORD, 'short')).json()).toMatchObject({ error: 'weak_password' });
    expect((await change(PASSWORD, 'a brand new password')).statusCode).toBe(204);

    expect((await app.inject({ url: '/api/settings', headers: cookie(there) })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/settings', headers: cookie(here) })).statusCode).toBe(200);
    expect((await signIn(app, 'steve', PASSWORD)).statusCode).toBe(401);
    expect((await signIn(app, 'steve', 'a brand new password')).statusCode).toBe(200);
  });
});
