import type { FastifyInstance } from 'fastify';
import { createProjectDoc, readDocument, skeletonDocument } from 'promptbook-project';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../../src/accounts/sessions.js';
import { createUser } from '../../src/accounts/users.js';
import { sweepUnusedClients } from '../../src/oauth/clients.js';
import { APP_RESOURCE, approveDesktop, desktopParams, desktopSignIn, LOOPBACK } from './desktop-helpers.js';
import { db, ORIGIN, PASSWORD, seedDesktopClient, signedIn, startApp, steve } from './helpers.js';
import { mcpCall } from './mcp-helpers.js';
import {
  authorizeParams,
  connect as connectClaude,
  cookie,
  exchange,
  FORM,
  form,
  pkce,
  registerClient,
  type Tokens,
} from './oauth-helpers.js';
import { connect, destroyClients, listen, synced, waitFor } from './sync-helpers.js';

// The desktop app's side of the server (desktop-app design decisions 8 and
// 9): the first-party client and its app resource.

beforeEach(() => seedDesktopClient(db));
afterEach(destroyClients);

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function newProject(app: FastifyInstance, session: string, title = 'Il ballo dei Lorenzetti'): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: { ...cookie(session), origin: ORIGIN },
    payload: { category: 'adventure', title },
  });
  if (response.statusCode !== 201) throw new Error(`Create failed: ${response.statusCode} ${response.body}`);
  return response.json().project.id as string;
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

describe('REST with the desktop app’s token', () => {
  it('acts as the grant’s user, with no cookie and no origin check', async () => {
    const { app, session } = await setup();
    const id = await newProject(app, session);
    const { access_token } = await desktopSignIn(app, session);
    const listed = await app.inject({ url: '/api/projects', headers: bearer(access_token) });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().projects.map((p: { id: string }) => p.id)).toEqual([id]);
    expect((await app.inject({ url: '/api/auth/me', headers: bearer(access_token) })).json().user).toMatchObject({
      username: 'steve',
    });
    // A write from anywhere: the header is not ambient.
    for (const headers of [{}, { origin: 'https://elsewhere.example' }, { referer: 'https://elsewhere.example/x' }]) {
      const created = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { ...bearer(access_token), ...headers },
        payload: { category: 'one-shot', title: 'Dal desktop' },
      });
      expect(created.statusCode).toBe(201);
    }
  });

  it('answers 401 to an MCP token, an unknown or expired one, and one of a revoked grant', async () => {
    const { app, session } = await setup();
    const claude = await connectClaude(app, session, 'read_write');
    const desktop = await desktopSignIn(app, session);
    const list = (token: string) => app.inject({ url: '/api/projects', headers: bearer(token) });
    expect((await list(claude.access_token)).statusCode).toBe(401);
    expect((await list(desktop.refresh_token)).statusCode).toBe(401);
    expect((await list('pb_at_nothing')).statusCode).toBe(401);
    // An MCP token on a public route is no session at all.
    expect((await app.inject({ url: '/api/auth/me', headers: bearer(claude.access_token) })).json()).toEqual({
      user: null,
    });
    await db.query("update oauth_tokens set expires_at = now() - interval '1 second' where token_hash = $1", [
      hashToken(desktop.access_token),
    ]);
    expect((await list(desktop.access_token)).statusCode).toBe(401);
    const fresh = await desktopSignIn(app, session);
    expect((await list(fresh.access_token)).statusCode).toBe(200);
    await app.inject({
      method: 'DELETE',
      url: `/api/auth/grants/${fresh.grantId}`,
      headers: { ...cookie(session), origin: ORIGIN },
    });
    expect((await list(fresh.access_token)).statusCode).toBe(401);
  });

  it('is refused at the MCP endpoint with the challenge', async () => {
    const { app, session } = await setup();
    const { access_token } = await desktopSignIn(app, session);
    const answer = await mcpCall(app, 'tools/list', {}, { token: access_token });
    expect(answer.status).toBe(401);
    expect(String(answer.headers['www-authenticate'])).toContain('invalid_token');
  });

  it('cannot approve, deny or see consent, nor sign out, and records nothing', async () => {
    const { app, session } = await setup();
    const { access_token } = await desktopSignIn(app, session);
    const grantsBefore = await db.query('select id from oauth_grants');
    const clientId = await registerClient(app);
    const params = authorizeParams(clientId, pkce().challenge);
    const desktopRequest = desktopParams(pkce().challenge);
    for (const [method, url, payload] of [
      ['GET', `/api/oauth/authorize?${new URLSearchParams(params)}`, undefined],
      ['POST', '/api/oauth/authorize', { ...params, granted_scope: 'read_write' }],
      ['POST', '/api/oauth/authorize', { ...desktopRequest, granted_scope: 'app' }],
      ['POST', '/api/oauth/authorize/deny', params],
      ['POST', '/api/auth/logout', {}],
    ] as const) {
      const response = await app.inject({ method, url, headers: bearer(access_token), ...(payload ? { payload } : {}) });
      expect(`${method} ${url} ${response.statusCode} ${response.json().error}`).toBe(
        `${method} ${url} 403 cookie_session_required`,
      );
    }
    expect(await db.query('select id from oauth_grants')).toEqual(grantsBefore);
    expect((await app.inject({ url: '/api/projects', headers: cookie(session) })).statusCode).toBe(200);
  });

  it('a cookie wins over a bearer token, and keeps the origin rule', async () => {
    const { app, session } = await setup();
    await createUser(db, { username: 'anna', password: PASSWORD, displayName: 'Anna' });
    const annas = await signedIn(app, 'anna');
    await newProject(app, annas, 'Di Anna');
    const { access_token } = await desktopSignIn(app, session);
    const listed = await app.inject({ url: '/api/projects', headers: { ...cookie(annas), ...bearer(access_token) } });
    expect(listed.json().projects.map((p: { title: string }) => p.title)).toEqual(['Di Anna']);
    const crossSite = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { ...cookie(annas), ...bearer(access_token), origin: 'https://evil.example' },
      payload: { category: 'one-shot', title: 'Cross-site' },
    });
    expect(crossSite.statusCode).toBe(403);
    expect(crossSite.json().error).toBe('cross_origin');
  });

  it('changing the password from the desktop app ends every cookie session', async () => {
    const { app, session } = await setup();
    const other = await signedIn(app);
    const { access_token } = await desktopSignIn(app, session);
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/password',
      headers: bearer(access_token),
      payload: { current: PASSWORD, next: 'a brand new passphrase' },
    });
    expect(response.statusCode).toBe(204);
    expect(await db.query('select token_hash from sessions')).toEqual([]);
    for (const token of [session, other]) {
      expect((await app.inject({ url: '/api/projects', headers: cookie(token) })).statusCode).toBe(401);
    }
    expect((await app.inject({ url: '/api/projects', headers: bearer(access_token) })).statusCode).toBe(200);
  });
});

