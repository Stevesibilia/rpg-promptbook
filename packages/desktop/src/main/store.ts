import { DatabaseSync } from 'node:sqlite';
import type { ProjectRow } from 'promptbook-project';
import * as Y from 'yjs';

// The account's database: every project's document, the list rows, local
// snapshots, what the server last answered, and a few keys (desktop-app
// design decision 4). node:sqlite in the main process, so no native module.
// Every Yjs update is appended in the tick it is applied; a project's rows
// are compacted into one state past COMPACT_AT rows and on quit. A failed
// write keeps the update in memory and retries; the project shows Not saved
// until a write succeeds.

export const COMPACT_AT = 500;
export const RETRY_MS = 10_000;

// Where an update came from: the server, a window (by its webContents id),
// or main itself (a restore, a new project).
export type UpdateOrigin = 'remote' | 'main' | `renderer:${number}`;

export interface ProjectRecord {
  id: string;
  row: ProjectRow;
  // editedAt as the server last listed it.
  serverEditedAt: string | null;
  // Set when the project left the server's list (binned or purged).
  deletedAt: string | null;
  createdLocal: boolean;
  uploaded: boolean;
}

export type LocalSnapshotKind = 'hourly' | 'user' | 'restore';

export interface LocalSnapshotRecord {
  id: string;
  projectId: string;
  // ms since epoch
  createdAt: number;
  kind: LocalSnapshotKind;
  label: string;
  text: string;
  words: number;
}

export interface CachedValue {
  value: unknown;
  fetchedAt: number;
}

interface PendingUpdate {
  update: Uint8Array;
  origin: UpdateOrigin;
  at: number;
}

// The subset of DatabaseSync the store uses; tests wrap a real one to make
// writes fail.
export type Database = Pick<DatabaseSync, 'exec' | 'prepare' | 'close'>;

const SCHEMA_VERSION = 1;

const MIGRATIONS = [
  `create table docs (
     project_id text primary key,
     state blob not null,
     updated_at integer
   );
   create table doc_updates (
     seq integer primary key autoincrement,
     project_id text,
     "update" blob not null,
     origin text not null,
     created_at integer
   );
   create index doc_updates_project on doc_updates (project_id, seq);
   create table projects (
     id text primary key,
     summary text not null,
     server_edited_at text,
     deleted_at text,
     created_local integer not null default 0,
     uploaded integer not null default 1
   );
   create table snapshots (
     id text primary key,
     project_id text,
     created_at integer,
     kind text,
     label text,
     text text not null,
     words integer
   );
   create index snapshots_project on snapshots (project_id, created_at);
   create table server_cache (
     key text primary key,
     value text not null,
     fetched_at integer
   );
   create table kv (key text primary key, value text);`,
];

const isLocal = (origin: UpdateOrigin) => origin !== 'remote';

const unsyncedKey = (projectId: string) => `unsynced:${projectId}`;

// «disk full» for SQLITE_FULL, the error's own message otherwise.
export function describeWriteError(error: unknown): string {
  const e = error as { errcode?: number; code?: string; message?: string };
  if (e?.errcode === 13 || /SQLITE_FULL|database or disk is full/i.test(e?.message ?? '')) return 'disk full';
  return e?.message ?? String(error);
}

export class Store {
  private closed = false;
  private rows = new Map<string, number>();
  private unsynced = new Map<string, number>();
  private pending = new Map<string, PendingUpdate[]>();
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  // The last write error while any project is not saved.
  lastError: string | null = null;

  constructor(
    private db: Database,
    private now: () => number = Date.now,
  ) {
    db.exec('pragma journal_mode = WAL; pragma synchronous = NORMAL; pragma foreign_keys = ON;');
    this.migrate();
    for (const r of this.all<{ project_id: string; n: number }>(
      'select project_id, count(*) as n from doc_updates group by project_id',
    )) {
      this.rows.set(r.project_id, Number(r.n));
    }
    for (const r of this.all<{ key: string; value: string }>("select key, value from kv where key like 'unsynced:%'")) {
      this.unsynced.set(r.key.slice('unsynced:'.length), Number(r.value) || 0);
    }
  }

  static open(file: string, now?: () => number): Store {
    return new Store(new DatabaseSync(file), now);
  }

