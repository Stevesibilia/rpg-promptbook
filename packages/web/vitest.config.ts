import { defineConfig } from 'vitest/config';

// The logic that lives outside the components: list filtering and grouping,
// the sync state, dates. Pure functions, so no browser environment, except
// test/pdf-sanitize.test.ts, which runs under jsdom: the PDF's SVG sanitiser
// is about how a browser's XML parser reads hostile markup.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
