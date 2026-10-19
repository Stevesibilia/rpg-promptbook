import type { FastifyInstance } from 'fastify';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { allowInsecureRequests } from 'openid-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PUBLIC_ROUTES } from '../../src/accounts/auth.js';
import {
  createOidcProvider,
  findOrCreateOidcUser,
  MAX_PENDING_SIGN_INS,
  safeReturnTo,
  SignInError,
  usernameFor,
} from '../../src/accounts/oidc.js';
import { createUser } from '../../src/accounts/users.js';
import { runCli } from '../../src/cli.js';
import type { Queryable } from '../../src/db.js';
import { hashToken } from '../../src/accounts/sessions.js';
import type { OidcConfig } from '../../src/config.js';
import { db, ORIGIN, PASSWORD, sessionCookie, signedIn, signIn, startApp, steve } from './helpers.js';
import { startIssuer, type FakeIssuer, type Identity, type Tamper } from './oidc-issuer.js';

let issuer: FakeIssuer;

beforeAll(async () => {
  issuer = await startIssuer();
});
afterAll(() => issuer.close());
beforeEach(() => {
  issuer.unavailable = false;
  issuer.requests.length = 0;
});

const oidcConfig = (overrides: Partial<OidcConfig> = {}): OidcConfig => ({
  issuer: issuer.issuer,
  clientId: issuer.clientId,
  clientSecret: issuer.clientSecret,
  providerName: 'Authentik',
  redirectUri: `${ORIGIN}/api/auth/oidc/callback`,
  ...overrides,
});

const insecure = { oidcDiscoveryOptions: { execute: [allowInsecureRequests] } };

const ssoApp = (oidc: Partial<OidcConfig> = {}, config = {}) => startApp({ oidc: oidcConfig(oidc), ...config }, insecure);

const ANNA: Identity = { sub: 'anna-sub', preferred_username: 'Anna', name: 'Anna Rossi', email: 'anna@example.org' };

// The browser's visit to /start: where it is sent, and its pb_oidc cookie.
async function begin(app: FastifyInstance, returnTo = '/projects/1?tab=notes', headers: Record<string, string> = {}) {
  const response = await app.inject({ url: `/api/auth/oidc/start?return_to=${encodeURIComponent(returnTo)}`, headers });
  expect(response.statusCode).toBe(302);
  const cookie = response.cookies.find((c) => c.name === 'pb_oidc');
  return { location: String(response.headers.location), browser: cookie?.value ?? '', cookie };
}

// The provider sending the browser back to the callback.
function callback(app: FastifyInstance, url: string, browser?: string) {
  const back = new URL(url);
  return app.inject({ url: back.pathname + back.search, headers: browser ? { cookie: `pb_oidc=${browser}` } : {} });
}

async function signInAs(app: FastifyInstance, identity: Identity, tamper?: Tamper, returnTo?: string) {
  const { location, browser } = await begin(app, returnTo);
  return callback(app, issuer.approve(location, identity, tamper), browser);
}

const count = async (sql: string, params: unknown[] = []) =>
  Number((await db.queryOne<{ n: string }>(`select count(*) as n from (${sql}) rows`, params))!.n);

const me = (app: FastifyInstance, token: string) =>
  app.inject({ url: '/api/auth/me', headers: { cookie: `pb_session=${token}` } }).then((r) => r.json());

