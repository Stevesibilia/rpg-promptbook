import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import pg from 'pg';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The real request and resolver stay reachable, so the address guard can be
// proved by a connection it refuses; a test hands a name the address it needs.
vi.mock('node:https', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:https')>();
  return { ...actual, default: actual, request: vi.fn(actual.request) };
});
vi.mock('node:dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns')>();
  return { ...actual, default: actual, lookup: vi.fn(actual.lookup) };
});

import { hashToken } from '../../src/accounts/sessions.js';
import { safeReturnTo } from '../../src/accounts/oidc.js';
import { createUser } from '../../src/accounts/users.js';
import {
  cacheLifetimeMs,
  clientLimits,
  ipv6Groups,
  isAcceptableRedirectUri,
  isLoopbackOnlyClient,
  isMetadataDocumentId,
  isPublicAddress,
  registrationKey,
  validateRedirectUri,
  type OAuthClient,
} from '../../src/oauth/clients.js';
import { parseScopeParameter, scopeWithin } from '../../src/oauth/config.js';
import {
  issueTokens,
  redeemCode,
  rotateRefreshToken,
  s256,
  sweepExpired,
  TokenError,
  verifyAccessToken,
} from '../../src/oauth/tokens.js';
import { purge } from '../../src/projects.js';
import { db, ORIGIN, PASSWORD, signedIn, startApp, steve, testConfig } from './helpers.js';
import { testDatabaseUrl } from './guard.js';
import {
  approve,
  authorizeParams,
  connect,
  cookie,
  exchange,
  FORM,
  form,
  pkce,
  REDIRECT,
  registerClient,
  RESOURCE,
} from './oauth-helpers.js';

// The setup file loaded the server before the mocks above were registered,
// so the modules that fetch are imported again, fresh, and see them.
let mockRequest: ReturnType<typeof vi.fn>;
let mockLookup: ReturnType<typeof vi.fn>;
let actualLookup: unknown;
let actualRequest: unknown;
let resolveClient: typeof import('../../src/oauth/clients.js').resolveClient;
let buildApp: typeof import('../../src/app.js').buildApp;

beforeAll(async () => {
  vi.resetModules();
  mockRequest = vi.mocked((await import('node:https')).request) as never;
  mockLookup = vi.mocked((await import('node:dns')).lookup) as never;
  actualLookup = (await vi.importActual<typeof import('node:dns')>('node:dns')).lookup;
  actualRequest = (await vi.importActual<typeof import('node:https')>('node:https')).request;
  resolveClient = (await import('../../src/oauth/clients.js')).resolveClient;
  buildApp = (await import('../../src/app.js')).buildApp;
});

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockImplementation(actualRequest as never);
  mockLookup.mockReset();
  mockLookup.mockImplementation(actualLookup as never);
});

const DOCUMENT_URL = 'https://client.example/oauth/client.json';

// The answer the next metadata document fetch gets.
function respondWith(options: { status?: number; headers?: Record<string, string>; body?: string }) {
  mockRequest.mockImplementation(((_options: unknown, callback: (res: unknown) => void) => {
    const res = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string, string> };
    res.statusCode = options.status ?? 200;
    res.headers = options.headers ?? {};
    const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
    req.end = () =>
      setImmediate(() => {
        callback(res);
        res.end(options.body ?? '');
        req.emit('close');
      });
    req.destroy = () => {};
    return req;
  }) as never);
}

const documentBody = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ client_id: DOCUMENT_URL, client_name: 'Example Client', redirect_uris: [REDIRECT], ...overrides });

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

// A second connection holding a write open, so a call made behind it waits
// on the row in Postgres; the holder commits and the call's outcome is the
// proof that it re-checked rather than trusted what it had read.
async function holdRow(sql: string, params: unknown[]) {
  const client = new pg.Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  await client.query('begin');
  await client.query(sql, params);
  return {
    async commit() {
      await client.query('commit');
      await client.end();
    },
    async rollback() {
      await client.query('rollback');
      await client.end();
    },
  };
}

