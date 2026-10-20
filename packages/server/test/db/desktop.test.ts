import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../../src/accounts/sessions.js';
import { sweepUnusedClients } from '../../src/oauth/clients.js';
import { db, ORIGIN, seedDesktopClient, signedIn, startApp, steve } from './helpers.js';
import { authorizeParams, cookie, exchange, pkce, registerClient, type Tokens } from './oauth-helpers.js';

// The desktop app's side of the server (desktop-app design decisions 8 and
// 9): the first-party client and its app resource.

const APP_RESOURCE = `${ORIGIN}/api`;
const LOOPBACK = 'http://127.0.0.1:51234/callback';

beforeEach(() => seedDesktopClient(db));

function desktopParams(challenge: string, overrides: Record<string, string> = {}): Record<string, string> {
  return {
    client_id: 'promptbook-desktop',
    redirect_uri: LOOPBACK,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: APP_RESOURCE,
    scope: 'app',
    state: 'desktop-state',
    device_name: 'studio-mac',
    ...overrides,
  };
}

async function approveDesktop(
  app: FastifyInstance,
  session: string,
  params: Record<string, string>,
  grantedScope = 'app',
) {
  return app.inject({
    method: 'POST',
    url: '/api/oauth/authorize',
    headers: { ...cookie(session), origin: ORIGIN },
    payload: { ...params, granted_scope: grantedScope },
  });
}

// The desktop app signed in by a signed-in browser, and its first tokens.
async function desktopSignIn(
  app: FastifyInstance,
  session: string,
  device = 'studio-mac',
): Promise<Tokens & { grantId: string }> {
  const { verifier, challenge } = pkce();
  const approved = await approveDesktop(app, session, desktopParams(challenge, { device_name: device }));
  if (approved.statusCode !== 200) throw new Error(`Approval failed: ${approved.statusCode} ${approved.body}`);
  const code = new URL(approved.json<{ redirect_to: string }>().redirect_to).searchParams.get('code')!;
  const response = await exchange(app, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: LOOPBACK,
    client_id: 'promptbook-desktop',
    code_verifier: verifier,
    resource: APP_RESOURCE,
  });
  if (response.statusCode !== 200) throw new Error(`Exchange failed: ${response.statusCode} ${response.body}`);
  const [grant] = await db.query<{ id: string }>('select id from oauth_grants order by created_at desc limit 1');
  return { ...response.json<Tokens>(), grantId: grant!.id };
}

async function setup() {
  await steve();
  const app = await startApp();
  return { app, session: await signedIn(app) };
}

const tokenResource = async (token: string) =>
  (await db.queryOne<{ resource: string }>('select resource from oauth_tokens where token_hash = $1', [hashToken(token)]))
    ?.resource;

