import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { addFiles, type NewFile } from 'promptbook-project';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Files, parseRange } from '../../src/main/files.js';
import { fileRoute } from '../../src/main/protocol.js';
import { ServerClient } from '../../src/main/server.js';
import { Store } from '../../src/main/store.js';
import type { SyncEngine } from '../../src/main/sync.js';
import { tempDir, until } from './helpers.js';

// The board's files on this computer (asset-board design decision 14): put,
// the upload queue, downloads with resume, the protocol's file route, the
// local sweep and usage, against a small HTTP server standing in for the
// server's file routes.

const P1 = '0b9d2c3e-1f4a-4b5c-8d6e-7f8a9b0c1d2e';
const P2 = '1c0e3d4f-2a5b-4c6d-9e7f-8a9b0c1d2e3f';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const png = (n = 2000) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(n)]);
const mp3 = (n = 2000) => Buffer.concat([Buffer.from('ID3'), randomBytes(n)]);

const entry = (bytes: Uint8Array, patch: Partial<NewFile> = {}): NewFile => ({
  sha256: sha(bytes),
  thumbSha256: null,
  name: 'you_a_vast_cathedral_0b6f2c1e-3d4a-4b5c-8d9e-0f1a2b3c4d5e_1.png',
  kind: 'image',
  mime: 'image/png',
  size: bytes.byteLength,
  width: 1456,
  height: 816,
  duration: null,
  sceneId: 'S1',
  matchedBy: 'prompt',
  addedBy: 'user',
  ...patch,
});

interface Hit {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
  body: Buffer;
}

