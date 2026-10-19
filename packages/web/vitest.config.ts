import { defineConfig } from 'vitest/config';

// The logic that lives outside the components: list filtering and grouping,
// the sync state, dates. Pure functions, so no browser environment.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
