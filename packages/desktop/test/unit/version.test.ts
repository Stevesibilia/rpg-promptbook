import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { appVersion } from '../../src/main/version.js';

// The version This device shows: the app's package.json, not Electron's.

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('app version', () => {
  it('reads the package.json beside dist/', () => {
    dir = mkdtempSync(join(tmpdir(), 'pb-version-'));
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'promptbook-desktop', version: '0.5.0' }));
    expect(appVersion(join(dir, 'dist'), '44.9.1')).toBe('0.5.0');
  });

  it('is the repository package’s own version unpackaged', () => {
    const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
    const own = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(appVersion(dist, '44.9.1')).toBe(own.version);
  });

  it('falls back when there is no package.json', () => {
    dir = mkdtempSync(join(tmpdir(), 'pb-version-'));
    expect(appVersion(join(dir, 'dist'), '44.9.1')).toBe('44.9.1');
  });
});
