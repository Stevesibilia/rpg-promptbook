import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import type { FastifyInstance } from 'fastify';
import { strFromU8, unzipSync } from 'fflate';
import {
  addFiles,
  addImagePrompt,
  checkCuebardPack,
  cuebardUuid,
  readFiles,
  setMusicPrompt,
  type NewFile,
} from 'promptbook-project';
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/accounts/users.js';
import { buildApp } from '../../src/app.js';
import { openBlobStore, type BlobStore } from '../../src/files/blobs.js';
import { openLiveDocument, setDocumentText, withLiveDocument } from '../../src/live.js';
import { loadProjectDoc } from '../../src/projects.js';
import { wav } from '../wav.js';
import { db, ORIGIN, PASSWORD, signedIn, startApp, steve, tempDataDir, testConfig } from './helpers.js';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const png = (size = 4096) => Buffer.concat([PNG_HEAD, randomBytes(size - PNG_HEAD.length)]);
const ID3 = Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00', 'latin1');
const mp3 = (size = 4096) => Buffer.concat([ID3, randomBytes(size - 10)]);
// An MP3 a reader finds no length in: a tag and silence with no frame.
const untimed = () => Buffer.concat([ID3, Buffer.alloc(4086)]);

const DOCUMENT = [
  '## Appendice: immagini e musica',
  '',
  '### S1. La casa che cede',
  '',
  '### S2. Il molo',
  '',
  '### S3. La torre',
  '',
].join('\n');

const TITLE = "L'Ancora di Sabaoth";

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

async function newProject(app: FastifyInstance, token: string, userId: string, title: string): Promise<string> {
  const created = await app.inject({ method: 'POST', url: '/api/projects', headers: auth(token), payload: { category: 'one-shot', title } });
  const id = created.json().project.id as string;
  await withLiveDocument(app.sync, id, userId, (doc) => setDocumentText(doc, DOCUMENT));
  return id;
}