// The server's file routes over an in-memory map of what each project links.
async function fileServer() {
  const linked = new Map<string, Buffer>();
  const hits: Hit[] = [];
  const state = {
    // Answers instead of storing, while set.
    putStatus: null as null | number,
    putBody: {} as Record<string, unknown>,
    // The first GET of a file sends this many bytes and drops the connection.
    cutAfter: null as null | number,
    corrupt: false,
    unknownProjects: new Set<string>(),
  };
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const hit = { method: req.method ?? 'GET', path: req.url ?? '/', headers: req.headers, body: Buffer.concat(chunks) };
      hits.push(hit);
      const m = /^\/api\/projects\/([^/]+)\/files\/([0-9a-f]{64})$/.exec(hit.path);
      if (!m) return void res.writeHead(404).end();
      const [, project, hash] = m as unknown as [string, string, string];
      const key = `${project}/${hash}`;
      if (hit.method === 'PUT') {
        if (state.unknownProjects.has(project)) return void res.writeHead(404).end('{"error":"not_found"}');
        if (state.putStatus) {
          return void res.writeHead(state.putStatus, { 'content-type': 'application/json' }).end(JSON.stringify(state.putBody));
        }
        if (sha(hit.body) !== hash) return void res.writeHead(400).end('{"error":"hash_mismatch"}');
        const known = linked.has(key);
        linked.set(key, hit.body);
        return void res.writeHead(known ? 200 : 201, { 'content-type': 'application/json' }).end('{}');
      }
      const bytes = linked.get(key);
      if (!bytes) return void res.writeHead(404).end();
      if (hit.method === 'HEAD') return void res.writeHead(200, { 'content-length': bytes.length }).end();
      const range = /^bytes=(\d+)-$/.exec(String(req.headers.range ?? ''));
      const start = range ? Number(range[1]) : 0;
      if (start >= bytes.length && range) return void res.writeHead(416).end();
      let body = bytes.subarray(start);
      if (state.corrupt) body = Buffer.from(body).fill(1);
      res.writeHead(range ? 206 : 200, {
        'content-length': body.length,
        ...(range ? { 'content-range': `bytes ${start}-${bytes.length - 1}/${bytes.length}` } : {}),
      });
      if (state.cutAfter !== null) {
        const cut = state.cutAfter;
        state.cutAfter = null;
        res.write(body.subarray(0, cut), () => res.socket?.destroy());
        return;
      }
      res.end(body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    linked,
    hits,
    state,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

// The engine as Files sees it: documents by project, online or not.
function fakeEngine() {
  const docs = new Map<string, Y.Doc>();
  const engine = {
    isOnline: true,
    filesChanges: 0,
    ids: () => [...docs.keys()],
    doc: (id: string) => docs.get(id) ?? null,
    has: (id: string) => docs.has(id),
    isDownloaded: (id: string) => docs.has(id),
    filesChanged() {
      engine.filesChanges += 1;
    },
  };
  return { engine, docs };
}

let dir: ReturnType<typeof tempDir>;
let server: Awaited<ReturnType<typeof fileServer>>;
let store: Store;
let now: number;
let files: Files | null;
let statuses: unknown[];

beforeEach(async () => {
  dir = tempDir('pb-files-');
  server = await fileServer();
  store = Store.open(join(dir.dir, 'promptbook.sqlite'), () => now);
  now = 1_000_000;
  files = null;
  statuses = [];
  for (const id of [P1, P2]) {
    store.putProject({
      id,
      row: {} as never,
      serverEditedAt: null,
      deletedAt: null,
      createdLocal: false,
      uploaded: true,
    });
  }
});

afterEach(async () => {
  await files?.close();
  store.close();
  await server.close();
  dir.remove();
});

const folder = () => join(dir.dir, 'files');

function open(engine: ReturnType<typeof fakeEngine>['engine'], { client = true } = {}) {
  mkdirSync(folder(), { recursive: true });
  const tokens = { accessToken: async () => 'pb_at_1', invalidate: () => {} };
  const api = new ServerClient(server.origin, tokens, () => {});
  files = new Files({
    folder: folder(),
    store,
    engine: engine as unknown as SyncEngine,
    client: () => (client ? api : null),
    emit: (s) => statuses.push(s),
    now: () => now,
    retryFirstMs: 10_000,
    retryMaxMs: 300_000,
    statusDelayMs: 1,
    docDelayMs: 1,
  });
  files.start();
  return files;
}

const get = (projectId: string, hash: string, headers: Record<string, string> = {}, method = 'GET') =>
  files!.serve(projectId, hash, new Request(`promptbook://app/api/projects/${projectId}/files/${hash}`, { method, headers }));

describe('put', () => {
  it('checks the bytes in main: hash, type and size', async () => {
    const { engine, docs } = fakeEngine();
    engine.isOnline = false;
    docs.set(P1, new Y.Doc());
    open(engine);
    const bytes = png();
    await expect(files!.put(P1, 'f'.repeat(64), bytes)).rejects.toThrow("The file's bytes do not match its hash.");
    const text = Buffer.from('not a picture');
    await expect(files!.put(P1, sha(text), text)).rejects.toThrow(/^Only PNG, JPEG and WebP images/);
    const big = Buffer.concat([png(0), Buffer.alloc(40 * 1024 * 1024)]);
    await expect(files!.put(P1, sha(big), big)).rejects.toThrow('The file is too large.');
    await expect(files!.put(P2, sha(bytes), bytes)).rejects.toThrow('This project is not on this computer.');
    expect(store.listUploads()).toEqual([]);
    expect(readdirSync(join(folder(), 'tmp'))).toEqual([]);
  });

  it('writes the file under its hash, queues it, and answers the type from the bytes', async () => {
    const { engine, docs } = fakeEngine();
    engine.isOnline = false;
    docs.set(P1, new Y.Doc());
    open(engine);
    const bytes = mp3();
    expect(await files!.put(P1, sha(bytes), bytes)).toEqual({ mime: 'audio/mpeg', state: 'waiting' });
    const path = join(folder(), sha(bytes).slice(0, 2), sha(bytes));
    expect(readFileSync(path).equals(bytes)).toBe(true);
    expect(store.listUploads()).toMatchObject([{ projectId: P1, sha256: sha(bytes), mime: 'audio/mpeg', size: bytes.length }]);
    expect(files!.status()).toEqual({ waiting: [{ projectId: P1, sha256: sha(bytes) }], downloading: 0, refused: [] });
    // Served before the window's entry reaches the document.
    expect((await get(P1, sha(bytes))).status).toBe(200);
  });
});

describe('the upload queue', () => {
  async function waitingFile(engine: ReturnType<typeof fakeEngine>['engine'], docs: Map<string, Y.Doc>, bytes = png()) {
    const doc = docs.get(P1) ?? new Y.Doc();
    docs.set(P1, doc);
    await files!.put(P1, sha(bytes), bytes);
    addFiles(doc, [entry(bytes)]);
    return bytes;
  }

  it('waits offline, then sends HEAD and PUT with the bytes once online', async () => {
    const { engine, docs } = fakeEngine();
    engine.isOnline = false;
    open(engine);
    docs.set(P1, new Y.Doc());
    const bytes = await waitingFile(engine, docs);
    await new Promise((r) => setTimeout(r, 30));
    expect(server.hits).toEqual([]);
    engine.isOnline = true;
    files!.wake();
    await until(() => store.listUploads().length === 0);
    const [head, put] = server.hits;
    expect(head).toMatchObject({ method: 'HEAD', path: `/api/projects/${P1}/files/${sha(bytes)}` });
    expect(put!.method).toBe('PUT');
    expect(put!.headers['content-length']).toBe(String(bytes.length));
    expect(put!.headers.authorization).toBe('Bearer pb_at_1');
    expect(put!.body.equals(bytes)).toBe(true);
    await until(() => (statuses.at(-1) as { waiting: unknown[] }).waiting.length === 0);
  });

  it('sends nothing when the project links the file already (HEAD 200)', async () => {
    const { engine, docs } = fakeEngine();
    engine.isOnline = false;
    open(engine);
    const bytes = png();
    server.linked.set(`${P1}/${sha(bytes)}`, bytes);
    await waitingFile(engine, docs, bytes);
    engine.isOnline = true;
    files!.wake();
    await until(() => store.listUploads().length === 0);
    expect(server.hits.map((h) => h.method)).toEqual(['HEAD']);
  });

  it('retries a 5xx after 10 s, doubling, and a 404 while the project is not on the server', async () => {
    const { engine, docs } = fakeEngine();
    engine.isOnline = false;
    open(engine);
    const bytes = await waitingFile(engine, docs);
    server.state.putStatus = 503;
    engine.isOnline = true;
    files!.wake();
    await until(() => store.listUploads()[0]?.attempts === 1);
    expect(store.listUploads()[0]!.nextAt).toBe(now + 10_000);
    // Not before its time.
    files!.wake();
    await new Promise((r) => setTimeout(r, 30));
    expect(server.hits.filter((h) => h.method === 'PUT')).toHaveLength(1);
    now += 10_000;
    server.state.putStatus = null;
    server.state.unknownProjects.add(P1);
    files!.wake();
    await until(() => store.listUploads()[0]?.attempts === 2);
    expect(store.listUploads()[0]!.nextAt).toBe(now + 20_000);
    now += 20_000;
    server.state.unknownProjects.clear();
    files!.wake();
    await until(() => store.listUploads().length === 0);
    expect(server.linked.get(`${P1}/${sha(bytes)}`)?.equals(bytes)).toBe(true);
  });

  it('keeps a file the server refuses (413, 415, 507) with its message, and stops trying', async () => {
    const { engine, docs } = fakeEngine();
    engine.isOnline = false;
    open(engine);
    const bytes = await waitingFile(engine, docs);
    server.state.putStatus = 507;
    server.state.putBody = { error: 'quota', message: 'Your files have reached their quota.' };
    engine.isOnline = true;
    files!.wake();
    await until(() => store.listUploads()[0]?.refused !== null);
    expect(files!.status()).toEqual({
      waiting: [],
      downloading: 0,
      refused: [{ projectId: P1, sha256: sha(bytes), message: 'Your files have reached their quota.' }],
    });
    now += 3_600_000;
    files!.wake();
    await new Promise((r) => setTimeout(r, 30));
    expect(server.hits.filter((h) => h.method === 'PUT')).toHaveLength(1);
  });

  it('survives a relaunch mid-upload', async () => {
    const { engine, docs } = fakeEngine();
    engine.isOnline = false;
    open(engine);
    const bytes = await waitingFile(engine, docs);
    await files!.close();
    // The next launch: the same folder and store.
    engine.isOnline = true;
    open(engine);
    await until(() => store.listUploads().length === 0);
    expect(server.linked.get(`${P1}/${sha(bytes)}`)?.equals(bytes)).toBe(true);
  });

  it('keeps one copy of a file two projects list, and uploads it to each', async () => {
    const { engine, docs } = fakeEngine();
    engine.isOnline = false;
    docs.set(P1, new Y.Doc());
    docs.set(P2, new Y.Doc());
    open(engine);
    const bytes = png();
    await files!.put(P1, sha(bytes), bytes);
    await files!.put(P2, sha(bytes), bytes);
    expect(readdirSync(join(folder(), sha(bytes).slice(0, 2)))).toEqual([sha(bytes)]);
    engine.isOnline = true;
    files!.wake();
    await until(() => store.listUploads().length === 0);
    expect([...server.linked.keys()].sort()).toEqual([`${P1}/${sha(bytes)}`, `${P2}/${sha(bytes)}`].sort());
  });
});

describe('downloads', () => {
  it('downloads every file a document lists, resuming a cut transfer with Range', async () => {
    const bytes = png(200_000);
    server.linked.set(`${P1}/${sha(bytes)}`, bytes);
    server.state.cutAfter = 50_000;
    const { engine, docs } = fakeEngine();
    const doc = new Y.Doc();
    addFiles(doc, [entry(bytes)]);
    docs.set(P1, doc);
    open(engine);
    expect(files!.counted(P1)).toEqual({ missing: 1, bytes: 0 });
    // The first attempt fails mid-file and leaves its part.
    await until(() => server.hits.length === 1 && existsSync(join(folder(), 'tmp', `${sha(bytes)}.part`)));
    await until(() => !files!['fetching'].size);
    now += 10_000;
    files!.wake();
    await until(() => files!.has(sha(bytes)));
    const [, second] = server.hits;
    expect(second!.headers.range).toMatch(/^bytes=\d+-$/);
    expect(Number(/\d+/.exec(String(second!.headers.range))![0])).toBeGreaterThan(0);
    expect(readFileSync(join(folder(), sha(bytes).slice(0, 2), sha(bytes))).equals(bytes)).toBe(true);
    expect(files!.counted(P1)).toEqual({ missing: 0, bytes: bytes.length });
  });

  it('throws away a download whose hash does not match, and tries again later', async () => {
    const bytes = png();
    server.linked.set(`${P1}/${sha(bytes)}`, bytes);
    server.state.corrupt = true;
    const { engine, docs } = fakeEngine();
    const doc = new Y.Doc();
    addFiles(doc, [entry(bytes)]);
    docs.set(P1, doc);
    open(engine);
    await until(() => server.hits.length === 1 && !files!['fetching'].size);
    expect(files!.has(sha(bytes))).toBe(false);
    expect(readdirSync(join(folder(), 'tmp'))).toEqual([]);
    server.state.corrupt = false;
    now += 10_000;
    files!.wake();
    await until(() => files!.has(sha(bytes)));
  });

  it('does not keep First sync waiting for a file the server does not have', async () => {
    const bytes = png();
    const { engine, docs } = fakeEngine();
    const doc = new Y.Doc();
    addFiles(doc, [entry(bytes)]);
    docs.set(P1, doc);
    open(engine);
    await until(() => files!.counted(P1).missing === 0);
    expect(files!.status().downloading).toBe(0);
    // Uploaded later by another desktop: the next try gets it.
    server.linked.set(`${P1}/${sha(bytes)}`, bytes);
    now += 10_000;
    files!.wake();
    await until(() => files!.has(sha(bytes)));
  });

  it('stops at sign-out mid-download, leaving nothing named', async () => {
    const bytes = png(2_000_000);
    server.linked.set(`${P1}/${sha(bytes)}`, bytes);
    server.state.cutAfter = 1_000_000;
    const { engine, docs } = fakeEngine();
    const doc = new Y.Doc();
    addFiles(doc, [entry(bytes)]);
    docs.set(P1, doc);
    open(engine);
    await until(() => server.hits.length === 1);
    await files!.close();
    expect(files!.has(sha(bytes))).toBe(false);
    expect(existsSync(join(folder(), sha(bytes).slice(0, 2), sha(bytes)))).toBe(false);
  });
});

describe('the protocol file route', () => {
  it('reads only a project id and a hash from the address', () => {
    const h = 'a'.repeat(64);
    expect(fileRoute(`promptbook://app/api/projects/${P1}/files/${h}`)).toEqual({ projectId: P1, sha256: h });
    expect(fileRoute(`promptbook://app/api/projects/${P1}/files/${h}/x`)).toBe('invalid');
    expect(fileRoute(`promptbook://app/api/projects/${P1}/files/..%2F..%2Fpromptbook.sqlite`)).toBe('invalid');
    expect(fileRoute(`promptbook://app/api/projects/${P1}/files/${h.toUpperCase()}`)).toBe('invalid');
    expect(fileRoute('promptbook://app/api/settings')).toBe('invalid');
    expect(fileRoute(`promptbook://other/api/projects/${P1}/files/${h}`)).toBeNull();
    expect(fileRoute('promptbook://app/projects/x')).toBeNull();
  });

  it('serves a listed file from disk with its headers and ranges', async () => {
    const { engine, docs } = fakeEngine();
    engine.isOnline = false;
    const doc = new Y.Doc();
    docs.set(P1, doc);
    open(engine);
    const bytes = png(1000);
    await files!.put(P1, sha(bytes), bytes);
    addFiles(doc, [entry(bytes)]);

    const whole = await get(P1, sha(bytes));
    expect(whole.status).toBe(200);
    expect(Object.fromEntries(whole.headers)).toMatchObject({
      'content-type': 'image/png',
      'content-length': String(bytes.length),
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    });
    expect(whole.headers.get('content-security-policy')).toContain("media-src 'self' blob:");
    expect(Buffer.from(await whole.arrayBuffer()).equals(bytes)).toBe(true);

    const part = await get(P1, sha(bytes), { range: 'bytes=10-19' });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe(`bytes 10-19/${bytes.length}`);
    expect(Buffer.from(await part.arrayBuffer()).equals(bytes.subarray(10, 20))).toBe(true);
    expect((await get(P1, sha(bytes), { range: `bytes=${bytes.length}-` })).status).toBe(416);
    const head = await get(P1, sha(bytes), {}, 'HEAD');
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('refuses a file the project does not list, another project, and anything offline not here', async () => {
    const { engine, docs } = fakeEngine();
    engine.isOnline = false;
    const doc = new Y.Doc();
    docs.set(P1, doc);
    docs.set(P2, new Y.Doc());
    open(engine);
    const bytes = png();
    await files!.put(P1, sha(bytes), bytes);
    // On disk, but P2 does not list it.
    expect((await get(P2, sha(bytes))).status).toBe(404);
    // A project this account does not have.
    expect((await get('2d1f4e5a-3b6c-4d7e-8f9a-0b1c2d3e4f5a', sha(bytes))).status).toBe(404);
    const other = png();
    addFiles(doc, [entry(other)]);
    expect((await get(P1, sha(other))).status).toBe(404);
    expect(parseRange('bytes=5-2', 100)).toBeNull();
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=0-1,4-5', 100)).toBeNull();
  });

  it('fetches a listed file once from the server when online and not here', async () => {
    const bytes = png();
    server.linked.set(`${P1}/${sha(bytes)}`, bytes);
    const { engine, docs } = fakeEngine();
    open(engine);
    const doc = new Y.Doc();
    addFiles(doc, [entry(bytes)]);
    docs.set(P1, doc);
    const answer = await get(P1, sha(bytes));
    expect(answer.status).toBe(200);
    expect(Buffer.from(await answer.arrayBuffer()).equals(bytes)).toBe(true);
    expect(server.hits.filter((h) => h.method === 'GET')).toHaveLength(1);
  });
});

describe('the local sweep and usage', () => {
  it('deletes the files nothing names, and keeps those a document or the queue names', async () => {
    const { engine, docs } = fakeEngine();
    engine.isOnline = false;
    const doc = new Y.Doc();
    docs.set(P1, doc);
    open(engine);
    const listed = png();
    const queued = png();
    await files!.put(P1, sha(listed), listed);
    await files!.put(P1, sha(queued), queued);
    addFiles(doc, [entry(listed)]);
    await files!.close();

    // An orphan from an earlier run, a stale part and a fresh one.
    const orphan = png();
    mkdirSync(join(folder(), sha(orphan).slice(0, 2)), { recursive: true });
    writeFileSync(join(folder(), sha(orphan).slice(0, 2), sha(orphan)), orphan);
    writeFileSync(join(folder(), 'tmp', `${'b'.repeat(64)}.part`), 'x');
    const stale = join(folder(), 'tmp', `${'c'.repeat(64)}.x.put`);
    writeFileSync(stale, 'x');
    utimesSync(stale, new Date(0), new Date(0));

    open(engine);
    expect(files!.has(sha(listed))).toBe(true);
    expect(files!.has(sha(queued))).toBe(true);
    expect(files!.has(sha(orphan))).toBe(false);
    expect(readdirSync(join(folder(), 'tmp'))).toEqual([]);
    // The queued file is not listed: a day after its put, its row and bytes go.
    now += 2 * 86_400_000;
    files!.sweep();
    expect(store.listUploads().map((r) => r.sha256)).toEqual([sha(listed)]);
    expect(files!.has(sha(queued))).toBe(false);
    expect(files!.has(sha(listed))).toBe(true);
  });

  it('counts the images and tracks, not their thumbnails, and every byte kept', async () => {
    const { engine, docs } = fakeEngine();
    engine.isOnline = false;
    const doc = new Y.Doc();
    docs.set(P1, doc);
    open(engine);
    const image = png(3000);
    const thumb = png(500);
    const track = mp3(4000);
    for (const b of [image, thumb, track]) await files!.put(P1, sha(b), b);
    addFiles(doc, [
      entry(image, { thumbSha256: sha(thumb) }),
      entry(track, { kind: 'audio', mime: 'audio/mpeg', width: null, height: null, duration: 3, name: 'title.mp3' }),
    ]);
    expect(files!.usage()).toEqual({ files: 2, fileBytes: image.length + thumb.length + track.length });
    // Waiting: the image and the track; the thumbnail goes up uncounted.
    expect(files!.status().waiting.map((w) => w.sha256).sort()).toEqual([sha(image), sha(track)].sort());
  });
});
