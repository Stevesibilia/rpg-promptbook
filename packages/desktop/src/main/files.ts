import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { mkdir, open, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { FILE_LIMITS, fileHashes, isSha256, readFiles, sniff, SNIFF_BYTES } from 'promptbook-project';
import type { FilesStatus, PutFileResult } from 'promptbook-web/src/platform/bridge.js';
import { CSP } from './protocol.js';
import type { ServerClient } from './server.js';
import type { Store, UploadRecord } from './store.js';
import type { SyncEngine } from './sync.js';

// The board's images and tracks on this computer (asset-board design
// decision 14): every file every project of the account lists, in
// <account>/files/<aa>/<sha256>, named by content. A file added here is
// written at once and queued in the store's file_uploads until the server has
// it; a file listed and not here is downloaded, resumed after an
// interruption and checked against its hash. The window loads them through
// the protocol (serve), from disk, never from the network.

export const RETRY_FIRST_MS = 10_000;
export const RETRY_MAX_MS = 5 * 60_000;
const DOWNLOADS_AT_ONCE = 2;
// One file's whole exchange, body included.
const TRANSFER_TIMEOUT_MS = 15 * 60_000;
const DAY = 86_400_000;
// The answers that refuse the file for good (D5): too large, not a known
// type, over the quota, and a request the server will never take.
const REFUSALS = new Set([400, 413, 415, 507]);

export interface FilesOptions {
  // <account>/files
  folder: string;
  store: Store;
  engine: SyncEngine;
  // Null with no active session.
  client: () => ServerClient | null;
  emit: (status: FilesStatus) => void;
  now?: () => number;
  retryFirstMs?: number;
  retryMaxMs?: number;
  statusDelayMs?: number;
  // How long a document's changes are gathered before its files are looked at.
  docDelayMs?: number;
}

// A file some project lists that is not on this computer.
interface Wanted {
  projects: Set<string>;
  attempts: number;
  nextAt: number;
  // Every project listing it answered 404 at the last attempt (a file a
  // desktop uploads later, or one lost from the server): First sync does not
  // wait for it.
  notFound: boolean;
}

export class FileError extends Error {}

const sha256Of = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

// Errors once more than `max` bytes went through.
function limit(max: number): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      seen += chunk.length;
      if (seen > max) done(new Error('The file is larger than allowed.'));
      else done(null, chunk);
    },
  });
}

// One `bytes=a-b`, `bytes=a-` or `bytes=-n` range of a file of `size` bytes;
// null to answer the whole file (none, several, or inverted, as the server).
export function parseRange(header: string | null, size: number): { start: number; end: number } | 'unsatisfiable' | null {
  const m = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') {
    const n = Number(m[2]);
    if (n === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start >= size) return 'unsatisfiable';
  if (end < start) return null;
  return { start, end };
}

const answer = (status: number, extra: Record<string, string> = {}, body: ConstructorParameters<typeof Response>[0] = null) =>
  new Response(body, {
    status,
    headers: {
      'content-security-policy': CSP,
      'x-content-type-options': 'nosniff',
      ...extra,
    },
  });

const notFound = () => answer(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }, 'Not found');

