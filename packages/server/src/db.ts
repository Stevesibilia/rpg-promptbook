import pg from 'pg';

// The pool and the helpers every service uses, with the same shape inside and
// outside a transaction so a service can be written once.

export interface Queryable {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>;
}

export interface Db extends Queryable {
  pool: pg.Pool;
  withTransaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function wrap(client: pg.Pool | pg.PoolClient): Queryable {
  return {
    async query<T>(sql: string, params?: unknown[]) {
      return (await client.query(sql, params)).rows as T[];
    },
    async queryOne<T>(sql: string, params?: unknown[]) {
      return ((await client.query(sql, params)).rows[0] as T | undefined) ?? null;
    },
  };
}

export function createDb(connectionString: string): Db {
  const pool = new pg.Pool({
    connectionString,
    // Bounds both a new connection and the wait for a free client, so a
    // database that drops packets fails requests in seconds, not minutes.
    connectionTimeoutMillis: 5000,
  });
  return {
    ...wrap(pool),
    pool,
    async withTransaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn(wrap(client));
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
