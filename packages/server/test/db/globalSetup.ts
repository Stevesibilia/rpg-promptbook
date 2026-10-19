import pg from 'pg';
import { createDb } from '../../src/db.js';
import { runMigrations } from '../../src/migrate.js';
import { testDatabaseUrl } from './guard.js';

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

// Runs once before every test file: recreates the database and applies every
// migration, so each run proves the schema from empty as a new install does.
export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const name = new URL(url).pathname.replace(/^\//, '');
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`drop database if exists ${quote(name)} with (force)`);
    await client.query(`create database ${quote(name)}`);
  } finally {
    await client.end();
  }
  const db = createDb(url);
  try {
    await runMigrations(db);
  } finally {
    await db.close();
  }
}
