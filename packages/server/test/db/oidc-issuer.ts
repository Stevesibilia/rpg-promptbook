import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

// An OpenID Connect provider on 127.0.0.1 for the tests, shaped like
// Authentik's: an issuer path ending in a slash, discovery, JWKS, and a token
// endpoint that checks the client, the code and the PKCE verifier and signs
// an RS256 ID token. The browser's visit to the authorization endpoint is
// approve() or deny(), which answer the URL the provider would send it back
// to. Plain http: the app reaches it only through allowInsecureRequests,
// which the tests pass and the server never does.
//
// The end-to-end tests and the owner's preview run it in a container with
// options (e2e/issuer/serve.mjs): https with a test CA the app trusts through
// NODE_EXTRA_CA_CERTS, an address of their own, and a page at the
// authorization endpoint where a person picks the outcome.

export interface Identity {
  sub: string;
  preferred_username?: string;
  name?: string;
  email?: string;
}

// Ways to spoil the ID token of one approval.
export interface Tamper {
  // Signed with a key that is not in the JWKS, under the same key id.
  signature?: boolean;
  nonce?: string;
  // The token endpoint answers 503 for this code: the provider went down
  // during the sign-in.
  unavailable?: boolean;
}

export interface IssuerOptions {
  // Serve https with this key and certificate instead of http.
  tls?: { key: string | Buffer; cert: string | Buffer };
  // Where to listen; by default 127.0.0.1 on a free port.
  host?: string;
  port?: number;
  // The origin the app and the browser reach it at, when it differs from
  // the listening address (a container behind a published port).
  publicOrigin?: string;
  // Serve a page at the authorization endpoint (see authorizePage).
  page?: boolean;
}

interface Grant {
  identity: Identity;
  tamper: Tamper;
  nonce: string;
  codeChallenge: string;
  redirectUri: string;
}

export interface FakeIssuer {
  issuer: string;
  clientId: string;
  clientSecret: string;
  // While true, every endpoint answers 503.
  unavailable: boolean;
  // The paths requested, in order.
  requests: string[];
  approve(authorizationUrl: string, identity: Identity, tamper?: Tamper): string;
  deny(authorizationUrl: string, error?: string): string;
  close(): Promise<void>;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const sha256 = (value: string) => createHash('sha256').update(value).digest('base64url');

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

export async function startIssuer(options: IssuerOptions = {}): Promise<FakeIssuer> {
  const keys = await generateKeyPair('RS256');
  const wrongKeys = await generateKeyPair('RS256');
  const kid = 'test-key';
  const jwk = { ...(await exportJWK(keys.publicKey)), kid, alg: 'RS256', use: 'sig' };
  const grants = new Map<string, Grant>();
  const path = '/application/o/promptbook/';

  const listener = (req: IncomingMessage, res: ServerResponse) => {
    fake.requests.push(req.url ?? '');
    handle(req, res).catch((error: unknown) => json(res, 500, { error: 'server_error', detail: String(error) }));
  };
  const server = options.tls ? createTlsServer(options.tls, listener) : createServer(listener);
  const host = options.host ?? '127.0.0.1';
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, host, resolve));
  const base =
    options.publicOrigin ?? `${options.tls ? 'https' : 'http'}://${host}:${(server.address() as AddressInfo).port}`;
  const issuer = `${base}${path}`;

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (fake.unavailable) return json(res, 503, { error: 'temporarily_unavailable' });
    const url = new URL(req.url ?? '/', base);
    if (req.method === 'GET' && url.pathname === `${path}.well-known/openid-configuration`) {
      return json(res, 200, {
        issuer,
        authorization_endpoint: `${base}/application/o/authorize/`,
        token_endpoint: `${base}/application/o/token/`,
        jwks_uri: `${issuer}jwks/`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      });
    }
    if (req.method === 'GET' && url.pathname === `${path}jwks/`) return json(res, 200, { keys: [jwk] });
    if (req.method === 'POST' && url.pathname === '/application/o/token/') return token(req, res);
    if (options.page && req.method === 'GET' && url.pathname === '/application/o/authorize/') {
      return authorizePage(res, url);
    }
    if (options.page && req.method === 'GET' && url.pathname === '/application/o/authorize/decide') {
      return decide(res, url);
    }
    return json(res, 404, { error: 'not_found' });
  }

  async function token(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const form = new URLSearchParams(await body(req));
    let [id, secret]: (string | null | undefined)[] = [form.get('client_id'), form.get('client_secret')];
    const basic = req.headers.authorization?.match(/^Basic (.+)$/)?.[1];
    if (basic) {
      [id, secret] = Buffer.from(basic, 'base64')
        .toString('utf8')
        .split(':')
        .map((part) => decodeURIComponent(part));
    }
    if (id !== fake.clientId || secret !== fake.clientSecret) return json(res, 401, { error: 'invalid_client' });
    const code = form.get('code') ?? '';
    const grant = grants.get(code);
    grants.delete(code);
    if (grant?.tamper.unavailable) return json(res, 503, { error: 'temporarily_unavailable' });
    if (
      form.get('grant_type') !== 'authorization_code' ||
      !grant ||
      form.get('redirect_uri') !== grant.redirectUri ||
      sha256(form.get('code_verifier') ?? '') !== grant.codeChallenge
    ) {
      return json(res, 400, { error: 'invalid_grant' });
    }
    const { sub, ...claims } = grant.identity;
    const idToken = await new SignJWT({ ...claims, nonce: grant.tamper.nonce ?? grant.nonce })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(issuer)
      .setSubject(sub)
      .setAudience(fake.clientId)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(grant.tamper.signature ? wrongKeys.privateKey : keys.privateKey);
    return json(res, 200, { access_token: randomBytes(16).toString('hex'), token_type: 'Bearer', expires_in: 300, id_token: idToken });
  }

  // What the authorization endpoint checks before it would show its page.
  function authorization(authorizationUrl: string) {
    const params = new URL(authorizationUrl).searchParams;
    const get = (name: string) => {
      const value = params.get(name);
      if (!value) throw new Error(`The authorization request has no ${name}`);
      return value;
    };
    if (get('client_id') !== fake.clientId || get('response_type') !== 'code') throw new Error('Bad authorization request');
    if (get('code_challenge_method') !== 'S256' || !get('scope').split(' ').includes('openid')) {
      throw new Error('Bad authorization request');
    }
    return { get, redirectUri: get('redirect_uri') };
  }

  // The provider's sign-in page, reduced to a choice: who signs in, and how
  // the sign-in ends. Every step is a GET, as a provider's redirect back is.
  function authorizePage(res: ServerResponse, url: URL): void {
    try {
      authorization(url.href);
    } catch (error) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(String(error));
      return;
    }
    const field = (name: string, label: string, value: string) =>
      `<label>${label}<input name="${name}" value="${escapeHtml(value)}"></label>`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test issuer</title>
