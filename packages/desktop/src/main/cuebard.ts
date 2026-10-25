import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, type WriteStream } from 'node:fs';
import { open, rename, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { basename, dirname, join } from 'node:path';
import { strToU8, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { parseFile } from 'music-metadata';
import {
  cuebardFiles,
  cuebardLeftOut,
  cuebardPack,
  needsDuration,
  sniff,
  SNIFF_BYTES,
  type CuebardPack,
} from 'promptbook-project';
import type { CuebardSaved } from 'promptbook-web/src/platform/bridge.js';
import * as Y from 'yjs';
import { FileError, type Files } from './files.js';
import type { Store } from './store.js';
import type { SyncEngine } from './sync.js';
import { cachedTemplates } from './templates.js';

// The CueBard pack built on this computer (cuebard-export design decision
// 15): the project's own copy and the files on disk, online or offline, with
// the server route's guards (packages/server/src/routes/cuebard.ts). A file
// is read only when the project's document names it (Files.localPath); its
// size and type come from the disk, never the document; the limits are
// checked on everything picked before a length is read; only audio is
// parsed, each content once. The zip goes to a part file of its own beside
// the target, renamed once complete; on any failure the part is removed and
// no file is left.

// fflate's Zip writes no ZIP64: the server's ZIP_BYTES_MAX and
// ZIP_ENTRIES_MAX (packages/server/src/routes/zip.ts), kept equal.
const ZIP_BYTES_MAX = 4_000_000_000;
const ZIP_ENTRIES_MAX = 65_000;

const TOO_LARGE =
  'This project holds more than 4 GB of images and tracks for CueBard, more than one pack can take. Choose fewer files on the board.';
export const NOT_HERE = 'This project is not on this computer yet.';
const STOPPED = 'Signed out: the CueBard pack was not saved.';
const NOT_WRITTEN = 'The CueBard pack could not be written. Check the folder and the free space, then try again.';

export interface CuebardDeps {
  engine: Pick<SyncEngine, 'isDownloaded' | 'doc'>;
  files: Pick<Files, 'localPath' | 'reading'>;
  // Where the account's cached templates are; the built-ins without it.
  store?: Pick<Store, 'getCache'>;
}

interface OnDisk {
  path: string;
  size: number;
  audio: boolean;
}

// A copy of the document, so the files checked are the ones written,
// whatever a window changes while the export awaits.
function frozen(doc: Y.Doc): Y.Doc {
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  return copy;
}

function checkFits(bytes: number, entries: number): void {
  // The project file and left-out.txt beside the media.
  if (bytes > ZIP_BYTES_MAX || entries + 2 > ZIP_ENTRIES_MAX) throw new FileError(TOO_LARGE);
}

// Its size and whether its bytes are audio, read from the file itself.
async function inspect(path: string): Promise<{ size: number; audio: boolean } | null> {
  try {
    const handle = await open(path, 'r');
    try {
      const { size } = await handle.stat();
      const head = new Uint8Array(SNIFF_BYTES);
      const { bytesRead } = await handle.read(head, 0, SNIFF_BYTES, 0);
      return { size, audio: sniff(head.subarray(0, bytesRead))?.kind === 'audio' };
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

// A track's length in seconds read from its file, null when the reader
// fails or finds none above 0 (design decision 10).
async function trackDuration(path: string): Promise<number | null> {
  try {
    const { format } = await parseFile(path, { duration: true, skipCovers: true });
    const seconds = format.duration;
    return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}

async function plan(
  deps: CuebardDeps,
  projectId: string,
  doc: Y.Doc,
  now: string,
  signal: AbortSignal,
): Promise<{ pack: CuebardPack; disk: Map<string, OnDisk> }> {
  const disk = new Map<string, OnDisk>();
  const missing = new Set<string>();
  const templates = deps.store ? cachedTemplates(deps.store) : [];
  const picked = cuebardFiles(doc, templates);
  // What the document says first: a pack far too large is refused before a
  // file not here yet is fetched. The sizes on disk decide below.
  checkFits(
    picked.reduce((sum, f) => sum + f.size, 0),
    picked.length,
  );
  // Each content looked up once, all at once: online, those not here wait
  // for their download together, not one after the other.
  const hashes = [...new Set(picked.map((f) => f.sha256))];
  await Promise.all(
    hashes.map(async (sha256) => {
      const path = await deps.files.localPath(projectId, sha256);
      const facts = path === null ? null : await inspect(path);
      if (path !== null && facts !== null) disk.set(sha256, { path, ...facts });
    }),
  );
  signal.throwIfAborted();
  for (const file of picked) if (!disk.has(file.sha256)) missing.add(file.id);
  const kept = picked.filter((f) => !missing.has(f.id));
  checkFits(
    kept.reduce((sum, f) => sum + disk.get(f.sha256)!.size, 0),
    kept.length,
  );
  const durations = new Map<string, number>();
  const read = new Map<string, number | null>();
  for (const track of needsDuration(doc, templates)) {
    if (missing.has(track.id)) continue;
    if (!read.has(track.sha256)) {
      signal.throwIfAborted();
      const file = disk.get(track.sha256)!;
      read.set(track.sha256, file.audio ? await trackDuration(file.path) : null);
    }
    const seconds = read.get(track.sha256);
    if (seconds != null) durations.set(track.id, seconds);
  }
  const pack = cuebardPack(doc, { now, durations, missing, templates });
  const text = pack.projectFile.json.length + (cuebardLeftOut(pack, 'not on this computer')?.length ?? 0);
  checkFits(
    pack.entries.reduce((sum, e) => sum + disk.get(e.sha256)!.size, 0) + 3 * text,
    pack.entries.length,
  );
  return { pack, disk };
}

// fflate's Zip into a file: each chunk written as it comes, waiting for the
// disk when its buffer is full. The file's first error fails the next step.
function zipFile(out: WriteStream, signal: AbortSignal) {
  const queue: Uint8Array[] = [];
  let failure: Error | null = null;
  out.on('error', (error) => {
    failure ??= error;
  });
  const zip = new Zip((error, chunk) => {
    if (error) failure ??= error;
    else queue.push(chunk);
  });
  const check = () => {
    if (failure) throw failure;
    signal.throwIfAborted();
  };
  const flush = async (): Promise<void> => {
    check();
    for (const chunk of queue.splice(0)) {
      if (!out.write(chunk)) await once(out, 'drain', { signal });
    }
    check();
  };
  return {
    async text(path: string, content: string): Promise<void> {
      const entry = new ZipDeflate(path, { level: 6 });
      zip.add(entry);
      entry.push(strToU8(content), true);
      await flush();
    },
    async stored(path: string, file: string): Promise<void> {
      const entry = new ZipPassThrough(path);
      zip.add(entry);
      for await (const chunk of createReadStream(file, { signal })) {
        entry.push(chunk as Uint8Array, false);
        await flush();
      }
      entry.push(new Uint8Array(0), true);
      await flush();
    },
    // The central directory, then the file flushed and closed.
    async end(): Promise<void> {
      zip.end();
      await flush();
      await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())));
      if (!out.closed) await once(out, 'close');
      check();
    },
    // Stopped, the file closed before it is removed.
    async abandon(): Promise<void> {
      zip.terminate();
      out.destroy();
      if (!out.closed) await once(out, 'close');
    },
  };
}

// Builds the project's pack and writes it to `target`. Throws with the
// message the window shows: the project not here, the pack too large, a
// file that could not be read, the disk.
export function exportCuebard(
  deps: CuebardDeps,
  projectId: string,
  target: string,
  now = new Date().toISOString(),
): Promise<CuebardSaved> {
  return deps.files.reading(async (signal) => {
    try {
      return await build(deps, projectId, target, now, signal);
    } catch (error) {
      if (error instanceof FileError) throw error;
      // A sign-out, the disk, a file gone since the plan: said plainly, the
      // details in the log.
      console.error('CueBard export failed:', error);
      throw new FileError(signal.aborted ? STOPPED : NOT_WRITTEN);
    }
  });
}

async function build(deps: CuebardDeps, projectId: string, target: string, now: string, signal: AbortSignal): Promise<CuebardSaved> {
  const live = deps.engine.isDownloaded(projectId) ? deps.engine.doc(projectId) : null;
  if (!live) throw new FileError(NOT_HERE);
  const doc = frozen(live);
  const { pack, disk } = await plan(deps, projectId, doc, now, signal);
  // A name of its own, made new (wx): never through a file or link there,
  // never another export's.
  const part = join(dirname(target), `.${basename(target)}.${randomUUID()}.part`);
  const out = createWriteStream(part, { flags: 'wx' });
  const zip = zipFile(out, signal);
  try {
    await zip.text(pack.projectFile.path, pack.projectFile.json);
    for (const entry of pack.entries) await zip.stored(entry.path, disk.get(entry.sha256)!.path);
    const leftOut = cuebardLeftOut(pack, 'not on this computer');
    if (leftOut !== null) await zip.text('left-out.txt', leftOut);
    await zip.end();
    await rename(part, target);
  } catch (error) {
    await zip.abandon().catch(() => {});
    await rm(part, { force: true }).catch(() => {});
    throw error;
  }
  return {
    saved: true,
    leftOut: pack.summary.warnings.filter((w) => w.kind === 'no-duration' || w.kind === 'missing').length,
    name: basename(target),
  };
}
