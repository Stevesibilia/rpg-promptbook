import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../src/accounts/users.js';
import type { Config } from '../../src/config.js';
import { purge } from '../../src/projects.js';
import { db, ORIGIN, PASSWORD, signedIn, startApp, steve, tempDataDir } from './helpers.js';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const png = (size = 4096) => Buffer.concat([PNG_HEAD, randomBytes(size - PNG_HEAD.length)]);
const mp3 = (size = 4096) => Buffer.concat([Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00', 'latin1'), randomBytes(size - 10)]);

const GIB = 1024 ** 3;

interface Setup {
  app: FastifyInstance;
  token: string;
  dataDir: string;
  project: string;
}

async function setup(overrides: Partial<Config> = {}): Promise<Setup> {
  await steve();
  const dataDir = tempDataDir();
  const app = await startApp({ dataDir, ...overrides });
  const token = await signedIn(app);
  return { app, token, dataDir, project: await newProject(app, token) };
}

async function newProject(app: FastifyInstance, token: string, title = 'L’Ancora di Sabaoth'): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: auth(token),
    payload: { category: 'one-shot', title },
  });
  if (response.statusCode !== 201) throw new Error(`Create failed: ${response.statusCode} ${response.body}`);
  return response.json().project.id;
}

const auth = (token: string) => ({ cookie: `pb_session=${token}`, origin: ORIGIN });

const fileUrl = (project: string, hash: string) => `/api/projects/${project}/files/${hash}`;

function put(
  { app, token }: Pick<Setup, 'app' | 'token'>,
  project: string,
  hash: string,
  body: Buffer | Readable,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: 'PUT',
    url: fileUrl(project, hash),
    headers: { ...auth(token), 'content-type': 'application/octet-stream', ...headers },
    payload: body,
  });
}

const get = ({ app, token }: Pick<Setup, 'app' | 'token'>, project: string, hash: string, headers = {}, method = 'GET') =>
  app.inject({ method: method as 'GET', url: fileUrl(project, hash), headers: { ...auth(token), ...headers } });

const blobPath = (dataDir: string, hash: string) => join(dataDir, 'files', hash.slice(0, 2), hash);
const tempFiles = (dataDir: string) => readdirSync(join(dataDir, 'files', 'tmp'));

async function rows() {
  return {
    files: await db.query<{ sha256: string; size: string; mime: string }>('select sha256, size, mime from files order by sha256'),
    links: await db.query<{ project_id: string; sha256: string }>(
      'select project_id, sha256 from project_files order by project_id, sha256',
    ),
  };
}

async function second(app: FastifyInstance): Promise<{ token: string; project: string }> {
  await createUser(db, { username: 'marta', password: PASSWORD, displayName: 'Marta' });
  const token = await signedIn(app, 'marta');
  return { token, project: await newProject(app, token, 'La Casa') };
}

