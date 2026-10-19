import { afterAll, afterEach, beforeEach } from 'vitest';
import { closeApps, db } from './helpers.js';

// Every test starts from empty tables; the migrations stay applied.
beforeEach(async () => {
  const tables = await db.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' and tablename <> '_migrations'",
  );
  if (tables.length > 0) {
    await db.query(`truncate ${tables.map((t) => `"${t.tablename}"`).join(', ')} restart identity cascade`);
  }
});
afterEach(closeApps);
afterAll(() => db.close());
