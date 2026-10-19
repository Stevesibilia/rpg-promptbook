import { defineConfig, devices } from '@playwright/test';
import { baseURL } from './stack.js';

// End-to-end tests against the compose stack. `npm run e2e` builds and starts
// it on E2E_PORT (8091), runs the tests and removes it with its volume, unless
// KEEP_STACK=1.
export default defineConfig({
  testDir: '.',
  outputDir: '../test-results',
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  // The tests share one account; one at a time keeps them independent.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