async function waitForLockWait(): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 5000) {
    const row = await db.queryOne<{ n: number }>(
      `select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
    );
    if ((row?.n ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Nothing waited on the lock');
}

async function raceBehind<T>(holder: Awaited<ReturnType<typeof holdRow>>, start: () => Promise<T>) {
  const settled = start().then(
    (value) => ({ value, error: undefined as unknown }),
    (error: unknown) => ({ value: undefined, error }),
  );
  try {
    await waitForLockWait();
    await holder.commit();
  } catch (error) {
    await holder.rollback().catch(() => undefined);
    await settled;
    throw error;
  }
  return settled;
}

function expectInvalidGrant(error: unknown) {
  expect(error).toBeInstanceOf(TokenError);
  expect((error as TokenError).code).toBe('invalid_grant');
}

describe('metadata', () => {
  it('answers the same protected resource document at both paths', async () => {
    const app = await startApp();
    const suffixed = await app.inject({ url: '/.well-known/oauth-protected-resource/api/mcp' });
    const root = await app.inject({ url: '/.well-known/oauth-protected-resource' });
    expect(suffixed.statusCode).toBe(200);
    expect(suffixed.json()).toEqual(root.json());
    expect(suffixed.json()).toEqual({
      resource: RESOURCE,
      authorization_servers: [ORIGIN],
      scopes_supported: ['read', 'read_write'],
      bearer_methods_supported: ['header'],
    });
  });

  it('states every field a client needs to run the flow', async () => {
    const app = await startApp();
    const response = await app.inject({ url: '/.well-known/oauth-authorization-server' });
    expect(response.json()).toEqual({
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/authorize`,
      token_endpoint: `${ORIGIN}/api/oauth/token`,
      registration_endpoint: `${ORIGIN}/api/oauth/register`,
      revocation_endpoint: `${ORIGIN}/api/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['read', 'read_write'],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    });
  });

  it('names the configured origin whatever host the request came in on', async () => {
    const app = await startApp({ publicOrigin: 'https://promptbook.example' });
    const headers = { host: 'evil.example', 'x-forwarded-host': 'evil.example' };
    const server = (await app.inject({ url: '/.well-known/oauth-authorization-server', headers })).json();
    const resource = (await app.inject({ url: '/.well-known/oauth-protected-resource', headers })).json();
    expect(server.issuer).toBe('https://promptbook.example');
    expect(resource.resource).toBe('https://promptbook.example/api/mcp');
  });
});

describe('what a browser-based client may reach cross-origin', () => {
  const permissive = [
    ['GET', '/.well-known/oauth-authorization-server'],
    ['GET', '/.well-known/oauth-protected-resource/api/mcp'],
    ['POST', '/api/oauth/token'],
    ['POST', '/api/oauth/register'],
    ['POST', '/api/oauth/revoke'],
    ['POST', '/api/mcp'],
  ];

  it.each(permissive)('lets a preflight for %s %s through from any origin, without credentials', async (method, url) => {
    const app = await startApp();
    const response = await app.inject({
      method: 'OPTIONS',
      url,
      headers: { origin: 'https://claude.ai', 'access-control-request-method': method },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://claude.ai');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('lets a browser read the 401 challenge of the MCP endpoint', async () => {
    const app = await startApp();
    const response = await app.inject({ method: 'POST', url: '/api/mcp', headers: { origin: 'https://claude.ai' }, payload: {} });
    expect(response.statusCode).toBe(401);
    expect(response.headers['access-control-allow-origin']).toBe('https://claude.ai');
    expect(response.headers['access-control-expose-headers']).toBe('WWW-Authenticate');
  });

  it('answers a metadata read from any origin', async () => {
    const app = await startApp();
    const response = await app.inject({
      url: '/.well-known/oauth-authorization-server',
      headers: { origin: 'https://claude.ai' },
    });
    expect(response.headers['access-control-allow-origin']).toBe('https://claude.ai');
  });

  it('adds no CORS header anywhere else, the consent API included', async () => {
    await steve();
    const app = await startApp();
    const session = await signedIn(app);
    for (const url of ['/api/auth/me', '/api/oauth/authorize', '/api/projects', '/api/auth/grants']) {
      const read = await app.inject({ url, headers: { ...cookie(session), origin: 'https://claude.ai' } });
      expect(read.headers['access-control-allow-origin'], url).toBeUndefined();
      const preflight = await app.inject({
        method: 'OPTIONS',
        url,
        headers: { origin: 'https://claude.ai', 'access-control-request-method': 'POST' },
      });
      expect(preflight.headers['access-control-allow-origin'], url).toBeUndefined();
    }
  });
});

describe('redirect URIs', () => {
  it.each([
    ['https://client.example/callback', true],
    ['http://127.0.0.1:49152/callback', true],
    ['http://[::1]:49152/callback', true],
    ['http://localhost:3000/callback', true],
    ['cursor://anysphere.cursor-retrieval/oauth', false],
    ['http://client.example/callback', false],
    ['javascript:alert(1)', false],
    ['not a url', false],
  ])('%s is acceptable: %s', (uri, ok) => {
    expect(isAcceptableRedirectUri(uri)).toBe(ok);
  });

  const client = (redirectUris: string[]): OAuthClient => ({
    id: 'x',
    clientId: 'x',
    kind: 'registered',
    clientName: 'x',
    clientUri: null,
    redirectUris,
    firstParty: false,
  });

  it('matches exactly, except the port of a loopback URI', () => {
    const c = client(['https://client.example/callback', 'http://127.0.0.1/cb', 'http://localhost/callback']);
    expect(validateRedirectUri(c, 'https://client.example/callback')).toBe(true);
    expect(validateRedirectUri(c, 'https://client.example/callback?x=1')).toBe(false);
    expect(validateRedirectUri(c, 'https://client.example:8443/callback')).toBe(false);
    expect(validateRedirectUri(c, 'https://client.example/other')).toBe(false);
    expect(validateRedirectUri(c, 'http://127.0.0.1:49152/cb')).toBe(true);
    expect(validateRedirectUri(c, 'http://127.0.0.1:49152/other')).toBe(false);
    expect(validateRedirectUri(c, 'http://localhost:49152/callback')).toBe(true);
    expect(validateRedirectUri(c, 'http://localhost.evil.example:49152/callback')).toBe(false);
    expect(validateRedirectUri(c, 'http://[::1]:49152/cb')).toBe(false);
    expect(validateRedirectUri(client(['cursor://x/cb']), 'cursor://x/cb')).toBe(false);
  });

  it('knows a client that can only send the user to their own machine', () => {
    expect(isLoopbackOnlyClient(client(['http://127.0.0.1/cb', 'http://localhost/cb']))).toBe(true);
    expect(isLoopbackOnlyClient(client(['http://127.0.0.1/cb', REDIRECT]))).toBe(false);
  });
});

describe('which addresses the server connects to', () => {
  it.each([
    ['8.8.8.8', true],
    ['1.1.1.1', true],
    ['10.0.0.5', false],
    ['127.0.0.1', false],
    ['169.254.169.254', false],
    ['172.16.0.1', false],
    ['172.31.255.255', false],
    ['172.32.0.1', true],
    ['192.168.1.1', false],
    ['100.64.0.1', false],
    ['0.0.0.0', false],
    ['224.0.0.1', false],
    ['255.255.255.255', false],
    ['2606:4700:4700::1111', true],
    ['::1', false],
    ['::', false],
    ['fd00::1', false],
    ['fe80::1', false],
    ['ff02::1', false],
    ['2001:db8::1', false],
    ['::ffff:127.0.0.1', false],
    ['::ffff:7f00:1', false],
    ['::ffff:8.8.8.8', true],
    ['64:ff9b::a00:5', false],
    ['64:ff9b:1::808:808', false],
    ['2002:c0a8:101::1', false],
    ['2002:808:808::1', false],
    ['2001:0:4136:e378:8000:63bf:3fff:fdd2', false],
    ['2001:4860:4860::8888', true],
    ['::ffff:0:808:808', false],
    ['::10.0.0.5', false],
    ['client.example', false],
  ])('%s is public: %s', (address, ok) => {
    expect(isPublicAddress(address)).toBe(ok);
  });

  it('reads an IPv6 address whichever way its low 32 bits were written', () => {
    expect(ipv6Groups('::ffff:127.0.0.1')).toEqual(ipv6Groups('::ffff:7f00:1'));
    expect(ipv6Groups('[::1]')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(ipv6Groups('1::2::3')).toBeNull();
  });
});

describe('client ID metadata documents', () => {
  it('knows one by its https URL with a path', () => {
    expect(isMetadataDocumentId(DOCUMENT_URL)).toBe(true);
    expect(isMetadataDocumentId('https://client.example/')).toBe(false);
    expect(isMetadataDocumentId('http://client.example/client.json')).toBe(false);
    expect(isMetadataDocumentId('3f1c…')).toBe(false);
  });

  it('caches for max-age up to an hour, and not at all on no-store', () => {
    expect(cacheLifetimeMs(undefined)).toBe(clientLimits.MAX_CACHE_MS);
    expect(cacheLifetimeMs('max-age=60')).toBe(60_000);
    expect(cacheLifetimeMs('public, max-age=999999')).toBe(clientLimits.MAX_CACHE_MS);
    expect(cacheLifetimeMs('no-store')).toBe(0);
  });

  it('takes the client from its document, with the guards set, and caches the row', async () => {
    respondWith({ headers: { 'cache-control': 'max-age=600' }, body: documentBody({ client_uri: 'https://client.example' }) });
    const client = await resolveClient(db, DOCUMENT_URL);
    expect(client).toMatchObject({
      clientId: DOCUMENT_URL,
      kind: 'metadata_document',
      clientName: 'Example Client',
      clientUri: 'https://client.example',
      redirectUris: [REDIRECT],
    });
    const options = mockRequest.mock.calls[0]![0] as Record<string, unknown>;
    expect(options).toMatchObject({
      protocol: 'https:',
      hostname: 'client.example',
      path: '/oauth/client.json',
      headers: { accept: 'application/json', host: 'client.example' },
      timeout: clientLimits.FETCH_TIMEOUT_MS,
    });
    expect(typeof options.lookup).toBe('function');
    const row = await db.queryOne<{ metadata_expires_at: Date }>('select metadata_expires_at from oauth_clients');
    expect(row!.metadata_expires_at.getTime() - Date.now()).toBeGreaterThan(590_000);
    expect(row!.metadata_expires_at.getTime() - Date.now()).toBeLessThanOrEqual(600_000);
    await resolveClient(db, DOCUMENT_URL);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('fetches again once the cache has expired, and on no-store every time', async () => {
    respondWith({ headers: { 'cache-control': 'no-store' }, body: documentBody() });
    await resolveClient(db, DOCUMENT_URL);
    respondWith({ body: documentBody({ client_name: 'Renamed' }) });
    expect((await resolveClient(db, DOCUMENT_URL))?.clientName).toBe('Renamed');
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(await db.query('select id from oauth_clients')).toHaveLength(1);
  });

  it.each([
    ['names a different client_id', { body: documentBody({ client_id: 'https://other.example/c.json' }) }, 'different client_id'],
    ['has no client_name', { body: documentBody({ client_name: '' }) }, 'no client_name'],
    ['has no redirect URI', { body: documentBody({ redirect_uris: [] }) }, 'no redirect_uris'],
    ['declares a plain http redirect', { body: documentBody({ redirect_uris: ['http://client.example/cb'] }) }, 'neither'],
    ['is not JSON', { body: 'not json' }, 'not a JSON object'],
    ['redirects', { status: 302, headers: { location: 'http://10.0.0.5/' } }, 'redirected (302)'],
    ['answers 404', { status: 404 }, 'answered 404'],
    ['is larger than 64 KB', { body: 'x'.repeat(64 * 1024 + 1) }, 'larger than'],
    ['declares a size over 64 KB', { headers: { 'content-length': String(64 * 1024 + 1) }, body: '{}' }, 'larger than'],
  ])('refuses a document that %s', async (_name, response, message) => {
    respondWith(response);
    await expect(resolveClient(db, DOCUMENT_URL)).rejects.toMatchObject({ code: 'invalid_client', message: expect.stringContaining(message) });
    expect(await db.query('select id from oauth_clients')).toEqual([]);
  });

  it('will not connect to a name that resolves to a private address', async () => {
    mockLookup.mockImplementation(((_host: string, _options: unknown, callback: (...args: unknown[]) => void) =>
      callback(null, [{ address: '10.0.0.5', family: 4 }], 4)) as never);
    await expect(resolveClient(db, 'https://internal.example/client.json')).rejects.toMatchObject({
      code: 'invalid_client',
      message: expect.stringContaining('will not connect to'),
    });
    expect(mockLookup).toHaveBeenCalled();
    expect(await db.query('select id from oauth_clients')).toEqual([]);
  });

  it('will not connect to a private address literal, without resolving anything', async () => {
    for (const url of ['https://10.0.0.5/c.json', 'https://[::ffff:127.0.0.1]/c.json', 'https://169.254.169.254/x']) {
      await expect(resolveClient(db, url)).rejects.toMatchObject({ code: 'invalid_client' });
    }
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('refuses an authorization request whose client resolves to a private address, as an invalid client', async () => {
    await steve();
    const app = await buildApp({ config: testConfig(), db });
    try {
      const session = await signedIn(app);
      mockLookup.mockImplementation(((_host: string, _options: unknown, callback: (...args: unknown[]) => void) =>
        callback(null, '10.0.0.5', 4)) as never);
      const { challenge } = pkce();
      const params = authorizeParams('https://internal.example/client.json', challenge);
      const response = await app.inject({
        url: `/api/oauth/authorize?${new URLSearchParams(params)}`,
        headers: cookie(session),
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('invalid_client');
      expect(mockLookup).toHaveBeenCalledWith('internal.example', expect.anything(), expect.any(Function));
      expect(await db.query('select id from oauth_clients')).toEqual([]);
    } finally {
      await app.close();
    }
  });
});

describe('registration', () => {
  it('stores a public client and answers its id, no-store', async () => {
    const app = await startApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/oauth/register',
      headers: { origin: 'https://claude.ai' },
      payload: { client_name: 'Claude', redirect_uris: [REDIRECT], client_uri: 'https://claude.ai', scope: 'read' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.json();
    expect(body).toMatchObject({
      client_name: 'Claude',
      redirect_uris: [REDIRECT],
      client_uri: 'https://claude.ai',
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
    expect(body.client_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).not.toHaveProperty('client_secret');
    expect(await db.query('select client_id, kind from oauth_clients')).toEqual([
      { client_id: body.client_id, kind: 'registered' },
    ]);
  });

  it('keeps a client_uri only when https or loopback, never a logo, and shows the consent page only its host', async () => {
    await steve();
    const app = await startApp();
    const session = await signedIn(app);
    const kept: (string | null)[] = [];
    for (const uri of ['https://claude.ai/about', 'http://127.0.0.1:8080/', 'javascript:alert(1)', 'http://client.example/', 'data:text/html,x']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/oauth/register',
        payload: { client_name: 'C', redirect_uris: [REDIRECT], client_uri: uri, logo_uri: 'https://claude.ai/logo.png' },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).not.toHaveProperty('logo_uri');
      kept.push(response.json().client_uri ?? null);
    }
    expect(kept).toEqual(['https://claude.ai/about', 'http://127.0.0.1:8080/', null, null, null]);
    expect(await db.query(`select id from oauth_clients where logo_uri is not null`)).toEqual([]);
    const clientId = await registerClient(app, { client_uri: 'https://claude.ai/about' });
    const consent = await app.inject({
      url: `/api/oauth/authorize?${new URLSearchParams(authorizeParams(clientId, pkce().challenge))}`,
      headers: cookie(session),
    });
    expect(consent.json().client_host).toBe('claude.ai');
    expect(consent.body).not.toContain('https://claude.ai/about');
  });

  it('counts IPv6 registrations per /64, and an IPv4 address written as IPv6 as itself', async () => {
    const app = await startApp();
    for (let i = 0; i < 30; i++) await registerClient(app, {}, `2001:db8:1:2::${(i + 1).toString(16)}`);
    const sameNetwork = await app.inject({
      method: 'POST',
      url: '/api/oauth/register',
      payload: { client_name: 'Claude', redirect_uris: [REDIRECT] },
      remoteAddress: '2001:db8:1:2:ffff:ffff:ffff:ffff',
    });
    expect(sameNetwork.statusCode).toBe(429);
    await registerClient(app, {}, '2001:db8:1:3::1');
    expect(registrationKey('::ffff:203.0.113.5')).toBe('203.0.113.5');
    expect(registrationKey('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
  });

  it('refuses every registration while 1000 registered clients wait unapproved', async () => {
    const app = await startApp();
    await db.query(
      `insert into oauth_clients (client_id, kind, client_name, redirect_uris)
       select gen_random_uuid()::text, 'registered', 'Waiting', '["https://client.example/callback"]'::jsonb
       from generate_series(1, $1)`,
      [clientLimits.UNAPPROVED_CLIENTS_MAX],
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/oauth/register',
      payload: { client_name: 'Claude', redirect_uris: [REDIRECT] },
      remoteAddress: '198.51.100.20',
    });
    expect(response.statusCode).toBe(429);
    expect(response.json().error).toBe('too_many_registrations');
    expect(await db.query('select id from oauth_registrations')).toEqual([]);
    // Once a day has passed, the sweep makes room again.
    await db.query(`update oauth_clients set created_at = now() - interval '25 hours'`);
    await registerClient(app, {}, '198.51.100.20');
  });

  it('sweeps expired metadata document clients nobody approved, and keeps approved or live ones', async () => {
    const user = await steve();
    const app = await startApp();
    const insert = (clientId: string, expires: string) =>
      db.query(
        `insert into oauth_clients (client_id, kind, client_name, redirect_uris, metadata_expires_at)
         values ($1, 'metadata_document', 'Doc', '[]'::jsonb, now() + $2::interval)`,
        [clientId, expires],
      );
    await insert('https://a.example/c.json', '-1 minute');
    await insert('https://b.example/c.json', '-1 minute');
    await insert('https://c.example/c.json', '1 hour');
    await db.query(
      `insert into oauth_grants (user_id, client_id, scope)
       select $1, id, 'read' from oauth_clients where client_id = 'https://b.example/c.json'`,
      [user.id],
    );
    await registerClient(app);
    const left = await db.query<{ client_id: string }>(`select client_id from oauth_clients where kind = 'metadata_document' order by client_id`);
    expect(left.map((r) => r.client_id)).toEqual(['https://b.example/c.json', 'https://c.example/c.json']);
  });

  it.each([
    ['a client secret method', { token_endpoint_auth_method: 'client_secret_basic' }, 'invalid_client_metadata'],
    ['a plain http redirect', { redirect_uris: ['http://client.example/cb'] }, 'invalid_redirect_uri'],
    ['a custom scheme', { redirect_uris: ['cursor://x/cb'] }, 'invalid_redirect_uri'],
    ['no redirect', { redirect_uris: [] }, 'invalid_client_metadata'],
    ['no name', { client_name: '  ' }, 'invalid_client_metadata'],
    ['a name too long', { client_name: 'x'.repeat(201) }, 'invalid_client_metadata'],
    ['a redirect too long', { redirect_uris: [`https://c.example/${'x'.repeat(2048)}`] }, 'invalid_client_metadata'],
  ])('refuses %s, and counts nothing', async (_name, body, error) => {
    const app = await startApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/oauth/register',
      payload: { client_name: 'Claude', redirect_uris: [REDIRECT], ...body },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe(error);
    expect(await db.query('select id from oauth_clients')).toEqual([]);
    expect(await db.query('select id from oauth_registrations')).toEqual([]);
  });

  it('refuses a body over 8 KB', async () => {
    const app = await startApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/oauth/register',
      payload: { client_name: 'Claude', redirect_uris: [REDIRECT], logo_uri: 'x'.repeat(9000) },
    });
    expect(response.statusCode).toBe(413);
  });

  it('throttles a 31st registration from one address within 15 minutes, and stores nothing for it', async () => {
    const app = await startApp();
    for (let i = 0; i < 30; i++) await registerClient(app, {}, '203.0.113.7');
    const response = await app.inject({
      method: 'POST',
      url: '/api/oauth/register',
      payload: { client_name: 'Claude', redirect_uris: [REDIRECT] },
      remoteAddress: '203.0.113.7',
    });
    expect(response.statusCode).toBe(429);
    expect(response.json().error).toBe('too_many_registrations');
    expect(await db.query('select id from oauth_clients')).toHaveLength(30);
    // Another address is counted on its own.
    await registerClient(app, {}, '203.0.113.8');
    // An old count no longer counts, and purge removes it after a day.
    await db.query(`update oauth_registrations set at = now() - interval '2 days'`);
    await registerClient(app, {}, '203.0.113.7');
    expect((await purge(db)).oauthRegistrations).toBe(31);
  });

  it('throttles a burst at once to exactly 30', async () => {
    const app = await startApp();
    const answers = await Promise.all(
      Array.from({ length: 40 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/oauth/register',
          payload: { client_name: 'Claude', redirect_uris: [REDIRECT] },
          remoteAddress: '203.0.113.9',
        }),
      ),
    );
    expect(answers.filter((a) => a.statusCode === 201)).toHaveLength(30);
    expect(answers.filter((a) => a.statusCode === 429)).toHaveLength(10);
  });

  it('sweeps registered clients nobody approved within a day, and keeps approved ones', async () => {
    const user = await steve();
    const app = await startApp();
    const unused = await registerClient(app);
    const approved = await registerClient(app);
    await db.query(
      `insert into oauth_grants (user_id, client_id, scope)
       select $1, id, 'read' from oauth_clients where client_id = $2`,
      [user.id, approved],
    );
    await db.query(`update oauth_clients set created_at = now() - interval '25 hours'`);
    const fresh = await registerClient(app);
    const left = await db.query<{ client_id: string }>('select client_id from oauth_clients order by client_id');
    expect(left.map((r) => r.client_id).sort()).toEqual([approved, fresh].sort());
    expect(left.map((r) => r.client_id)).not.toContain(unused);
  });
});