describe('single sign-on: start', () => {
  it('sends the browser to the provider with PKCE, state and nonce, and binds the handshake to it', async () => {
    const app = await ssoApp();
    const { location, browser, cookie } = await begin(app);
    const url = new URL(location);
    expect(url.origin + url.pathname).toBe(new URL('/application/o/authorize/', issuer.issuer).href);
    const params = Object.fromEntries(url.searchParams);
    expect(params).toMatchObject({
      client_id: issuer.clientId,
      response_type: 'code',
      scope: 'openid profile email',
      redirect_uri: `${ORIGIN}/api/auth/oidc/callback`,
      code_challenge_method: 'S256',
    });
    expect(params.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(params.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(params.code_challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);

    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api/auth/oidc', maxAge: 600 });
    expect(cookie!.secure).toBeUndefined();
    expect(browser).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const rows = await db.query<Record<string, unknown>>('select *, expires_at - now() as ttl from oidc_logins');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: params.state, browser_hash: hashToken(browser), return_to: '/projects/1?tab=notes' });
    expect(rows[0]!.nonce).toBe(params.nonce);
    // The verifier stays on the server; only its challenge travels.
    expect(location).not.toContain(String(rows[0]!.code_verifier));
    expect(JSON.stringify(rows)).not.toContain(browser);
  });

  it('names the handshake cookie __Host- behind a trusted HTTPS proxy, and reads only that name there', async () => {
    const app = await ssoApp({}, { trustProxyHops: 1 });
    const https = { 'x-forwarded-proto': 'https' };
    const start = await app.inject({ url: '/api/auth/oidc/start?return_to=/settings', headers: https });
    expect(start.cookies.find((c) => c.name === 'pb_oidc')).toBeUndefined();
    const cookie = start.cookies.find((c) => c.name === '__Host-pb_oidc')!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', secure: true, path: '/', maxAge: 600 });
    expect(cookie.domain).toBeUndefined();
    const back = new URL(issuer.approve(String(start.headers.location), ANNA));
    const url = back.pathname + back.search;

    // The plain name, as a sibling subdomain could set it, is not read.
    const planted = await app.inject({ url, headers: { ...https, cookie: `pb_oidc=${cookie.value}` } });
    expect(planted.headers.location).toBe('/?sign_in=cancelled');
    const response = await app.inject({ url, headers: { ...https, cookie: `__Host-pb_oidc=${cookie.value}` } });
    expect(response.headers.location).toBe('/settings');
    expect(response.cookies.find((c) => c.name === '__Host-pb_oidc')).toMatchObject({ value: '', path: '/', secure: true });
    expect(sessionCookie(response)).not.toBeNull();
  });

  it('caps the sign-ins in flight, and warns about it once a minute', async () => {
    await db.query(
      `insert into oidc_logins (state, browser_hash, nonce, code_verifier, return_to, expires_at)
       select 's' || n, 'h', 'n', 'v', '/', now() + interval '10 minutes' from generate_series(1, $1) n`,
      [MAX_PENDING_SIGN_INS - 1],
    );
    // Expired rows do not count.
    await db.query(
      `insert into oidc_logins (state, browser_hash, nonce, code_verifier, return_to, expires_at)
       values ('old', 'h', 'n', 'v', '/', now() - interval '1 second')`,
    );
    const app = await ssoApp();
    await begin(app);
    const refused = await app.inject({ url: '/api/auth/oidc/start' });
    expect(refused.headers.location).toBe('/?sign_in=unreachable');
    expect(refused.cookies.find((c) => c.name === 'pb_oidc')).toBeUndefined();
    expect(await count('select 1 from oidc_logins where expires_at > now()')).toBe(MAX_PENDING_SIGN_INS);

    const provider = createOidcProvider(db, oidcConfig(), insecure.oidcDiscoveryOptions);
    const errors: unknown[] = [];
    for (let i = 0; i < 2; i++) errors.push(await provider.start('/').catch((error: unknown) => error));
    expect(errors.map((e) => [(e as SignInError).reason, (e as SignInError).log])).toEqual([
      ['unreachable', true],
      ['unreachable', false],
    ]);
  });

  it('keeps a return path only when it stays on this site', async () => {
    for (const kept of ['/', '/projects/1?tab=notes', '/settings/account', '/a//b', '/%E2%82%AC']) {
      expect(safeReturnTo(kept)).toBe(kept);
    }
    for (const refused of [
      undefined,
      ['/x', '/y'],
      '',
      'projects',
      'https://evil.example/',
      '//evil.example/',
      '/\\evil.example',
      '\\\\evil.example',
      '/\t/evil.example',
      '/\n/evil.example',
      '/a b',
      '/€',
      `/${'a'.repeat(2048)}`,
    ]) {
      expect(safeReturnTo(refused)).toBe('/');
    }
    const app = await ssoApp();
    expect((await signInAs(app, ANNA, {}, '//evil.example/x')).headers.location).toBe('/');
    expect((await signInAs(app, ANNA, {}, 'https://evil.example/x')).headers.location).toBe('/');
    expect((await signInAs(app, ANNA, {}, '/settings')).headers.location).toBe('/settings');
  });
});

