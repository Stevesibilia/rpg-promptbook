import { defineConfig, devices } from '@playwright/test';
import { baseURL, issuerHost } from './stack.js';

// End-to-end tests against the compose stack. `npm run e2e` builds and starts
// it on E2E_PORT (8091), runs the tests and removes it with its volume, unless
// KEEP_STACK=1. The desktop project needs the desktop app built.
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
  projects: [
    {
      name: 'chromium',
      // The desktop app has its own project.
      testIgnore: 'desktop.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        // The single sign-on tests' issuer, published on this machine.
        launchOptions: { args: [`--host-resolver-rules=MAP ${issuerHost} 127.0.0.1`] },
      },
    },
    // The desktop app through Playwright's Electron support, from the
    // unpackaged build: `npm run build -w promptbook-web && npm run build -w
    // promptbook-desktop` first. Its browser steps use Chromium.
    {
      name: 'desktop',
      testMatch: 'desktop.spec.ts',
      timeout: 120_000,
    },
  ],
});