export class Files {
  private readonly now: () => number;
  private closed = false;
  private readonly abort = new AbortController();
  // Bytes of every file on disk, by sha256.
  private onDisk = new Map<string, number>();
  private mimes = new Map<string, string>();
  // `<projectId>/<sha256>` put by a window in this session: the protocol
  // serves them and the sweep keeps them before the document lists them.
  private recent = new Set<string>();
  private wanted = new Map<string, Wanted>();
  private fetching = new Map<string, Promise<boolean>>();
  private uploading: Promise<void> | null = null;
  private counts = new Map<string, { missing: number; bytes: number }>();
  private docTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private uploadTimer: ReturnType<typeof setTimeout> | null = null;
  private downloadTimer: ReturnType<typeof setTimeout> | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: FilesOptions) {
    this.now = options.now ?? Date.now;
    mkdirSync(this.tmp, { recursive: true });
    for (const name of readdirSync(options.folder)) {
      if (!/^[0-9a-f]{2}$/.test(name)) continue;
      for (const file of readdirSync(join(options.folder, name))) {
        if (!isSha256(file) || !file.startsWith(name)) continue;
        try {
          this.onDisk.set(file, statSync(join(options.folder, name, file)).size);
        } catch {
          // Gone meanwhile.
        }
      }
    }
    // A put's temporary file is from a process that stopped mid-write; a
    // download's is kept to resume.
    for (const name of readdirSync(this.tmp)) {
      if (name.endsWith('.put')) rmSync(join(this.tmp, name), { force: true });
    }
  }

  private get tmp(): string {
    return join(this.options.folder, 'tmp');
  }

  private blobPath(sha256: string): string {
    return join(this.options.folder, sha256.slice(0, 2), sha256);
  }

  private partPath(sha256: string): string {
    return join(this.tmp, `${sha256}.part`);
  }

  private online(): boolean {
    return !this.closed && this.options.engine.isOnline && this.options.client() !== null;
  }

  // Every project's files looked at, the sweep, then the queues.
  start(): void {
    for (const id of this.options.engine.ids()) this.scan(id);
    this.sweep();
    this.sweepTimer = setInterval(() => this.sweep(), DAY);
    this.statusChanged();
    this.wake();
  }

  // Online, or signed in again: uploads and downloads go on.
  wake(): void {
    this.pumpUploads();
    this.pumpDownloads();
  }

  has(sha256: string): boolean {
    return this.onDisk.has(sha256);
  }

  // A project's document changed (here, on the server, or it arrived).
  docChanged(projectId: string): void {
    if (this.closed) return;
    const timer = this.docTimers.get(projectId);
    if (timer) clearTimeout(timer);
    this.docTimers.set(
      projectId,
      setTimeout(() => {
        this.docTimers.delete(projectId);
        this.scan(projectId);
      }, this.options.docDelayMs ?? 500),
    );
  }

  // The project left this account's list.
  forget(projectId: string): void {
    this.counts.delete(projectId);
    for (const [sha, w] of this.wanted) {
      w.projects.delete(projectId);
      if (w.projects.size === 0) this.wanted.delete(sha);
    }
    this.statusChanged();
  }

  // What First sync shows for the project: files listed and not here (a 404
  // not counted), and the bytes of those that are.
  counted(projectId: string): { missing: number; bytes: number } {
    return this.counts.get(projectId) ?? this.scan(projectId);
  }

  // The files the project's document lists: those not here are wanted.
  private scan(projectId: string): { missing: number; bytes: number } {
    const engine = this.options.engine;
    const doc = engine.isDownloaded(projectId) ? engine.doc(projectId) : null;
    const result = { missing: 0, bytes: 0 };
    if (this.closed || !doc) {
      this.counts.delete(projectId);
      return result;
    }
    const hashes = fileHashes(doc);
    for (const [sha, w] of this.wanted) {
      if (hashes.has(sha) || !w.projects.has(projectId)) continue;
      w.projects.delete(projectId);
      if (w.projects.size === 0) this.wanted.delete(sha);
    }
    for (const sha of hashes) {
      const size = this.onDisk.get(sha);
      if (size !== undefined) {
        result.bytes += size;
        continue;
      }
      let w = this.wanted.get(sha);
      if (!w) {
        w = { projects: new Set(), attempts: 0, nextAt: 0, notFound: false };
        this.wanted.set(sha, w);
      }
      w.projects.add(projectId);
      if (!w.notFound) result.missing += 1;
    }
    const before = this.counts.get(projectId);
    this.counts.set(projectId, result);
    if (before?.missing !== result.missing || before.bytes !== result.bytes) engine.filesChanged();
    this.statusChanged();
    this.pumpDownloads();
    return result;
  }

  private rescan(projects: Iterable<string>): void {
    for (const id of [...projects]) this.scan(id);
  }

  // pb:files:put: bytes from the window, checked here (hash, type, size),
  // written to disk and queued for upload. The window adds the entry after.
  async put(projectId: string, sha256: string, bytes: Uint8Array): Promise<PutFileResult> {
    if (this.closed) throw new FileError('Signed out.');
    if (!this.options.engine.has(projectId)) throw new FileError('This project is not on this computer.');
    if (sha256Of(bytes) !== sha256) throw new FileError("The file's bytes do not match its hash.");
    const type = sniff(bytes.subarray(0, SNIFF_BYTES));
    if (!type) throw new FileError('Only PNG, JPEG and WebP images and MP3, M4A, AAC, WAV, Ogg and FLAC tracks.');
    if (bytes.byteLength > FILE_LIMITS[type.kind]) throw new FileError('The file is too large.');
    this.recent.add(`${projectId}/${sha256}`);
    if (!this.onDisk.has(sha256)) await this.writeBlob(sha256, bytes);
    if (this.closed) throw new FileError('Signed out.');
    this.mimes.set(sha256, type.mime);
    this.options.store.addUpload({ projectId, sha256, mime: type.mime, size: bytes.byteLength });
    this.arrived(sha256);
    this.statusChanged();
    this.pumpUploads();
    return { mime: type.mime, state: 'waiting' };
  }

  // Written to a temporary file first, so a stop mid-write leaves no half
  // file under its hash.
  private async writeBlob(sha256: string, bytes: Uint8Array): Promise<void> {
    const temp = join(this.tmp, `${sha256}.${randomBytes(6).toString('hex')}.put`);
    try {
      await writeFile(temp, bytes);
      await mkdir(join(this.options.folder, sha256.slice(0, 2)), { recursive: true });
      if (this.closed) return;
      await rename(temp, this.blobPath(sha256));
      this.onDisk.set(sha256, bytes.byteLength);
    } finally {
      await rm(temp, { force: true }).catch(() => {});
    }
  }

  // A file is on disk now: whoever waited for it counts it.
  private arrived(sha256: string): void {
    const w = this.wanted.get(sha256);
    if (!w) return;
    this.wanted.delete(sha256);
    this.rescan(w.projects);
  }

  // Uploads: one at a time, oldest first, while online.

  private uploadable(projectId: string): boolean {
    const p = this.options.store.getProject(projectId);
    return !!p && p.uploaded && p.deletedAt === null;
  }

  private pumpUploads(): void {
    if (this.closed || this.uploading) return;
    this.uploading = this.uploadLoop()
      .catch(() => {})
      .finally(() => {
        this.uploading = null;
        this.statusChanged();
      });
  }

  private async uploadLoop(): Promise<void> {
    while (this.online()) {
      const now = this.now();
      const rows = this.options.store.listUploads().filter((r) => r.refused === null);
      const ready = rows.filter((r) => this.uploadable(r.projectId));
      const due = ready.find((r) => r.nextAt <= now);
      if (!due) {
        // A project made here waits for its own upload: looked at again.
        const waits = rows.map((r) => (this.uploadable(r.projectId) ? r.nextAt - now : this.retryFirst));
        if (waits.length > 0) this.scheduleUploads(Math.max(Math.min(...waits), 50));
        return;
      }
      await this.uploadOne(due);
    }
  }

  private scheduleUploads(ms: number): void {
    if (this.closed) return;
    if (this.uploadTimer) clearTimeout(this.uploadTimer);
    this.uploadTimer = setTimeout(() => {
      this.uploadTimer = null;
      this.pumpUploads();
    }, ms);
  }

  private get retryFirst(): number {
    return this.options.retryFirstMs ?? RETRY_FIRST_MS;
  }

  private backoff(attempts: number): number {
    return Math.min(this.retryFirst * 2 ** Math.max(attempts - 1, 0), this.options.retryMaxMs ?? RETRY_MAX_MS);
  }

  private retryUpload(row: UploadRecord): void {
    const attempts = row.attempts + 1;
    this.options.store.retryUpload(row.projectId, row.sha256, attempts, this.now() + this.backoff(attempts));
  }

  // HEAD, then PUT on 404 (D5): a file the project already links is not sent.
  private async uploadOne(row: UploadRecord): Promise<void> {
    const { store } = this.options;
    const client = this.options.client();
    const size = this.onDisk.get(row.sha256);
    if (size === undefined) {
      // The bytes are gone from this computer: nothing to send.
      store.deleteUpload(row.projectId, row.sha256);
      return;
    }
    if (!client) return;
    const path = `/api/projects/${row.projectId}/files/${row.sha256}`;
    const file = this.blobPath(row.sha256);
    try {
      const head = await client.request(path, { method: 'HEAD', signal: this.abort.signal });
      if (head.ok) {
        store.deleteUpload(row.projectId, row.sha256);
        return;
      }
      if (head.status !== 404) {
        this.retryUpload(row);
        return;
      }
      const put = await client.request(path, {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream', 'content-length': String(size) },
        body: () => Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>,
        timeoutMs: TRANSFER_TIMEOUT_MS,
        signal: this.abort.signal,
      });
      const body = (await put.json().catch(() => null)) as { message?: unknown } | null;
      if (this.closed) return;
      if (put.status === 200 || put.status === 201) {
        store.deleteUpload(row.projectId, row.sha256);
      } else if (REFUSALS.has(put.status)) {
        const message = typeof body?.message === 'string' && body.message ? body.message : `The server answered ${put.status}.`;
        store.refuseUpload(row.projectId, row.sha256, message);
      } else {
        // 404: the project is not on the server yet; 5xx, 503 retry.
        this.retryUpload(row);
      }
    } catch {
      // Offline, signed out, or stopped.
      if (!this.closed) this.retryUpload(row);
    } finally {
      this.statusChanged();
    }
  }

  // Downloads: two at a time, while online.

  private pumpDownloads(): void {
    if (!this.online()) return;
    const now = this.now();
    let next = Infinity;
    for (const [sha, w] of this.wanted) {
      if (this.fetching.size >= DOWNLOADS_AT_ONCE) return;
      if (this.fetching.has(sha) || this.onDisk.has(sha)) continue;
      if (w.nextAt > now) {
        next = Math.min(next, w.nextAt);
        continue;
      }
      void this.download(sha);
    }
    if (next !== Infinity && this.fetching.size < DOWNLOADS_AT_ONCE) {
      if (this.downloadTimer) clearTimeout(this.downloadTimer);
      this.downloadTimer = setTimeout(
        () => {
          this.downloadTimer = null;
          this.pumpDownloads();
        },
        Math.max(next - now, 50),
      );
    }
  }

  // One download per content at a time, whoever asks (the queue, the
  // protocol). True once the file is on disk.
  private download(sha256: string): Promise<boolean> {
    let running = this.fetching.get(sha256);
    if (running) return running;
    running = this.fetchOne(sha256)
      .catch(() => false)
      .finally(() => {
        this.fetching.delete(sha256);
        this.statusChanged();
        this.pumpDownloads();
      });
    this.fetching.set(sha256, running);
    this.statusChanged();
    return running;
  }

  private async fetchOne(sha256: string): Promise<boolean> {
    const w = this.wanted.get(sha256);
    const client = this.options.client();
    if (!w || !client) return false;
    let notFound = w.projects.size > 0;
    for (const projectId of [...w.projects]) {
      const result = await this.fetchFrom(client, projectId, sha256);
      if (this.closed) return false;
      if (result === 'done') {
        this.arrived(sha256);
        return true;
      }
      if (result === 'retry') {
        notFound = false;
        break;
      }
    }
    w.attempts += 1;
    w.nextAt = this.now() + this.backoff(w.attempts);
    if (w.notFound !== notFound) {
      w.notFound = notFound;
      this.rescan(w.projects);
    }
    return false;
  }

  // GET with the bearer, resumed with Range from what a previous attempt
  // left, the hash checked before the file takes its name.
  private async fetchFrom(client: ServerClient, projectId: string, sha256: string): Promise<'done' | 'not-found' | 'retry'> {
    const part = this.partPath(sha256);
    const path = `/api/projects/${projectId}/files/${sha256}`;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const have = await stat(part).then(
          (s) => s.size,
          () => 0,
        );
        const response = await client.request(path, {
          method: 'GET',
          headers: { accept: '*/*', ...(have > 0 ? { range: `bytes=${have}-` } : {}) },
          timeoutMs: TRANSFER_TIMEOUT_MS,
          signal: this.abort.signal,
        });
        if (response.status === 416 && have > 0) {
          // The part is no prefix of the file: from the start.
          await response.body?.cancel();
          await rm(part, { force: true });
          continue;
        }
        if (response.status === 404) {
          await response.body?.cancel();
          return 'not-found';
        }
        const resumed = response.status === 206 && response.headers.get('content-range')?.startsWith(`bytes ${have}-`);
        if ((response.status !== 200 && !resumed) || !response.body) {
          await response.body?.cancel();
          if (response.status === 206) await rm(part, { force: true });
          return 'retry';
        }
        const start = resumed ? have : 0;
        await pipeline(
          Readable.fromWeb(response.body as never),
          limit(FILE_LIMITS.audio - start),
          createWriteStream(part, { flags: resumed ? 'a' : 'w' }),
          { signal: this.abort.signal },
        );
        if (this.closed) return 'retry';
        if ((await hashFile(part)) !== sha256) {
          await rm(part, { force: true });
          return 'retry';
        }
        const size = (await stat(part)).size;
        await mkdir(join(this.options.folder, sha256.slice(0, 2)), { recursive: true });
        if (this.closed) return 'retry';
        await rename(part, this.blobPath(sha256));
        this.onDisk.set(sha256, size);
        return 'done';
      }
      return 'retry';
    } catch {
      return 'retry';
    }
  }

  // The protocol's file route: promptbook://app/api/projects/<id>/files/<sha>.
  // Only a project of this account whose document, upload queue or a put of
  // this session names the file; from disk, with Range; fetched once from the
  // server when online and not here yet.
  async serve(projectId: string, sha256: string, request: Request): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') return answer(405);
    if (this.closed || !this.allowed(projectId, sha256)) return notFound();
    if (!this.onDisk.has(sha256)) {
      if (!this.online()) return notFound();
      let w = this.wanted.get(sha256);
      if (!w) {
        w = { projects: new Set(), attempts: 0, nextAt: 0, notFound: false };
        this.wanted.set(sha256, w);
      }
      w.projects.add(projectId);
      await this.download(sha256);
      if (!this.onDisk.has(sha256)) return notFound();
    }
    const file = this.blobPath(sha256);
    let size: number;
    let mime: string;
    try {
      size = (await stat(file)).size;
      mime = this.mimes.get(sha256) ?? (await this.sniffFile(file));
    } catch {
      this.onDisk.delete(sha256);
      return notFound();
    }
    this.mimes.set(sha256, mime);
    const headers = {
      'content-type': mime,
      'accept-ranges': 'bytes',
      etag: `"${sha256}"`,
      'cache-control': 'private, max-age=31536000, immutable',
    };
    const range = parseRange(request.headers.get('range'), size);
    if (range === 'unsatisfiable') return answer(416, { ...headers, 'content-range': `bytes */${size}` });
    const { start, end } = range ?? { start: 0, end: size - 1 };
    const body =
      request.method === 'HEAD' || size === 0
        ? null
        : (Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>);
    return answer(
      range ? 206 : 200,
      {
        ...headers,
        'content-length': String(end - start + 1),
        ...(range ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}),
      },
      body,
    );
  }

  private allowed(projectId: string, sha256: string): boolean {
    const doc = this.options.engine.doc(projectId);
    if (!doc) return false;
    return (
      fileHashes(doc).has(sha256) ||
      this.recent.has(`${projectId}/${sha256}`) ||
      this.options.store.hasUpload(projectId, sha256)
    );
  }

  private async sniffFile(path: string): Promise<string> {
    const handle = await open(path, 'r');
    try {
      const head = new Uint8Array(SNIFF_BYTES);
      const { bytesRead } = await handle.read(head, 0, SNIFF_BYTES, 0);
      return sniff(head.subarray(0, bytesRead))?.mime ?? 'application/octet-stream';
    } finally {
      await handle.close();
    }
  }

  // The local sweep, at start and every day: a file no project's document,
  // upload row or put of this session names is deleted at once (the server
  // keeps it for its grace period). An upload row whose document stopped
  // listing the file a day after the put goes too, and so do temporary files
  // a day old or of files nobody wants.
  sweep(): void {
    if (this.closed) return;
    const { store, engine } = this.options;
    const names = new Set<string>();
    const listedBy = new Map<string, Set<string>>();
    for (const record of store.listProjects()) {
      const live = engine.doc(record.id);
      const doc = live ?? store.loadDoc(record.id);
      if (!doc) continue;
      const hashes = fileHashes(doc);
      listedBy.set(record.id, hashes);
      for (const h of hashes) names.add(h);
      if (!live) doc.destroy();
    }
    const now = this.now();
    for (const key of this.recent) names.add(key.slice(key.indexOf('/') + 1));
    for (const row of store.listUploads()) {
      const listed = listedBy.get(row.projectId)?.has(row.sha256) ?? false;
      if (!listed && !this.recent.has(`${row.projectId}/${row.sha256}`) && now - row.addedAt > DAY) {
        store.deleteUpload(row.projectId, row.sha256);
        continue;
      }
      names.add(row.sha256);
    }
    for (const sha of [...this.onDisk.keys()]) {
      if (names.has(sha) || this.fetching.has(sha)) continue;
      rmSync(this.blobPath(sha), { force: true });
      this.onDisk.delete(sha);
      this.mimes.delete(sha);
    }
    for (const name of readdirSync(this.tmp)) {
      const sha = name.slice(0, 64);
      if (this.fetching.has(sha)) continue;
      try {
        const old = now - statSync(join(this.tmp, name)).mtimeMs > DAY;
        if (old || (name.endsWith('.part') && !this.wanted.has(sha))) rmSync(join(this.tmp, name), { force: true });
      } catch {
        // Gone meanwhile.
      }
    }
    this.statusChanged();
  }

  // This device's usage line: the images and tracks (not their thumbnails),
  // and the bytes of every file kept, temporary ones included.
  usage(): { files: number; fileBytes: number } {
    const originals = new Set<string>();
    for (const id of this.options.engine.ids()) {
      const doc = this.options.engine.doc(id);
      if (doc) for (const f of readFiles(doc)) if (this.onDisk.has(f.sha256)) originals.add(f.sha256);
    }
    let fileBytes = 0;
    for (const size of this.onDisk.values()) fileBytes += size;
    try {
      for (const name of readdirSync(this.tmp)) fileBytes += statSync(join(this.tmp, name)).size;
    } catch {
      // Nothing there.
    }
    return { files: originals.size, fileBytes };
  }

  status(): FilesStatus {
    const rows = this.options.store.listUploads();
    let downloading = 0;
    for (const [sha, w] of this.wanted) if (!w.notFound && !this.onDisk.has(sha)) downloading += 1;
    return {
      waiting: rows.filter((r) => r.refused === null).map(({ projectId, sha256 }) => ({ projectId, sha256 })),
      downloading,
      refused: rows.flatMap((r) => (r.refused === null ? [] : [{ projectId: r.projectId, sha256: r.sha256, message: r.refused }])),
    };
  }

  private statusChanged(): void {
    if (this.closed || this.statusTimer) return;
    this.statusTimer = setTimeout(() => {
      this.statusTimer = null;
      if (!this.closed) this.options.emit(this.status());
    }, this.options.statusDelayMs ?? 100);
  }

  // Quit, sign-out or another account: every transfer stopped and settled,
  // so nothing writes into a folder about to be removed.
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.abort.abort();
    for (const t of this.docTimers.values()) clearTimeout(t);
    this.docTimers.clear();
    for (const t of [this.uploadTimer, this.downloadTimer, this.statusTimer]) if (t) clearTimeout(t);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    await Promise.allSettled([...this.fetching.values(), this.uploading]);
  }
}
