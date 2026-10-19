import type { Queryable } from '../db.js';
import { AppError } from '../errors.js';
import { hashPassword } from './passwords.js';

export interface User {
  id: string;
  username: string;
  displayName: string;
}

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
}

const toUser = (row: UserRow): User => ({ id: row.id, username: row.username, displayName: row.display_name });

// Letters, digits, dot, dash and underscore; compared without case.
const USERNAME = /^[\p{L}\p{N}._-]{1,64}$/u;

export function assertUsername(username: string): void {
  if (!USERNAME.test(username)) {
    throw new AppError(
      400,
      'invalid_username',
      'A username has 1 to 64 letters, digits, dots, dashes or underscores.',
    );
  }
}

export async function findUserByUsername(db: Queryable, username: string): Promise<(User & { passwordHash: string }) | null> {
  const row = await db.queryOne<UserRow>('select * from users where lower(username) = lower($1)', [username.trim()]);
  return row ? { ...toUser(row), passwordHash: row.password_hash } : null;
}

export async function countUsers(db: Queryable): Promise<number> {
  const row = await db.queryOne<{ count: string }>('select count(*) as count from users');
  return Number(row?.count ?? 0);
}

export async function createUser(
  db: Queryable,
  input: { username: string; password: string; displayName?: string | undefined },
): Promise<User> {
  const username = input.username.trim();
  assertUsername(username);
  const passwordHash = await hashPassword(input.password);
  const displayName = input.displayName?.trim() || username;
  try {
    const row = await db.queryOne<UserRow>(
      'insert into users (username, display_name, password_hash) values ($1, $2, $3) returning *',
      [username, displayName, passwordHash],
    );
    return toUser(row!);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError(409, 'username_taken', `The username "${username}" is taken.`);
    }
    throw error;
  }
}

export async function setPassword(db: Queryable, userId: string, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await db.query('update users set password_hash = $2, updated_at = now() where id = $1', [userId, passwordHash]);
}

export async function setDisplayName(db: Queryable, userId: string, displayName: string): Promise<User> {
  const row = await db.queryOne<UserRow>(
    'update users set display_name = $2, updated_at = now() where id = $1 returning *',
    [userId, displayName],
  );
  return toUser(row!);
}

// The account from PROMPTBOOK_ADMIN_USERNAME and PROMPTBOOK_ADMIN_PASSWORD,
// created only on a database with no account at all. Returns it when created.
export async function ensureAdmin(
  db: { withTransaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> },
  admin: { username: string; password: string } | null,
): Promise<User | null> {
  if (!admin) return null;
  return db.withTransaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtextextended('promptbook-admin', 0))");
    if ((await countUsers(tx)) > 0) return null;
    return createUser(tx, admin);
  });
}
