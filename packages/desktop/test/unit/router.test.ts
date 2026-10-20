import type { ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { isRoutablePath } from '../../src/main/router.js';
import { projectDoc, rowOf, sendJson, until, type Recorded } from './helpers.js';
import { world, type World } from './world.js';

// The REST router in main (desktop-app design decisions 7, 9 and 10): local
// answers, the merge of snapshot sources, the forward with the bearer, 503
// offline, 401 ending the session, and offline create with its upload.

const A = '0b9d2c3e-1f4a-4b5c-8d6e-7f8a9b0c1d2e';
const NEW = { category: 'one-shot', title: 'La fiera di Randazzo', campaignId: null, status: 'draft', seed: '' };

let w: World;
let rest: (req: Recorded, res: ServerResponse) => void;
const start = async (options: { online?: boolean } = {}) => {
  rest = (_req, res) => sendJson(res, 404, { error: 'not_found' });
  w = await world((req, res) => rest(req, res), options);
  if (options.online !== false) await until(() => w.engine.isOnline);
};

afterEach(async () => {
  await w?.close();
});

// A project of the account, on the server and downloaded.
function seed(id = A, title = 'Ancora', text = 'Testo.') {
  const doc = projectDoc(id, title, text);
  w.store.appendUpdate(id, Y.encodeStateAsUpdate(doc), 'remote');
  w.store.putProject({ id, row: rowOf(doc), serverEditedAt: null, deletedAt: null, createdLocal: false, uploaded: true });
  w.hocus.kept.set(id, Y.encodeStateAsUpdate(doc));
  w.engine.add(id);
}

describe('router', () => {
  it('lets through the REST API only', () => {
    expect(isRoutablePath('/api/projects')).toBe(true);
    expect(isRoutablePath('/.well-known/oauth-protected-resource')).toBe(true);
    expect(isRoutablePath('/sync')).toBe(false);
    expect(isRoutablePath('//evil.example/api/')).toBe(false);
    expect(isRoutablePath('/api/\\evil')).toBe(false);
    expect(isRoutablePath('/api/ x')).toBe(false);
    expect(isRoutablePath('/api/../mcp')).toBe(false);
    expect(isRoutablePath('/api/%2e%2e/mcp')).toBe(false);
    expect(isRoutablePath('/api/projects?bin=1')).toBe(true);
    expect(isRoutablePath(42)).toBe(false);
  });

  it('answers the list from the store, offline', async () => {
    await start({ online: false });
    seed();
    const { status, json } = await w.request('GET', '/api/projects');
    expect(status).toBe(200);
    expect(json.projects.map((p: { title: string }) => p.title)).toEqual(['Ancora']);
    expect(w.api.requests).toEqual([]);
  });

  it('answers 503 offline for what needs the server, and forwards it with the bearer online', async () => {
    await start({ online: false });
    seed();
    const offline = await w.request('DELETE', `/api/projects/${A}`);
    expect(offline).toMatchObject({ status: 503, json: { error: 'offline', message: 'Needs the server.' } });
    await w.close();

    await start();
    rest = (req, res) => {
      if (req.path === `/api/projects/${A}/export`) {
        res.writeHead(200, { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="a.zip"' });
        res.end(Buffer.from([0x50, 0x4b, 3, 4]));
        return;
      }
      sendJson(res, 404, {});
    };
    const zip = await w.router.handle(`/api/projects/${A}/export`, { method: 'GET' });
    expect(zip.status).toBe(200);
    expect(zip.headers['content-disposition']).toBe('attachment; filename="a.zip"');
    expect([...zip.body!]).toEqual([0x50, 0x4b, 3, 4]);
    expect(w.api.requests[0]!.headers.authorization).toBe('Bearer pb_at_1');
  });

  it('refreshes the token on a 401 and ends the session on a second one', async () => {
    await start();
    rest = (req, res) =>
      req.headers.authorization === 'Bearer pb_at_2' && req.path === '/api/auth/grants'
        ? sendJson(res, 200, { grants: [] })
        : sendJson(res, 401, { error: 'unauthenticated' });
    expect((await w.request('GET', '/api/auth/grants')).status).toBe(200);
    expect(w.ended).toEqual([]);
    expect((await w.request('DELETE', `/api/projects/${A}`)).status).toBe(401);
    expect(w.ended).toEqual([1]);
  });

  it('keeps settings, the account and the auth config for offline', async () => {
    await start();
    rest = (req, res) => {
      if (req.path === '/api/settings') return sendJson(res, 200, { system: 'D&D 5e', author: 'S' });
      if (req.path === '/api/auth/me') return sendJson(res, 200, { user: { id: 'u', displayName: 'Stefano' } });
      sendJson(res, 404, {});
    };
    expect((await w.request('GET', '/api/settings')).json).toMatchObject({ system: 'D&D 5e' });
    expect((await w.request('GET', '/api/auth/me')).json.user.displayName).toBe('Stefano');
    await w.hocus.stop();
    await until(() => !w.engine.isOnline);
    expect((await w.request('GET', '/api/settings')).json).toMatchObject({ system: 'D&D 5e' });
    expect((await w.request('GET', '/api/auth/me')).json.user.displayName).toBe('Stefano');
    expect((await w.request('GET', '/api/auth/config')).status).toBe(503);
    expect((await w.request('GET', '/api/projects?bin=1')).json).toEqual({ projects: [] });
    expect(w.api.requests).toHaveLength(2);
  });

  it('merges server and device snapshots, newest first, filtered and limited', async () => {
    await start();
    seed();
    const server = [
      { id: 's2', kind: 'claude', label: 'S1', tool: 'replace_scene', target: 'S1', words: 3, createdAt: '2026-10-03T00:00:00.000Z', expiresAt: '2026-11-02T00:00:00.000Z' },
      { id: 's1', kind: 'user', label: 'prima', tool: null, target: null, words: 2, createdAt: '2026-10-01T00:00:00.000Z', expiresAt: null },
    ];
    rest = (req, res) => (req.path === `/api/projects/${A}/snapshots` ? sendJson(res, 200, { snapshots: server }) : sendJson(res, 404, {}));
    w.store.insertSnapshot({ id: 'd1', projectId: A, createdAt: Date.parse('2026-10-02T00:00:00.000Z'), kind: 'hourly', label: 'Hourly, while editing', text: 'x', words: 1 });
    const all = (await w.request('GET', `/api/projects/${A}/snapshots`)).json.snapshots;
    expect(all.map((s: { id: string; source: string }) => `${s.id}:${s.source}`)).toEqual(['s2:server', 'd1:device', 's1:server']);
    expect(all[1]).toMatchObject({ kind: 'hourly', expiresAt: '2026-10-09T00:00:00.000Z' });
    const claude = (await w.request('GET', `/api/projects/${A}/snapshots?kind=claude&limit=1`)).json.snapshots;
    expect(claude.map((s: { id: string }) => s.id)).toEqual(['s2']);

    // Offline: the list as the server last answered it.
    await w.hocus.stop();
    await until(() => !w.engine.isOnline);
    const cached = (await w.request('GET', `/api/projects/${A}/snapshots`)).json.snapshots;
    expect(cached.map((s: { id: string }) => s.id)).toEqual(['s2', 'd1', 's1']);
  });

  it('saves a snapshot on this device offline, and restores and deletes it there', async () => {
    await start({ online: false });
    seed(A, 'Ancora', 'Prima versione.');
    const saved = await w.request('POST', `/api/projects/${A}/snapshots`, { label: 'before playtest' });
    expect(saved.status).toBe(201);
    expect(saved.json.snapshot).toMatchObject({ kind: 'user', label: 'before playtest', source: 'device', expiresAt: null });

    w.engine.open(7, A);
    w.engine.transact(A, (doc) => doc.getText('document').insert(0, 'Nuovo. '));
    w.sent.length = 0;
    const restored = await w.request('POST', `/api/projects/${A}/snapshots/${saved.json.snapshot.id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.json.snapshot.kind).toBe('restore');
    expect(restored.json.snapshot.label).toMatch(/^before playtest · \d{4}-\d{2}-\d{2}T/);
    expect(w.engine.doc(A)!.getText('document').toString()).toBe('Prima versione.');
    // From main: it reaches the window like any edit.
    expect(w.sent.length).toBeGreaterThan(0);
    const text = (await w.request('GET', `/api/projects/${A}/snapshots/${restored.json.snapshot.id}`)).json.snapshot.text;
    expect(text).toBe('Nuovo. Prima versione.');

    expect((await w.request('DELETE', `/api/projects/${A}/snapshots/${restored.json.snapshot.id}`)).status).toBe(409);
    expect((await w.request('DELETE', `/api/projects/${A}/snapshots/${saved.json.snapshot.id}`)).status).toBe(204);
    // A server snapshot needs the server.
    expect((await w.request('POST', `/api/projects/${A}/snapshots/0b9d2c3e-0000-4b5c-8d6e-7f8a9b0c1d2e/restore`)).status).toBe(503);
  });

  it('creates a project offline from the cached settings and uploads it on reconnect', async () => {
    await start();
    rest = (req, res) => {
      if (req.method === 'POST' && req.path === '/api/projects') {
        const { id, state } = JSON.parse(req.body) as { id: string; state: string };
        const doc = new Y.Doc();
        Y.applyUpdate(doc, Buffer.from(state, 'base64'));
        w.hocus.kept.set(id, Y.encodeStateAsUpdate(doc));
        return sendJson(res, 201, { project: rowOf(doc) });
      }
      if (req.path === '/api/projects') return sendJson(res, 200, { projects: [] });
      sendJson(res, 404, {});
    };
    w.store.setCache('settings', {
      todoTemplates: { campaign: [], adventure: [], 'one-shot': ['Scrivere le scene'] },
      author: 'Stefano',
      copyright: '',
      licence: 'CC-BY-4.0',
      system: 'Brancalonia',
    });
    await w.hocus.stop();
    await until(() => !w.engine.isOnline);

    const created = await w.request('POST', '/api/projects', NEW);
    expect(created.status).toBe(201);
    const id = created.json.project.id as string;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.json.project).toMatchObject({ title: 'La fiera di Randazzo', system: 'Brancalonia', todoTotal: 1 });
    expect(w.store.getProject(id)).toMatchObject({ createdLocal: true, uploaded: false });
    expect(w.engine.status().projects[0]).toMatchObject({ localOnly: true, unsynced: 1 });
    expect((await w.request('GET', '/api/projects')).json.projects).toHaveLength(1);
    expect(w.api.requests).toEqual([]);

    // A scene written offline, then the server comes back.
    w.engine.transact(id, (doc) => doc.getText('document').insert(doc.getText('document').length, '\nLa fiera.'));
    await w.hocus.start();
    await until(() => w.engine.isOnline);
    await w.creator.uploadPending();
    const upload = w.api.requests.find((r) => r.method === 'POST')!;
    expect(JSON.parse(upload.body).id).toBe(id);
    expect(upload.headers.authorization).toBe('Bearer pb_at_1');
    expect(w.store.getProject(id)?.uploaded).toBe(true);
    await until(async () => (await w.hocus.text(id)).endsWith('La fiera.'));
    await until(() => w.engine.status().projects[0]!.unsynced === 0);
  });

  it('treats a 200 to a repeated upload as uploaded, and leaves a 409 on this device', async () => {
    await start();
    let answer: [number, unknown] = [200, {}];
    rest = (req, res) => (req.method === 'POST' ? sendJson(res, answer[0], answer[1]) : sendJson(res, 200, { projects: [] }));
    await w.hocus.stop();
    await until(() => !w.engine.isOnline);
    const first = (await w.request('POST', '/api/projects', NEW)).json.project.id as string;
    const second = (await w.request('POST', '/api/projects', { ...NEW, title: 'Altro' })).json.project.id as string;
    await w.hocus.start();
    await until(() => w.engine.isOnline);
    answer = [200, { project: {} }];
    await w.creator.upload(first);
    answer = [409, { error: 'id_taken' }];
    await w.creator.upload(second);
    expect(w.store.getProject(first)?.uploaded).toBe(true);
    expect(w.store.getProject(second)?.uploaded).toBe(false);
    const status = (id: string) => w.engine.status().projects.find((p) => p.id === id);
    expect(status(first)).toMatchObject({ localOnly: false, refused: false });
    expect(status(second)).toMatchObject({ localOnly: true, refused: true });
    const posts = w.api.requests.filter((r) => r.method === 'POST').length;
    await w.creator.uploadPending();
    // Not tried again until a relaunch.
    expect(w.api.requests.filter((r) => r.method === 'POST')).toHaveLength(posts);
  });

  it('refuses a project that is not valid, or in a campaign it does not have', async () => {
    await start({ online: false });
    expect((await w.request('POST', '/api/projects', { ...NEW, category: 'novel' })).json.error).toBe('validation_error');
    expect((await w.request('POST', '/api/projects', { ...NEW, title: ' ' })).status).toBe(400);
    expect(
      (await w.request('POST', '/api/projects', { ...NEW, campaignId: '0b9d2c3e-1f4a-4b5c-8d6e-7f8a9b0c1d2e' })).json.error,
    ).toBe('invalid_campaign');
  });
});

describe('projects list', () => {
  it('adds what is new on the server, bins what left it, and brings back what returned', async () => {
    await start();
    seed(A, 'Ancora');
    const B = '1c0e3d4f-2a5b-4c6d-9e7f-8a9b0c1d2e3f';
    const b = projectDoc(B, 'Ballo', 'Altro.');
    w.hocus.kept.set(B, Y.encodeStateAsUpdate(b));
    w.list.apply([rowOf(b)], new Set([A]));
    expect(w.engine.has(B)).toBe(true);
    expect(w.store.getProject(A)?.deletedAt).not.toBeNull();
    expect(w.engine.has(A)).toBe(false);
    expect(w.list.rows().map((r) => r.title)).toEqual(['Ballo']);
    await until(() => w.engine.isDownloaded(B));

    // A project uploaded while the list was on its way is not binned.
    const C = '2d1f4e5a-3b6c-4d7e-8f9a-0b1c2d3e4f5a';
    w.store.putProject({ id: C, row: rowOf(projectDoc(C)), serverEditedAt: null, deletedAt: null, createdLocal: true, uploaded: true });
    const a = projectDoc(A, 'Ancora');
    w.list.apply([rowOf(a), rowOf(b)], new Set([A, B]));
    expect(w.store.getProject(A)?.deletedAt).toBeNull();
    expect(w.engine.has(A)).toBe(true);
    expect(w.store.getProject(C)?.deletedAt).toBeNull();
  });

  it('attaches a project made here once the list shows it uploaded, though its answer was lost', async () => {
    await start();
    const doc = projectDoc(A, 'Persa');
    w.store.appendUpdate(A, Y.encodeStateAsUpdate(doc), 'main');
    w.store.putProject({ id: A, row: rowOf(doc), serverEditedAt: null, deletedAt: null, createdLocal: true, uploaded: false });
    w.engine.add(A, { localOnly: true });
    w.hocus.kept.set(A, Y.encodeStateAsUpdate(doc));
    w.list.apply([rowOf(doc)], new Set());
    expect(w.store.getProject(A)?.uploaded).toBe(true);
    expect(w.engine.status().projects[0]?.localOnly).toBe(false);
    await until(() => w.engine.status().projects[0]!.synced);
  });

  it('rebuilds a row from the document after a local edit', async () => {
    await start({ online: false });
    seed(A, 'Ancora');
    w.engine.transact(A, (doc) => doc.getMap('meta').set('title', 'Ancora di Sabaoth'));
    w.list.refreshRow(A, true);
    expect(w.list.rows()[0]!.title).toBe('Ancora di Sabaoth');
  });

  it('purges projects out of the list for more than 30 days', async () => {
    await start({ online: false });
    seed(A, 'Ancora');
    const record = w.store.getProject(A)!;
    w.store.putProject({ ...record, deletedAt: new Date(Date.now() - 31 * 86_400_000).toISOString() });
    expect(w.list.purge()).toBe(1);
    expect(w.store.getProject(A)).toBeNull();
    expect(w.store.loadDoc(A)).toBeNull();
  });
});