describe('the consent API', () => {
  async function setup() {
    await steve();
    const app = await startApp();
    const session = await signedIn(app);
    const clientId = await registerClient(app);
    const { verifier, challenge } = pkce();
    return { app, session, clientId, verifier, challenge };
  }

  it('answers the client, where the user would be sent and what was asked', async () => {
    const { app, session, clientId, challenge } = await setup();
    const response = await app.inject({
      url: `/api/oauth/authorize?${new URLSearchParams(authorizeParams(clientId, challenge))}`,
      headers: cookie(session),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      client_name: 'Claude',
      client_host: null,
      redirect_host: 'client.example',
      loopback_only: false,
      requested_scopes: ['read', 'read_write'],
      first_party: false,
    });
  });

  it('says when the client can only run on the user’s machine, and reads no scope as read', async () => {
    const { app, session, challenge } = await setup();
    const loopback = await registerClient(app, { redirect_uris: ['http://127.0.0.1/callback'] });
    const params = authorizeParams(loopback, challenge, { redirect_uri: 'http://127.0.0.1:51234/callback' });
    delete (params as Partial<typeof params>).scope;
    const response = await app.inject({ url: `/api/oauth/authorize?${new URLSearchParams(params)}`, headers: cookie(session) });
    expect(response.json()).toMatchObject({ loopback_only: true, redirect_host: '127.0.0.1:51234', requested_scopes: ['read'] });
  });

  it('needs a session', async () => {
    const { app, clientId, challenge } = await setup();
    const query = new URLSearchParams(authorizeParams(clientId, challenge));
    expect((await app.inject({ url: `/api/oauth/authorize?${query}` })).statusCode).toBe(401);
    const post = await app.inject({
      method: 'POST',
      url: '/api/oauth/authorize',
      headers: { origin: ORIGIN },
      payload: { ...authorizeParams(clientId, challenge), granted_scope: 'read' },
    });
    expect(post.statusCode).toBe(401);
  });

  const refusals: [string, Record<string, string | undefined>, string][] = [
    ['an unknown response type', { response_type: 'token' }, 'unsupported_response_type'],
    ['plain PKCE', { code_challenge_method: 'plain' }, 'invalid_request'],
    ['no challenge', { code_challenge: undefined }, 'invalid_request'],
    ['a challenge over 256 characters', { code_challenge: 'x'.repeat(257) }, 'invalid_request'],
    ['another resource', { resource: 'https://other.example/api/mcp' }, 'invalid_target'],
    ['no resource', { resource: undefined }, 'invalid_request'],
    ['an unknown scope', { scope: 'read admin' }, 'invalid_scope'],
    ['an undeclared redirect URI', { redirect_uri: 'https://client.example/other' }, 'invalid_request'],
    ['an unknown client', { client_id: '00000000-0000-4000-8000-000000000000' }, 'invalid_client'],
  ];

  it.each(refusals)('refuses %s without a redirect', async (_name, overrides, error) => {
    const { app, session, clientId, challenge } = await setup();
    const params = Object.fromEntries(
      Object.entries({ ...authorizeParams(clientId, challenge), ...overrides }).filter(([, v]) => v !== undefined),
    ) as Record<string, string>;
    const read = await app.inject({ url: `/api/oauth/authorize?${new URLSearchParams(params)}`, headers: cookie(session) });
    expect(read.statusCode).toBe(400);
    expect(read.json().error).toBe(error);
    for (const url of ['/api/oauth/authorize', '/api/oauth/authorize/deny']) {
      const post = await app.inject({
        method: 'POST',
        url,
        headers: { ...cookie(session), origin: ORIGIN },
        payload: { ...params, granted_scope: 'read' },
      });
      expect(post.statusCode, url).toBe(400);
      expect(post.json().error, url).toBe(error);
      expect(post.json()).not.toHaveProperty('redirect_to');
    }
    expect(await db.query('select id from oauth_grants')).toEqual([]);
    expect(await db.query('select id from oauth_codes')).toEqual([]);
  });

  it('refuses a repeated parameter rather than picking one', async () => {
    const { app, session, clientId, challenge } = await setup();
    const query = `${new URLSearchParams(authorizeParams(clientId, challenge))}&redirect_uri=${encodeURIComponent('https://evil.example/cb')}`;
    const response = await app.inject({ url: `/api/oauth/authorize?${query}`, headers: cookie(session) });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_request');
  });

  it('approves: a grant at the granted scope for the signed-in user, a code stored as a digest, and the redirect', async () => {
    const { app, session, clientId, challenge } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/oauth/authorize',
      headers: { ...cookie(session), origin: ORIGIN },
      payload: { ...authorizeParams(clientId, challenge), granted_scope: 'read' },
    });
    expect(response.statusCode).toBe(200);
    const target = new URL(response.json().redirect_to);
    expect(`${target.origin}${target.pathname}`).toBe(REDIRECT);
    expect(target.searchParams.get('state')).toBe('state-123');
    expect(target.searchParams.get('iss')).toBe(ORIGIN);
    const code = target.searchParams.get('code')!;
    expect(code).toMatch(/^pb_ac_[A-Za-z0-9_-]{43}$/);
    const grants = await db.query<{ scope: string; user_id: string }>(
      'select g.scope, u.username from oauth_grants g join users u on u.id = g.user_id',
    );
    expect(grants).toEqual([{ scope: 'read', username: 'steve' }]);
    const codes = await db.query<{ code_hash: string; resource: string; redirect_uri: string; code_challenge: string }>(
      'select code_hash, resource, redirect_uri, code_challenge from oauth_codes',
    );
    expect(codes).toEqual([{ code_hash: hashToken(code), resource: RESOURCE, redirect_uri: REDIRECT, code_challenge: challenge }]);
    expect(JSON.stringify(await db.query('select * from oauth_codes'))).not.toContain(code);
  });

  it('refuses a granted scope wider than requested', async () => {
    const { app, session, clientId, challenge } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/oauth/authorize',
      headers: { ...cookie(session), origin: ORIGIN },
      payload: { ...authorizeParams(clientId, challenge, { scope: 'read' }), granted_scope: 'read_write' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_scope');
    expect(await db.query('select id from oauth_grants')).toEqual([]);
  });

  it('refuses an approval from another origin, cookie and all, and records nothing', async () => {
    const { app, session, clientId, challenge } = await setup();
    for (const headers of [{ origin: 'https://evil.example' }, { referer: 'https://evil.example/page' }]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/oauth/authorize',
        headers: { ...cookie(session), ...headers },
        payload: { ...authorizeParams(clientId, challenge), granted_scope: 'read_write' },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe('cross_origin');
    }
    expect(await db.query('select id from oauth_grants')).toEqual([]);
  });

  it('denies: access_denied at the redirect URI with the state and the issuer, and nothing recorded', async () => {
    const { app, session, clientId, challenge } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/oauth/authorize/deny',
      headers: { ...cookie(session), origin: ORIGIN },
      payload: authorizeParams(clientId, challenge),
    });
    expect(response.statusCode).toBe(200);
    const target = new URL(response.json().redirect_to);
    expect(Object.fromEntries(target.searchParams)).toEqual({ error: 'access_denied', state: 'state-123', iss: ORIGIN });
    expect(await db.query('select id from oauth_grants')).toEqual([]);
    expect(await db.query('select id from oauth_codes')).toEqual([]);
  });

  it('keeps a realistic authorize address through the single sign-on round trip', () => {
    // What claude.ai sends, with a metadata document client_id and a long
    // state, as the sign-in page passes it in return_to (path and query).
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: 'https://claude.ai/oauth/mcp-oauth-client-metadata',
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      code_challenge: pkce().challenge,
      code_challenge_method: 'S256',
      state: 'x'.repeat(256),
      scope: 'read read_write',
      resource: 'https://promptbook.siberio.eu/api/mcp',
    });
    const returnTo = `/authorize?${params}`;
    expect(returnTo.length).toBeLessThan(2048);
    expect(safeReturnTo(returnTo)).toBe(returnTo);
  });
});

