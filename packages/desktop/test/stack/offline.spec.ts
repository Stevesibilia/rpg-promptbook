import { expect, request as apiRequest, test, type APIRequestContext, type ElectronApplication, type Page } from '@playwright/test';
import { rmSync } from 'node:fs';
import * as Y from 'yjs';
import setup from '../../../../e2e/global-setup.js';
import { baseURL, compose, password, username } from '../../../../e2e/stack.js';
import { launch, signInThroughBrowser, tempUserData } from './launch.js';

// Offline editing against the e2e compose stack (password app on 8091,
// account e2e), driven through main's bridge as the web client will drive it
// (desktop-app design decisions 4, 5, 8, 9, 10 and 12): sign in through the
// loopback flow, first sync into SQLite, an edit through IPC, the server
// stopped, an edit and a new project offline, main relaunched offline with
// everything there, the server back, and both edits and the new project on
// the server; a local snapshot taken meanwhile.
//
// Starts the stack (as `npm run e2e` does) and removes it afterwards, unless
// KEEP_STACK=1.

test.describe.configure({ mode: 'serial' });

const userData = tempUserData();
let app: ElectronApplication;
let page: Page;
let api: APIRequestContext;

interface Status {
  online: boolean;
  firstSync: boolean;
  projects: { id: string; title: string; downloaded: boolean; localOnly: boolean; synced: boolean; unsynced: number }[];
}

const status = () => page.evaluate(() => window.promptbook.sync.status()) as Promise<Status>;
const auth = () => page.evaluate(() => window.promptbook.auth.state());

// A REST call through main, as the web client's request() will make it.
async function rest<T>(path: string, method = 'GET', body?: unknown): Promise<{ status: number; json: T }> {
  return page.evaluate(
    async ({ path, method, body }) => {
      const answer = await window.promptbook.request(path, {
        method,
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: answer.status, json: answer.body ? JSON.parse(new TextDecoder().decode(answer.body)) : null };
    },
    { path, method, body },
  );
}

// An edit made as a window makes it: the document from pb:sync:open, a Yjs
// update of the change, sent on pb:sync:update.
async function append(id: string, text: string): Promise<string> {
  const state = await page.evaluate(async (id) => Array.from((await window.promptbook.sync.open(id)).state), id);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(state));
  let update: Uint8Array | null = null;
  doc.on('update', (u: Uint8Array) => (update = u));
  const body = doc.getText('document');
  body.insert(body.length, text);
  await page.evaluate(({ id, update }) => window.promptbook.sync.update(id, new Uint8Array(update)), {
    id,
    update: Array.from(update!),
  });
  return body.toString();
}

async function openText(id: string): Promise<string> {
  const state = await page.evaluate(async (id) => Array.from((await window.promptbook.sync.open(id)).state), id);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(state));
  return doc.getText('document').toString();
}

// The server's text of a project, through its API: a snapshot holds it.
async function serverText(id: string): Promise<string> {
  const made = await api.post(`/api/projects/${id}/snapshots`, { data: { label: 'proof' }, headers: { origin: baseURL } });
  expect(made.status()).toBe(201);
  const { snapshot } = (await made.json()) as { snapshot: { id: string } };
  const got = await api.get(`/api/projects/${id}/snapshots/${snapshot.id}`);
  return ((await got.json()) as { snapshot: { text: string } }).snapshot.text;
}

async function start(): Promise<void> {
  app = await launch(userData, { PROMPTBOOK_SERVER: baseURL, PROMPTBOOK_E2E_SNAPSHOT_SECONDS: '2' });
  page = await app.firstWindow();
  await page.waitForLoadState('load');
}

const waitForServer = async () =>
  expect
    .poll(async () => (await fetch(`${baseURL}/api/health`).catch(() => null))?.status ?? 0, { timeout: 60_000 })
    .toBe(200);

test.beforeAll(async () => {
  test.setTimeout(900_000);
  setup();
  api = await apiRequest.newContext({ baseURL });
  const login = await api.post('/api/auth/login', { data: { username, password }, headers: { origin: baseURL } });
  expect(login.status()).toBe(200);
});

test.afterAll(async () => {
  await app?.close().catch(() => {});
  await api?.dispose();
  rmSync(userData, { recursive: true, force: true });
  try {
    compose('start', 'app');
  } catch {
    // Already running.
  }
  if (!process.env.KEEP_STACK) compose('down', '-v');
});

let ancora = '';
let created = '';
let online = '';
let offline = '';

