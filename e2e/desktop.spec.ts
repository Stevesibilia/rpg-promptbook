import { _electron, chromium, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Y from 'yjs';
import { createProject, row, signIn, syncPill, throttle } from './helpers.js';
import { midjourneyName, png } from './media.js';
import { baseURL, compose, password, username } from './stack.js';

// The desktop app against the compose stack (desktop-app design decision 17),
// through its own window: sign in through the browser, the first sync, an
// edit online, then with the server stopped an edit and a new project, a
// relaunch still offline, the server back with everything on it as the web
// client shows it, a local snapshot in History, and both ways of signing out.
// The board (asset-board design decision 18): images dropped offline stay on
// this computer across the relaunch, upload once the server is back and show
// on the web in the same scene; an image added on the web reaches the app.
// Runs the unpackaged app from packages/desktop/dist; in CI under xvfb-run.

const desktop = fileURLToPath(new URL('../packages/desktop/', import.meta.url));

// What the test reads of the bridge (packages/web/src/platform/bridge.ts).
interface Bridge {
  sync: {
    status(): Promise<{ online: boolean; projects: { id: string; downloaded: boolean; synced: boolean }[] }>;
    open(id: string): Promise<{ state: Uint8Array }>;
    update(id: string, update: Uint8Array): Promise<void>;
  };
  auth: { state(): Promise<{ session: string; remembered: boolean }> };
  files: { status(): Promise<{ waiting: unknown[]; downloading: number; refused: unknown[] }> };
}
declare global {
  interface Window {
    promptbook: Bridge;
  }
  var __promptbookAuthorizeUrl: string | undefined;
}

test.describe.configure({ mode: 'serial' });

const userData = mkdtempSync(join(tmpdir(), 'promptbook-desktop-e2e-'));
let app: ElectronApplication;
let page: Page;

// The app's account folder: one, once signed in.
const accountFolders = () => {
  const accounts = join(userData, 'accounts');
  return existsSync(accounts) ? readdirSync(accounts) : [];
};

async function launch(): Promise<void> {
  if (!existsSync(join(desktop, 'dist/main.cjs')) || !existsSync(join(desktop, 'app/web/index.html'))) {
    throw new Error('No desktop build: run npm run build -w promptbook-web && npm run build -w promptbook-desktop.');
  }
  app = await _electron.launch({
    args: [join(desktop, 'dist/main.cjs')],
    cwd: desktop,
    env: {
      ...process.env,
      PROMPTBOOK_E2E: '1',
      PROMPTBOOK_USER_DATA: userData,
      PROMPTBOOK_SERVER: baseURL,
      PROMPTBOOK_E2E_SNAPSHOT_SECONDS: '3',
    } as Record<string, string>,
  });
  page = await app.firstWindow();
  await page.waitForLoadState('load');
  await throttle(page);
}

// The system browser's part of signing in: signed in to the server, it
// follows the authorize URL main handed over and lands on the loopback page.
async function finishInBrowser(): Promise<void> {
  await expect.poll(() => app.evaluate(() => globalThis.__promptbookAuthorizeUrl ?? '')).toMatch(/\/authorize\?/);
  const url = await app.evaluate(() => globalThis.__promptbookAuthorizeUrl!);
  const browser = await chromium.launch();
  try {
    const tab = await (await browser.newContext({ baseURL })).newPage();
    await signIn(tab);
    await tab.goto(url);
    await expect(tab.getByText('Signed in to Promptbook on this computer. You can close this tab.')).toBeVisible();
    expect(tab.url()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback\?/);
  } finally {
    await browser.close();
  }
}

// A change made the way a second window makes it: main's document, a Yjs
// update of the change, sent over the bridge.
async function appendThroughBridge(id: string, text: string): Promise<void> {
  const state = await page.evaluate(async (id) => Array.from((await window.promptbook.sync.open(id)).state), id);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(state));
  let update: Uint8Array | null = null;
  doc.on('update', (u: Uint8Array) => (update = u));
  doc.getText('document').insert(doc.getText('document').length, text);
  await page.evaluate(({ id, update }) => window.promptbook.sync.update(id, new Uint8Array(update)), {
    id,
    update: Array.from(update!),
  });
}

const statusRight = () => page.locator('.status .r').last();
const computer = /this (Mac|PC|computer)/;

// The end of the document: the editor draws only the lines in view.
async function endOf(p: Page) {
  await p.locator('.cm-content').click();
  await p.keyboard.press('ControlOrMeta+End');
  return p.locator('.cm-content');
}

async function typeAtEnd(text: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(text);
}

test.afterAll(async () => {
  await app?.close().catch(() => {});
  rmSync(userData, { recursive: true, force: true });
  try {
    compose('start', 'app');
  } catch {
    // Already running.
  }
});