describe('the first-party desktop client', () => {
  it('survives the sweep of unused clients and does not count as waiting for approval', async () => {
    await db.query("update oauth_clients set created_at = now() - interval '2 days'");
    expect(await sweepUnusedClients(db)).toBe(0);
    expect(await db.query('select client_id, first_party from oauth_clients')).toEqual([
      { client_id: 'promptbook-desktop', first_party: true },
    ]);
  });

  it('is shown as first party, asking for the app scope', async () => {
    const { app, session } = await setup();
    const response = await app.inject({
      url: `/api/oauth/authorize?${new URLSearchParams(desktopParams(pkce().challenge))}`,
      headers: cookie(session),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      client_name: 'Promptbook desktop',
      client_host: null,
      redirect_host: '127.0.0.1:51234',
      loopback_only: true,
      requested_scopes: ['app'],
      first_party: true,
    });
  });

  it('records the grant with the scope app and the device name, and redirects to the loopback with a code', async () => {
    const { app, session } = await setup();
    const response = await approveDesktop(app, session, desktopParams(pkce().challenge));
    expect(response.statusCode).toBe(200);
    const redirect = new URL(response.json<{ redirect_to: string }>().redirect_to);
    expect(`${redirect.origin}${redirect.pathname}`).toBe(LOOPBACK);
    expect(redirect.searchParams.get('code')).toMatch(/^pb_ac_/);
    expect(redirect.searchParams.get('state')).toBe('desktop-state');
    expect(redirect.searchParams.get('iss')).toBe(ORIGIN);
    expect(await db.query('select scope, device_name from oauth_grants')).toEqual([
      { scope: 'app', device_name: 'studio-mac' },
    ]);
    const { grants } = (await app.inject({ url: '/api/auth/grants', headers: cookie(session) })).json();
    expect(grants).toMatchObject([
      { client_name: 'Promptbook desktop', scope: 'app', first_party: true, device_name: 'studio-mac' },
    ]);
  });

  it('issues tokens for the app resource, which refresh keeps', async () => {
    const { app, session } = await setup();
    const tokens = await desktopSignIn(app, session);
    expect(tokens.scope).toBe('app');
    expect(await tokenResource(tokens.access_token)).toBe(APP_RESOURCE);
    expect(await tokenResource(tokens.refresh_token)).toBe(APP_RESOURCE);
    const refreshed = await exchange(app, {
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: 'promptbook-desktop',
    });
    expect(refreshed.statusCode).toBe(200);
    expect(await tokenResource(refreshed.json<Tokens>().access_token)).toBe(APP_RESOURCE);
    // Refreshing for the MCP resource is refused.
    const mcp = await exchange(app, {
      grant_type: 'refresh_token',
      refresh_token: refreshed.json<Tokens>().refresh_token,
      client_id: 'promptbook-desktop',
      resource: `${ORIGIN}/api/mcp`,
    });
    expect(mcp.json()).toMatchObject({ error: 'invalid_grant' });
  });

  it('issues for the code’s resource when the exchange names none, and refuses another one', async () => {
    const { app, session } = await setup();
    for (const resource of [undefined, `${ORIGIN}/api/mcp`]) {
      const { verifier, challenge } = pkce();
      const approved = await approveDesktop(app, session, desktopParams(challenge));
      const code = new URL(approved.json<{ redirect_to: string }>().redirect_to).searchParams.get('code')!;
      const response = await exchange(app, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: LOOPBACK,
        client_id: 'promptbook-desktop',
        code_verifier: verifier,
        ...(resource ? { resource } : {}),
      });
      if (resource) {
        expect(response.json()).toMatchObject({ error: 'invalid_grant' });
      } else {
        expect(response.statusCode).toBe(200);
        expect(await tokenResource(response.json<Tokens>().access_token)).toBe(APP_RESOURCE);
      }
    }
  });

  it.each([
    ['the MCP resource', { resource: `${ORIGIN}/api/mcp`, scope: 'read' }, 'invalid_target'],
    ['another scope', { scope: 'read' }, 'invalid_scope'],
    ['the app scope and another', { scope: 'app read' }, 'invalid_scope'],
    ['no scope', { scope: '' }, 'invalid_scope'],
    ['no device name', { device_name: '' }, 'invalid_request'],
    ['a device name of 81 characters', { device_name: 'x'.repeat(81) }, 'invalid_request'],
    ['a device name with a control character', { device_name: 'studio\nmac' }, 'invalid_request'],
    ['a device name of spaces', { device_name: '   ' }, 'invalid_request'],
  ])('refuses a desktop request with %s, and records nothing', async (_what, overrides, error) => {
    const { app, session } = await setup();
    const params = desktopParams(pkce().challenge, overrides);
    if (params.device_name === '') delete params.device_name;
    const shown = await app.inject({ url: `/api/oauth/authorize?${new URLSearchParams(params)}`, headers: cookie(session) });
    expect(shown.statusCode).toBe(400);
    expect(shown.json().error).toBe(error);
    const approved = await approveDesktop(app, session, params, params.scope === 'read' ? 'read' : 'app');
    expect(approved.statusCode).toBe(400);
    expect(await db.query('select id from oauth_grants')).toEqual([]);
  });

  it('takes a device name of 80 characters', async () => {
    const { app, session } = await setup();
    const device = 'é'.repeat(80);
    await desktopSignIn(app, session, device);
    expect(await db.query('select device_name from oauth_grants')).toEqual([{ device_name: device }]);
  });

  it('refuses a granted scope other than app', async () => {
    const { app, session } = await setup();
    const response = await approveDesktop(app, session, desktopParams(pkce().challenge), 'read');
    expect(response.json()).toMatchObject({ error: 'invalid_scope' });
    expect(await db.query('select id from oauth_grants')).toEqual([]);
  });

  it('gives the app resource and scope to no other client', async () => {
    const { app, session } = await setup();
    const clientId = await registerClient(app);
    const { challenge } = pkce();
    for (const [overrides, error, granted] of [
      [{ resource: APP_RESOURCE, scope: 'app' }, 'invalid_target', 'app'],
      [{ resource: APP_RESOURCE, scope: 'read' }, 'invalid_scope', 'read'],
      [{ scope: 'app' }, 'invalid_scope', 'app'],
      [{}, 'invalid_scope', 'app'],
    ] as const) {
      const params = authorizeParams(clientId, challenge, overrides);
      const shown = await app.inject({ url: `/api/oauth/authorize?${new URLSearchParams(params)}`, headers: cookie(session) });
      const approved = await approveDesktop(app, session, params, granted);
      // The valid MCP request is refused only for the app scope it grants.
      if (Object.keys(overrides).length > 0) expect(shown.json().error).toBe(error);
      expect(approved.json().error).toBe(error);
    }
    expect(await db.query('select id from oauth_grants')).toEqual([]);
  });

  it('stores no device name for another client', async () => {
    const { app, session } = await setup();
    const clientId = await registerClient(app);
    const params = { ...authorizeParams(clientId, pkce().challenge), device_name: 'studio-mac' };
    const response = await approveDesktop(app, session, params, 'read');
    expect(response.statusCode).toBe(200);
    expect(await db.query('select scope, device_name from oauth_grants')).toEqual([{ scope: 'read', device_name: null }]);
  });
});
