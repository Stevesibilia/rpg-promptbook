import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hashToken } from '../accounts/sessions.js';
import type { Queryable } from '../db.js';
import type { OAuthScope } from './config.js';
import { deleteGrant } from './grants.js';

// Codes, access tokens and refresh tokens (connector design decision 7,
// ported from gdrarchive): 32 random bytes behind a visible prefix, so a
// leaked one is recognisable in a log, and stored only as SHA-256 digests, so
// a database dump holds no working credential.

const TOKEN_BYTES = 32;

const CODE_TTL_MS = 600_000;
// A stolen access token is an hour of loss and no more.
const ACCESS_TTL_MS = 3_600_000;
// Each refresh rotates the token and starts a new 30 days, so a grant in use
// does not lapse and one unused for a month does.
const REFRESH_TTL_MS = 30 * 86_400_000;
// Skip the grant's last_used_at write unless it is at least this stale.
const LAST_USED_WRITE_INTERVAL_MS = 60_000;

export const CODE_PREFIX = 'pb_ac_';
export const ACCESS_PREFIX = 'pb_at_';
export const REFRESH_PREFIX = 'pb_rt_';

// A refusal in the shape RFC 6749 section 5.2 wants. The message never
// repeats what the caller sent, so no code or verifier lands in a client's
// log.
export class TokenError extends Error {
  constructor(
    readonly code: 'invalid_request' | 'invalid_grant' | 'unsupported_grant_type',
    message: string,
  ) {
    super(message);
  }
}

const mint = (prefix: string) => `${prefix}${randomBytes(TOKEN_BYTES).toString('base64url')}`;

// PKCE S256, the only method this server takes.
export const s256 = (verifier: string): string => createHash('sha256').update(verifier).digest('base64url');

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Codes.

export interface CodeBinding {
  redirectUri: string;
  codeChallenge: string;
  resource: string;
}

