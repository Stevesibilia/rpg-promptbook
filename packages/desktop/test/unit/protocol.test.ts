import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CSP, resolveAppPath, serveApp } from '../../src/main/protocol.js';

// promptbook://app/ (desktop-app design decision 2): files of the web build,
// the single-page fallback, 404 for anything outside it, the CSP on every
// answer.

const dir = mkdtempSync(join(tmpdir(), 'pb-protocol-'));
const root = join(dir, 'web');
mkdirSync(join(root, 'assets'), { recursive: true });
writeFileSync(join(root, 'index.html'), '<!doctype html><title>Promptbook</title>');
writeFileSync(join(root, 'assets', 'index-abc.js'), 'export {};');
writeFileSync(join(root, 'assets', 'engine.wasm'), new Uint8Array([0, 0x61, 0x73, 0x6d]));
writeFileSync(join(dir, 'secret.txt'), 'not for the page');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const get = (url: string, method = 'GET') => serveApp(root, new Request(url, { method }));

describe('app protocol', () => {
  it('serves the build with its type and the CSP', async () => {
    const js = await get('promptbook://app/assets/index-abc.js');
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(js.headers.get('content-security-policy')).toBe(CSP);
    expect(await js.text()).toBe('export {};');
    const wasm = await get('promptbook://app/assets/engine.wasm');
    expect(wasm.headers.get('content-type')).toBe('application/wasm');
  });

  it('answers index.html for the app’s own routes', async () => {
    for (const path of ['/', '/projects/0b9d2c3e-1f4a-4b5c-8d6e-7f8a9b0c1d2e', '/settings/device', '/assets/missing.js']) {
      const answer = await get(`promptbook://app${path}`);
      expect(answer.status, path).toBe(200);
      expect(answer.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(await answer.text()).toContain('<title>Promptbook</title>');
    }
  });

  it('refuses paths outside the build, other hosts and other methods', async () => {
    // The URL parser takes dot segments out, encoded or not: still inside.
    expect(resolveAppPath(root, 'promptbook://app/%2e%2e/secret.txt')).toBe(join(root, 'secret.txt'));
    // Encoded slashes are not segments for it, but are once decoded.
    expect(resolveAppPath(root, 'promptbook://app/assets/%2e%2e%2f%2e%2e%2fsecret.txt')).toBeNull();
    expect(resolveAppPath(root, 'promptbook://app/..%5csecret.txt')).toBeNull();
    expect(resolveAppPath(root, 'promptbook://app/x%00.js')).toBeNull();
    expect(resolveAppPath(root, 'promptbook://app/%E0%A4%A')).toBeNull();
    expect(resolveAppPath(root, 'promptbook://other/index.html')).toBeNull();
    const escaped = await get('promptbook://app/assets/%2e%2e%2f%2e%2e%2fsecret.txt');
    expect(escaped.status).toBe(404);
    expect(await escaped.text()).not.toContain('not for the page');
    expect((await get('promptbook://evil/')).status).toBe(404);
    expect((await get('promptbook://app/', 'POST')).status).toBe(405);
  });
});