  private migrate(): void {
    const version = Number(this.get<{ user_version: number }>('pragma user_version')?.user_version ?? 0);
    for (let v = version; v < SCHEMA_VERSION; v++) {
      this.transaction(() => {
        this.db.exec(MIGRATIONS[v]!);
        this.db.exec(`pragma user_version = ${v + 1}`);
      });
    }
  }

  private all<T>(sql: string, ...params: (string | number | null | Uint8Array)[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  private get<T>(sql: string, ...params: (string | number | null | Uint8Array)[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  private run(sql: string, ...params: (string | number | null | Uint8Array)[]): void {
    this.db.prepare(sql).run(...params);
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec('begin immediate');
    try {
      const result = fn();
      this.db.exec('commit');
      return result;
    } catch (error) {
      try {
        this.db.exec('rollback');
      } catch {
        // The failed statement may have rolled back already.
      }
      throw error;
    }
  }

  // Called when a project's Not saved state or the unsynced counts change.
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }

  // Documents.

  // The project's document as stored: the compacted state, then its updates
  // in order. Null when nothing is stored for it.
  loadDoc(projectId: string): Y.Doc | null {
    if (this.closed) return null;
    const state = this.get<{ state: Uint8Array }>('select state from docs where project_id = ?', projectId);
    const updates = this.all<{ update: Uint8Array }>(
      'select "update" from doc_updates where project_id = ? order by seq',
      projectId,
    );
    if (!state && updates.length === 0) return null;
    const doc = new Y.Doc();
    doc.transact(() => {
      if (state) Y.applyUpdate(doc, state.state);
      for (const u of updates) Y.applyUpdate(doc, u.update);
    });
    return doc;
  }

  hasDoc(projectId: string): boolean {
    if (this.closed) return false;
    return (
      !!this.get('select 1 from docs where project_id = ?', projectId) ||
      !!this.get('select 1 from doc_updates where project_id = ? limit 1', projectId)
    );
  }

  // Appends one update. False when it could not be written: it is then held
  // in memory and retried every RETRY_MS and with the project's next update.
  appendUpdate(projectId: string, update: Uint8Array, origin: UpdateOrigin): boolean {
    if (this.closed) return false;
    const item = { update, origin, at: this.now() };
    const queue = this.pending.get(projectId);
    if (queue) {
      queue.push(item);
      this.changed();
      return this.flush(projectId);
    }
    try {
      this.writeUpdates(projectId, [item]);
      if (isLocal(origin)) this.changed();
      return true;
    } catch (error) {
      this.pending.set(projectId, [item]);
      this.lastError = describeWriteError(error);
      this.startRetry();
      this.changed();
      return false;
    }
  }

  private writeUpdates(projectId: string, items: PendingUpdate[]): void {
    const local = items.filter((i) => isLocal(i.origin)).length;
    const unsynced = (this.unsynced.get(projectId) ?? 0) + local;
    this.transaction(() => {
      const insert = this.db.prepare(
        'insert into doc_updates (project_id, "update", origin, created_at) values (?, ?, ?, ?)',
      );
      for (const i of items) insert.run(projectId, i.update, i.origin, i.at);
      if (local > 0) {
        this.db
          .prepare('insert into kv (key, value) values (?, ?) on conflict (key) do update set value = excluded.value')
          .run(unsyncedKey(projectId), String(unsynced));
      }
    });
    this.rows.set(projectId, (this.rows.get(projectId) ?? 0) + items.length);
    this.unsynced.set(projectId, unsynced);
  }

  // Writes a project's held updates. True once nothing is held for it.
  flush(projectId: string): boolean {
    const queue = this.pending.get(projectId);
    if (!queue) return true;
    if (this.closed) return false;
    try {
      this.writeUpdates(projectId, queue);
    } catch (error) {
      this.lastError = describeWriteError(error);
      return false;
    }
    this.pending.delete(projectId);
    if (this.pending.size === 0) {
      this.lastError = null;
      this.stopRetry();
    }
    this.changed();
    return true;
  }

  flushAll(): void {
    for (const id of [...this.pending.keys()]) this.flush(id);
  }

  private startRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = setInterval(() => this.flushAll(), RETRY_MS);
  }

  private stopRetry(): void {
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = null;
  }

  // Updates held in memory for a project after a failed write.
  notSaved(projectId: string): number {
    return this.pending.get(projectId)?.length ?? 0;
  }

  // Changes made on this device the server has not acknowledged.
  unsyncedCount(projectId: string): number {
    const held = (this.pending.get(projectId) ?? []).filter((i) => isLocal(i.origin)).length;
    return (this.unsynced.get(projectId) ?? 0) + held;
  }

  // The server acknowledged every change of the project.
  resetUnsynced(projectId: string): void {
    if (this.closed || !this.unsynced.get(projectId)) return;
    try {
      this.run('delete from kv where key = ?', unsyncedKey(projectId));
      this.unsynced.delete(projectId);
      this.changed();
    } catch {
      // Kept as it is; the next acknowledgement tries again.
    }
  }

  updateRows(projectId: string): number {
    return this.rows.get(projectId) ?? 0;
  }

  // Replaces a project's rows with `state`, the encoded in-memory document,
  // which holds every row and every held update. False when the write fails.
  compact(projectId: string, state: Uint8Array): boolean {
    if (this.closed) return false;
    try {
      this.transaction(() => {
        this.run(
          `insert into docs (project_id, state, updated_at) values (?, ?, ?)
           on conflict (project_id) do update set state = excluded.state, updated_at = excluded.updated_at`,
          projectId,
          state,
          this.now(),
        );
        this.run('delete from doc_updates where project_id = ?', projectId);
      });
    } catch (error) {
      this.lastError = describeWriteError(error);
      return false;
    }
    this.rows.set(projectId, 0);
    const held = this.pending.get(projectId);
    if (held) {
      // Their changes are in the state; only their count of local changes
      // is still to be kept.
      const local = held.filter((i) => isLocal(i.origin)).length;
      this.pending.delete(projectId);
      if (local > 0) this.setUnsynced(projectId, (this.unsynced.get(projectId) ?? 0) + local);
      if (this.pending.size === 0) {
        this.lastError = null;
        this.stopRetry();
      }
      this.changed();
    }
    return true;
  }

  private setUnsynced(projectId: string, n: number): void {
    try {
      this.run(
        'insert into kv (key, value) values (?, ?) on conflict (key) do update set value = excluded.value',
        unsyncedKey(projectId),
        String(n),
      );
    } catch {
      // The count is kept in memory; it is written with the next update.
    }
    this.unsynced.set(projectId, n);
  }

  // Projects.

  listProjects(): ProjectRecord[] {
    if (this.closed) return [];
    return this.all<ProjectDbRow>('select * from projects').map(toRecord);
  }

  getProject(id: string): ProjectRecord | null {
    if (this.closed) return null;
    const row = this.get<ProjectDbRow>('select * from projects where id = ?', id);
    return row ? toRecord(row) : null;
  }

  putProject(p: ProjectRecord): void {
    if (this.closed) return;
    this.run(
      `insert into projects (id, summary, server_edited_at, deleted_at, created_local, uploaded)
       values (?, ?, ?, ?, ?, ?)
       on conflict (id) do update set summary = excluded.summary, server_edited_at = excluded.server_edited_at,
         deleted_at = excluded.deleted_at, created_local = excluded.created_local, uploaded = excluded.uploaded`,
      p.id,
      JSON.stringify(p.row),
      p.serverEditedAt,
      p.deletedAt,
      p.createdLocal ? 1 : 0,
      p.uploaded ? 1 : 0,
    );
  }

  // A project, with its document, updates and local snapshots, gone from
  // this device.
  removeProject(id: string): void {
    if (this.closed) return;
    this.transaction(() => {
      this.run('delete from docs where project_id = ?', id);
      this.run('delete from doc_updates where project_id = ?', id);
      this.run('delete from snapshots where project_id = ?', id);
      this.run('delete from projects where id = ?', id);
      this.run('delete from kv where key = ?', unsyncedKey(id));
    });
    this.rows.delete(id);
    this.unsynced.delete(id);
    this.pending.delete(id);
  }

  // Local snapshots.

  insertSnapshot(s: LocalSnapshotRecord): void {
    if (this.closed) return;
    this.run(
      'insert into snapshots (id, project_id, created_at, kind, label, text, words) values (?, ?, ?, ?, ?, ?, ?)',
      s.id,
      s.projectId,
      s.createdAt,
      s.kind,
      s.label,
      s.text,
      s.words,
    );
  }

  // Newest first, without their text when `withText` is false.
  listSnapshots(projectId: string): LocalSnapshotRecord[] {
    if (this.closed) return [];
    return this.all<SnapshotDbRow>(
      'select * from snapshots where project_id = ? order by created_at desc, id',
      projectId,
    ).map(toSnapshot);
  }

  allSnapshots(): Omit<LocalSnapshotRecord, 'text'>[] {
    if (this.closed) return [];
    return this.all<SnapshotDbRow>(
      'select id, project_id, created_at, kind, label, words from snapshots order by created_at',
    ).map((r) => {
      const { text: _text, ...rest } = toSnapshot({ ...r, text: '' });
      return rest;
    });
  }

  getSnapshot(id: string): LocalSnapshotRecord | null {
    if (this.closed) return null;
    const row = this.get<SnapshotDbRow>('select * from snapshots where id = ?', id);
    return row ? toSnapshot(row) : null;
  }

  latestSnapshotText(projectId: string): string | null {
    if (this.closed) return null;
    return (
      this.get<{ text: string }>(
        'select text from snapshots where project_id = ? order by created_at desc limit 1',
        projectId,
      )?.text ?? null
    );
  }

  deleteSnapshots(ids: readonly string[]): void {
    if (this.closed || ids.length === 0) return;
    this.transaction(() => {
      for (const id of ids) this.run('delete from snapshots where id = ?', id);
    });
  }

  snapshotCount(): number {
    if (this.closed) return 0;
    return Number(this.get<{ n: number }>('select count(*) as n from snapshots')?.n ?? 0);
  }

  // What the server last answered.

  getCache(key: string): CachedValue | null {
    if (this.closed) return null;
    const row = this.get<{ value: string; fetched_at: number }>(
      'select value, fetched_at from server_cache where key = ?',
      key,
    );
    return row ? { value: JSON.parse(row.value), fetchedAt: Number(row.fetched_at) } : null;
  }

  setCache(key: string, value: unknown): void {
    if (this.closed) return;
    this.run(
      `insert into server_cache (key, value, fetched_at) values (?, ?, ?)
       on conflict (key) do update set value = excluded.value, fetched_at = excluded.fetched_at`,
      key,
      JSON.stringify(value),
      this.now(),
    );
  }

  deleteCache(prefix: string): void {
    if (this.closed) return;
    this.run("delete from server_cache where key like ? escape '\\'", `${prefix.replace(/[%_\\]/g, '\\$&')}%`);
  }

  // Keys.

  getKv(key: string): string | null {
    if (this.closed) return null;
    return this.get<{ value: string }>('select value from kv where key = ?', key)?.value ?? null;
  }

  setKv(key: string, value: string): void {
    if (this.closed) return;
    this.run(
      'insert into kv (key, value) values (?, ?) on conflict (key) do update set value = excluded.value',
      key,
      value,
    );
  }

  deleteKv(key: string): void {
    if (this.closed) return;
    this.run('delete from kv where key = ?', key);
  }

  get isClosed(): boolean {
    return this.closed;
  }

  // Held updates get one last try; the caller compacts first.
  close(): void {
    if (this.closed) return;
    this.flushAll();
    this.stopRetry();
    this.closed = true;
    this.listeners.clear();
    this.db.close();
  }
}

interface ProjectDbRow {
  id: string;
  summary: string;
  server_edited_at: string | null;
  deleted_at: string | null;
  created_local: number;
  uploaded: number;
}

const toRecord = (r: ProjectDbRow): ProjectRecord => ({
  id: r.id,
  row: JSON.parse(r.summary) as ProjectRow,
  serverEditedAt: r.server_edited_at,
  deletedAt: r.deleted_at,
  createdLocal: Number(r.created_local) === 1,
  uploaded: Number(r.uploaded) === 1,
});

interface SnapshotDbRow {
  id: string;
  project_id: string;
  created_at: number;
  kind: LocalSnapshotKind;
  label: string;
  text: string;
  words: number;
}

const toSnapshot = (r: SnapshotDbRow): LocalSnapshotRecord => ({
  id: r.id,
  projectId: r.project_id,
  createdAt: Number(r.created_at),
  kind: r.kind,
  label: r.label,
  text: r.text,
  words: Number(r.words),
});