// Every picture of the row drawn: loaded, not an empty tile.
async function loadedImages(p: Page, sceneId: string): Promise<number> {
  return p
    .locator(`#row-${sceneId} .th-i img`)
    .evaluateAll((imgs) => imgs.filter((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0).length);
}

const PROMPT = 'A pier at dawn in Messina, fishing boats, cold light --ar 16:9 --v 8.1';
const APPENDIX = '\n\n## Appendice: immagini e musica\n\n### S1. Il molo\n\nvisual: a pier at dawn, fishing boats\n\nmood: calm, cold wind\n';
const offlineImages = [1, 2].map((n) => ({ name: midjourneyName(PROMPT, n), mimeType: 'image/png', buffer: png() }));

const stamp = Date.now().toString(36);
const online = `Scritto nel desktop, online ${stamp}.`;
const offline = `Scritto nel desktop, offline ${stamp}.`;
const newTitle = `La fiera di Randazzo ${stamp}`;
const newText = `Scritta offline ${stamp}.`;
let mine = { id: '', title: '' };

test('signs in through the browser and downloads every project', async ({ request }) => {
  test.setTimeout(180_000);
  const login = await request.post('/api/auth/login', { headers: { origin: baseURL }, data: { username, password } });
  expect(login.ok()).toBe(true);
  mine = await createProject(request, 'Desktop');

  await launch();
  await page.getByRole('button', { name: 'Continue in your browser' }).click();
  await expect(page.getByText('Finish signing in in your browser')).toBeVisible();
  await finishInBrowser();

  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible({ timeout: 90_000 });
  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced', { timeout: 90_000 });
  await expect(page.getByText('All on this device')).toBeVisible();
  await expect(row(page, mine.title)).toBeVisible();
  expect(accountFolders()).toHaveLength(1);
  // The unpackaged build is 0.0.0, which is no release: the rail shows none.
  await expect(page.locator('.rail .rail-version')).toBeAttached();
  await expect(page.getByRole('note', { name: /^Release / })).toHaveCount(0);
});

test('an edit online reaches the server', async () => {
  await row(page, mine.title).dblclick();
  await expect(page.locator('.cm-content')).toContainText(`titolo: ${mine.title}`);
  await typeAtEnd(`\n\n${online}`);
  // The board's appendix, for the steps offline.
  await page.keyboard.insertText(APPENDIX);
  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced', { timeout: 30_000 });
});

test('offline: an edit and a new project, kept across a relaunch', async () => {
  test.setTimeout(180_000);
  compose('stop', 'app');
  await expect(syncPill(page)).toHaveAttribute('data-state', 'local', { timeout: 60_000 });
  await expect(statusRight()).toHaveText('Offline · nothing waiting to sync');
  // Typed without a pause: one change.
  await typeAtEnd(`\n\n${offline}`);
  await expect(statusRight()).toHaveText('Offline · 1 change on this device');

  await page.getByRole('link', { name: 'Projects' }).first().click();
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Title').fill(newTitle);
  await dialog.getByRole('button', { name: /Create/ }).click();
  await expect(page.locator('.cm-content')).toContainText(`titolo: ${newTitle}`);
  await typeAtEnd(`\n\n${newText}`);
  await expect(statusRight()).toHaveText(/^Offline · [23] changes on this device$/);

  // A local snapshot shows up in an open History by itself.
  await page.goto(`promptbook://app/projects/${mine.id}/history`);
  await expect(page.getByText(/^Offline\. Server snapshots are shown as of/)).toBeVisible();
  const hourly = page.getByText('Hourly, while editing');
  const before = await hourly.count();
  await appendThroughBridge(mine.id, ' Ancora.');
  await expect.poll(() => hourly.count(), { timeout: 20_000 }).toBeGreaterThan(before);

  // The board offline: a prompt by hand, then two images dropped, kept here.
  await page.goto(`promptbook://app/projects/${mine.id}/board`);
  const s1 = page.locator('#row-S1');
  await s1.getByRole('button', { name: 'Write by hand' }).first().click();
  await page.getByLabel('Midjourney prompt for S1').fill(PROMPT);
  await s1.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.toast')).toHaveText('Saved.');
  await page.locator('.board input[type=file]').setInputFiles(offlineImages);
  await expect(page.locator('.info.good')).toContainText('2 files added: 2 matched, 0 to assign.', { timeout: 30_000 });
  await expect(s1.locator('.th-i .badge.dev')).toHaveCount(2);
  await expect(s1.locator('.th-i .badge.dev').first()).toHaveAttribute('title', 'On this computer. Uploads when you are back online');
  await expect(page.locator('.info.local')).toContainText(
    '2 files on this computer, uploaded when you are back online. Choosing and editing prompts work offline; they sync too.',
  );
  await expect(statusRight()).toHaveText(/^Offline · \d+ changes? on this device · 2 files waiting to upload$/);
  await expect.poll(() => loadedImages(page, 'S1')).toBe(2);

  // Quit and start again, still offline.
  await app.close();
  await launch();
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible({ timeout: 30_000 });
  await expect(row(page, newTitle)).toBeVisible();
  await row(page, mine.title).dblclick();
  await expect(page.locator('.cm-content')).toContainText(`titolo: ${mine.title}`);
  await expect(await endOf(page)).toContainText(offline);
  await page.getByRole('link', { name: 'Projects' }).first().click();
  await row(page, newTitle).dblclick();
  await expect(page.locator('.cm-content')).toContainText(`titolo: ${newTitle}`);
  await expect(await endOf(page)).toContainText(newText);
  // The images are still here, and still waiting.
  await page.goto(`promptbook://app/projects/${mine.id}/board`);
  await expect(page.locator('#row-S1 .th-i .badge.dev')).toHaveCount(2);
  await expect.poll(() => loadedImages(page, 'S1')).toBe(2);
});

test('back online: the web client has both edits and the new project', async () => {
  test.setTimeout(180_000);
  compose('start', 'app');
  // Up before going on: signing in again goes straight to the server.
  await expect
    .poll(() => fetch(`${baseURL}/api/health`).then((r) => r.status, () => 0), { timeout: 60_000 })
    .toBe(200);
  // Linux with no keyring keeps the sign-in in memory only (design decision
  // 8): the relaunch asks to sign in again.
  const { remembered } = await page.evaluate(() => window.promptbook.auth.state());
  test.info().annotations.push({
    type: 'sign-in',
    description: remembered ? 'remembered across the relaunch' : 'not remembered (no keyring): signed in again',
  });
  if (!remembered) {
    await expect(syncPill(page)).toHaveAttribute('data-state', 'signed-out', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Sign in…' }).click();
    await finishInBrowser();
  }
  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced', { timeout: 90_000 });
  // The images dropped offline go up.
  await expect
    .poll(() => page.evaluate(() => window.promptbook.files.status().then((s) => s.waiting.length)), { timeout: 60_000 })
    .toBe(0);

  const browser = await chromium.launch();
  try {
    const web = await (await browser.newContext({ baseURL })).newPage();
    await signIn(web);
    await expect(row(web, newTitle)).toBeVisible();
    await web.goto(`/projects/${mine.id}`);
    await expect(web.locator('.cm-content')).toContainText(`titolo: ${mine.title}`);
    await expect(await endOf(web)).toContainText(online);
    await expect(web.locator('.cm-content')).toContainText(offline);
    await web.goto('/');
    await row(web, newTitle).dblclick();
    await expect(web.locator('.cm-content')).toContainText(`titolo: ${newTitle}`);
    await expect(await endOf(web)).toContainText(newText);

    // The board on the web: the two images in S1, then a third added there
    // reaches the app.
    await web.goto(`/projects/${mine.id}/board`);
    await expect(web.locator('#row-S1 .th-i img')).toHaveCount(2);
    await expect.poll(() => loadedImages(web, 'S1')).toBe(2);
    await web
      .locator('.board input[type=file]')
      .setInputFiles([{ name: midjourneyName(PROMPT, 3), mimeType: 'image/png', buffer: png() }]);
    await expect(web.locator('.info.good')).toContainText('1 file added: 1 matched, 0 to assign.', { timeout: 30_000 });
  } finally {
    await browser.close();
  }
  await page.goto(`promptbook://app/projects/${mine.id}/board`);
  await expect(page.locator('#row-S1 .th-i img')).toHaveCount(3, { timeout: 30_000 });
  await expect.poll(() => loadedImages(page, 'S1'), { timeout: 30_000 }).toBe(3);
  await expect(page.locator('#row-S1 .th-i .badge.dev')).toHaveCount(0);
});

test('signs out keeping the projects, then removing them', async () => {
  await page.goto('promptbook://app/');
  await syncPill(page).click();
  await page.getByRole('dialog', { name: 'Sync status' }).getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('dialog', { name: 'Sign out?' }).getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByText(new RegExp(`^Signed out\\. Your projects stay on ${computer.source}\\.$`))).toBeVisible();
  await expect(syncPill(page)).toHaveAttribute('data-state', 'signed-out');
  await expect(row(page, newTitle)).toBeVisible();
  expect(accountFolders()).toHaveLength(1);

  await page.goto('promptbook://app/settings/device');
  // The account's other projects (board.spec.ts) hold files too.
  await expect(page.locator('.usage')).toContainText(/ · \d+ images and tracks$/);
  const kept = Number(/(\d+) images and tracks/.exec((await page.locator('.usage').textContent()) ?? '')?.[1]);
  expect(kept).toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: 'Sign out…' }).click();
  await page.getByLabel('Also remove the projects from this computer').check();
  await page.getByRole('button', { name: 'Sign out and remove' }).click();
  await expect(
    page.getByText(new RegExp(`^Signed out\\. The projects were removed from ${computer.source}\\.$`)),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue in your browser' })).toBeVisible();
  expect(accountFolders()).toEqual([]);
});
