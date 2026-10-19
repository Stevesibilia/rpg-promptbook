import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { s256 } from '../../src/oauth/tokens.js';
import { ORIGIN } from './helpers.js';

// Running the connector's OAuth flow the way a client does: register, consent
// through a signed-in session, exchange the code.

export const RESOURCE = `${ORIGIN}/api/mcp`;
export const REDIRECT = 'https://client.example/callback';
export const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

export const cookie = (token: string) => ({ cookie: `pb_session=${token}` });
export const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();

export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: s256(verifier) };
}

export async function registerClient(
  app: FastifyInstance,
  body: Record<string, unknown> = {},
  remoteAddress = '127.0.0.1',
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/oauth/register',
    payload: { client_name: 'Claude', redirect_uris: [REDIRECT], ...body },
    remoteAddress,
  });
  if (response.statusCode !== 201) throw new Error(`Registration failed: ${response.statusCode} ${response.body}`);
  return response.json<{ client_id: string }>().client_id;
}

export function authorizeParams(clientId: string, challenge: string, overrides: Record<string, string> = {}) {
  return {
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: RESOURCE,
    scope: 'read read_write',
    state: 'state-123',
    ...overrides,
  };
}

// Allow on the consent API; answers the code from the redirect.
export async function approve(
  app: FastifyInstance,
  session: string,
  params: Record<string, string>,
  grantedScope: 'read' | 'read_write',
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/oauth/authorize',
    headers: { ...cookie(session), origin: ORIGIN },
    payload: { ...params, granted_scope: grantedScope },
  });
  if (response.statusCode !== 200) throw new Error(`Approval failed: ${response.statusCode} ${response.body}`);
  const code = new URL(response.json<{ redirect_to: string }>().redirect_to).searchParams.get('code');
  if (!code) throw new Error('No code in the redirect');
  return code;
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
  scope: string;
}

export async function exchange(app: FastifyInstance, fields: Record<string, string>) {
  return app.inject({ method: 'POST', url: '/api/oauth/token', headers: FORM, payload: form(fields) });
}

// A client approved at a scope by a signed-in user, and its first tokens.
export async function connect(
  app: FastifyInstance,
  session: string,
  scope: 'read' | 'read_write' = 'read_write',
): Promise<Tokens & { clientId: string }> {
  const clientId = await registerClient(app);
  const { verifier, challenge } = pkce();
  const code = await approve(app, session, authorizeParams(clientId, challenge), scope);
  const response = await exchange(app, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT,
    client_id: clientId,
    code_verifier: verifier,
  });
  if (response.statusCode !== 200) throw new Error(`Exchange failed: ${response.statusCode} ${response.body}`);
  return { ...response.json<Tokens>(), clientId };
}
