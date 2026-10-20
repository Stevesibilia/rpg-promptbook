import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { strFromU8, unzipSync } from 'fflate';
import { addFiles, chooseFile, readFiles, setImagePrompt, type NewFile } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/accounts/users.js';
import { openBlobStore } from '../../src/files/blobs.js';
import { setDocumentText, withLiveDocument } from '../../src/live.js';
import { db, ORIGIN, PASSWORD, signedIn, startApp, steve, tempDataDir } from './helpers.js';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const png = (size = 4096) => Buffer.concat([PNG_HEAD, randomBytes(size - PNG_HEAD.length)]);
const mp3 = (size = 4096) => Buffer.concat([Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00', 'latin1'), randomBytes(size - 10)]);

const DOCUMENT = [
  '## Appendice: immagini e musica',
  '',
  '### S1. La casa che cede',
  '',
  'visual: a library',
  '',
  'mood: dread',
  '',
  '### S2. Il molo',
  '',
].join('\n');

// Garbage the engine has not collected yet is not memory the export holds, so
// the large test collects before it looks.
setFlagsFromString('--expose-gc');
const collect = runInNewContext('gc') as () => void;

const auth = (token: string) => ({ cookie: `pb_session=${token}`, origin: ORIGIN });

interface Setup {
  app: FastifyInstance;
  token: string;
  dataDir: string;
  project: string;
  userId: string;
}

async function setup(): Promise<Setup> {
  const user = await steve();
  const dataDir = tempDataDir();
  const app = await startApp({ dataDir });
  const token = await signedIn(app);
  const project = await newProject(app, token, user.id, "L'Ancora di Sabaoth");
  return { app, token, dataDir, project, userId: user.id };
}

async function newProject(app: FastifyInstance, token: string, userId: string, title: string): Promise<string> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: auth(token),
    payload: { category: 'one-shot', title },
  });
  const id = created.json().project.id as string;
  await withLiveDocument(app.sync, id, userId, (doc) => setDocumentText(doc, DOCUMENT));
  return id;
}

async function upload(s: Pick<Setup, 'app' | 'token'>, project: string, bytes: Buffer): Promise<string> {
  const hash = sha(bytes);
  const response = await s.app.inject({
    method: 'PUT',
    url: `/api/projects/${project}/files/${hash}`,
    headers: { ...auth(s.token), 'content-type': 'application/octet-stream' },
    payload: bytes,
  });
  if (response.statusCode !== 201) throw new Error(`Upload failed: ${response.statusCode} ${response.body}`);
  return hash;
}

const entry = (hash: string, name: string, overrides: Partial<NewFile> = {}): NewFile => ({
  sha256: hash,
  thumbSha256: null,
  name,
  kind: name.endsWith('.png') ? 'image' : 'audio',
  mime: name.endsWith('.png') ? 'image/png' : 'audio/mpeg',
  size: 4096,
  width: null,
  height: null,
  duration: null,
  sceneId: 'S1',
  matchedBy: 'hand',
  addedBy: 'user',
  ...overrides,
});

const exportOf = async (s: Pick<Setup, 'app' | 'token'>, url = '/api/export') => {
  const response = await s.app.inject({ method: 'GET', url, headers: auth(s.token) });
  expect(response.statusCode).toBe(200);
  return { response, zip: unzipSync(new Uint8Array(response.rawPayload)) };
};