describe('/sync with the desktop app’s token', () => {
  async function syncSetup() {
    const { app, session } = await setup();
    const id = await newProject(app, session);
    const url = await listen(app);
    const tokens = await desktopSignIn(app, session);
    return { app, session, id, url, tokens };
  }

  it('syncs the owner’s project with no cookie and no Origin, or another Origin', async () => {
    const { app, session, id, url, tokens } = await syncSetup();
    const a = connect(url, id, { origin: null, appToken: tokens.access_token });
    const b = connect(url, id, { origin: 'https://elsewhere.example', appToken: tokens.access_token });
    const web = connect(url, id, { token: session });
    await Promise.all([synced(a), synced(b), synced(web)]);
    a.doc.getText('document').insert(0, 'Dal desktop.\n');
    await waitFor(() => readDocument(web.doc).startsWith('Dal desktop.'), 'the edit in the web client');
    expect(app.sync.liveDocument(id)).not.toBeNull();
  });

  it('refuses an MCP token, a refresh token, another user’s token, and no credential', async () => {
    const { app, session, id, url, tokens } = await syncSetup();
    const claude = await connectClaude(app, session, 'read_write');
    await createUser(db, { username: 'anna', password: PASSWORD, displayName: 'Anna' });
    const annas = await desktopSignIn(app, await signedIn(app, 'anna'));
    const refused = [
      connect(url, id, { origin: null, appToken: claude.access_token }),
      connect(url, id, { origin: null, appToken: tokens.refresh_token }),
      connect(url, id, { origin: null, appToken: annas.access_token }),
      connect(url, id, { origin: null }),
    ];
    await waitFor(() => refused.every((c) => c.authFailures.length > 0), 'every connection refused');
    for (const client of refused) {
      expect(client.provider.isSynced).toBe(false);
      expect(client.doc.getText('document').length).toBe(0);
    }
  });

  async function revokedCloses(revoke: (s: Awaited<ReturnType<typeof syncSetup>>) => Promise<void>) {
    const setup = await syncSetup();
    const { url, id, tokens, session } = setup;
    const desktop = connect(url, id, { origin: null, appToken: tokens.access_token });
    const web = connect(url, id, { token: session });
    await Promise.all([synced(desktop), synced(web)]);
    await revoke(setup);
    await waitFor(() => desktop.closes.includes('4401 Unauthorized'), 'the desktop socket to close');
    // It reconnects with the revoked token and is refused; the web stays.
    await waitFor(() => desktop.authFailures.length > 0, 'the reconnect refused');
    expect(web.closes).toEqual([]);
  }

  it('closes the grant’s sockets when it is revoked in Connected apps', () =>
    revokedCloses(async ({ app, session, tokens }) => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/auth/grants/${tokens.grantId}`,
        headers: { ...cookie(session), origin: ORIGIN },
      });
      expect(response.statusCode).toBe(204);
    }));

  it('closes the grant’s sockets when the app revokes its token', () =>
    revokedCloses(async ({ app, tokens }) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/oauth/revoke',
        headers: FORM,
        payload: form({ token: tokens.refresh_token }),
      });
      expect(response.statusCode).toBe(200);
    }));

  it('closes the grant’s sockets when a refresh token is reused', () =>
    revokedCloses(async ({ app, tokens }) => {
      const refresh = () =>
        exchange(app, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: 'promptbook-desktop' });
      expect((await refresh()).statusCode).toBe(200);
      expect((await refresh()).json()).toMatchObject({ error: 'invalid_grant' });
    }));
});

describe('a project made on the device, uploaded', () => {
  const ID = '6f1c0a52-3b8e-4c1d-9a57-2d0e7f1b9c11';

  function offlineDoc(overrides: { id?: string; campaignId?: string | null; document?: string } = {}): Y.Doc {
    return createProjectDoc({
      id: overrides.id ?? ID,
      title: 'Scritto in treno',
      category: 'one-shot',
      status: 'draft',
      campaignId: overrides.campaignId ?? null,
      system: 'Kulthos',
      todo: ['Scrivere le scene', 'Rilettura'],
      document:
        overrides.document ??
        skeletonDocument('one-shot', {
          title: 'Scritto in treno',
          system: 'Kulthos',
          campaignTitle: null,
          author: 'Stefano',
          copyright: '',
          licence: '',
        }),
      createdAt: '2026-10-20T07:00:00.000Z',
    });
  }

  const encode = (doc: Y.Doc) => Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');

  async function upload(app: FastifyInstance, token: string, body: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: '/api/projects', headers: bearer(token), payload: body });
  }

  const storedState = async (id: string) =>
    (await db.queryOne<{ state: Buffer }>('select state from project_docs where project_id = $1', [id]))?.state;

  it('stores the document with its id and answers 201 with its row, which the web lists', async () => {
    const { app, session } = await setup();
    const { access_token } = await desktopSignIn(app, session);
    const doc = offlineDoc();
    doc.getText('document').insert(0, 'Scritto offline.\n');
    const response = await upload(app, access_token, { id: ID, state: encode(doc), title: 'Ignored', category: 'campaign' });
    expect(response.statusCode).toBe(201);
    expect(response.json().project).toMatchObject({
      id: ID,
      title: 'Scritto in treno',
      category: 'one-shot',
      system: 'Kulthos',
      todoDone: 0,
      todoTotal: 2,
      deletedAt: null,
    });
    const listed = await app.inject({ url: '/api/projects', headers: cookie(session) });
    expect(listed.json().projects).toEqual([response.json().project]);
    const stored = new Y.Doc();
    Y.applyUpdate(stored, (await storedState(ID))!);
    expect(readDocument(stored)).toBe(readDocument(doc));
  });

  it('answers 200 with the project as it is when its owner sends the id again, and stores nothing new', async () => {
    const { app, session } = await setup();
    const { access_token } = await desktopSignIn(app, session);
    const doc = offlineDoc();
    const first = await upload(app, access_token, { id: ID, state: encode(doc) });
    expect(first.statusCode).toBe(201);
    const state = await storedState(ID);
    doc.getText('document').insert(0, 'Più tardi.\n');
    const again = await upload(app, access_token, { id: ID, state: encode(doc) });
    expect(again.statusCode).toBe(200);
    expect(again.json().project).toEqual(first.json().project);
    expect(await storedState(ID)).toEqual(state);
    expect(await db.query('select id from projects')).toEqual([{ id: ID }]);
  });

  it('refuses an id another user has with 409, and leaves their project alone', async () => {
    const { app, session } = await setup();
    await createUser(db, { username: 'anna', password: PASSWORD, displayName: 'Anna' });
    const annas = await desktopSignIn(app, await signedIn(app, 'anna'));
    expect((await upload(app, annas.access_token, { id: ID, state: encode(offlineDoc()) })).statusCode).toBe(201);
    const state = await storedState(ID);
    const { access_token } = await desktopSignIn(app, session);
    const other = offlineDoc();
    other.getText('document').insert(0, 'Di Stefano.\n');
    for (const body of [{ id: ID, state: encode(other) }, { id: ID, category: 'one-shot', title: 'Mio' }]) {
      const response = await upload(app, access_token, body);
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe('id_taken');
    }
    expect(await storedState(ID)).toEqual(state);
    expect((await app.inject({ url: '/api/projects', headers: bearer(access_token) })).json().projects).toEqual([]);
  });

  it.each([
    ['another project’s id in the document', () => encode(offlineDoc({ id: '00000000-0000-4000-8000-000000000001' }))],
    ['a document that is not a project', () => {
      const doc = new Y.Doc();
      doc.getText('document').insert(0, 'Solo testo.');
      return encode(doc);
    }],
    ['a project of an unknown category', () => {
      const doc = offlineDoc();
      doc.getMap('meta').set('category', 'saga');
      return encode(doc);
    }],
    ['a meta of the wrong kind', () => {
      const doc = new Y.Doc();
      doc.getArray('meta').insert(0, [ID]);
      return encode(doc);
    }],
    ['bytes that are no Yjs update', () => Buffer.from('not a yjs update at all').toString('base64')],
    ['text that is not base64', () => 'not base64!'],
    ['a state over 5 MB', () => encode(offlineDoc({ document: 'a'.repeat(5 * 1024 * 1024 + 1) }))],
  ])('answers 400 invalid_state to %s, and creates nothing', async (_what, state) => {
    const { app, session } = await setup();
    const { access_token } = await desktopSignIn(app, session);
    const response = await upload(app, access_token, { id: ID, state: state() });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid_state');
    expect(await db.query('select id from projects')).toEqual([]);
  });

  it('refuses a body over 8 MB, a state without an id, and an id that is not a UUID', async () => {
    const { app, session } = await setup();
    const { access_token } = await desktopSignIn(app, session);
    const huge = await upload(app, access_token, { id: ID, state: 'A'.repeat(8 * 1024 * 1024) });
    expect(huge.statusCode).toBe(413);
    expect((await upload(app, access_token, { state: encode(offlineDoc()) })).statusCode).toBe(400);
    expect((await upload(app, access_token, { id: 'not-a-uuid', state: encode(offlineDoc()) })).statusCode).toBe(400);
    expect(await db.query('select id from projects')).toEqual([]);
  });

  it('reads a link to a campaign that is not the uploader’s as stand-alone', async () => {
    const { app, session } = await setup();
    await createUser(db, { username: 'anna', password: PASSWORD, displayName: 'Anna' });
    const annas = await signedIn(app, 'anna');
    const campaign = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { ...cookie(annas), origin: ORIGIN },
      payload: { category: 'campaign', title: 'Di Anna' },
    });
    const { access_token } = await desktopSignIn(app, session);
    const response = await upload(app, access_token, {
      id: ID,
      state: encode(offlineDoc({ campaignId: campaign.json().project.id })),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().project.campaignId).toBeNull();
  });

  it('creates from the templates with an id and no state, and answers 200 to it again', async () => {
    const { app, session } = await setup();
    const { access_token } = await desktopSignIn(app, session);
    const body = { id: ID, category: 'adventure', title: 'Con un id' };
    const first = await upload(app, access_token, body);
    expect(first.statusCode).toBe(201);
    expect(first.json().project).toMatchObject({ id: ID, title: 'Con un id', category: 'adventure' });
    const again = await upload(app, access_token, { ...body, title: 'Cambiato' });
    expect(again.statusCode).toBe(200);
    expect(again.json().project.title).toBe('Con un id');
  });
});