describe('the token endpoint', () => {
  async function codeFor(scope: 'read' | 'read_write' = 'read_write') {
    await steve();
    const app = await startApp();
    const session = await signedIn(app);
    const clientId = await registerClient(app);
    const { verifier, challenge } = pkce();
    const code = await approve(app, session, authorizeParams(clientId, challenge), scope);
    const fields = { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier };
    return { app, session, clientId, code, verifier, fields };
  }

  it('exchanges a code for a pair bound to the resource, stored as digests, no-store', async () => {
    const { app, fields } = await codeFor('read');
    const response = await exchange(app, fields);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.json();
    expect(body).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'read' });
    expect(body.access_token).toMatch(/^pb_at_/);
    expect(body.refresh_token).toMatch(/^pb_rt_/);
    const rows = await db.query<{ kind: string; token_hash: string; resource: string }>(
      'select kind, token_hash, resource from oauth_tokens order by kind',
    );
    expect(rows).toEqual([
      { kind: 'access', token_hash: hashToken(body.access_token), resource: RESOURCE },
      { kind: 'refresh', token_hash: hashToken(body.refresh_token), resource: RESOURCE },
    ]);
    const codes = await db.query<{ spent_at: Date | null }>('select spent_at from oauth_codes');
    expect(codes).toHaveLength(1);
    expect(codes[0]!.spent_at).not.toBeNull();
  });

  it('spends a code once, even when the first redemption failed', async () => {
    const { app, fields } = await codeFor();
    expect((await exchange(app, { ...fields, code_verifier: 'wrong-verifier' })).json().error).toBe('invalid_grant');
    const again = await exchange(app, fields);
    expect(again.statusCode).toBe(400);
    expect(again.json().error).toBe('invalid_grant');
  });

  it('refuses a code exchanged a second time, and revokes the grant it was issued under', async () => {
    const { app, fields } = await codeFor();
    const first = await exchange(app, fields);
    expect(first.statusCode).toBe(200);
    const { access_token: access, refresh_token: refresh } = first.json();
    expect(await verifyAccessToken(db, access, RESOURCE)).not.toBeNull();
    const second = await exchange(app, fields);
    expect(second.statusCode).toBe(400);
    expect(second.json().error).toBe('invalid_grant');
    expect(second.json().error_description).toContain('already been used');
    expect(await verifyAccessToken(db, access, RESOURCE)).toBeNull();
    expect(await db.query('select id from oauth_grants')).toEqual([]);
    const refreshed = await exchange(app, { grant_type: 'refresh_token', refresh_token: refresh, client_id: fields.client_id });
    expect(refreshed.json().error).toBe('invalid_grant');
  });

  it('leaves the grant alone when another client replays a spent code', async () => {
    const { app, fields } = await codeFor();
    expect((await exchange(app, fields)).statusCode).toBe(200);
    const other = await exchange(app, { ...fields, client_id: '00000000-0000-4000-8000-000000000000' });
    expect(other.json()).toEqual({ error: 'invalid_grant', error_description: 'That authorization code is not valid.' });
    expect(await db.query('select id from oauth_grants')).toHaveLength(1);
  });

  it('answers a code that never existed as not valid, and revokes nothing', async () => {
    const { app, fields } = await codeFor();
    const response = await exchange(app, { ...fields, code: 'pb_ac_never-issued' });
    expect(response.json()).toEqual({ error: 'invalid_grant', error_description: 'That authorization code is not valid.' });
    expect(await db.query('select id from oauth_grants')).toHaveLength(1);
  });

  it.each([
    ['another client', { client_id: '00000000-0000-4000-8000-000000000000' }],
    ['another redirect URI', { redirect_uri: 'https://client.example/other' }],
    ['another resource', { resource: 'https://other.example/api/mcp' }],
    ['a wrong verifier', { code_verifier: 'a-wrong-verifier-of-a-decent-length-0123456789' }],
  ])('refuses %s', async (_name, overrides) => {
    const { app, fields } = await codeFor();
    const response = await exchange(app, { ...fields, ...overrides });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_grant');
    expect(response.body).not.toContain(fields.code);
    expect(await db.query('select id from oauth_tokens')).toEqual([]);
  });

  it('refuses an expired code', async () => {
    const { app, fields } = await codeFor();
    await db.query(`update oauth_codes set expires_at = now() - interval '1 second'`);
    expect((await exchange(app, fields)).json().error).toBe('invalid_grant');
  });

  it('takes the MCP resource when the client names none, and the same when it names it', async () => {
    const { app, fields } = await codeFor();
    expect((await exchange(app, { ...fields, resource: RESOURCE })).statusCode).toBe(200);
  });

  it.each(['code', 'redirect_uri', 'client_id', 'code_verifier'])('refuses a request with no %s', async (name) => {
    const { app, fields } = await codeFor();
    const partial = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== name));
    const response = await exchange(app, partial);
    expect(response.json().error).toBe('invalid_request');
  });

  it('refuses a grant type it does not implement', async () => {
    const app = await startApp();
    const response = await exchange(app, { grant_type: 'client_credentials' });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('unsupported_grant_type');
  });

  it('takes form-encoded bodies only', async () => {
    const { app, fields } = await codeFor();
    const json = await app.inject({ method: 'POST', url: '/api/oauth/token', payload: fields });
    expect(json.statusCode).toBe(400);
    expect(json.json().error).toBe('invalid_request');
    const text = await app.inject({
      method: 'POST',
      url: '/api/oauth/token',
      headers: { 'content-type': 'text/plain' },
      payload: form(fields),
    });
    expect(text.statusCode).toBe(400);
    expect(text.json().error).toBe('invalid_request');
    const xml = await app.inject({
      method: 'POST',
      url: '/api/oauth/token',
      headers: { 'content-type': 'application/xml' },
      payload: '<x/>',
    });
    expect(xml.statusCode).toBe(415);
    expect(xml.json().error).toBe('invalid_request');
    // The code was not spent by either.
    expect((await exchange(app, fields)).statusCode).toBe(200);
  });

  it('refuses a parameter sent twice rather than picking one', async () => {
    const { app, fields } = await codeFor();
    const response = await app.inject({
      method: 'POST',
      url: '/api/oauth/token',
      headers: FORM,
      payload: `${form(fields)}&redirect_uri=${encodeURIComponent('https://evil.example/cb')}`,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_request' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('refuses a body over 8 KB', async () => {
    const app = await startApp();
    const response = await exchange(app, { grant_type: 'refresh_token', refresh_token: 'x'.repeat(9000), client_id: 'c' });
    expect(response.statusCode).toBe(413);
  });

  it('is handled on its merits from another origin, and never reads the cookie', async () => {
    const { app, session, fields } = await codeFor();
    await db.query('delete from sessions');
    const response = await app.inject({
      method: 'POST',
      url: '/api/oauth/token',
      headers: { ...FORM, origin: 'https://evil.example', ...cookie(session) },
      payload: form(fields),
    });
    expect(response.statusCode).toBe(200);
    // A cookie the auth hook had read would have been cleared as gone.
    expect(response.headers['set-cookie']).toBeUndefined();
    for (const url of ['/api/oauth/register', '/api/oauth/revoke']) {
      const other = await app.inject({
        method: 'POST',
        url,
        headers: { origin: 'https://evil.example', ...cookie(session), ...(url.endsWith('revoke') ? FORM : {}) },
        ...(url.endsWith('revoke') ? { payload: form({ token: 'pb_at_x' }) } : { payload: { client_name: 'C', redirect_uris: [REDIRECT] } }),
      });
      expect(other.statusCode, url).toBeLessThan(300);
      expect(other.headers['set-cookie'], url).toBeUndefined();
    }
  });

  it('sweeps expired codes and tokens on each request', async () => {
    const { app, fields } = await codeFor();
    const pair = (await exchange(app, fields)).json();
    await db.query(`update oauth_tokens set expires_at = now() - interval '1 second' where kind = 'access'`);
    await exchange(app, { grant_type: 'nonsense' });
    expect(await db.query<{ kind: string }>('select kind from oauth_tokens')).toEqual([{ kind: 'refresh' }]);
    expect(pair.refresh_token).toBeTruthy();
  });
});

