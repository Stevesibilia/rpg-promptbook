import { randomBytes } from 'node:crypto';
import * as client from 'openid-client';
import type { OidcConfig } from '../config.js';
import type { Db, Queryable } from '../db.js';
import { hashToken } from './sessions.js';
import { toUser, type User, type UserRow } from './users.js';

// Single sign-on through an OpenID Connect provider: authorization code with
// PKCE, state and nonce (single-sign-on design decisions 1, 4 and 5).

// How long a started sign-in may take at the provider.
export const HANDSHAKE_TTL_SECONDS = 600;

const SCOPE = 'openid profile email';

// Why a sign-in did not finish, as the sign-in page names it:
// `cancelled` covers a handshake that is unknown, expired, already used or
// started in another browser, and the provider's access_denied.
export type SignInFailure = 'cancelled' | 'unreachable' | 'failed';

export class SignInError extends Error {
  constructor(
    readonly reason: SignInFailure,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

// A path on this site, or `/`. A scheme, a host (`//host`) or a backslash,
// which browsers read as a slash, would send the browser elsewhere after the
// sign-in; so would a control character, which browsers drop from URLs.
// Only printable ASCII, as a browser sends a percent-encoded path: anything
// else could not go in the Location header.
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  if (/[^\x21-\x7e]/.test(value)) return '/';
  return value;
}

export interface OidcProvider {
  // A new handshake: where to send the browser, and the secret its cookie
  // carries.
  start(returnTo: string): Promise<{ url: URL; browserSecret: string }>;
  // Finishes the handshake the callback's query names, for the browser whose
  // cookie is `browserSecret`: the account signed in, and where to go.
  finish(query: string, browserSecret: string | undefined): Promise<{ user: User; returnTo: string }>;
}

// `discoveryOptions` is for the tests' plain-http issuer
// (`allowInsecureRequests`); the server never passes it.
export function createOidcProvider(
  db: Db,
  oidc: OidcConfig,
  discoveryOptions?: client.DiscoveryRequestOptions,
): OidcProvider {
  const redirectUri = new URL(oidc.redirectUri).href;

  // The ID token's signature is checked against the provider's JWKS too.
  // openid-client skips that by default for a token fetched straight from the
  // token endpoint, trusting TLS alone.
  const options: client.DiscoveryRequestOptions = {
    ...discoveryOptions,
    execute: [client.enableNonRepudiationChecks, ...(discoveryOptions?.execute ?? [])],
  };

  // Discovered at the first use and kept; a failure is not kept, so the next
  // sign-in tries again.
  let configuration: Promise<client.Configuration> | null = null;
  const discover = (): Promise<client.Configuration> => {
    configuration ??= client
      .discovery(new URL(oidc.issuer), oidc.clientId, oidc.clientSecret, undefined, options)
      .catch((error: unknown) => {
        configuration = null;
        throw new SignInError('unreachable', 'The provider could not be discovered', { cause: error });
      });
    return configuration;
  };

  return {
    async start(returnTo) {
      const config = await discover();
      const state = client.randomState();
      const nonce = client.randomNonce();
      const codeVerifier = client.randomPKCECodeVerifier();
      const browserSecret = randomBytes(32).toString('base64url');
      await db.query(
        `insert into oidc_logins (state, browser_hash, nonce, code_verifier, return_to, expires_at)
         values ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))`,
        [state, hashToken(browserSecret), nonce, codeVerifier, safeReturnTo(returnTo), HANDSHAKE_TTL_SECONDS],
      );
      const url = client.buildAuthorizationUrl(config, {
        redirect_uri: redirectUri,
        scope: SCOPE,
        state,
        nonce,
        code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: 'S256',
      });
      return { url, browserSecret };
    },

    async finish(query, browserSecret) {
      const params = new URLSearchParams(query);
      const state = params.get('state');
      if (!state || !browserSecret) throw new SignInError('cancelled', 'No sign-in in flight for this browser');

      // Consumed on read: a state finishes one callback at most. Only the
      // browser that started it consumes it, so a callback URL opened
      // anywhere else neither signs in nor spoils the real sign-in.
      const row = await db.queryOne<{ nonce: string; code_verifier: string; return_to: string; live: boolean }>(
        `delete from oidc_logins where state = $1 and browser_hash = $2
         returning nonce, code_verifier, return_to, expires_at > now() as live`,
        [state, hashToken(browserSecret)],
      );
      if (!row?.live) throw new SignInError('cancelled', 'No sign-in in flight for this browser');

      const error = params.get('error');
      if (error) {
        throw new SignInError(error === 'access_denied' ? 'cancelled' : 'failed', `The provider answered ${error}`);
      }

      const config = await discover();
      const currentUrl = new URL(redirectUri);
      currentUrl.search = params.toString();
      let claims: client.IDToken | undefined;
      try {
        // Checks the state, the PKCE verifier, and the ID token's signature,
        // issuer, audience, expiry and nonce.
        const tokens = await client.authorizationCodeGrant(config, currentUrl, {
          pkceCodeVerifier: row.code_verifier,
          expectedState: state,
          expectedNonce: row.nonce,
          idTokenExpected: true,
        });
        claims = tokens.claims();
      } catch (error) {
        throw new SignInError(unreachable(error) ? 'unreachable' : 'failed', 'The token exchange failed', {
          cause: error,
        });
      }
      const identity = claims;
      if (!identity) throw new SignInError('failed', 'The provider sent no ID token');

      const user = await db.withTransaction((tx) => findOrCreateOidcUser(tx, identity));
      return { user, returnTo: row.return_to };
    },
  };
}

// No answer from the provider, or a server error: fetch's own failures
// (connection, DNS, TLS) are plain TypeErrors, its timeout an abort, and a
// 5xx arrives as a response the client refuses.
function unreachable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return true;
  if (error instanceof TypeError && !('code' in error)) return true;
  if (error instanceof client.ResponseBodyError) return error.status >= 500;
  return error instanceof client.ClientError && error.cause instanceof Response && error.cause.status >= 500;
}

