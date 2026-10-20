import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError } from '../../src/config.js';
import { HashMismatch, openBlobStore, TooLarge } from '../../src/files/blobs.js';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

const dirs: string[] = [];
const dataDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'promptbook-blobs-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    chmodSync(dir, 0o755);
    rmSync(dir, { recursive: true, force: true });
  }
});

// A body in uneven chunks, as a request arrives.
const body = (bytes: Buffer) =>
  Readable.from([bytes.subarray(0, 7), bytes.subarray(7, 5000), bytes.subarray(5000)], { objectMode: false });

describe('FsBlobStore', () => {
  it('stores a file under its hash and serves it whole or in part', async () => {
    const store = await openBlobStore(dataDir());
    const bytes = Buffer.from('0123456789'.repeat(1000));
    const hash = sha(bytes);
    expect(await store.has(hash)).toBe(false);
    expect(await store.put(hash, body(bytes), { maxBytes: bytes.length })).toEqual({ size: 10_000 });
    expect(await store.has(hash)).toBe(true);
    expect(existsSync(join(store.root, hash.slice(0, 2), hash))).toBe(true);
    const whole = await store.get(hash);
    expect(whole?.size).toBe(10_000);
    expect(await text(whole!.stream)).toBe(bytes.toString());
    const part = await store.get(hash, { start: 2, end: 5 });
    expect(part?.size).toBe(10_000);
    expect(await text(part!.stream)).toBe('2345');
    expect(readdirSync(store.tmp)).toEqual([]);
  });

  it('stores the same bytes twice as one file', async () => {
    const store = await openBlobStore(dataDir());
    const bytes = randomBytes(2000);
    await store.put(sha(bytes), body(bytes), { maxBytes: 2000 });
    await store.put(sha(bytes), body(bytes), { maxBytes: 2000 });
    const listed = [];
    for await (const blob of store.list()) listed.push(blob.sha256);
    expect(listed).toEqual([sha(bytes)]);
  });

  it('keeps nothing when the hash differs', async () => {
    const store = await openBlobStore(dataDir());
    const bytes = randomBytes(6000);
    const wrong = sha(randomBytes(10));
    const source = body(bytes);
    await expect(store.put(wrong, source, { maxBytes: 6000 })).rejects.toBeInstanceOf(HashMismatch);
    expect(await store.has(wrong)).toBe(false);
    expect(readdirSync(store.tmp)).toEqual([]);
  });

  it('refuses past the limit without destroying the body, and keeps nothing', async () => {
    const store = await openBlobStore(dataDir());
    const bytes = randomBytes(6000);
    const source = body(bytes);
    await expect(store.put(sha(bytes), source, { maxBytes: 5999 })).rejects.toBeInstanceOf(TooLarge);
    expect(source.destroyed).toBe(false);
    expect(await store.has(sha(bytes))).toBe(false);
    expect(readdirSync(store.tmp)).toEqual([]);
  });

  it('answers null for a file it does not have, and deletes', async () => {
    const store = await openBlobStore(dataDir());
    const bytes = randomBytes(100);
    expect(await store.get(sha(bytes))).toBeNull();
    await store.put(sha(bytes), body(bytes), { maxBytes: 100 });
    await store.delete(sha(bytes));
    await store.delete(sha(bytes));
    expect(await store.has(sha(bytes))).toBe(false);
  });

  it('lists only names that are hashes in their folder', async () => {
    const store = await openBlobStore(dataDir());
    const bytes = randomBytes(100);
    await store.put(sha(bytes), body(bytes), { maxBytes: 100 });
    mkdirSync(join(store.root, 'zz'));
    writeFileSync(join(store.root, 'zz', 'notes.txt'), 'x');
    writeFileSync(join(store.root, sha(bytes).slice(0, 2), 'f'.repeat(64)), 'x');
    const listed = [];
    for await (const blob of store.list()) listed.push(blob.sha256);
    expect(listed).toEqual([sha(bytes)]);
  });

  it('refuses a name that is not a hash', async () => {
    const store = await openBlobStore(dataDir());
    await expect(store.has('../../etc/passwd')).rejects.toThrow('Not a SHA-256');
    await expect(store.get('A'.repeat(64))).rejects.toThrow('Not a SHA-256');
  });
});

describe('opening the store', () => {
  it('makes its folders and empties the temporary one', async () => {
    const dir = dataDir();
    mkdirSync(join(dir, 'files', 'tmp'), { recursive: true });
    writeFileSync(join(dir, 'files', 'tmp', 'left-over'), 'x');
    const store = await openBlobStore(dir);
    expect(readdirSync(store.tmp)).toEqual([]);
    expect(await openBlobStore(join(dir, 'new', 'deeper'))).toBeDefined();
  });

  it.skipIf(process.getuid?.() === 0)('stops the start naming PROMPTBOOK_DATA_DIR when it cannot write', async () => {
    const dir = dataDir();
    chmodSync(dir, 0o555);
    const opening = openBlobStore(dir);
    await expect(opening).rejects.toBeInstanceOf(ConfigError);
    await expect(opening).rejects.toThrow(/PROMPTBOOK_DATA_DIR: cannot write to/);
  });
});
