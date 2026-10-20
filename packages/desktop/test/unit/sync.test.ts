import { Server } from '@hocuspocus/server';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Store } from '../../src/main/store.js';
import { SyncEngine, type EngineHooks } from '../../src/main/sync.js';
import { freePort } from './hocus.js';
import { projectDoc, tempDir, until } from './helpers.js';

// The sync engine against a real Hocuspocus server in this process
// (desktop-app design decision 5): every project synced in the background,
// windows' updates passed on, offline edits counted and merged on reconnect.

const A = '0b9d2c3e-1f4a-4b5c-8d6e-7f8a9b0c1d2e';
const B = '1c0e3d4f-2a5b-4c6d-9e7f-8a9b0c1d2e3f';

// The server's documents survive a restart, as Postgres keeps them.
const kept = new Map<string, Uint8Array>();
let server: Server;
let port = 0;

async function startServer(): Promise<void> {
  server = new Server({
    quiet: true,
    debounce: 10,
    maxDebounce: 50,
    async onAuthenticate({ token }) {
      if (token !== 'good') throw new Error('refused');
    },
    async onLoadDocument({ document, documentName }) {
      const state = kept.get(documentName);
      if (state) Y.applyUpdate(document, state);
      return document;
    },
    async onStoreDocument({ document, documentName }) {
      kept.set(documentName, Y.encodeStateAsUpdate(document));
    },
  });
  if (!port) port = await freePort();
  await server.listen(port);
  server.httpServer.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
}

// As a stopped server process: every socket cut, nothing listening. The
// server's own destroy() leaves open WebSockets as they are.
const sockets = new Set<Socket>();
async function stopServer(): Promise<void> {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  await server.destroy();
}

const serverText = async (id: string) => {
  const connection = await server.hocuspocus.openDirectConnection(id);
  let text = '';
  await connection.transact((doc) => {
    text = doc.getText('document').toString();
  });
  await connection.disconnect();
  return text;
};

let dir: ReturnType<typeof tempDir>;
let store: Store;
let engine: SyncEngine;
let sent: { to: number; id: string; update: Uint8Array }[];
let stateless: { id: string; payload: string }[];
let failed: string[];
let deleted: string[];
let token: string;

function makeEngine(hooks: Partial<EngineHooks> = {}) {
  engine = new SyncEngine({
    url: `ws://127.0.0.1:${port}`,
    healthUrl: `http://127.0.0.1:${port}/`,
    healthEveryMs: 100,
    store,
    statusDelayMs: 5,
    hooks: {
      token: async () => token,
      sendUpdate: (to, id, update) => sent.push({ to, id, update }),
      status: () => {},
      stateless: (id, payload) => stateless.push({ id, payload }),
      authFailed: (id) => failed.push(id),
      deleted: (id) => deleted.push(id),
      ...hooks,
    },
  });
}

beforeEach(async () => {
  kept.clear();
  kept.set(A, Y.encodeStateAsUpdate(projectDoc(A, 'Ancora', 'Testo del server.')));
  kept.set(B, Y.encodeStateAsUpdate(projectDoc(B, 'Ballo', 'Altro testo.')));
  port = 0;
  await startServer();
  dir = tempDir();
  store = Store.open(join(dir.dir, 'promptbook.sqlite'));
  sent = [];
  stateless = [];
  failed = [];
  deleted = [];
  token = 'good';
});

afterEach(async () => {
  engine?.close();
  store.close();
  await stopServer();
  dir.remove();
});

const edit = (id: string, text: string, at = 0) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, engine.open(7, id).state);
  let update: Uint8Array | null = null;
  doc.on('update', (u: Uint8Array) => (update = u));
  doc.getText('document').insert(at, text);
  engine.applyFromRenderer(7, id, update!);
};