describe('single sign-on: callback', () => {
  it('creates the account at the first sign-in and returns to where it started', async () => {
    const app = await ssoApp();
    const response = await signInAs(app, ANNA);
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/projects/1?tab=notes');
    expect(response.cookies.find((c) => c.name === 'pb_oidc')).toMatchObject({ value: '', path: '/api/auth/oidc' });
    const token = sessionCookie(response);
    expect(token).not.toBeNull();
    expect(response.cookies.find((c) => c.name === 'pb_session')).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });

    const users = await db.query<Record<string, unknown>>('select * from users');
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      username: 'anna',
      display_name: 'Anna Rossi',
      password_hash: null,
      oidc_issuer: issuer.issuer,
      oidc_subject: 'anna-sub',
      email: 'anna@example.org',
    });
    // Stored as the token says, with Authentik's trailing slash.
    expect(String(users[0]!.oidc_issuer)).toMatch(/\/$/);
    expect(users[0]!.last_login_at).toBeInstanceOf(Date);
    expect(await db.query('select * from oidc_logins')).toEqual([]);

    expect(await me(app, token!)).toEqual({
      user: { id: users[0]!.id, username: 'anna', displayName: 'Anna Rossi', email: 'anna@example.org', signIn: 'oidc' },
    });
  });

  it('signs a returning identity into the same account, whatever its email and username became', async () => {
    const app = await ssoApp();
    const first = sessionCookie(await signInAs(app, ANNA))!;
    const { user } = await me(app, first);
    const again = await signInAs(app, { ...ANNA, preferred_username: 'anna.rossi', name: 'Anna R.', email: 'new@example.org' });
    const token = sessionCookie(again)!;
    expect(token).not.toBe(first);
    expect(await me(app, token)).toEqual({ user: { ...user, email: 'new@example.org' } });
    expect(await count('select 1 from users')).toBe(1);
    expect(await count('select 1 from sessions where user_id = $1', [user.id])).toBe(2);
  });

  it('never matches an account by username or email', async () => {
    const local = await steve();
    const app = await ssoApp();
    const response = await signInAs(app, { sub: 'steve-sub', preferred_username: 'Steve', email: 'steve@example.org' });
    const { user } = await me(app, sessionCookie(response)!);
    expect(user).toMatchObject({ username: 'steve-2', displayName: 'Steve', signIn: 'oidc' });
    expect(user.id).not.toBe(local.id);
    const again = await signInAs(app, { sub: 'other-sub', preferred_username: 'steve' });
    expect((await me(app, sessionCookie(again)!)).user.username).toBe('steve-3');
    // The local account is untouched.
    expect(await db.queryOne('select username, oidc_issuer, email from users where id = $1', [local.id])).toEqual({
      username: 'steve',
      oidc_issuer: null,
      email: null,
    });
  });

  it('makes a username from what the provider sends', async () => {
    expect(usernameFor('  Anna  ')).toBe('anna');
    expect(usernameFor('anna.rossi@example.org')).toBe('anna.rossi-example.org');
    expect(usernameFor('Anna Maria')).toBe('anna-maria');
    expect(usernameFor('Élodie')).toBe('élodie');
    expect(usernameFor('@@@')).toBe('user');
    expect(usernameFor(undefined)).toBe('user');
    expect(usernameFor(42)).toBe('user');
    expect(usernameFor('x'.repeat(80))).toBe('x'.repeat(64));
    const app = await ssoApp();
    await signInAs(app, { sub: 'a' });
    await signInAs(app, { sub: 'b' });
    expect((await db.query<{ username: string }>('select username from users order by username')).map((r) => r.username)).toEqual([
      'user',
      'user-2',
    ]);
  });

  it('creates one account when first sign-ins of an identity race, and distinct ones for one username', async () => {
    // Holds the new-account lock while the sign-ins start, so they all reach
    // it before any of them has created anything.
    async function race(subs: string[]) {
      const holder = await db.pool.connect();
      try {
        await holder.query('begin');
        await holder.query("select pg_advisory_xact_lock(hashtextextended('promptbook-oidc-new-account', 0))");
        const racing = Promise.allSettled(
          subs.map((sub) =>
            db.withTransaction((tx) => findOrCreateOidcUser(tx, { iss: issuer.issuer, sub, preferred_username: 'racer' })),
          ),
        );
        await new Promise((resolve) => setTimeout(resolve, 300));
        await holder.query('commit');
        return await racing;
      } finally {
        holder.release();
      }
    }
    const same = await race(['race', 'race', 'race']);
    expect(same.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
    expect(new Set(same.map((result) => (result as PromiseFulfilledResult<{ id: string }>).value.id)).size).toBe(1);
    const others = await race(['x', 'y', 'z']);
    expect(others.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
    expect((await db.query<{ username: string }>('select username from users order by username')).map((r) => r.username)).toEqual([
      'racer',
      'racer-2',
      'racer-3',
      'racer-4',
    ]);
  });

  it('looks again when a password account takes the free username before the insert', async () => {
    // Creates `racer` from another connection right before the first insert,
    // as user:create could.
    let interfered = false;
    const user = await db.withTransaction((tx) => {
      const racing: Queryable = {
        query: async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
          if (!interfered && sql.includes('insert into users')) {
            interfered = true;
            await createUser(db, { username: 'racer', password: PASSWORD });
          }
          return tx.query<T>(sql, params);
        },
        queryOne: async <T>(sql: string, params?: unknown[]) => (await racing.query<T>(sql, params))[0] ?? null,
      };
      return findOrCreateOidcUser(racing, { iss: issuer.issuer, sub: 'late', preferred_username: 'racer' });
    });
    expect(interfered).toBe(true);
    expect(user).toMatchObject({ username: 'racer-2', signIn: 'oidc' });
    expect((await db.query<{ username: string }>('select username from users order by username')).map((r) => r.username)).toEqual([
      'racer',
      'racer-2',
    ]);
  });

  it('refuses a callback from another browser, and leaves the sign-in in flight', async () => {
    const app = await ssoApp();
    const { location, browser } = await begin(app);
    const back = issuer.approve(location, ANNA);
    const stranger = await begin(app);
    for (const response of [await callback(app, back, stranger.browser), await callback(app, back)]) {
      expect(response.headers.location).toBe('/?sign_in=cancelled');
      expect(sessionCookie(response)).toBeNull();
    }
    expect(await count('select 1 from oidc_logins')).toBe(2);
    expect(await count('select 1 from users')).toBe(0);
    // The browser that started it still finishes it.
    const response = await callback(app, back, browser);
    expect(response.headers.location).toBe('/projects/1?tab=notes');
    expect(sessionCookie(response)).not.toBeNull();
  });

  it('refuses a replayed or expired state', async () => {
    const app = await ssoApp();
    const { location, browser } = await begin(app);
    const back = issuer.approve(location, ANNA);
    expect(sessionCookie(await callback(app, back, browser))).not.toBeNull();
    const replay = await callback(app, back, browser);
    expect(replay.headers.location).toBe('/?sign_in=cancelled');
    expect(sessionCookie(replay)).toBeNull();

    const late = await begin(app);
    await db.query("update oidc_logins set expires_at = now() - interval '1 second'");
    const expired = await callback(app, issuer.approve(late.location, ANNA), late.browser);
    expect(expired.headers.location).toBe('/?sign_in=cancelled');
    expect(sessionCookie(expired)).toBeNull();
    // Used up either way.
    expect(await count('select 1 from oidc_logins')).toBe(0);
    expect(await count('select 1 from sessions')).toBe(1);
  });

  it('answers cancelled to access_denied and failed to any other provider error', async () => {
    const app = await ssoApp();
    const denied = await begin(app);
    const response = await callback(app, issuer.deny(denied.location), denied.browser);
    expect(response.headers.location).toBe('/?sign_in=cancelled');
    expect(response.cookies.find((c) => c.name === 'pb_oidc')?.value).toBe('');
    const broken = await begin(app);
    expect((await callback(app, issuer.deny(broken.location, 'server_error'), broken.browser)).headers.location).toBe(
      '/?sign_in=failed',
    );
    expect(await count('select 1 from oidc_logins')).toBe(0);
    expect(await count('select 1 from sessions')).toBe(0);
    expect(issuer.requests.filter((path) => path.includes('/token/'))).toEqual([]);
  });

  it('answers failed to a bad signature or a wrong nonce, and creates nothing', async () => {
    const app = await ssoApp();
    for (const tamper of [{ signature: true }, { nonce: 'not-the-nonce' }]) {
      const response = await signInAs(app, ANNA, tamper);
      expect(response.headers.location).toBe('/?sign_in=failed');
      expect(sessionCookie(response)).toBeNull();
    }
    expect(await count('select 1 from users')).toBe(0);
    expect(await count('select 1 from sessions')).toBe(0);
  });

  it('answers failed when the code is replayed to the provider', async () => {
    const app = await ssoApp();
    const { location, browser } = await begin(app);
    const back = issuer.approve(location, ANNA);
    // Another handshake of the same browser, carrying a code already spent.
    await callback(app, back, browser);
    const second = await begin(app);
    const state = new URL(second.location).searchParams.get('state')!;
    const replayed = new URL(back);
    replayed.searchParams.set('state', state);
    expect((await callback(app, replayed.href, second.browser)).headers.location).toBe('/?sign_in=failed');
  });
});

