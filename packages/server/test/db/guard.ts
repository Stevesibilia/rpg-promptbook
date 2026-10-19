// The database tests drop and recreate their database, so they refuse any
// name that does not end in _test.
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL must be set to run the database tests.');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to run: TEST_DATABASE_URL must name a database ending in _test (got "${name}").`);
  }
  return url;
}
