import { readdir, readFile } from 'node:fs/promises';
import type { Db } from './db.js';

// Next to src/ in development and next to dist/ in the image.
export const MIGRATIONS = new URL('../migrations/', import.meta.url);

// Applies every migration not yet recorded, in file name order. Each one and
// the record of having run it commit together, so a migration that fails
// halfway leaves nothing behind and runs again from the top next time.
export async function runMigrations(db: Db, log: (line: string) => void = () => {}): Promise<string[]> {
  await db.query(`
    create table if not exists _migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  const done = new Set((await db.query<{ name: string }>('select name from _migrations')).map((row) => row.name));
  const files = (await readdir(MIGRATIONS)).filter((file) => /^\d{3}_.+\.sql$/.test(file)).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(new URL(file, MIGRATIONS), 'utf8');
    await db.withTransaction(async (tx) => {
      // One runner at a time: two servers starting together would otherwise
      // both apply the same migration.
      await tx.query("select pg_advisory_xact_lock(hashtextextended('promptbook-migrations', 0))");
      if (await tx.queryOne('select 1 from _migrations where name = $1', [file])) return;
      await tx.query(sql);
      await tx.query('insert into _migrations (name) values ($1)', [file]);
      applied.push(file);
    });
    log(`Applied migration ${file}`);
  }
  return applied;
}