describe('refresh', () => {
  async function connected() {
    await steve();
    const app = await startApp();
    const session = await signedIn(app);
    const tokens = await connect(app, session, 'read');
    const refresh = (token = tokens.refresh_token, extra: Record<string, string> = {}) =>
      exchange(app, { grant_type: 'refresh_token', refresh_token: token, client_id: tokens.clientId, ...extra });
    return { app, session, tokens, refresh };
  }

  it('rotates the refresh token and issues a new pair at the grant’s scope', async () => {
    const { tokens, refresh } = await connected();
    const response = await refresh();
    expect(response.statusCode).toBe(200);
    const next = response.json();
    expect(next.refresh_token).not.toBe(tokens.refresh_token);
    expect(next.access_token).not.toBe(tokens.access_token);
    expect(next.scope).toBe('read');
    const old = await db.queryOne<{ rotated_at: Date | null }>('select rotated_at from oauth_tokens where token_hash = $1', [
      hashToken(tokens.refresh_token),
    ]);
    expect(old!.rotated_at).not.toBeNull();
    expect((await refresh(next.refresh_token)).statusCode).toBe(200);
  });

  it('revokes the whole grant when a rotated token comes back', async () => {
    const { tokens, refresh } = await connected();
    const next = (await refresh()).json();
    const reuse = await refresh();
    expect(reuse.statusCode).toBe(400);
    expect(reuse.json().error).toBe('invalid_grant');
    expect(reuse.json().error_description).toContain('already been exchanged');
    expect(await db.query('select id from oauth_grants')).toEqual([]);
    expect(await db.query('select id from oauth_tokens')).toEqual([]);
    expect((await refresh(next.refresh_token)).json().error).toBe('invalid_grant');
    expect(await verifyAccessToken(db, next.access_token, RESOURCE)).toBeNull();
    expect(await verifyAccessToken(db, tokens.access_token, RESOURCE)).toBeNull();
  });

  it('refuses one presented by another client, without revoking', async () => {
    const { refresh } = await connected();
    const response = await refresh(undefined, { client_id: '00000000-0000-4000-8000-000000000000' });
    expect(response.json().error).toBe('invalid_grant');
    expect(await db.query('select id from oauth_grants')).toHaveLength(1);
  });

  it('refuses a rotated token presented by another client, and leaves the grant alone', async () => {
    const { tokens, refresh } = await connected();
    const next = (await refresh()).json();
    const response = await refresh(tokens.refresh_token, { client_id: '00000000-0000-4000-8000-000000000000' });
    expect(response.json()).toEqual({
      error: 'invalid_grant',
      error_description: 'That refresh token was issued to a different client.',
    });
    expect(await db.query('select id from oauth_grants')).toHaveLength(1);
    expect(await verifyAccessToken(db, next.access_token, RESOURCE)).not.toBeNull();
  });

  it('refuses one presented for another resource', async () => {
    const { refresh } = await connected();
    expect((await refresh(undefined, { resource: 'https://other.example/api/mcp' })).json().error).toBe('invalid_grant');
  });

  it('refuses an expired one and drops its row', async () => {
    const { tokens, refresh } = await connected();
    await db.query(`update oauth_tokens set expires_at = now() - interval '1 second' where kind = 'refresh'`);
    expect((await refresh()).json().error).toBe('invalid_grant');
    expect(await db.query('select id from oauth_tokens where token_hash = $1', [hashToken(tokens.refresh_token)])).toEqual([]);
  });

  it('refuses a refresh token another presentation retired first, and revokes the grant', async () => {
    const { tokens } = await connected();
    const row = await db.queryOne<{ id: string; grant_id: string }>(
      `select id, grant_id from oauth_tokens where kind = 'refresh'`,
    );
    const holder = await holdRow('update oauth_tokens set rotated_at = now() where id = $1', [row!.id]);
    const outcome = await raceBehind(holder, () =>
      rotateRefreshToken(db, { refreshToken: tokens.refresh_token, clientId: tokens.clientId }),
    );
    expectInvalidGrant(outcome.error);
    expect(await db.query('select id from oauth_grants')).toEqual([]);
  });

  it('refuses a code another redemption spent first, and revokes the grant as a replay', async () => {
    await steve();
    const app = await startApp();
    const session = await signedIn(app);
    const clientId = await registerClient(app);
    const { verifier, challenge } = pkce();
    const code = await approve(app, session, authorizeParams(clientId, challenge), 'read');
    const row = await db.queryOne<{ id: string }>('select id from oauth_codes');
    const holder = await holdRow('update oauth_codes set spent_at = now() where id = $1', [row!.id]);
    const outcome = await raceBehind(holder, () =>
      redeemCode(db, { code, clientId, redirectUri: REDIRECT, resource: RESOURCE, codeVerifier: verifier }),
    );
    expectInvalidGrant(outcome.error);
    expect(await db.query('select id from oauth_grants')).toEqual([]);
  });

  it('answers invalid_grant when the grant is deleted while the pair is being issued', async () => {
    const { tokens } = await connected();
    const grant = await db.queryOne<{ id: string }>('select id from oauth_grants');
    await db.query('delete from oauth_tokens');
    const holder = await holdRow('delete from oauth_grants where id = $1', [grant!.id]);
    const outcome = await raceBehind(holder, () => issueTokens(db, grant!.id, RESOURCE));
    expectInvalidGrant(outcome.error);
    expect(await db.query('select id from oauth_tokens')).toEqual([]);
    expect(tokens).toBeTruthy();
  });

  it('lets at most one of eight simultaneous refreshes through', async () => {
    const { tokens } = await connected();
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => rotateRefreshToken(db, { refreshToken: tokens.refresh_token, clientId: tokens.clientId })),
    );
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeLessThanOrEqual(1);
    for (const result of results) if (result.status === 'rejected') expectInvalidGrant(result.reason);
  });
});