async function setup(blobs?: BlobStore, dataDir = tempDataDir()): Promise<Setup> {
  const user = await steve();
  const app = blobs ? await buildApp({ config: testConfig({ dataDir }), db, blobs }) : await startApp({ dataDir });
  const token = await signedIn(app);
  const project = await newProject(app, token, user.id, TITLE);
  return { app, token, dataDir, project, userId: user.id };
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

let clock = 0;
const image = (hash: string, name: string, promptId: string | null): NewFile => ({
  sha256: hash,
  thumbSha256: null,
  name,
  kind: 'image',
  mime: 'image/png',
  size: 4096,
  width: 1456,
  height: 816,
  duration: null,
  sceneId: null,
  promptId,
  matchedBy: promptId === null ? null : 'hand',
  addedBy: 'user',
  addedAt: new Date(Date.parse('2026-10-21T09:00:00.000Z') + clock++ * 1000).toISOString(),
});
const track = (hash: string, name: string, sceneId: string | null, duration: number | null, mime = 'audio/mpeg', size = 4096): NewFile => ({
  ...image(hash, name, null),
  kind: 'audio',
  mime,
  size,
  width: null,
  height: null,
  duration,
  sceneId,
  promptId: null,
  matchedBy: sceneId === null ? null : 'hand',
});

const packOf = async (s: Pick<Setup, 'app' | 'token'>, project: string) => {
  const response = await s.app.inject({ method: 'GET', url: `/api/projects/${project}/cuebard`, headers: auth(s.token) });
  expect(response.statusCode, response.body.slice(0, 200)).toBe(200);
  const bytes = new Uint8Array(response.rawPayload);
  return { response, bytes, zip: unzipSync(bytes) };
};

const projectFile = (zip: Record<string, Uint8Array>) => JSON.parse(strFromU8(zip[`${TITLE}.cuebard`]!));

const anna = async (s: Setup) => {
  await createUser(db, { username: 'anna', password: PASSWORD, displayName: 'Anna' });
  const token = await signedIn(s.app, 'anna');
  const userId = (await db.queryOne<{ id: string }>("select id from users where username = 'anna'"))!.id;
  return { token, project: await newProject(s.app, token, userId, 'Segreto') };
};

describe('the CueBard pack', () => {
  it('holds the project file, the picked tracks and images, a length read from a WAV, and lists what it left out', async () => {
    const s = await setup();
    const other = await anna(s);
    const secret = await upload({ app: s.app, token: other.token }, other.project, png(4444));
    const bytes = {
      citta: wav(8000 * 2.5),
      molo: mp3(),
      rotta: untimed(),
      casa: png(),
      rosalia: png(4097),
      anselmo: png(4098),
      lettera: png(4099),
      tray: png(4100),
    };
    const hashes = Object.fromEntries(
      await Promise.all(Object.entries(bytes).map(async ([key, b]) => [key, await upload(s, s.project, b)] as const)),
    ) as Record<keyof typeof bytes, string>;
    await withLiveDocument(s.app.sync, s.project, s.userId, (doc) => {
      const scene = addImagePrompt(doc, { category: 'scene', sceneId: 'S1', prompt: 'a library' }, 'claude').id;
      const pc = addImagePrompt(doc, { category: 'pc', name: 'Rosalia', prompt: 'a nurse' }, 'claude').id;
      const npc = addImagePrompt(doc, { category: 'npc', name: 'Padre Anselmo', prompt: 'a priest' }, 'claude').id;
      const handout = addImagePrompt(doc, { category: 'handout', name: 'Lettera', prompt: 'a letter' }, 'claude').id;
      setMusicPrompt(doc, 'S1', { title: 'Dominus Deus Sabaoth', style: 'choir', lyrics: '' }, 'claude');
      addFiles(doc, [
        track(hashes.citta, 'Città.wav', 'S1', null, 'audio/wav', bytes.citta.length),
        track(hashes.molo, 'molo.mp3', 'S2', 95),
        track(hashes.rotta, 'rotta.mp3', 'S3', null),
        image(hashes.casa, 'casa.png', scene),
        image(hashes.rosalia, 'rosalia.png', pc),
        image(hashes.anselmo, 'anselmo.png', npc),
        image(hashes.lettera, 'lettera.png', handout),
        // Another user's file: the document names it, the project does not
        // link it.
        image(secret, 'stolen.png', handout),
        image(hashes.tray, 'tray.png', null),
      ]);
    });
    const { response, bytes: pack, zip } = await packOf(s, s.project);
    if (process.env.CUEBARD_PACK_OUT) writeFileSync(process.env.CUEBARD_PACK_OUT, pack);
    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="L'Ancora di Sabaoth.cbpack"; filename*=UTF-8''${encodeURIComponent("L'Ancora di Sabaoth.cbpack")}`,
    );
    expect(checkCuebardPack(pack)).toEqual([]);

    const ids = new Map(readFiles((await loadProjectDoc(db, s.project))!).map((f) => [f.name, f.id]));
    const uuid = (name: string) => cuebardUuid(s.project, 'visual', ids.get(name)!);
    expect(Object.keys(zip).sort()).toEqual(
      [
        `${TITLE}.cuebard`,
        'left-out.txt',
        'media/Città.wav',
        'media/molo.mp3',
        `media/visuals/${uuid('casa.png')}_casa.png`,
        `media/visuals/${uuid('rosalia.png')}_rosalia.png`,
        `media/visuals/${uuid('anselmo.png')}_anselmo.png`,
        `media/visuals/${uuid('lettera.png')}_lettera.png`,
      ].sort(),
    );
    expect(Buffer.from(zip['media/Città.wav']!).equals(bytes.citta)).toBe(true);
    expect(Buffer.from(zip[`media/visuals/${uuid('lettera.png')}_lettera.png`]!).equals(bytes.lettera)).toBe(true);
    expect(strFromU8(zip['left-out.txt']!)).toBe(
      'S3. La torre: rotta.mp3 (length unknown)\nHandout "Lettera": stolen.png (not on the server)\n',
    );

    const file = projectFile(zip);
    expect(file.name).toBe(TITLE);
    expect(file.items.map((g: { displayName: string; children: unknown[] }) => [g.displayName, g.children.length])).toEqual([
      ['S1. La casa che cede', 1],
      ['S2. Il molo', 1],
      ['S3. La torre', 0],
    ]);
    const citta = file.items[0].children[0];
    expect([citta.displayName, citta.duration, citta.outPoint]).toEqual(['Dominus Deus Sabaoth', 2.5, 2.5]);
    expect(file.items[1].children[0].duration).toBe(95);
    expect(file.visualFolders).toEqual(['Scenes', 'PCs', 'NPCs', 'Handouts']);
    expect(file.visualMedia[0].linkedCueUuid).toBe(citta.uuid);
    // The length read is not written to the document.
    expect(readFiles((await loadProjectDoc(db, s.project))!).find((f) => f.name === 'Città.wav')!.duration).toBeNull();
  });

  it('reads a length over a real connection, the client still there', async () => {
    const s = await setup();
    const bytes = wav(8000 * 1.5);
    const hash = await upload(s, s.project, bytes);
    await withLiveDocument(s.app.sync, s.project, s.userId, (doc) =>
      addFiles(doc, [track(hash, 'onda.wav', 'S2', null, 'audio/wav', bytes.length)]),
    );
    await s.app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = s.app.server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/projects/${s.project}/cuebard`, { headers: auth(s.token) });
    expect(response.status).toBe(200);
    const pack = new Uint8Array(await response.arrayBuffer());
    expect(checkCuebardPack(pack)).toEqual([]);
    expect(projectFile(unzipSync(pack)).items[1].children[0].duration).toBe(1.5);
  });

  it('parses a content once, with the type the server sniffed, whatever the document says', async () => {
    const dataDir = tempDataDir();
    const store = await openBlobStore(dataDir);
    const parsed: string[] = [];
    const get = store.get.bind(store);
    store.get = async (sha256, range) => {
      parsed.push(sha256);
      return get(sha256, range);
    };
    const s = await setup(store, dataDir);
    const bytes = wav(8000 * 3);
    const hash = await upload(s, s.project, bytes);
    const image = await upload(s, s.project, png());
    await withLiveDocument(s.app.sync, s.project, s.userId, (doc) =>
      addFiles(doc, [
        track(hash, 'a.wav', 'S1', null, 'audio/mpeg', bytes.length),
        // An image the document calls a track: never parsed, left out.
        track(image, 'b.mp3', 'S2', null),
      ]),
    );
    // A second file id for the same content.
    await withLiveDocument(s.app.sync, s.project, s.userId, (doc) => {
      const copy = doc.getArray<Y.Map<unknown>>('files').get(0).clone();
      copy.set('id', 'copy-of-a');
      copy.set('sceneId', 'S3');
      doc.getArray<Y.Map<unknown>>('files').push([copy]);
    });
    parsed.length = 0;
    const { zip } = await packOf(s, s.project).finally(() => s.app.close());
    const file = projectFile(zip);
    expect(file.items.map((g: { children: { duration: number }[] }) => g.children.map((c) => c.duration))).toEqual([[3], [], [3]]);
    expect(strFromU8(zip['left-out.txt']!)).toBe('S2. Il molo: b.mp3 (length unknown)\n');
    // Read once to time it, twice to stream it; the image never.
    expect(parsed.filter((h) => h === hash)).toHaveLength(3);
    expect(parsed).not.toContain(image);
  });

  it('holds an edit of the open document not yet stored', async () => {
    const s = await setup();
    const hash = await upload(s, s.project, mp3());
    const live = await openLiveDocument(s.app.sync, s.project, s.userId);
    try {
      await live.transact((doc) => {
        addFiles(doc, [track(hash, 'molo.mp3', 'S2', 95)]);
        setMusicPrompt(doc, 'S2', { title: 'Onde lente', style: 'ambient', lyrics: '' }, 'user');
      });
      const { zip } = await packOf(s, s.project);
      expect(projectFile(zip).items[1].children[0].displayName).toBe('Onde lente');
      expect(readFiles((await loadProjectDoc(db, s.project))!)).toEqual([]);
    } finally {
      await live.close();
    }
  });

  it('leaves out a linked file whose bytes are gone, says so, and goes on', async () => {
    const s = await setup();
    const gone = await upload(s, s.project, mp3());
    const kept = await upload(s, s.project, mp3(4097));
    await withLiveDocument(s.app.sync, s.project, s.userId, (doc) =>
      addFiles(doc, [track(gone, 'gone.mp3', 'S1', 60), track(kept, 'kept.mp3', 'S1', 61)]),
    );
    unlinkSync(join(s.dataDir, 'files', gone.slice(0, 2), gone));
    const { bytes, zip } = await packOf(s, s.project);
    expect(checkCuebardPack(bytes)).toEqual([]);
    expect(zip['media/gone.mp3']).toBeUndefined();
    expect(zip['media/kept.mp3']).toBeDefined();
    expect(projectFile(zip).items[0].children.map((c: { index: number[] }) => c.index)).toEqual([[0, 0]]);
    expect(strFromU8(zip['left-out.txt']!)).toBe('S1. La casa che cede: gone.mp3 (not on the server)\n');
  });

  it('has no left-out.txt when nothing was left out, and empty groups for a board with no files', async () => {
    const s = await setup();
    const { bytes, zip } = await packOf(s, s.project);
    expect(checkCuebardPack(bytes)).toEqual([]);
    expect(Object.keys(zip)).toEqual([`${TITLE}.cuebard`]);
    expect(projectFile(zip).items).toHaveLength(3);
  });

  it('refuses another user’s project, a project in the bin, a malformed id, and asks for a session', async () => {
    const s = await setup();
    const other = await anna(s);
    const get = (url: string, token: string | null = s.token) =>
      s.app.inject({ method: 'GET', url, headers: token ? auth(token) : { origin: ORIGIN } });
    const foreign = await get(`/api/projects/${other.project}/cuebard`);
    const unknown = await get(`/api/projects/${crypto.randomUUID()}/cuebard`);
    const malformed = await get('/api/projects/not-a-uuid/cuebard');
    expect([foreign.statusCode, unknown.statusCode, malformed.statusCode]).toEqual([404, 404, 404]);
    expect(foreign.json()).toEqual(unknown.json());
    const binned = await newProject(s.app, s.token, s.userId, 'Cestino');
    await s.app.inject({ method: 'DELETE', url: `/api/projects/${binned}`, headers: auth(s.token) });
    expect((await get(`/api/projects/${binned}/cuebard`)).statusCode).toBe(404);
    expect((await get(`/api/projects/${s.project}/cuebard`, null)).statusCode).toBe(401);
  });
});

