import { expect, request as apiRequest, test, type APIRequestContext } from '@playwright/test';
import { rmSync } from 'node:fs';
import setup from '../../../../e2e/global-setup.js';
import { baseURL, compose, password, username } from '../../../../e2e/stack.js';
import { launch, signInThroughBrowser, tempUserData } from './launch.js';

// The design's risk on many providers on one socket in main (desktop-app
// design, Risks): the first sync of PROMPTBOOK_PROVE_PROJECTS projects (e.g.
// 60) against the e2e stack, its time and main's memory, and the socket
// staying up for 30 seconds after. Opt-in: it adds that many projects to the
// e2e account.

const count = Number(process.env.PROMPTBOOK_PROVE_PROJECTS ?? 0);
test.skip(!count, 'PROMPTBOOK_PROVE_PROJECTS is not set');

let api: APIRequestContext;
const userData = tempUserData();

test.beforeAll(async () => {
  test.setTimeout(900_000);
  setup();
  api = await apiRequest.newContext({ baseURL });
  await api.post('/api/auth/login', { data: { username, password }, headers: { origin: baseURL } });
  const { projects } = (await (await api.get('/api/projects')).json()) as { projects: unknown[] };
  for (let i = projects.length; i < count; i++) {
    const made = await api.post('/api/projects', {
      headers: { origin: baseURL },
      data: { category: 'one-shot', title: `Prova ${i}`, campaignId: null, status: 'draft', seed: '' },
    });
    expect(made.status()).toBe(201);
  }
});

test.afterAll(async () => {
  await api?.dispose();
  rmSync(userData, { recursive: true, force: true });
  if (!process.env.KEEP_STACK) compose('down', '-v');
});

test(`first sync of ${count} projects`, async () => {
  const app = await launch(userData, { PROMPTBOOK_SERVER: baseURL });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('load');
    const before = await app.evaluate(() => process.memoryUsage().rss);
    await signInThroughBrowser(app, page, baseURL, { username, password });
    const signedIn = Date.now();
    await expect
      .poll(
        async () => {
          const s = await page.evaluate(() => window.promptbook.sync.status());
          return s.projects.length >= count && s.projects.every((p) => p.downloaded && p.synced);
        },
        { timeout: 120_000, intervals: [100] },
      )
      .toBe(true);
    const took = Date.now() - signedIn;
    const after = await app.evaluate(() => process.memoryUsage().rss);
    await page.waitForTimeout(30_000);
    const later = await page.evaluate(() => window.promptbook.sync.status());
    const settled = await app.evaluate(() => process.memoryUsage().rss);
    console.log(
      `First sync: ${later.projects.length} projects in ${took} ms; main RSS ${Math.round(before / 1e6)} MB before, ` +
        `${Math.round(after / 1e6)} MB synced, ${Math.round(settled / 1e6)} MB 30 s later; ` +
        `online ${later.online}, offlineSince ${later.offlineSince}`,
    );
    expect(later.online).toBe(true);
    expect(later.offlineSince).toBeNull();
    expect(later.projects.every((p) => p.synced && p.unsynced === 0)).toBe(true);
  } finally {
    await app.close();
  }
});