describe('revocation and verification', () => {
  it.each(['access_token', 'refresh_token'] as const)('revoking the %s ends the grant and every token', async (kind) => {
    await steve();
    const app = await startApp();
    const tokens = await connect(app, await signedIn(app));
    const response = await app.inject({
      method: 'POST',
      url: '/api/oauth/revoke',
      headers: FORM,
      payload: form({ token: tokens[kind] }),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(await db.query('select id from oauth_grants')).toEqual([]);
    expect(await verifyAccessToken(db, tokens.access_token, RESOURCE)).toBeNull();
  });

  it('answers 200 for an unknown token and changes nothing', async () => {
    await steve();
    const app = await startApp();
    await connect(app, await signedIn(app));
    for (const payload of [form({ token: 'pb_at_never-issued' }), form({})]) {
      const response = await app.inject({ method: 'POST', url: '/api/oauth/revoke', headers: FORM, payload });
      expect(response.statusCode).toBe(200);
    }
    expect(await db.query('select id from oauth_grants')).toHaveLength(1);
  });

  it('verifies an access token for its resource only, never a refresh token, and notes the use at most once a minute', async () => {
    await steve();
    const app = await startApp();
    const tokens = await connect(app, await signedIn(app), 'read');
    const caller = await verifyAccessToken(db, tokens.access_token, RESOURCE);
    expect(caller).toMatchObject({ scope: 'read', clientName: 'Claude' });
    expect(await verifyAccessToken(db, tokens.access_token, 'https://other.example/api/mcp')).toBeNull();
    expect(await verifyAccessToken(db, tokens.refresh_token, RESOURCE)).toBeNull();
    expect(await verifyAccessToken(db, '', RESOURCE)).toBeNull();
    const first = await db.queryOne<{ last_used_at: Date }>('select last_used_at from oauth_grants');
    expect(first!.last_used_at).not.toBeNull();
    await verifyAccessToken(db, tokens.access_token, RESOURCE);
    const second = await db.queryOne<{ last_used_at: Date }>('select last_used_at from oauth_grants');
    expect(second!.last_used_at).toEqual(first!.last_used_at);
  });

  it('refuses an expired access token and deletes it', async () => {
    await steve();
    const app = await startApp();
    const tokens = await connect(app, await signedIn(app));
    await db.query(`update oauth_tokens set expires_at = now() - interval '1 second' where kind = 'access'`);
    expect(await verifyAccessToken(db, tokens.access_token, RESOURCE)).toBeNull();
    expect(await db.query<{ kind: string }>('select kind from oauth_tokens')).toEqual([{ kind: 'refresh' }]);
  });

  it('sweeps, and purge sweeps, expired codes and tokens and keeps the live ones', async () => {
    await steve();
    const app = await startApp();
    const session = await signedIn(app);
    await connect(app, session);
    const clientId = await registerClient(app);
    await approve(app, session, authorizeParams(clientId, pkce().challenge), 'read');
    expect(await sweepExpired(db)).toEqual({ codes: 0, tokens: 0 });
    // The spent code and the unspent one alike go once expired.
    expect(await db.query('select id from oauth_codes')).toHaveLength(2);
    await db.query(`update oauth_codes set expires_at = now() - interval '1 second'`);
    await db.query(`update oauth_tokens set expires_at = now() - interval '1 second' where kind = 'access'`);
    expect(await purge(db)).toMatchObject({ oauthCodes: 2, oauthTokens: 1 });
    expect(await db.query('select id from oauth_codes')).toEqual([]);
    expect(await db.query<{ kind: string }>('select kind from oauth_tokens')).toEqual([{ kind: 'refresh' }]);
  });
});

describe('Connected apps', () => {
  it('lists the user’s own grants, newest first, with no secret in them', async () => {
    await steve();
    await createUser(db, { username: 'anna', password: PASSWORD, displayName: 'Anna' });
    const app = await startApp();
    const session = await signedIn(app);
    const tokens = await connect(app, session, 'read');
    await db.query(`update oauth_grants set created_at = now() - interval '1 hour'`);
    await connect(app, session, 'read_write');
    await connect(app, await signedIn(app, 'anna'), 'read');
    const response = await app.inject({ url: '/api/auth/grants', headers: cookie(session) });
    const grants = response.json().grants;
    expect(grants.map((g: { scope: string }) => g.scope)).toEqual(['read_write', 'read']);
    expect(Object.keys(grants[0]).sort()).toEqual([
      'client_name',
      'client_uri',
      'created_at',
      'device_name',
      'first_party',
      'id',
      'last_used_at',
      'scope',
    ]);
    expect(grants[0]).toMatchObject({ first_party: false, device_name: null });
    expect(grants[1].last_used_at).toBeNull();
    expect(response.body).not.toContain(tokens.access_token);
    expect(response.body).not.toContain(hashToken(tokens.access_token));
  });

  it('revokes one, with its codes and tokens, and answers 404 for another user’s', async () => {
    await steve();
    await createUser(db, { username: 'anna', password: PASSWORD, displayName: 'Anna' });
    const app = await startApp();
    const session = await signedIn(app);
    const mine = await connect(app, session);
    await connect(app, await signedIn(app, 'anna'));
    const [annas] = await db.query<{ id: string }>(
      `select g.id from oauth_grants g join users u on u.id = g.user_id where u.username = 'anna'`,
    );
    const [own] = await db.query<{ id: string }>(
      `select g.id from oauth_grants g join users u on u.id = g.user_id where u.username = 'steve'`,
    );
    const headers = { ...cookie(session), origin: ORIGIN };
    for (const id of [annas!.id, 'not-a-uuid', '00000000-0000-4000-8000-000000000000']) {
      const response = await app.inject({ method: 'DELETE', url: `/api/auth/grants/${id}`, headers });
      expect(response.statusCode).toBe(404);
    }
    expect(await db.query('select id from oauth_grants')).toHaveLength(2);
    const response = await app.inject({ method: 'DELETE', url: `/api/auth/grants/${own!.id}`, headers });
    expect(response.statusCode).toBe(204);
    expect(ids(await db.query('select id from oauth_grants'))).toEqual([annas!.id]);
    expect(await verifyAccessToken(db, mine.access_token, RESOURCE)).toBeNull();
    expect(await db.query('select t.id from oauth_tokens t where t.grant_id = $1', [own!.id])).toEqual([]);
  });

  it('removes a user’s grants with the user', async () => {
    const user = await steve();
    const app = await startApp();
    await connect(app, await signedIn(app));
    await db.query('delete from users where id = $1', [user.id]);
    expect(await db.query('select id from oauth_grants')).toEqual([]);
    expect(await db.query('select id from oauth_tokens')).toEqual([]);
  });
});

describe('scopes', () => {
  it('parses the scope parameter, and keeps a grant within the request', () => {
    expect(parseScopeParameter(undefined)).toEqual(['read']);
    expect(parseScopeParameter(' ')).toEqual(['read']);
    expect(parseScopeParameter('read_write read read')).toEqual(['read_write', 'read']);
    expect(parseScopeParameter('read write')).toBeNull();
    expect(scopeWithin('read', ['read_write'])).toBe(true);
    expect(scopeWithin('read_write', ['read'])).toBe(false);
  });
});
