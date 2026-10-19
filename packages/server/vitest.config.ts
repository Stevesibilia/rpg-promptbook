import { defineConfig } from 'vitest/config';

// The database tests need a real Postgres at TEST_DATABASE_URL, a database
// whose name ends in _test (test/db/globalSetup.ts recreates it). Without one
// they are skipped locally and refused in CI.
const database = process.env.TEST_DATABASE_URL;
if (!database && process.env.CI) throw new Error('TEST_DATABASE_URL must be set to run the database tests in CI.');
if (!database) console.warn('TEST_DATABASE_URL is not set: skipping the database tests.');

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['test/unit/**/*.test.ts'] } },
      ...(database
        ? [
            {
              test: {
                name: 'db',
                include: ['test/db/**/*.test.ts'],
                globalSetup: ['test/db/globalSetup.ts'],
                setupFiles: ['test/db/setup.ts'],
                // The files share one database; two at once would race each
                // other's truncation.
                fileParallelism: false,
                testTimeout: 20_000,
                hookTimeout: 60_000,
              },
            },
          ]
        : []),
    ],
  },
});