test('signs in through the browser and downloads every project', async () => {
  await start();
  await signInThroughBrowser(app, page, baseURL, { username, password });
  const signedIn = Date.now();

  await expect.poll(async () => (await auth()).session).toBe('active');
  const state = await auth();
  expect(state.account?.user).toMatchObject({ signIn: 'password' });
  expect(JSON.stringify(state)).not.toMatch(/pb_at_|pb_rt_/);

  await expect
    .poll(async () => {
      const s = await status();
      return s.projects.length > 0 && s.projects.every((p) => p.downloaded && p.synced) && !s.firstSync;
    }, { timeout: 60_000 })
    .toBe(true);
  // The numbers the design's risk on many providers asks for.
  const rss = await app.evaluate(() => process.memoryUsage().rss);
  const synced = await status();
  console.log(
    `First sync: ${synced.projects.length} projects in ${Date.now() - signedIn} ms after sign-in; main RSS ${Math.round(rss / 1e6)} MB`,
  );
  const { json } = await rest<{ projects: { id: string; title: string }[] }>('/api/projects');
  const server = (await (await api.get('/api/projects')).json()) as { projects: { id: string }[] };
  expect(json.projects.map((p) => p.id).sort()).toEqual(server.projects.map((p) => p.id).sort());
  ancora = json.projects.find((p) => p.title === "L'Ancora di Sabaoth")!.id;
  expect(ancora).toBeTruthy();
});

test('an edit through the window reaches the server', async () => {
  online = `\n\nModifica dal desktop, online ${Date.now()}.`;
  await append(ancora, online);
  await expect.poll(async () => (await serverText(ancora)).includes(online), { timeout: 20_000 }).toBe(true);
});

test('offline: edits and a new project are kept, across a relaunch', async () => {
  compose('stop', 'app');
  await expect.poll(async () => (await status()).online, { timeout: 30_000 }).toBe(false);

  offline = `\n\nModifica dal desktop, offline ${Date.now()}.`;
  await append(ancora, offline);

  const made = await rest<{ project: { id: string; title: string } }>('/api/projects', 'POST', {
    category: 'one-shot',
    title: 'La fiera di Randazzo',
    campaignId: null,
    status: 'draft',
    seed: '',
  });
  expect(made.status).toBe(201);
  created = made.json.project.id;
  await append(created, '\n\n### S2. La fiera\n\nScritta offline.');

  // What needs the server says so.
  expect((await rest(`/api/projects/${ancora}`, 'DELETE')).status).toBe(503);

  // A local snapshot, from the 2-second test interval.
  await expect
    .poll(async () => {
      const { json } = await rest<{ snapshots: { source: string; kind: string }[] }>(`/api/projects/${ancora}/snapshots`);
      return json.snapshots.some((s) => s.source === 'device' && s.kind === 'hourly');
    }, { timeout: 20_000 })
    .toBe(true);

  const before = await status();
  expect(before.projects.find((p) => p.id === ancora)?.unsynced).toBeGreaterThan(0);
  expect(before.projects.find((p) => p.id === created)).toMatchObject({ localOnly: true });

  // Quit and relaunch, still offline.
  await app.close();
  await start();
  await expect.poll(async () => (await auth()).session).toBe('active');
  const after = await status();
  expect(after.online).toBe(false);
  expect(after.projects.find((p) => p.id === ancora)?.unsynced).toBe(before.projects.find((p) => p.id === ancora)?.unsynced);
  expect(await openText(ancora)).toContain(offline);
  expect(await openText(created)).toContain('Scritta offline.');
  const { json } = await rest<{ projects: { id: string }[] }>('/api/projects');
  expect(json.projects.map((p) => p.id)).toContain(created);
});

test('back online: both edits and the new project are on the server', async () => {
  compose('start', 'app');
  await waitForServer();
  await expect
    .poll(async () => {
      const s = await status();
      return s.online && s.projects.every((p) => !p.localOnly && p.synced && p.unsynced === 0);
    }, { timeout: 60_000 })
    .toBe(true);

  const listed = (await (await api.get('/api/projects')).json()) as { projects: { id: string; title: string }[] };
  expect(listed.projects.find((p) => p.id === created)?.title).toBe('La fiera di Randazzo');
  await expect.poll(async () => serverText(created), { timeout: 20_000 }).toContain('Scritta offline.');
  const text = await serverText(ancora);
  expect(text).toContain(online);
  expect(text).toContain(offline);
});
