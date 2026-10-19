import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { signIn as signInWithPassword, syncPill } from './helpers.js';
import { baseURL, issuerHost, issuerPort, oidcURL } from './stack.js';

// Single sign-on (#17), against the second app of the stack and the test
// issuer, whose page stands in for Authentik's: it asks who signs in and how
// the sign-in ends. Its certificate comes from a throwaway CA, which the app
// trusts and the browser is told to accept.
test.use({ baseURL: oidcURL, ignoreHTTPSErrors: true });

// Each test signs in as a new identity, so the first sign-in creates it.
const someone = (name: string) => `${name}-${Date.now().toString(36)}`;

async function atIssuer(page: Page, username: string, outcome = 'Sign in'): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`^https://${issuerHost}:${issuerPort}/application/o/authorize/`));
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Name', { exact: true }).fill(`GM ${username}`);
  await page.getByLabel('Email', { exact: true }).fill(`${username}@example.org`);
  await page.getByRole('button', { name: outcome, exact: true }).click();
}

async function signIn(page: Page, username: string, path = '/'): Promise<void> {
  await page.goto(path);
  await page.getByRole('button', { name: 'Sign in with Authentik' }).click();
  await atIssuer(page, username);
  await expect(syncPill(page)).toBeVisible();
}

async function createProject(request: APIRequestContext, title: string): Promise<{ id: string; title: string }> {
  const unique = `${title} ${Date.now().toString(36)}`;
  const response = await request.post('/api/projects', {
    headers: { origin: oidcURL },
    data: { category: 'one-shot', title: unique, campaignId: null, status: 'draft', seed: '' },
  });
  expect(response.status()).toBe(201);
  const { project } = (await response.json()) as { project: { id: string } };
  return { id: project.id, title: unique };
}

test('the first sign-in creates the account and lands on the page asked for', async ({ page }) => {
  const username = someone('gm');
  await page.goto('/settings/account');
  await expect(page.getByLabel('Password')).toHaveCount(0);
  await expect(page.locator('.auth .foot')).toHaveText(
    `localhost · accounts come from ${issuerHost}:${issuerPort}. The first sign-in creates yours.`,
  );
  await page.getByRole('button', { name: 'Sign in with Authentik' }).click();
  await atIssuer(page, username);

  await expect(page).toHaveURL(`${oidcURL}/settings/account`);
  const account = page.locator('section', { has: page.getByRole('heading', { name: 'Account' }) });
  await expect(account.locator('.lead')).toHaveText('Your account comes from Authentik. Players have no accounts.');
  await expect(account.getByLabel('Display name')).toHaveValue(`GM ${username}`);
  await expect(
    account.getByText('Taken from Authentik at the first sign-in; change it here if you like.'),
  ).toBeVisible();
  await expect(account.getByLabel('Username')).toHaveValue(username);
  await expect(account.locator('.okline')).toHaveText(`Signed in through Authentik · ${username}@example.org`);
  await expect(account.getByRole('button', { name: /password/i })).toHaveCount(0);

  // Passwords are refused while single sign-on is on.
  const login = await page.request.post('/api/auth/login', {
    headers: { origin: oidcURL },
    data: { username, password: 'whatever-password' },
  });
  expect(login.status()).toBe(403);
  expect(((await login.json()) as { error: string }).error).toBe('password_sign_in_off');
});

for (const [outcome, message] of [
  ['Cancel', 'Sign-in was cancelled or took too long. Try again.'],
  ['Sign in, then go down before the token exchange', 'Authentik could not be reached. Try again in a minute.'],
  ['Sign in with a badly signed ID token', 'Sign-in failed. Try again.'],
] as const) {
  test(`a sign-in ending with "${outcome}" says so once`, async ({ page }) => {
    await page.goto('/bin');
    await page.getByRole('button', { name: 'Sign in with Authentik' }).click();
    await atIssuer(page, someone('gm'), outcome);

    await expect(page.getByRole('alert')).toHaveText(message);
    // The reason leaves the address once shown, and a reload does not repeat it.
    await expect(page).toHaveURL(`${oidcURL}/`);
    await expect(page.getByRole('alert')).toHaveText(message);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign in with Authentik' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

test('signing out in another tab asks to sign in, in a new window, and typed text still arrives', async ({
  browser,
}) => {
  const username = someone('gm');
  const context = await browser.newContext({ baseURL: oidcURL, ignoreHTTPSErrors: true });
  const editing = await context.newPage();
  await signIn(editing, username);
  const project = await createProject(editing.request, 'Sessione finita');
  await editing.goto(`/projects/${project.id}`);
  await expect(editing.locator('.cm-content')).toContainText(project.title);

  const other = await context.newPage();
  await other.goto('/');
  await syncPill(other).click();
  await other.getByRole('button', { name: 'Sign out' }).click();
  await expect(other.getByRole('button', { name: 'Sign in with Authentik' })).toBeVisible();

  await expect(syncPill(editing)).toHaveText(/Sign in to sync/);
  await editing.locator('.cm-content').click();
  await editing.keyboard.press('ControlOrMeta+Home');
  await editing.keyboard.type('Scritto dopo la fine della sessione.\n');

  await editing.getByRole('alert').getByRole('button', { name: 'Sign in…' }).click();
  const dialog = editing.getByRole('dialog', { name: 'Sign in to sync' });
  const opened = editing.waitForEvent('popup');
  await dialog.getByRole('button', { name: 'Sign in with Authentik' }).click();
  const popup = await opened;
  await atIssuer(popup, username);
  await expect(popup.getByText('You are signed in. You can close this window.')).toBeVisible();

  // The page kept its text and sends it with the new session.
  await expect(dialog).toHaveCount(0);
  await expect(syncPill(editing)).toHaveAttribute('data-state', 'synced', { timeout: 15_000 });
  await expect(editing.getByRole('alert')).toHaveCount(0);
  // The tab that signed out picked the new session up too.
  await expect(other.getByRole('heading', { name: 'Projects' })).toBeVisible();

  const check = await browser.newContext({ baseURL: oidcURL, ignoreHTTPSErrors: true });
  const reader = await check.newPage();
  await signIn(reader, username, `/projects/${project.id}`);
  await expect(reader.locator('.cm-content')).toContainText('Scritto dopo la fine della sessione.');
  await context.close();
  await check.close();
});

test('with single sign-on off, the password form and the password section stay', async ({ page }) => {
  await page.goto(`${baseURL}/`);
  await expect(page.getByRole('button', { name: /Sign in with/ })).toHaveCount(0);
  await expect(page.locator('.auth .foot')).toHaveText(
    "localhost · no sign-up: the game master's account is created on the server.",
  );
  await signInWithPassword(page, `${baseURL}/settings/account`);
  const account = page.locator('section', { has: page.getByRole('heading', { name: 'Account' }) });
  await expect(account.locator('.lead')).toHaveText('One game master per server. Players have no accounts.');
  await expect(account.getByRole('button', { name: 'Change password…' })).toBeVisible();
  await expect(account.locator('.okline')).toHaveCount(0);
  const config = await page.request.get(`${baseURL}/api/auth/config`);
  expect(await config.json()).toEqual({ signIn: 'password' });
});