describe('single sign-on: provider down', () => {
  it('answers unreachable when discovery fails, and tries again at the next sign-in', async () => {
    const app = await ssoApp();
    issuer.unavailable = true;
    const response = await app.inject({ url: '/api/auth/oidc/start' });
    expect(response.headers.location).toBe('/?sign_in=unreachable');
    expect(response.cookies.find((c) => c.name === 'pb_oidc')).toBeUndefined();
    expect(await count('select 1 from oidc_logins')).toBe(0);
    issuer.unavailable = false;
    expect(sessionCookie(await signInAs(app, ANNA))).not.toBeNull();
    expect(issuer.requests.filter((path) => path.endsWith('openid-configuration'))).toHaveLength(2);
    // Discovered once, then kept.
    await signInAs(app, ANNA);
    expect(issuer.requests.filter((path) => path.endsWith('openid-configuration'))).toHaveLength(2);
  });

  it('answers unreachable when nothing listens at the issuer', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const { port } = closed.address() as AddressInfo;
    await new Promise((resolve) => closed.close(resolve));
    const app = await ssoApp({ issuer: `http://127.0.0.1:${port}/application/o/promptbook/` });
    expect((await app.inject({ url: '/api/auth/oidc/start' })).headers.location).toBe('/?sign_in=unreachable');
  });

  it('answers unreachable when the token exchange gets no answer', async () => {
    const app = await ssoApp();
    const { location, browser } = await begin(app);
    const back = issuer.approve(location, ANNA);
    issuer.unavailable = true;
    const response = await callback(app, back, browser);
    expect(response.headers.location).toBe('/?sign_in=unreachable');
    expect(sessionCookie(response)).toBeNull();
    expect(issuer.requests.at(-1)).toBe('/application/o/token/');
  });

  it('answers unreachable when the provider is gone at the token exchange', async () => {
    const own = await startIssuer();
    try {
      const app = await startApp(
        { oidc: { ...oidcConfig(), issuer: own.issuer, clientId: own.clientId, clientSecret: own.clientSecret } },
        insecure,
      );
      const { location, browser } = await begin(app);
      const back = own.approve(location, ANNA);
      await own.close();
      expect((await callback(app, back, browser)).headers.location).toBe('/?sign_in=unreachable');
    } finally {
      await own.close().catch(() => {});
    }
  });
});

