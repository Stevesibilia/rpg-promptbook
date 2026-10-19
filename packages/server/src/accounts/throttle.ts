import type { Db } from '../db.js';
import { AppError } from '../errors.js';

// Failed sign-ins allowed per window, each key counted on its own. The
// username limit bounds guesses at one password; the address limit counts
// across every username behind one address, so it is higher.
export const WINDOW_MINUTES = 15;
const USERNAME_MAX_FAILURES = 10;
const ADDRESS_MAX_FAILURES = 30;

export const TOO_MANY_ATTEMPTS = `Wrong username or password. Too many failed attempts: wait ${WINDOW_MINUTES} minutes and try again.`;

// Takes the attempt's place in both counts before its password is checked,
// in the same transaction as the check against the limits, under a lock per
// key. A count taken first and a failure recorded after a slow verification
// would let every request arriving in between pass. A failed attempt keeps
// its place; a successful one gives it back with releaseAttempt.
export async function reserveAttempt(db: Db, username: string, ip: string): Promise<string> {
  const name = username.trim().toLowerCase();
  return db.withTransaction(async (tx) => {
    for (const key of [`address:${ip}`, `username:${name}`]) {
      await tx.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`promptbook-login|${key}`]);
    }
    const counts = await tx.queryOne<{ by_username: string; by_address: string }>(
      `select count(*) filter (where username = $1) as by_username,
              count(*) filter (where ip = $2::inet) as by_address
       from login_failures
       where at > now() - make_interval(mins => $3) and (username = $1 or ip = $2::inet)`,
      [name, ip, WINDOW_MINUTES],
    );
    if (Number(counts?.by_username) >= USERNAME_MAX_FAILURES || Number(counts?.by_address) >= ADDRESS_MAX_FAILURES) {
      throw new AppError(429, 'too_many_attempts', TOO_MANY_ATTEMPTS);
    }
    const row = await tx.queryOne<{ id: string }>(
      'insert into login_failures (username, ip) values ($1, $2::inet) returning id',
      [name, ip],
    );
    return row!.id;
  });
}

export async function releaseAttempt(db: Db, id: string): Promise<void> {
  await db.query('delete from login_failures where id = $1', [id]);
}