<style>
/* Promptbook's Emerald tokens, so the preview reads as one product; the real
   provider's page has its own look. */
body { font: 14px/1.45 Barlow, system-ui, sans-serif; background: #131917; color: #e7ece9; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 16px; box-sizing: border-box; }
form { background: #1a221f; border: 1px solid #33403a; padding: 28px 28px 22px; border-radius: 12px; width: min(400px, 100%); box-sizing: border-box; display: grid; gap: 12px; }
h1 { font: 700 24px 'Barlow Condensed', Barlow, system-ui, sans-serif; letter-spacing: .02em; margin: 0; }
p { margin: 0; color: #6b7972; font-size: 12.5px; }
label { display: grid; gap: 4px; font-size: 12px; font-weight: 600; letter-spacing: .04em; color: #97a49d; }
input { font: inherit; font-weight: 400; letter-spacing: 0; padding: 6px 9px; border-radius: 6px; border: 1px solid #33403a; background: #202a26; color: #e7ece9; }
input:focus { outline: none; border-color: #1fb98a; }
button { font: inherit; padding: 8px 10px; border-radius: 6px; border: 1px solid #33403a; background: none; color: #e7ece9; cursor: pointer; }
button:hover { background: #232d29; }
button[value=approve] { background: #1fb98a; border-color: #1fb98a; color: #08150f; font-weight: 600; }
button[value=approve]:hover { background: #2fcb9b; }
</style></head><body>
<form method="get" action="/application/o/authorize/decide">
<h1>Test issuer</h1>
<p>Stands in for Authentik. Pick who signs in and how the sign-in ends.</p>
<input type="hidden" name="request" value="${escapeHtml(url.href)}">
${field('username', 'Username', 'steve')}
${field('name', 'Name', 'Stefano')}
${field('email', 'Email', 'stefano@example.org')}
<button name="outcome" value="approve">Sign in</button>
<button name="outcome" value="deny">Cancel</button>
<button name="outcome" value="unavailable">Sign in, then go down before the token exchange</button>
<button name="outcome" value="signature">Sign in with a badly signed ID token</button>
</form></body></html>`);
  }

  function decide(res: ServerResponse, url: URL): void {
    const get = (name: string) => url.searchParams.get(name) ?? '';
    const request = new URL(get('request'));
    // Only a request to this issuer's own endpoint, so the page cannot be
    // turned into a redirector.
    if (`${request.origin}${request.pathname}` !== `${base}/application/o/authorize/`) {
      return json(res, 400, { error: 'invalid_request' });
    }
    const username = get('username').trim() || 'steve';
    const identity: Identity = { sub: `test-${username}`, preferred_username: username };
    if (get('name').trim()) identity.name = get('name').trim();
    if (get('email').trim()) identity.email = get('email').trim();
    const outcome = get('outcome');
    let location: string;
    try {
      location =
        outcome === 'deny'
          ? fake.deny(request.href)
          : fake.approve(request.href, identity, {
              unavailable: outcome === 'unavailable',
              signature: outcome === 'signature',
            });
    } catch (error) {
      return json(res, 400, { error: 'invalid_request', detail: String(error) });
    }
    res.writeHead(302, { location, 'cache-control': 'no-store' });
    res.end();
  }

  const fake: FakeIssuer = {
    issuer,
    clientId: 'promptbook-test',
    clientSecret: 'test-secret',
    unavailable: false,
    requests: [],
    approve(authorizationUrl, identity, tamper = {}) {
      const { get, redirectUri } = authorization(authorizationUrl);
      const code = randomBytes(16).toString('base64url');
      grants.set(code, { identity, tamper, nonce: get('nonce'), codeChallenge: get('code_challenge'), redirectUri });
      const back = new URL(redirectUri);
      back.searchParams.set('code', code);
      back.searchParams.set('state', get('state'));
      return back.href;
    },
    deny(authorizationUrl, error = 'access_denied') {
      const { get, redirectUri } = authorization(authorizationUrl);
      const back = new URL(redirectUri);
      back.searchParams.set('error', error);
      back.searchParams.set('state', get('state'));
      return back.href;
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
  return fake;
}
