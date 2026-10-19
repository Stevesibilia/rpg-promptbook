import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { baseURL, password, username } from './stack.js';

export async function signIn(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(syncPill(page)).toBeVisible();
}

export interface Created {
  id: string;
  title: string;
}

// A project of the test's own, so the tests do not depend on each other or on
// what an earlier run left behind.
export async function createProject(
  request: APIRequestContext,
  title: string,
  body: Record<string, unknown> = {},
): Promise<Created> {
  const unique = `${title} ${Date.now().toString(36)}`;
  const response = await request.post('/api/projects', {
    headers: { origin: baseURL },
    data: { category: 'one-shot', title: unique, campaignId: null, status: 'draft', seed: '', ...body },
  });
  expect(response.status()).toBe(201);
  const { project } = (await response.json()) as { project: { id: string } };
  return { id: project.id, title: unique };
}

export const row = (page: Page, title: string) => page.locator('.tr[data-id]', { hasText: title });

export const syncPill = (page: Page) => page.locator('button.sync');
