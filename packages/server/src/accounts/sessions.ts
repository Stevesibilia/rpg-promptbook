import { createHash, randomBytes } from 'node:crypto';
import type { Queryable } from '../db.js';
import type { User } from './users.js';

// 32 random bytes: far beyond guessing, which is why a plain SHA-256 of the
// token is enough in the database. The token itself is never stored.
const TOKEN_BYTES = 32;

// Skip the last_seen_at write unless the row is at least this stale.
const LAST_SEEN_WRITE_INTERVAL_MS = 60_000;

export interface Session {
  // SHA-256 hex of the cookie's token: the session's id everywhere.
  tokenHash: string;
  user: User;
}

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export async function createSession(
  db: Queryable,
  userId: string,
  ttlHours: number,
): Promise<{ token: string; tokenHash: string; expiresAt: Date }> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);
  await db.query('insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)', [
    tokenHash,
    userId,
    expiresAt,
  ]);
  return { token, tokenHash, expiresAt };
}

// The session and user behind a cookie value, or null when it is unknown or
// expired. An expired row is deleted on the way past.
export async function resolveSession(db: Queryable, token: string): Promise<Session | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = await db.queryOne<{
    expires_at: Date;
    last_seen_at: Date;
    id: string;
    username: string;
    display_name: string;
  }>(
    `select s.expires_at, s.last_seen_at, u.id, u.username, u.display_name
     from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1`,
    [tokenHash],
  );
  if (!row) return null;
  if (row.expires_at.getTime() <= Date.now()) {
    await db.query('delete from sessions where token_hash = $1', [tokenHash]);
    return null;
  }
  if (Date.now() - row.last_seen_at.getTime() > LAST_SEEN_WRITE_INTERVAL_MS) {
    await db.query('update sessions set last_seen_at = now() where token_hash = $1', [tokenHash]);
  }
  return { tokenHash, user: { id: row.id, username: row.username, displayName: row.display_name } };
}

export async function deleteSession(db: Queryable, tokenHash: string): Promise<void> {
  await db.query('delete from sessions where token_hash = $1', [tokenHash]);
}

// Every session of a user but one; returns the hashes ended, so their sync
// connections can be closed too.
export async function deleteOtherSessions(db: Queryable, userId: string, keep: string | null): Promise<string[]> {
  const rows = await db.query<{ token_hash: string }>(
    'delete from sessions where user_id = $1 and token_hash is distinct from $2 returning token_hash',
    [userId, keep],
  );
  return rows.map((row) => row.token_hash);
}
