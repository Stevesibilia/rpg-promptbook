import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

// An OpenID Connect provider on 127.0.0.1 for the tests, shaped like
// Authentik's: an issuer path ending in a slash, discovery, JWKS, and a token
// endpoint that checks the client, the code and the PKCE verifier and signs
// an RS256 ID token. The browser's visit to the authorization endpoint is
// approve() or deny(), which answer the URL the provider would send it back
// to. Plain http: the app reaches it only through allowInsecureRequests,
// which the tests pass and the server never does.

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

export async function startIssuer(): Promise<FakeIssuer> {
  const keys = await generateKeyPair('RS256');
  const wrongKeys = await generateKeyPair('RS256');
  const kid = 'test-key';
  const jwk = { ...(await exportJWK(keys.publicKey)), kid, alg: 'RS256', use: 'sig' };
  const grants = new Map<string, Grant>();
  const path = '/application/o/promptbook/';

  const server = createServer((req, res) => {
    fake.requests.push(req.url ?? '');
    handle(req, res).catch((error: unknown) => json(res, 500, { error: 'server_error', detail: String(error) }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
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