describe('uploading a file', () => {
  it('stores it, named by its hash, and links it to the project', async () => {
    const s = await setup();
    const bytes = png();
    const hash = sha(bytes);
    const response = await put(s, s.project, hash, bytes);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ sha256: hash, size: bytes.length, mime: 'image/png' });
    expect(existsSync(blobPath(s.dataDir, hash))).toBe(true);
    expect(await rows()).toEqual({
      files: [{ sha256: hash, size: String(bytes.length), mime: 'image/png' }],
      links: [{ project_id: s.project, sha256: hash }],
    });
    expect(tempFiles(s.dataDir)).toEqual([]);
  });

  it('takes the body whatever its declared type, or none', async () => {
    const s = await setup();
    for (const type of ['image/png', 'application/json', 'text/plain', undefined]) {
      const bytes = png();
      const response = await s.app.inject({
        method: 'PUT',
        url: fileUrl(s.project, sha(bytes)),
        headers: { ...auth(s.token), ...(type ? { 'content-type': type } : {}) },
        payload: bytes,
      });
      expect(response.statusCode, type).toBe(201);
    }
  });

  it('answers 200 to the same upload again and keeps one copy', async () => {
    const s = await setup();
    const bytes = mp3();
    const hash = sha(bytes);
    expect((await put(s, s.project, hash, bytes)).statusCode).toBe(201);
    const again = await put(s, s.project, hash, bytes);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ sha256: hash, size: bytes.length, mime: 'audio/mpeg' });
    expect((await rows()).files).toHaveLength(1);
    expect((await rows()).links).toHaveLength(1);
  });

  it('does not read the body of a file the project already links', async () => {
    const s = await setup();
    const bytes = png();
    const hash = sha(bytes);
    await put(s, s.project, hash, bytes);
    // The wrong bytes are never looked at.
    const response = await put(s, s.project, hash, Buffer.from('%PDF-1.7 not the file'));
    expect(response.statusCode).toBe(200);
  });

  it('refuses a malformed hash with 400', async () => {
    const s = await setup();
    const bytes = png();
    for (const hash of [sha(bytes).toUpperCase(), sha(bytes).slice(1), 'x'.repeat(64)]) {
      const response = await put(s, s.project, hash, bytes);
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('validation_error');
    }
  });

  it('answers 404 for a project that is missing, another user’s or in the bin', async () => {
    const s = await setup();
    const other = await second(s.app);
    const bytes = png();
    const hash = sha(bytes);
    for (const project of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid', other.project]) {
      const response = await put(s, project, hash, bytes);
      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('not_found');
    }
    await s.app.inject({ method: 'DELETE', url: `/api/projects/${s.project}`, headers: auth(s.token) });
    expect((await put(s, s.project, hash, bytes)).statusCode).toBe(404);
    expect(await rows()).toEqual({ files: [], links: [] });
  });

  it('wants a Content-Length', async () => {
    const s = await setup();
    const bytes = png();
    const response = await put(s, s.project, sha(bytes), Readable.from([bytes]));
    expect(response.statusCode).toBe(411);
    expect(response.json().error).toBe('length_required');
  });

  it('refuses a declared length over 80 MB before reading anything', async () => {
    const s = await setup();
    const bytes = mp3();
    const response = await put(s, s.project, sha(bytes), bytes, { 'content-length': String(80 * 1024 * 1024 + 1) });
    expect(response.statusCode).toBe(413);
    expect(response.json().error).toBe('file_too_large');
    expect(await rows()).toEqual({ files: [], links: [] });
  });

  it('refuses an image over 40 MB', async () => {
    const s = await setup();
    const bytes = png();
    const response = await put(s, s.project, sha(bytes), bytes, { 'content-length': String(40 * 1024 * 1024 + 1) });
    expect(response.statusCode).toBe(413);
    expect(response.json().error).toBe('file_too_large');
  });

  it('refuses bytes beyond the declared length and keeps nothing', async () => {
    const s = await setup();
    const bytes = mp3(100_000);
    const response = await put(s, s.project, sha(bytes), bytes, { 'content-length': '50000' });
    expect(response.statusCode).toBe(413);
    expect(response.json().error).toBe('file_too_large');
    expect(await rows()).toEqual({ files: [], links: [] });
    expect(existsSync(blobPath(s.dataDir, sha(bytes)))).toBe(false);
    expect(tempFiles(s.dataDir)).toEqual([]);
  });

  it('decides the type from the bytes, not the name or the header', async () => {
    const s = await setup();
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(1000)]);
    const response = await put(s, s.project, sha(pdf), pdf, { 'content-type': 'image/png' });
    expect(response.statusCode).toBe(415);
    expect(response.json().error).toBe('unsupported_type');
    const empty = Buffer.alloc(0);
    expect((await put(s, s.project, sha(empty), empty)).statusCode).toBe(415);
    expect(await rows()).toEqual({ files: [], links: [] });
  });

  it('keeps nothing when the bytes have another hash', async () => {
    const s = await setup();
    const bytes = png();
    const wrong = sha(png());
    const response = await put(s, s.project, wrong, bytes);
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('hash_mismatch');
    expect(await rows()).toEqual({ files: [], links: [] });
    expect(existsSync(blobPath(s.dataDir, wrong))).toBe(false);
    expect(tempFiles(s.dataDir)).toEqual([]);
  });

  it('wants the bytes of a file another user stored, and their hash', async () => {
    const s = await setup();
    const other = await second(s.app);
    const bytes = png();
    const hash = sha(bytes);
    expect((await put(s, s.project, hash, bytes)).statusCode).toBe(201);
    const forged = await put({ app: s.app, token: other.token }, other.project, hash, png());
    expect(forged.statusCode).toBe(400);
    expect(forged.json().error).toBe('hash_mismatch');
    // Knowing the hash got nothing: no link, and the file is not served.
    expect((await get({ app: s.app, token: other.token }, other.project, hash)).statusCode).toBe(404);
    expect((await get({ app: s.app, token: other.token }, other.project, hash, {}, 'HEAD')).statusCode).toBe(404);
    expect((await put({ app: s.app, token: other.token }, other.project, hash, bytes)).statusCode).toBe(201);
    expect((await get({ app: s.app, token: other.token }, other.project, hash)).statusCode).toBe(200);
    expect((await rows()).files).toHaveLength(1);
    expect((await rows()).links).toHaveLength(2);
  });

  it('wants the bytes again for another project of the same user', async () => {
    const s = await setup();
    const bytes = png();
    const hash = sha(bytes);
    await put(s, s.project, hash, bytes);
    const other = await newProject(s.app, s.token, 'Un altro');
    expect((await get(s, other, hash, {}, 'HEAD')).statusCode).toBe(404);
    expect((await put(s, other, hash, png())).json().error).toBe('hash_mismatch');
  });

  it('refuses past the quota with 507, counting each content once', async () => {
    const s = await setup({ filesQuotaGb: 1 });
    const kept = png();
    await put(s, s.project, sha(kept), kept);
    // As if the user's file filled the quota but for a few bytes.
    await db.query('update files set size = $1', [GIB - 100]);
    const other = await newProject(s.app, s.token, 'Un altro');
    const big = png(101);
    const response = await put(s, other, sha(big), big);
    expect(response.statusCode).toBe(507);
    expect(response.json().error).toBe('quota');
    expect((await rows()).files).toHaveLength(1);
    // The same content in another project costs nothing more.
    expect((await put(s, other, sha(kept), kept)).statusCode).toBe(201);
    const small = png(100);
    expect((await put(s, other, sha(small), small)).statusCode).toBe(201);
  });

  it('counts only the user’s own files against the quota', async () => {
    const s = await setup({ filesQuotaGb: 1 });
    const other = await second(s.app);
    const theirs = png();
    await put({ app: s.app, token: other.token }, other.project, sha(theirs), theirs);
    await db.query('update files set size = $1', [GIB]);
    const mine = png();
    expect((await put(s, s.project, sha(mine), mine)).statusCode).toBe(201);
  });
});

