import { _electron, chromium, expect, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const desktop = fileURLToPath(new URL('../..', import.meta.url));

export const tempUserData = () => mkdtempSync(join(tmpdir(), 'promptbook-desktop-'));

// The unpackaged app from dist/main.cjs, with its data in `userData`.
export function launch(userData: string, env: Record<string, string> = {}): Promise<ElectronApplication> {
  return _electron.launch({
    args: [join(desktop, 'dist/main.cjs')],
    cwd: desktop,
    env: { ...process.env, PROMPTBOOK_E2E: '1', PROMPTBOOK_USER_DATA: userData, ...env } as Record<string, string>,
  });
}

// Sign-in as the user does it: the app starts it through the bridge, and the
// system browser, already signed in to the server, comes back to the
// loopback listener. Answers when the browser tab says Signed in.
export async function signInThroughBrowser(
  app: ElectronApplication,
  page: Page,
  server: string,
  { username, password }: { username: string; password: string },
): Promise<void> {
  await page.evaluate((server) => window.promptbook.auth.start(server), server);
  await expect.poll(() => app.evaluate(() => globalThis.__promptbookAuthorizeUrl ?? '')).toMatch(/\/authorize\?/);
  const url = await app.evaluate(() => globalThis.__promptbookAuthorizeUrl!);
  expect(new URL(url).searchParams.get('client_id')).toBe('promptbook-desktop');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL: server });
    const tab = await context.newPage();
    await tab.goto('/');
    await tab.getByLabel('Username').fill(username);
    await tab.getByLabel('Password').fill(password);
    await tab.getByRole('button', { name: 'Sign in' }).click();
    await expect(tab.locator('button.sync')).toBeVisible();
    // No consent page: straight to the loopback's Signed in.
    await tab.goto(url);
    await expect(tab.getByText('Signed in to Promptbook on this computer. You can close this tab.')).toBeVisible();
    await expect(tab.getByText(new RegExp(`^${new URL(server).host} · .+ · local account$`))).toBeVisible();
    expect(tab.url()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback\?/);
  } finally {
    await browser.close();
  }
}