describe('a CueBard pack too large for one zip', () => {
  it('is refused before anything is sent', async () => {
    const s = await setup();
    const hash = await upload(s, s.project, mp3());
    await withLiveDocument(s.app.sync, s.project, s.userId, (doc) => addFiles(doc, [track(hash, 'huge.mp3', 'S1', 60)]));
    await db.query('update files set size = 4000000001 where sha256 = $1', [hash]);
    const response = await s.app.inject({ method: 'GET', url: `/api/projects/${s.project}/cuebard`, headers: auth(s.token) });
    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({
      error: 'export_too_large',
      message:
        'This project holds more than 4 GB of images and tracks for CueBard, more than one pack can take. Choose fewer files on the board.',
    });
  });
});

describe('a large CueBard pack', () => {
  it('streams 120 MB of tracks without holding them in memory', { timeout: 180_000 }, async () => {
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
        hashes.map((hash, k) => track(hash, `track ${k}.mp3`, 'S1', 120, 'audio/mpeg', SIZE)),
      ),
    );

    await s.app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = s.app.server.address() as AddressInfo;
    const out = join(tmpdir(), `promptbook-cuebard-${process.pid}.cbpack`);
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
        const req = request({ port, method: 'GET', path: `/api/projects/${s.project}/cuebard`, headers: auth(s.token) }, (res) => {
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

    const bytes = new Uint8Array(readFileSync(out));
    rmSync(out, { force: true });
    expect(checkCuebardPack(bytes)).toEqual([]);
    const zip = unzipSync(bytes);
    for (let k = 0; k < FILES; k++) expect(sha(zip[`media/track ${k}.mp3`]!)).toBe(hashes[k]);
  });
});