describe('exporting a project with files', () => {
  it('puts each file in its scene’s folder, the tray in unmatched, and board.md beside them', async () => {
    const s = await setup();
    const a = png();
    const b = mp3();
    const c = mp3(5000);
    const hashes = [await upload(s, s.project, a), await upload(s, s.project, b), await upload(s, s.project, c)];
    await withLiveDocument(s.app.sync, s.project, s.userId, (doc) => {
      addFiles(doc, [
        entry(hashes[0]!, 'steve_a_library.png', { thumbSha256: hashes[0]! }),
        entry(hashes[1]!, 'la casa cede (1).mp3'),
        entry(hashes[2]!, 'perduta.mp3', { sceneId: null, matchedBy: null }),
      ]);
      setImagePrompt(doc, 'S1', 'a library --ar 16:9 --v 8.1', 'claude');
      chooseFile(doc, 'S1', 'image', readFiles(doc).find((f) => f.kind === 'image')!.id);
    });
    const { response, zip } = await exportOf(s, `/api/projects/${s.project}/export`);
    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['content-disposition']).toContain('L\'Ancora di Sabaoth.zip');
    const folder = "L'Ancora di Sabaoth";
    expect(Object.keys(zip).sort()).toEqual(
      [
        'board.md',
        'brainstorm-log.md',
        'document.md',
        'files/S1/la casa cede (1).mp3',
        'files/S1/steve_a_library.png',
        'files/unmatched/perduta.mp3',
        'inspiration.md',
        'project.json',
        'research.md',
        'seed.md',
        'todo.md',
      ]
        .map((name) => `${folder}/${name}`)
        .sort(),
    );
    expect(Buffer.from(zip[`${folder}/files/S1/steve_a_library.png`]!).equals(a)).toBe(true);
    expect(Buffer.from(zip[`${folder}/files/S1/la casa cede (1).mp3`]!).equals(b)).toBe(true);
    expect(Buffer.from(zip[`${folder}/files/unmatched/perduta.mp3`]!).equals(c)).toBe(true);
    const board = strFromU8(zip[`${folder}/board.md`]!);
    expect(board).toContain('a library --ar 16:9 --v 8.1');
    expect(board).toContain('Chosen: steve_a_library.png');
    expect(strFromU8(zip[`${folder}/document.md`]!)).toBe(DOCUMENT);
  });

  it('exports every project in its own folder, files included', async () => {
    const s = await setup();
    const second = await newProject(s.app, s.token, s.userId, 'La fiera');
    const one = await upload(s, s.project, png(4000));
    const two = await upload(s, second, png(5000));
    for (const [project, hash] of [
      [s.project, one],
      [second, two],
    ] as const) {
      await withLiveDocument(s.app.sync, project, s.userId, (doc) => addFiles(doc, [entry(hash, 'image.png')]));
    }
    const { response, zip } = await exportOf(s);
    expect(response.headers['content-disposition']).toMatch(/promptbook-\d{4}-\d\d-\d\d\.zip/);
    expect(Buffer.from(zip["L'Ancora di Sabaoth/files/S1/image.png"]!).length).toBe(4000);
    expect(Buffer.from(zip['La fiera/files/S1/image.png']!).length).toBe(5000);
  });

  it('keeps a name with accents and a name that would climb out of its folder', async () => {
    const s = await setup();
    const hashes = [await upload(s, s.project, png(4000)), await upload(s, s.project, png(4001))];
    await withLiveDocument(s.app.sync, s.project, s.userId, (doc) =>
      addFiles(doc, [entry(hashes[0]!, 'città è già.png'), entry(hashes[1]!, '../../escape.png')]),
    );
    const { zip } = await exportOf(s);
    expect(Object.keys(zip).filter((n) => n.includes('/files/')).sort()).toEqual([
      "L'Ancora di Sabaoth/files/S1/..-..-escape.png",
      "L'Ancora di Sabaoth/files/S1/città è già.png",
    ]);
  });

  it('never reads a file the project does not link, even when its document names the hash', async () => {
    const s = await setup();
    await createUser(db, { username: 'anna', password: PASSWORD, displayName: 'Anna' });
    const annaToken = await signedIn(s.app, 'anna');
    const anna = await newProject(s.app, annaToken, (await db.queryOne<{ id: string }>("select id from users where username = 'anna'"))!.id, 'Segreto');
    const secret = png(4444);
    const hash = await upload({ app: s.app, token: annaToken }, anna, secret);
    await withLiveDocument(s.app.sync, s.project, s.userId, (doc) => addFiles(doc, [entry(hash, 'stolen.png')]));
    const { zip } = await exportOf(s);
    expect(Object.keys(zip).some((n) => n.includes('stolen'))).toBe(false);
    expect(strFromU8(zip["L'Ancora di Sabaoth/files-missing.txt"]!)).toBe('files/S1/stolen.png\n');
  });

  it('leaves out a linked file whose bytes are gone, says so, and goes on', async () => {
    const s = await setup();
    const gone = png(4000);
    const kept = png(4001);
    const hashes = [await upload(s, s.project, gone), await upload(s, s.project, kept)];
    await withLiveDocument(s.app.sync, s.project, s.userId, (doc) =>
      addFiles(doc, [entry(hashes[0]!, 'gone.png'), entry(hashes[1]!, 'kept.png')]),
    );
    unlinkSync(join(s.dataDir, 'files', hashes[0]!.slice(0, 2), hashes[0]!));
    const { zip } = await exportOf(s);
    const folder = "L'Ancora di Sabaoth";
    expect(zip[`${folder}/files/S1/gone.png`]).toBeUndefined();
    expect(Buffer.from(zip[`${folder}/files/S1/kept.png`]!).equals(kept)).toBe(true);
    expect(strFromU8(zip[`${folder}/files-missing.txt`]!)).toBe('files/S1/gone.png\n');
  });

  it('refuses another user’s project and a project in the bin, and asks for a session', async () => {
    const s = await setup();
    await createUser(db, { username: 'anna', password: PASSWORD, displayName: 'Anna' });
    const annaToken = await signedIn(s.app, 'anna');
    const anna = await newProject(s.app, annaToken, (await db.queryOne<{ id: string }>("select id from users where username = 'anna'"))!.id, 'Segreto');
    const other = await s.app.inject({ method: 'GET', url: `/api/projects/${anna}/export`, headers: auth(s.token) });
    expect(other.statusCode).toBe(404);
    const binned = await newProject(s.app, s.token, s.userId, 'Cestino');
    await s.app.inject({ method: 'DELETE', url: `/api/projects/${binned}`, headers: auth(s.token) });
    expect((await s.app.inject({ method: 'GET', url: `/api/projects/${binned}/export`, headers: auth(s.token) })).statusCode).toBe(404);
    expect((await s.app.inject({ method: 'GET', url: `/api/projects/${s.project}/export` })).statusCode).toBe(401);
    expect((await s.app.inject({ method: 'GET', url: '/api/export' })).statusCode).toBe(401);
    // The other user's export holds none of the first user's projects.
    const { zip } = await exportOf({ app: s.app, token: annaToken });
    expect(Object.keys(zip).every((n) => n.startsWith('Segreto/'))).toBe(true);
  });
});