describe('serving a file', () => {
  it('serves a linked file with its type and headers', async () => {
    const s = await setup();
    const bytes = mp3(10_000);
    const hash = sha(bytes);
    await put(s, s.project, hash, bytes);
    const response = await get(s, s.project, hash);
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.equals(bytes)).toBe(true);
    expect(response.headers).toMatchObject({
      'content-type': 'audio/mpeg',
      'content-length': '10000',
      'accept-ranges': 'bytes',
      etag: `"${hash}"`,
      'cache-control': 'private, max-age=31536000, immutable',
      'content-disposition': 'inline',
      'x-content-type-options': 'nosniff',
    });
  });

  it('answers HEAD with the same headers and no body', async () => {
    const s = await setup();
    const bytes = png(5000);
    const hash = sha(bytes);
    await put(s, s.project, hash, bytes);
    const response = await get(s, s.project, hash, {}, 'HEAD');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-length']).toBe('5000');
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.rawPayload.length).toBe(0);
    expect((await get(s, s.project, sha(png()), {}, 'HEAD')).statusCode).toBe(404);
  });

  it('serves byte ranges with 206, and 416 outside the file', async () => {
    const s = await setup();
    const bytes = mp3(10_000);
    const hash = sha(bytes);
    await put(s, s.project, hash, bytes);
    const middle = await get(s, s.project, hash, { range: 'bytes=1000-1999' });
    expect(middle.statusCode).toBe(206);
    expect(middle.headers['content-range']).toBe('bytes 1000-1999/10000');
    expect(middle.headers['content-length']).toBe('1000');
    expect(middle.rawPayload.equals(bytes.subarray(1000, 2000))).toBe(true);
    const onward = await get(s, s.project, hash, { range: 'bytes=9000-' });
    expect(onward.headers['content-range']).toBe('bytes 9000-9999/10000');
    expect(onward.rawPayload.equals(bytes.subarray(9000))).toBe(true);
    const suffix = await get(s, s.project, hash, { range: 'bytes=-10' });
    expect(suffix.rawPayload.equals(bytes.subarray(9990))).toBe(true);
    const past = await get(s, s.project, hash, { range: 'bytes=9000-20000' });
    expect(past.headers['content-range']).toBe('bytes 9000-9999/10000');
    for (const range of ['bytes=10000-', 'bytes=20000-30000', 'bytes=-0', 'bytes=5-4']) {
      const response = await get(s, s.project, hash, { range });
      expect(response.statusCode, range).toBe(416);
      expect(response.headers['content-range']).toBe('bytes */10000');
    }
    // A range this route does not read gets the whole file.
    const several = await get(s, s.project, hash, { range: 'bytes=0-1,5-6' });
    expect(several.statusCode).toBe(200);
    expect(several.rawPayload.length).toBe(10_000);
  });

  it('answers 404 for a file the project does not link, even one another project has', async () => {
    const s = await setup();
    const bytes = png();
    const hash = sha(bytes);
    await put(s, s.project, hash, bytes);
    const other = await newProject(s.app, s.token, 'Un altro');
    expect((await get(s, other, hash)).statusCode).toBe(404);
    const stranger = await second(s.app);
    expect((await get({ app: s.app, token: stranger.token }, s.project, hash)).statusCode).toBe(404);
    expect((await get(s, s.project, 'z'.repeat(64))).statusCode).toBe(400);
  });

  it('answers 404 in the bin and for a linked file missing from the disk', async () => {
    const s = await setup();
    const bytes = png();
    const hash = sha(bytes);
    await put(s, s.project, hash, bytes);
    await db.query('update projects set deleted_at = now()');
    expect((await get(s, s.project, hash)).statusCode).toBe(404);
    await db.query('update projects set deleted_at = null');
    const { rmSync } = await import('node:fs');
    rmSync(blobPath(s.dataDir, hash));
    const lost = await get(s, s.project, hash);
    expect(lost.statusCode).toBe(404);
    expect(lost.json().error).toBe('not_found');
  });

  it('needs a session', async () => {
    const s = await setup();
    const bytes = png();
    const hash = sha(bytes);
    await put(s, s.project, hash, bytes);
    expect((await s.app.inject({ url: fileUrl(s.project, hash) })).statusCode).toBe(401);
    expect(
      (await s.app.inject({ method: 'PUT', url: fileUrl(s.project, hash), headers: { origin: ORIGIN }, payload: bytes }))
        .statusCode,
    ).toBe(401);
  });
});

