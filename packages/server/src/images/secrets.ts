import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Queryable } from '../db.js';

// Each account's OpenRouter key (board-image-generation design decision 1)
// and Atelier API token (atelier-image-provider design decision 4), sealed
// with AES-256-GCM under the server's PROMPTBOOK_SECRETS_KEY: a random 12-byte
// IV per save, the 16-byte tag, and "<userId>/<kind>" as the additional data,
// so a row copied to another account or kind does not open. The plain secret
// is never stored, answered or logged.

export type SecretKind = 'openrouter' | 'atelier';

export interface Sealed {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

const ALGORITHM = 'aes-256-gcm';
const aad = (userId: string, kind: SecretKind) => Buffer.from(`${userId}/${kind}`, 'utf8');

export function sealSecret(serverKey: Buffer, userId: string, kind: SecretKind, plain: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, serverKey, iv, { authTagLength: 16 });
  cipher.setAAD(aad(userId, kind));
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

// The plain secret, or null when the row does not open: another server key,
// another account's row, or bytes changed.
export function openSecret(serverKey: Buffer, userId: string, kind: SecretKind, sealed: Sealed): string | null {
  try {
    if (sealed.iv.length !== 12 || sealed.tag.length !== 16) return null;
    const decipher = createDecipheriv(ALGORITHM, serverKey, sealed.iv, { authTagLength: 16 });
    decipher.setAAD(aad(userId, kind));
    decipher.setAuthTag(sealed.tag);
    return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// The last four characters, shown masked in Settings.
export const keyHint = (plain: string) => plain.slice(-4);

export async function saveSecret(
  db: Queryable,
  serverKey: Buffer,
  userId: string,
  kind: SecretKind,
  plain: string,
): Promise<void> {
  const { ciphertext, iv, tag } = sealSecret(serverKey, userId, kind, plain);
  await db.query(
    `insert into user_secrets (user_id, kind, ciphertext, iv, tag, hint, checked_at)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (user_id, kind) do update
       set ciphertext = excluded.ciphertext, iv = excluded.iv, tag = excluded.tag, hint = excluded.hint,
           checked_at = excluded.checked_at, updated_at = now()`,
    [userId, kind, ciphertext, iv, tag, keyHint(plain)],
  );
}

export type StoredSecret =
  | { state: 'none' }
  | { state: 'unreadable' }
  | { state: 'ok'; key: string; hint: string; checkedAt: string };

export async function readSecret(db: Queryable, serverKey: Buffer, userId: string, kind: SecretKind): Promise<StoredSecret> {
  const row = await db.queryOne<{ ciphertext: Buffer; iv: Buffer; tag: Buffer; hint: string; checked_at: Date }>(
    `select ciphertext, iv, tag, hint, checked_at from user_secrets where user_id = $1 and kind = $2`,
    [userId, kind],
  );
  if (!row) return { state: 'none' };
  const key = openSecret(serverKey, userId, kind, row);
  if (key === null) return { state: 'unreadable' };
  return { state: 'ok', key, hint: row.hint, checkedAt: row.checked_at.toISOString() };
}

// Records a successful check of the saved secret.
export async function markSecretChecked(db: Queryable, userId: string, kind: SecretKind): Promise<string | null> {
  const row = await db.queryOne<{ checked_at: Date }>(
    `update user_secrets set checked_at = now() where user_id = $1 and kind = $2 returning checked_at`,
    [userId, kind],
  );
  return row?.checked_at.toISOString() ?? null;
}

export async function removeSecret(db: Queryable, userId: string, kind: SecretKind): Promise<void> {
  await db.query(`delete from user_secrets where user_id = $1 and kind = $2`, [userId, kind]);
}