describe('an export too large for one zip', () => {
  it('is refused before anything is sent, one project or all', async () => {
    const s = await setup();
    const hash = 'a'.repeat(64);
    await db.query("insert into files (sha256, size, mime) values ($1, 4000000001, 'audio/mpeg')", [hash]);
    await db.query('insert into project_files (project_id, sha256) values ($1, $2)', [s.project, hash]);
    for (const url of [`/api/projects/${s.project}/export`, '/api/export']) {
      const response = await s.app.inject({ method: 'GET', url, headers: auth(s.token) });
      expect(response.statusCode, url).toBe(413);
      expect(response.json().error).toBe('export_too_large');
    }
  });
});

describe('a large export', () => {
  it('streams 120 MB of files without holding them in memory', { timeout: 180_000 }, async () => {
    const s = await setup();
    const blobs = await openBlobStore(s.dataDir);
    const MB = 1024 * 1024;
    const SIZE = 40 * MB;
    const FILES = 3;
    const chunks = (k: number) =>
      (function* () {
        for (let i = 0; i < SIZE / MB; i++) {
          const buffer = Buffer.alloc(MB, (k * 7 + i) % 251);
          if (i === 0) buffer.write('ID3\x04\x00', 'latin1');
          yield buffer;
        }
      })();
    const hashes: string[] = [];
    for (let k = 0; k < FILES; k++) {
      const hash = createHash('sha256');
      for (const chunk of chunks(k)) hash.update(chunk);
      const digest = hash.digest('hex');
      await blobs.put(digest, Readable.from(chunks(k)), { maxBytes: SIZE, size: SIZE });
      await db.query("insert into files (sha256, size, mime) values ($1, $2, 'audio/mpeg')", [digest, SIZE]);
      await db.query('insert into project_files (project_id, sha256) values ($1, $2)', [s.project, digest]);
      hashes.push(digest);
    }
    await withLiveDocument(s.app.sync, s.project, s.userId, (doc) =>
      addFiles(
        doc,
        hashes.map((hash, k) => entry(hash, `track ${k}.mp3`, { size: SIZE })),
      ),
    );

    await s.app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = s.app.server.address() as AddressInfo;
    const out = join(tmpdir(), `promptbook-export-${process.pid}.zip`);
    const memory = () => {
      collect();
      return process.memoryUsage();
    };
    const before = memory();
    let peak = 0;
    const sampler = setInterval(() => {
      const now = memory();
      peak = Math.max(peak, now.heapUsed + now.arrayBuffers - before.heapUsed - before.arrayBuffers);
    }, 20);
    try {
      await new Promise<void>((resolve, reject) => {
        const req = request({ port, method: 'GET', path: '/api/export', headers: auth(s.token) }, (res) => {
          expect(res.statusCode).toBe(200);
          // Streamed: no length is known before the files are read.
          expect(res.headers['content-length']).toBeUndefined();
          pipeline(res, createWriteStream(out)).then(resolve, reject);
        });
        req.on('error', reject);
        req.end();
      });
    } finally {
      clearInterval(sampler);
    }
    // Half of one of the three files, with the engine's garbage collected.
    expect(peak).toBeLessThan(SIZE / 2);

    // The zip lists the files, and holds their bytes.
    const zip = unzipSync(new Uint8Array(readFileSync(out)));
    rmSync(out, { force: true });
    const names = Object.keys(zip).filter((n) => n.includes('/files/')).sort();
    expect(names).toEqual([0, 1, 2].map((k) => `L'Ancora di Sabaoth/files/S1/track ${k}.mp3`));
    for (let k = 0; k < FILES; k++) expect(sha(zip[names[k]!]!)).toBe(hashes[k]);
  });
});