describe('the projects in the bin for good', () => {
  it('lose their links when purged', async () => {
    const s = await setup();
    const bytes = png();
    await put(s, s.project, sha(bytes), bytes);
    await db.query("update projects set deleted_at = now() - interval '31 days'");
    await purge(db);
    expect((await rows()).links).toEqual([]);
    expect((await rows()).files).toHaveLength(1);
  });
});

describe('a large upload', () => {
  it('streams 60 MB to disk without holding it in memory', { timeout: 120_000 }, async () => {
    const s = await setup();
    await s.app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = s.app.server.address() as AddressInfo;
    const SIZE = 60 * 1024 * 1024;
    const CHUNK = 1024 * 1024;
    // The same chunks twice: once to hash, once to send, never all at once.
    const chunk = (i: number) => {
      const buffer = Buffer.alloc(CHUNK, i % 251);
      if (i === 0) buffer.write('ID3\x04\x00', 'latin1');
      return buffer;
    };
    const hash = createHash('sha256');
    for (let i = 0; i < SIZE / CHUNK; i++) hash.update(chunk(i));
    const digest = hash.digest('hex');

    const memory = () => process.memoryUsage();
    const before = memory();
    let peak = 0;
    const sampler = setInterval(() => {
      const now = memory();
      peak = Math.max(peak, now.heapUsed + now.arrayBuffers - before.heapUsed - before.arrayBuffers);
    }, 20);
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(
        {
          port,
          method: 'PUT',
          path: fileUrl(s.project, digest),
          headers: { ...auth(s.token), 'content-type': 'application/octet-stream', 'content-length': SIZE },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode!));
        },
      );
      req.on('error', reject);
      Readable.from(
        (function* () {
          for (let i = 0; i < SIZE / CHUNK; i++) yield chunk(i);
        })(),
      ).pipe(req);
    });
    clearInterval(sampler);
    expect(status).toBe(201);
    expect(existsSync(blobPath(s.dataDir, digest))).toBe(true);
    // The client's chunks count too; the file's whole size would be 60 MB.
    expect(peak).toBeLessThan(SIZE / 2);
  });
});