describe('single sign-on: the rest of the API', () => {
  it('answers which sign-in the server offers', async () => {
    const sso = await ssoApp();
    expect((await sso.inject({ url: '/api/auth/config' })).json()).toEqual({
      signIn: 'oidc',
      providerName: 'Authentik',
      issuerHost: new URL(issuer.issuer).host,
    });
    const local = await startApp();
    expect((await local.inject({ url: '/api/auth/config' })).json()).toEqual({ signIn: 'password' });
  });

  it('refuses password sign-in and password change, before any password work', async () => {
    await steve();
    const app = await ssoApp();
    const started = performance.now();
    const response = await signIn(app);
    expect(performance.now() - started).toBeLessThan(50);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'password_sign_in_off',
      message: 'Password sign-in is off: sign in with Authentik.',
    });
    expect(sessionCookie(response)).toBeNull();
    expect(await count('select 1 from login_failures')).toBe(0);
    // Even a body that would not parse is refused the same way.
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: ORIGIN }, payload: {} })).statusCode).toBe(
      403,
    );

    const token = sessionCookie(await signInAs(app, ANNA))!;
    const change = await app.inject({
      method: 'POST',
      url: '/api/auth/password',
      headers: { cookie: `pb_session=${token}`, origin: ORIGIN },
      payload: { current: PASSWORD, next: 'a brand new password' },
    });
    expect(change.statusCode).toBe(403);
    expect(change.json().error).toBe('password_sign_in_off');
  });

  it('with single sign-on off, has no handshake routes and a single sign-on account has no password', async () => {
    const sso = await ssoApp();
    await signInAs(sso, ANNA);
    await steve();
    const app = await startApp();
    expect([...app.routeList].filter((route) => route.includes('/oidc/'))).toEqual([]);
    // Unknown, so behind a session like any route that does not exist.
    expect((await app.inject({ url: '/api/auth/oidc/start' })).statusCode).toBe(401);
    expect((await signIn(app, 'anna', '')).statusCode).toBe(401);
    expect((await signIn(app, 'anna', PASSWORD)).statusCode).toBe(401);
    const token = await signedIn(app);
    expect((await me(app, token)).user).toMatchObject({ username: 'steve', email: null, signIn: 'password' });
  });

  it('lets user:password give a single sign-on account a password for when single sign-on is off', async () => {
    const sso = await ssoApp();
    const { user } = await me(sso, sessionCookie(await signInAs(sso, ANNA))!);
    const io = { env: { PROMPTBOOK_PASSWORD: PASSWORD }, out: () => {}, askPassword: async () => '' };
    expect(await runCli(['user:password', 'anna'], db, io)).toBe(0);

    const off = await startApp();
    const token = await signedIn(off, 'anna');
    expect((await me(off, token)).user.id).toBe(user.id);
    const refused = await signIn(sso, 'anna');
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error).toBe('password_sign_in_off');
  });

  it('keeps every route but the public ones behind a session', async () => {
    const app = await ssoApp();
    const api = [...app.routeList].filter((route) => route.includes(' /api') && !route.startsWith('HEAD '));
    for (const route of PUBLIC_ROUTES) expect(api).toContain(route);
    for (const route of api.filter((r) => !PUBLIC_ROUTES.has(r))) {
      const [method, url] = route.split(' ') as ['GET', string];
      const response = await app.inject({
        method,
        url: url.replace(/:[^/]+/g, '00000000-0000-4000-8000-000000000000'),
        headers: { origin: ORIGIN },
        ...(method === 'GET' ? {} : { payload: {} }),
      });
      expect(`${route} ${response.statusCode}`).toBe(`${route} 401`);
    }
  });
});