// A code for an approval. The value is returned here and never again.
export async function issueCode(db: Queryable, grantId: string, binding: CodeBinding): Promise<string> {
  const code = mint(CODE_PREFIX);
  await db.query(
    `insert into oauth_codes (grant_id, code_hash, redirect_uri, code_challenge, resource, expires_at)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      grantId,
      hashToken(code),
      binding.redirectUri,
      binding.codeChallenge,
      binding.resource,
      new Date(Date.now() + CODE_TTL_MS),
    ],
  );
  return code;
}

export interface CodeRedemption {
  code: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  codeVerifier: string;
}

interface CodeRow {
  grant_id: string;
  redirect_uri: string;
  code_challenge: string;
  resource: string;
  expires_at: Date;
  scope: OAuthScope;
  client_id: string;
}

// Spends a code, or refuses. Marked spent in one statement, before any
// check: a code is good for one redemption whether or not it succeeds, and
// of two requests with one code the second waits on the first's lock, then
// finds it spent. A spent code presented again is a replay (RFC 6749
// section 4.1.2): someone else may hold it, so the grant it was issued under
// is revoked, and every token issued from it with it.
export async function redeemCode(db: Queryable, input: CodeRedemption): Promise<{ grantId: string; scope: OAuthScope }> {
  const codeHash = hashToken(input.code);
  const row = await db.queryOne<CodeRow>(
    `update oauth_codes oc set spent_at = now()
     from oauth_grants g, oauth_clients c
     where oc.code_hash = $1 and oc.spent_at is null and g.id = oc.grant_id and c.id = g.client_id
     returning oc.grant_id, oc.redirect_uri, oc.code_challenge, oc.resource, oc.expires_at, g.scope, c.client_id`,
    [codeHash],
  );
  if (!row) {
    // As for refresh tokens, only a replay by the client the code was
    // issued to revokes: another client cannot end someone's approval.
    const spent = await db.queryOne<{ grant_id: string }>(
      `select oc.grant_id from oauth_codes oc
       join oauth_grants g on g.id = oc.grant_id join oauth_clients c on c.id = g.client_id
       where oc.code_hash = $1 and oc.spent_at is not null and c.client_id = $2`,
      [codeHash, input.clientId],
    );
    if (spent) {
      await deleteGrant(db, spent.grant_id);
      throw new TokenError(
        'invalid_grant',
        'That authorization code had already been used. The approval has been revoked; authorize the client again.',
      );
    }
    throw new TokenError('invalid_grant', 'That authorization code is not valid.');
  }
  if (row.expires_at.getTime() <= Date.now()) {
    throw new TokenError('invalid_grant', 'That authorization code has expired.');
  }
  if (row.client_id !== input.clientId) {
    throw new TokenError('invalid_grant', 'That authorization code was issued to a different client.');
  }
  if (row.redirect_uri !== input.redirectUri) {
    throw new TokenError('invalid_grant', 'The redirect URI does not match the one the code was issued for.');
  }
  if (row.resource !== input.resource) {
    throw new TokenError('invalid_grant', 'The resource does not match the one the code was issued for.');
  }
  if (!safeEqual(s256(input.codeVerifier), row.code_challenge)) {
    throw new TokenError('invalid_grant', 'The code verifier does not match the challenge.');
  }
  return { grantId: row.grant_id, scope: row.scope };
}

// Tokens.

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  // Seconds, as the token response says it.
  expiresIn: number;
}

const FOREIGN_KEY_VIOLATION = '23503';

// A pair for an approval. The approval can be revoked between spending the
// credential and this insert (a lost refresh race, the user in Connected
// apps): the foreign key then fails, and that answers as the approval gone.
export async function issueTokens(db: Queryable, grantId: string, resource: string): Promise<IssuedTokens> {
  const accessToken = mint(ACCESS_PREFIX);
  const refreshToken = mint(REFRESH_PREFIX);
  const now = Date.now();
  try {
    await db.query(
      `insert into oauth_tokens (grant_id, kind, token_hash, resource, expires_at)
       values ($1, 'access', $2, $3, $4), ($1, 'refresh', $5, $3, $6)`,
      [
        grantId,
        hashToken(accessToken),
        resource,
        new Date(now + ACCESS_TTL_MS),
        hashToken(refreshToken),
        new Date(now + REFRESH_TTL_MS),
      ],
    );
  } catch (error) {
    if ((error as { code?: unknown }).code === FOREIGN_KEY_VIOLATION) {
      throw new TokenError('invalid_grant', 'That approval has been revoked.');
    }
    throw error;
  }
  return { accessToken, refreshToken, expiresIn: Math.floor(ACCESS_TTL_MS / 1000) };
}

interface RefreshRow {
  id: string;
  grant_id: string;
  resource: string;
  expires_at: Date;
  rotated_at: Date | null;
  scope: OAuthScope;
  client_id: string;
}

export interface RefreshRedemption {
  refreshToken: string;
  clientId: string;
  // Checked only when the client states one.
  resource?: string | undefined;
}

async function revokeForReuse(db: Queryable, grantId: string): Promise<never> {
  await deleteGrant(db, grantId);
  throw new TokenError(
    'invalid_grant',
    'That refresh token had already been exchanged. The approval has been revoked; authorize the client again.',
  );
}

// Exchanges a refresh token, rotating it. One already exchanged revokes the
// whole approval (OAuth 2.1 for public clients): either it was stolen or the
// client lost a race, and either way someone else may hold a copy. Two at
// once are that race: the retiring write is conditional on the row still
// being unrotated, so the second waits on the first's lock, changes nothing
// and is treated as reuse. Single statements, no transaction, so no rollback
// can undo the revocation.
export async function rotateRefreshToken(
  db: Queryable,
  input: RefreshRedemption,
): Promise<{ grantId: string; scope: OAuthScope; resource: string }> {
  const row = await db.queryOne<RefreshRow>(
    `select t.id, t.grant_id, t.resource, t.expires_at, t.rotated_at, g.scope, c.client_id
     from oauth_tokens t
     join oauth_grants g on g.id = t.grant_id
     join oauth_clients c on c.id = g.client_id
     where t.token_hash = $1 and t.kind = 'refresh'`,
    [hashToken(input.refreshToken)],
  );
  if (!row) throw new TokenError('invalid_grant', 'That refresh token is not valid.');
  // A public client has no secret: the client_id is what stops another
  // client spending a leaked refresh token (RFC 6749 section 3.2.1). Checked
  // before reuse, so another client cannot revoke a grant by replaying one.
  if (row.client_id !== input.clientId) {
    throw new TokenError('invalid_grant', 'That refresh token was issued to a different client.');
  }
  if (row.rotated_at) return revokeForReuse(db, row.grant_id);
  if (row.expires_at.getTime() <= Date.now()) {
    await db.query('delete from oauth_tokens where id = $1', [row.id]);
    throw new TokenError('invalid_grant', 'That refresh token has expired.');
  }
  if (input.resource !== undefined && input.resource !== row.resource) {
    throw new TokenError('invalid_grant', 'The resource does not match the one the token was issued for.');
  }
  // Marked, not deleted: the row is what recognises a second presentation.
  const retired = await db.queryOne<{ id: string }>(
    'update oauth_tokens set rotated_at = now() where id = $1 and rotated_at is null returning id',
    [row.id],
  );
  if (!retired) return revokeForReuse(db, row.grant_id);
  return { grantId: row.grant_id, scope: row.scope, resource: row.resource };
}

// RFC 7009: the approval behind either kind of token goes. An unknown value
// is a silent success: the endpoint must not say which tokens exist.
export async function revokeByTokenValue(db: Queryable, value: string): Promise<void> {
  if (!value) return;
  const row = await db.queryOne<{ grant_id: string }>('select grant_id from oauth_tokens where token_hash = $1', [
    hashToken(value),
  ]);
  if (row) await deleteGrant(db, row.grant_id);
}

// Verification.

export interface McpCaller {
  userId: string;
  scope: OAuthScope;
  grantId: string;
  expiresAt: Date;
  clientName: string;
}

interface AccessRow {
  id: string;
  grant_id: string;
  expires_at: Date;
  resource: string;
  scope: OAuthScope;
  last_used_at: Date | null;
  client_name: string;
  user_id: string;
}

// The caller a bearer value acts as, or null for every reason alike
// (unknown, expired, another resource, approval revoked), so the 401 says
// nothing about which tokens exist. Opaque tokens make this one lookup that
// also proves the approval still stands.
export async function verifyAccessToken(db: Queryable, value: string, resource: string): Promise<McpCaller | null> {
  if (!value) return null;
  const row = await db.queryOne<AccessRow>(
    `select t.id, t.grant_id, t.expires_at, t.resource, g.scope, g.last_used_at, c.client_name, g.user_id
     from oauth_tokens t
     join oauth_grants g on g.id = t.grant_id
     join oauth_clients c on c.id = g.client_id
     where t.token_hash = $1 and t.kind = 'access'`,
    [hashToken(value)],
  );
  if (!row) return null;
  if (row.expires_at.getTime() <= Date.now()) {
    await db.query('delete from oauth_tokens where id = $1', [row.id]);
    return null;
  }
  // RFC 8707: a token works at the resource it was issued for and nowhere
  // else.
  if (row.resource !== resource) return null;
  if (Date.now() - (row.last_used_at?.getTime() ?? 0) > LAST_USED_WRITE_INTERVAL_MS) {
    await db.query('update oauth_grants set last_used_at = now() where id = $1', [row.grant_id]);
  }
  return {
    userId: row.user_id,
    scope: row.scope,
    grantId: row.grant_id,
    expiresAt: row.expires_at,
    clientName: row.client_name,
  };
}

// Expired codes and tokens, on each token request and by purge. A rotated
// refresh token stays until its own expiry, so its reuse is still caught.
export async function sweepExpired(db: Queryable): Promise<{ codes: number; tokens: number }> {
  const codes = await db.query('delete from oauth_codes where expires_at < now() returning id');
  const tokens = await db.query('delete from oauth_tokens where expires_at < now() returning id');
  return { codes: codes.length, tokens: tokens.length };
}

export const tokenLifetimes = { CODE_TTL_MS, ACCESS_TTL_MS, REFRESH_TTL_MS, LAST_USED_WRITE_INTERVAL_MS };
