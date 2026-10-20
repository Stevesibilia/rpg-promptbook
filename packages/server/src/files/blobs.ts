import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { ConfigError } from '../config.js';

// The bytes of images and tracks, stored once per content and named by their
// SHA-256 (asset-board design decision 3). Only the file system for now;
// S3 can take its place behind the same interface.

export interface BlobStore {
  has(sha256: string): Promise<boolean>;
  // Streams `body` to a temporary file while hashing it; refuses past
  // `maxBytes` with TooLarge; on a hash other than `sha256` deletes it and
  // throws HashMismatch; otherwise moves it into place. Nothing is left
  // behind when it throws, and `body` is never destroyed, so the request it
  // comes from can still be answered.
  put(sha256: string, body: Readable, opts: { maxBytes: number }): Promise<{ size: number }>;
  // A range is inclusive at both ends, as in HTTP; `size` is always the whole
  // file's.
  get(sha256: string, range?: { start: number; end: number }): Promise<{ stream: Readable; size: number } | null>;
  delete(sha256: string): Promise<void>;
  list(): AsyncIterable<{ sha256: string; mtimeMs: number }>;
  // Removes temporary files older than `olderThanMs` milliseconds, every one
  // without it. Answers how many it removed.
  clearTemp(olderThanMs?: number): Promise<number>;
}

export class HashMismatch extends Error {
  constructor() {
    super('The bytes do not have the SHA-256 the request names.');
  }
}

export class TooLarge extends Error {
  constructor(readonly maxBytes: number) {
    super(`The file is larger than ${maxBytes} bytes.`);
  }
}

const SHA256 = /^[0-9a-f]{64}$/;

function checkSha(sha256: string): void {
  if (!SHA256.test(sha256)) throw new Error(`Not a SHA-256: "${sha256}"`);
}

const isMissing = (error: unknown) => (error as { code?: unknown }).code === 'ENOENT';

async function write(stream: WriteStream, chunk: Buffer): Promise<void> {
  if (!stream.write(chunk)) await once(stream, 'drain');
}

// <dataDir>/files/<aa>/<sha256>, temporary files in <dataDir>/files/tmp/ on
// the same volume, so moving one into place is a rename.
export class FsBlobStore implements BlobStore {
  readonly root: string;
  readonly tmp: string;

  constructor(dataDir: string) {
    this.root = join(resolve(dataDir), 'files');
    this.tmp = join(this.root, 'tmp');
  }

  private path(sha256: string): string {
    checkSha(sha256);
    return join(this.root, sha256.slice(0, 2), sha256);
  }

  async has(sha256: string): Promise<boolean> {
    try {
      return (await stat(this.path(sha256))).isFile();
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  async put(sha256: string, body: Readable, { maxBytes }: { maxBytes: number }): Promise<{ size: number }> {
    const target = this.path(sha256);
    const temp = join(this.tmp, randomUUID());
    const out = createWriteStream(temp, { flags: 'wx' });
    // Kept rather than thrown from an event: a write still in flight when the
    // upload is refused fails once the stream is destroyed, and a disk error
    // must never let a partial file through.
    let failed: Error | null = null;
    out.on('error', (error) => (failed ??= error));
    const hash = createHash('sha256');
    let size = 0;
    try {
      await once(out, 'open');
      // Not destroyed when this stops early: the caller answers the request.
      for await (const chunk of body.iterator({ destroyOnReturn: false }) as AsyncIterable<Buffer>) {
        size += chunk.length;
        if (size > maxBytes) throw new TooLarge(maxBytes);
        hash.update(chunk);
        await write(out, chunk);
      }
      out.end();
      if (!out.closed) await once(out, 'close');
      if (failed) throw failed;
      if (hash.digest('hex') !== sha256) throw new HashMismatch();
      await mkdir(join(this.root, sha256.slice(0, 2)), { recursive: true });
      // Over a copy already there, which has the same bytes: the new one's
      // date tells the sweep it is in use (sweep.ts).
      await rename(temp, target);
      return { size };
    } catch (error) {
      out.destroy();
      if (!out.closed) await new Promise((done) => out.once('close', done));
      await rm(temp, { force: true });
      throw error;
    }
  }

  async get(sha256: string, range?: { start: number; end: number }): Promise<{ stream: Readable; size: number } | null> {
    const path = this.path(sha256);
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    const stream = createReadStream(path, range ? { start: range.start, end: range.end } : {});
    try {
      await once(stream, 'open');
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    return { stream, size };
  }

  async delete(sha256: string): Promise<void> {
    await rm(this.path(sha256), { force: true });
  }

  async *list(): AsyncIterable<{ sha256: string; mtimeMs: number }> {
    for (const folder of await readdir(this.root, { withFileTypes: true })) {
      if (!folder.isDirectory() || !/^[0-9a-f]{2}$/.test(folder.name)) continue;
      for (const name of await readdir(join(this.root, folder.name))) {
        if (!SHA256.test(name) || !name.startsWith(folder.name)) continue;
        try {
          yield { sha256: name, mtimeMs: (await stat(join(this.root, folder.name, name))).mtimeMs };
        } catch (error) {
          if (!isMissing(error)) throw error;
        }
      }
    }
  }

  async clearTemp(olderThanMs = 0): Promise<number> {
    const before = Date.now() - olderThanMs;
    let removed = 0;
    for (const name of await readdir(this.tmp)) {
      const path = join(this.tmp, name);
      try {
        if (olderThanMs > 0 && (await stat(path)).mtimeMs >= before) continue;
        await rm(path, { recursive: true, force: true });
        removed++;
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }
    return removed;
  }
}

// The store the server starts with: its folders made, the temporary files a
// stop left behind removed, and a write tried, so a folder the server cannot
// write to stops the start (design decision 3) rather than the first upload.
export async function openBlobStore(dataDir: string): Promise<FsBlobStore> {
  const store = new FsBlobStore(dataDir);
  try {
    await mkdir(store.tmp, { recursive: true });
    await store.clearTemp();
    const probe = join(store.tmp, `probe-${randomUUID()}`);
    await writeFile(probe, '');
    await unlink(probe);
  } catch (error) {
    throw new ConfigError(
      `Invalid configuration:\n  PROMPTBOOK_DATA_DIR: cannot write to ${store.root} (${(error as Error).message})`,
    );
  }
  return store;
}
