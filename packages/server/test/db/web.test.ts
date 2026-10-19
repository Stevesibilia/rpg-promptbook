import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ORIGIN, signedIn, startApp, steve } from './helpers.js';

let dist: string;

beforeAll(async () => {
  dist = await mkdtemp(join(tmpdir(), 'promptbook-web-'));
  await mkdir(join(dist, 'assets'));
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>Promptbook</title>');
  await writeFile(join(dist, 'assets', 'app.js'), 'console.log(1);');
  // The engine, with the compressed copies the web build writes.
  const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
  await writeFile(join(dist, 'assets', 'engine.wasm'), wasm);
  await writeFile(join(dist, 'assets', 'engine.wasm.br'), brotliCompressSync(wasm));
  await writeFile(join(dist, 'assets', 'engine.wasm.gz'), gzipSync(wasm));
});
afterAll(() => rm(dist, { recursive: true, force: true }));

describe('web build and headers', () => {
  it('serves the files and falls back to index.html for the app routes', async () => {
    const app = await startApp({ webDist: dist });
    const asset = await app.inject({ url: '/assets/app.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toBe('console.log(1);');
    for (const url of ['/', '/projects/123', '/settings']) {
      const page = await app.inject({ url });
      expect(page.statusCode).toBe(200);
      expect(page.headers['content-type']).toMatch(/^text\/html/);
      expect(page.body).toContain('<title>Promptbook</title>');
    }
  });

  it('sends the compressed copy a browser accepts, as WebAssembly', async () => {
    const app = await startApp({ webDist: dist });
    for (const [accept, encoding] of [
      ['gzip, deflate, br, zstd', 'br'],
      ['gzip', 'gzip'],
    ] as const) {
      const response = await app.inject({ url: '/assets/engine.wasm', headers: { 'accept-encoding': accept } });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-encoding']).toBe(encoding);
      expect(response.headers['content-type']).toBe('application/wasm');
      expect(response.headers.vary).toContain('accept-encoding');
    }
    const plain = await app.inject({ url: '/assets/engine.wasm', headers: { 'accept-encoding': 'identity' } });
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.headers['content-type']).toBe('application/wasm');
    expect(plain.rawPayload.subarray(0, 4).toString('latin1')).toBe('\0asm');
  });

  it('lets browsers keep hashed assets for a year and check index.html every time', async () => {
    const app = await startApp({ webDist: dist });
    for (const url of ['/assets/app.js', '/assets/engine.wasm']) {
      const response = await app.inject({ url });
      expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    }
    for (const url of ['/', '/index.html', '/projects/123']) {
      const response = await app.inject({ url });
      expect(response.headers['content-type']).toMatch(/^text\/html/);
      expect(response.headers['cache-control']).toBe('no-cache');
    }
  });

  it('answers JSON 404 under /api, with a session', async () => {
    await steve();
    const app = await startApp({ webDist: dist });
    const cookie = `pb_session=${await signedIn(app)}`;
    for (const url of ['/api/no-such-route', '/api']) {
      const response = await app.inject({ url, headers: { cookie } });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'not_found', message: 'Not found.' });
    }
    const post = await app.inject({ method: 'POST', url: '/api/nothing', headers: { cookie, origin: ORIGIN } });
    expect(post.statusCode).toBe(404);
  });

  it('answers JSON 404 for pages when there is no web build, as in development', async () => {
    const app = await startApp();
    const response = await app.inject({ url: '/settings' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('not_found');
  });

  it('sets the security headers, with a CSP allowing the same-origin WebSocket', async () => {
    const app = await startApp({ webDist: dist });
    for (const url of ['/', '/api/health']) {
      const response = await app.inject({ url });
      const csp = String(response.headers['content-security-policy']);
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain(`connect-src 'self' ws://localhost:8090`);
      // WebAssembly for the PDF engine, and no JavaScript eval.
      expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval';");
      expect(csp).not.toContain('upgrade-insecure-requests');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['strict-transport-security']).toBeUndefined();
    }
    const secure = await startApp({ publicOrigin: 'https://promptbook.example' });
    const response = await secure.inject({ url: '/api/health' });
    expect(String(response.headers['content-security-policy'])).toContain(
      "connect-src 'self' wss://promptbook.example",
    );
    expect(String(response.headers['content-security-policy'])).toContain('upgrade-insecure-requests');
    expect(response.headers['strict-transport-security']).toBeDefined();
  });
});
