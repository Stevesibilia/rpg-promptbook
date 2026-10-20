import { defineConfig } from '@playwright/test';

// The desktop app's proofs, driven through Playwright's Electron support:
// the window on promptbook://app (app.spec.ts, no server needed) and offline
// editing against the e2e compose stack (offline.spec.ts, which starts the
// stack and removes it unless KEEP_STACK=1). Run after building the web and
// the desktop: `npm run build -w promptbook-web && npm run build -w
// promptbook-desktop && npm run prove -w promptbook-desktop`.
export default defineConfig({
  testDir: '.',
  outputDir: '../../../../test-results/desktop',
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: 'list',
});
