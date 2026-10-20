import type { FastifyInstance } from 'fastify';
import { db, ORIGIN } from './helpers.js';
import { cookie, exchange, pkce, type Tokens } from './oauth-helpers.js';

// The desktop app's sign-in the way it runs it: the browser approves its
// request at once, and the app exchanges the code at its loopback address
// (desktop-app design decision 8). The tests that use it seed the
// first-party client first (seedDesktopClient).

export const APP_RESOURCE = `${ORIGIN}/api`;
export const LOOPBACK = 'http://127.0.0.1:51234/callback';

export function desktopParams(challenge: string, overrides: Record<string, string> = {}): Record<string, string> {
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

export async function approveDesktop(
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
export async function desktopSignIn(
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