export interface OidcClaims {
  iss: string;
  sub: string;
  preferred_username?: unknown;
  name?: unknown;
  email?: unknown;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

// preferred_username lowercased, with anything a username cannot hold turned
// into a dash; `user` when nothing is left.
export function usernameFor(preferred: unknown): string {
  const name = (text(preferred) ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .slice(0, 64)
    .replace(/^-+|-+$/g, '');
  return name || 'user';
}

// The account of an identity, strictly by issuer and subject: never by email
// or username, which the provider's users may be able to change. The first
// sign-in creates it, with no password.
export async function findOrCreateOidcUser(tx: Queryable, claims: OidcClaims): Promise<User> {
  const email = text(claims.email);
  // One sign-in per identity at a time, so two first sign-ins of the same
  // identity cannot make two accounts.
  await tx.query("select pg_advisory_xact_lock(hashtextextended('promptbook-oidc|' || $1 || '|' || $2, 0))", [
    claims.iss,
    claims.sub,
  ]);
  const existing = await tx.queryOne<UserRow>(
    'update users set email = $3 where oidc_issuer = $1 and oidc_subject = $2 returning *',
    [claims.iss, claims.sub, email],
  );
  if (existing) return toUser(existing);

  // And one new account at a time, so two identities wanting the same
  // username get different suffixes rather than a unique violation.
  await tx.query("select pg_advisory_xact_lock(hashtextextended('promptbook-oidc-new-account', 0))");
  const base = usernameFor(claims.preferred_username);
  let username = base;
  for (let n = 2; await tx.queryOne('select 1 from users where lower(username) = lower($1)', [username]); n++) {
    username = `${base.slice(0, 63 - String(n).length)}-${n}`;
  }
  const displayName = (text(claims.name) ?? text(claims.preferred_username) ?? username).slice(0, 100);
  const row = await tx.queryOne<UserRow>(
    `insert into users (username, display_name, oidc_issuer, oidc_subject, email)
     values ($1, $2, $3, $4, $5) returning *`,
    [username, displayName, claims.iss, claims.sub, email],
  );
  return toUser(row!);
}