describe('sync engine', () => {
  it('downloads every project, open or not, and stores what it receives', async () => {
    makeEngine();
    engine.add(A);
    engine.add(B);
    engine.firstSync = true;
    expect(engine.status().projects.map((p) => p.downloaded)).toEqual([false, false]);
    engine.setActive(true);
    await until(() => engine.status().projects.every((p) => p.downloaded && p.synced));
    const status = engine.status();
    expect(status.online).toBe(true);
    expect(status.firstSync).toBe(false);
    expect(status.projects.map((p) => p.title)).toEqual(['Ancora', 'Ballo']);
    expect(status.projects.every((p) => p.bytes > 0 && p.unsynced === 0)).toBe(true);
    expect(store.loadDoc(A)?.getText('document').toString()).toBe('Testo del server.');
  });

  // A project's row gets its ✓ once the files its document lists are here
  // too (asset-board design decision 14).
  it('keeps First sync going until every document’s files are on this computer', async () => {
    const missing = new Map([[A, 2]]);
    makeEngine({ files: (id) => ({ missing: missing.get(id) ?? 0, bytes: 40_000_000 - (missing.get(id) ?? 0) }) });
    engine.add(A);
    engine.add(B);
    engine.firstSync = true;
    engine.setActive(true);
    await until(() => engine.status().projects.every((p) => p.downloaded && p.synced));
    let status = engine.status();
    expect(status.firstSync).toBe(true);
    expect(status.projects.map((p) => [p.filesMissing, p.fileBytes])).toEqual([
      [2, 39_999_998],
      [0, 40_000_000],
    ]);
    missing.set(A, 0);
    engine.filesChanged();
    status = engine.status();
    expect(status.firstSync).toBe(false);
  });

  it('sends a window’s edit to the server and to the other windows, never back', async () => {
    makeEngine();
    engine.add(A);
    engine.setActive(true);
    await until(() => engine.isDownloaded(A) && engine.status().projects[0]!.synced);
    engine.open(8, A);
    edit(A, 'Nuovo. ');
    expect(sent.map((s) => s.to)).toEqual([8]);
    await until(async () => (await serverText(A)) === 'Nuovo. Testo del server.');
    await until(() => engine.status().projects[0]!.unsynced === 0);
  });

  it('passes the server’s changes to every window that has the project open', async () => {
    makeEngine();
    engine.add(A);
    engine.setActive(true);
    await until(() => engine.isDownloaded(A));
    engine.open(7, A);
    engine.open(8, A);
    const connection = await server.hocuspocus.openDirectConnection(A);
    await connection.transact((doc) => doc.getText('document').insert(0, 'Dal web. '));
    await connection.disconnect();
    await until(() => sent.length >= 2);
    expect(new Set(sent.map((s) => s.to))).toEqual(new Set([7, 8]));
    expect(engine.doc(A)!.getText('document').toString()).toBe('Dal web. Testo del server.');
    engine.release(8, A);
  });

  it('keeps offline edits, counts them across a relaunch, and merges them on reconnect', async () => {
    makeEngine();
    engine.add(A);
    engine.setActive(true);
    await until(() => engine.isDownloaded(A) && engine.status().projects[0]!.synced);
    await stopServer();
    await until(() => !engine.isOnline);
    edit(A, 'Offline uno. ');
    edit(A, 'Offline due. ');
    // Typed without a pause: one change.
    expect(engine.status().projects[0]!.unsynced).toBe(1);
    expect(engine.status().offlineSince).not.toBeNull();

    // Quit and relaunch, still offline.
    engine.close();
    store.close();
    store = Store.open(join(dir.dir, 'promptbook.sqlite'));
    makeEngine();
    engine.add(A);
    engine.setActive(true);
    expect(engine.doc(A)!.getText('document').toString()).toBe('Offline due. Offline uno. Testo del server.');
    expect(engine.status().projects[0]!.unsynced).toBe(1);

    // The web edited meanwhile; the server comes back.
    const web = new Y.Doc();
    Y.applyUpdate(web, kept.get(A)!);
    web.getText('document').insert(web.getText('document').length, ' Dal web.');
    kept.set(A, Y.encodeStateAsUpdate(web));
    await startServer();
    await until(() => engine.status().projects[0]!.unsynced === 0, 15_000);
    const merged = 'Offline due. Offline uno. Testo del server. Dal web.';
    expect(engine.doc(A)!.getText('document').toString()).toBe(merged);
    await until(async () => (await serverText(A)) === merged);
  }, 30_000);

  it('reports a refused provider and the server’s stateless messages', async () => {
    token = 'bad';
    makeEngine();
    engine.add(A);
    engine.setActive(true);
    await until(() => failed.length > 0);
    expect(failed[0]).toBe(A);

    token = 'good';
    engine.setActive(false);
    engine.setActive(true);
    await until(() => engine.isDownloaded(A));
    await until(() => server.hocuspocus.documents.has(A));
    // Edits after the provider was made again reach the server.
    edit(A, 'Di nuovo. ');
    await until(async () => (await serverText(A)).startsWith('Di nuovo. '));
    server.hocuspocus.documents.get(A)?.broadcastStateless(JSON.stringify({ type: 'deleted' }));
    await until(() => deleted.length > 0);
    expect(stateless[0]).toEqual({ id: A, payload: '{"type":"deleted"}' });
  });

  it('signs out offline and back in online without the old providers ending the new sessions', async () => {
    makeEngine();
    engine.add(A);
    engine.setActive(true);
    await until(() => engine.isDownloaded(A) && engine.status().projects[0]!.synced);
    await stopServer();
    await until(() => !engine.isOnline);
    // Signed out while offline: the providers' Close messages cannot leave.
    engine.setActive(false);
    engine.setActive(true);
    await startServer();
    await until(() => engine.isOnline && engine.status().projects[0]!.synced);
    await new Promise((r) => setTimeout(r, 300));
    edit(A, 'Dopo. ');
    await until(async () => (await serverText(A)).startsWith('Dopo. '));
  });

  it('keeps no socket with no provider, and asks the server’s health instead', async () => {
    makeEngine();
    await until(() => engine.isOnline);
    expect(server.hocuspocus.getConnectionsCount()).toBe(0);
    await stopServer();
    await until(() => !engine.isOnline);
    await startServer();
    await until(() => engine.isOnline);
  });

  it('counts a window’s opens of a project', async () => {
    makeEngine();
    engine.add(A);
    engine.setActive(true);
    await until(() => engine.isDownloaded(A));
    engine.open(7, A);
    edit(A, 'Due viste. ');
    engine.release(7, A);
    // The second view is still open.
    expect(() => edit(A, 'Ancora. ')).not.toThrow();
    engine.release(7, A);
    engine.release(7, A);
    const update = Y.encodeStateAsUpdate(new Y.Doc());
    expect(() => engine.applyFromRenderer(7, A, update)).toThrow();
  });

  it('holds a project made on this device until it is uploaded', async () => {
    makeEngine();
    const doc = projectDoc(A, 'Locale', 'Solo qui.');
    store.appendUpdate(A, Y.encodeStateAsUpdate(doc), 'main');
    kept.delete(A);
    engine.add(A, { localOnly: true, doc });
    engine.setActive(true);
    await until(() => engine.isOnline);
    await new Promise((r) => setTimeout(r, 200));
    expect(server.hocuspocus.documents.has(A)).toBe(false);
    expect(engine.status().projects[0]).toMatchObject({ localOnly: true, downloaded: true, unsynced: 1 });
    engine.uploaded(A);
    await until(async () => (await serverText(A)) === 'Solo qui.');
    await until(() => engine.status().projects[0]!.unsynced === 0);
  });

  it('compacts every document on close and refuses edits to a project not open', async () => {
    makeEngine();
    engine.add(A);
    engine.setActive(true);
    await until(() => engine.isDownloaded(A));
    expect(() => engine.applyFromRenderer(9, A, new Uint8Array([0, 0]))).toThrow();
    engine.close();
    expect(store.updateRows(A)).toBe(0);
    expect(store.loadDoc(A)?.getText('document').toString()).toBe('Testo del server.');
  });
});
