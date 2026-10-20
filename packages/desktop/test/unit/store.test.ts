import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { BURST_GAP_MS, COMPACT_AT, RETRY_MS, Store, type Database, type UpdateOrigin } from '../../src/main/store.js';

// The local store on a real node:sqlite database (desktop-app design
// decision 4): append, load, compaction, and a write that fails and is
// retried.

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pb-store-'));
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

const ID = '0b9d2c3e-1f4a-4b5c-8d6e-7f8a9b0c1d2e';

// A database whose writes to doc_updates fail while `full` is set, as with
// SQLITE_FULL.
function failingDb(file: string) {
  const real = new DatabaseSync(file);
  const state = { full: false };
  const db: Database = {
    exec: (sql) => real.exec(sql),
    close: () => real.close(),
    prepare: (sql) => {
      const statement = real.prepare(sql);
      if (!/insert into doc_updates/.test(sql)) return statement;
      return new Proxy(statement, {
        get(target, key) {
          if (key === 'run') {
            return (...args: Parameters<typeof target.run>) => {
              if (state.full) throw Object.assign(new Error('database or disk is full'), { errcode: 13 });
              return target.run(...args);
            };
          }
          const value = Reflect.get(target, key) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
  return { db, state };
}

const typed = (doc: Y.Doc, text: string) => {
  const updates: Uint8Array[] = [];
  const listener = (u: Uint8Array) => updates.push(u);
  doc.on('update', listener);
  doc.getText('document').insert(doc.getText('document').length, text);
  doc.off('update', listener);
  return updates[0]!;
};

describe('store', () => {
  it('creates the six tables in WAL mode', () => {
    const file = join(dir, 'a.sqlite');
    Store.open(file).close();
    const db = new DatabaseSync(file);
    const tables = (db.prepare("select name from sqlite_master where type = 'table' order by name").all() as {
      name: string;
    }[]).map((t) => t.name);
    expect(tables).toEqual(['doc_updates', 'docs', 'kv', 'projects', 'server_cache', 'snapshots', 'sqlite_sequence']);
    expect(db.prepare('pragma journal_mode').get()).toEqual({ journal_mode: 'wal' });
    expect(db.prepare('pragma user_version').get()).toEqual({ user_version: 1 });
    db.close();
  });

  it('appends every update and loads the document from them', () => {
    const file = join(dir, 'a.sqlite');
    const store = Store.open(file);
    const doc = new Y.Doc();
    store.appendUpdate(ID, typed(doc, 'Prima '), 'renderer:3');
    store.appendUpdate(ID, typed(doc, 'scena'), 'remote');
    expect(store.updateRows(ID)).toBe(2);
    // Only the change made here counts as waiting for the server.
    expect(store.unsyncedCount(ID)).toBe(1);
    store.close();

    const again = Store.open(file);
    expect(again.loadDoc(ID)?.getText('document').toString()).toBe('Prima scena');
    expect(again.unsyncedCount(ID)).toBe(1);
    expect(again.loadDoc('11111111-1111-4111-8111-111111111111')).toBeNull();
    again.close();
  });

  it('compacts a project into one state and loads the same text', () => {
    const file = join(dir, 'a.sqlite');
    const store = Store.open(file);
    const doc = new Y.Doc();
    for (let i = 0; i <= COMPACT_AT; i++) store.appendUpdate(ID, typed(doc, `${i} `), 'remote');
    expect(store.updateRows(ID)).toBe(COMPACT_AT + 1);
    expect(store.compact(ID, Y.encodeStateAsUpdate(doc))).toBe(true);
    expect(store.updateRows(ID)).toBe(0);
    store.appendUpdate(ID, typed(doc, 'fine'), 'remote');
    store.close();

    const again = Store.open(file);
    expect(again.updateRows(ID)).toBe(1);
    expect(again.loadDoc(ID)?.getText('document').toString()).toBe(doc.getText('document').toString());
    again.close();
  });

  it('keeps a failed write in memory, retries it every 10 s and on the next change, then clears', () => {
    vi.useFakeTimers();
    const file = join(dir, 'a.sqlite');
    const { db, state } = failingDb(file);
    const store = new Store(db);
    const doc = new Y.Doc();
    const changes: number[] = [];
    store.onChange(() => changes.push(store.notSaved(ID)));

    state.full = true;
    expect(store.appendUpdate(ID, typed(doc, 'uno '), 'renderer:1')).toBe(false);
    expect(store.appendUpdate(ID, typed(doc, 'due '), 'renderer:1')).toBe(false);
    expect(store.notSaved(ID)).toBe(2);
    expect(store.lastError).toBe('disk full');
    // Typed without a pause: one change.
    expect(store.unsyncedCount(ID)).toBe(1);
    vi.advanceTimersByTime(RETRY_MS);
    expect(store.notSaved(ID)).toBe(2);

    // Space is freed: the next try writes everything held, in order.
    state.full = false;
    vi.advanceTimersByTime(RETRY_MS);
    expect(store.notSaved(ID)).toBe(0);
    expect(store.lastError).toBeNull();
    expect(store.updateRows(ID)).toBe(2);

    // A third change while full, then the next change succeeds with it.
    state.full = true;
    store.appendUpdate(ID, typed(doc, 'tre '), 'renderer:1');
    state.full = false;
    expect(store.appendUpdate(ID, typed(doc, 'quattro'), 'renderer:1')).toBe(true);
    expect(store.notSaved(ID)).toBe(0);
    store.close();

    const again = Store.open(file);
    expect(again.loadDoc(ID)?.getText('document').toString()).toBe('uno due tre quattro');
    // «tre quattro» came 20 s later: a second change.
    expect(again.unsyncedCount(ID)).toBe(2);
    again.close();
    expect(changes).toContain(2);
    expect(changes.at(-1)).toBe(0);
  });

  it('compaction writes the held updates too', () => {
    const file = join(dir, 'a.sqlite');
    const { db, state } = failingDb(file);
    const store = new Store(db);
    const doc = new Y.Doc();
    state.full = true;
    store.appendUpdate(ID, typed(doc, 'tenuto'), 'renderer:1');
    expect(store.notSaved(ID)).toBe(1);
    expect(store.compact(ID, Y.encodeStateAsUpdate(doc))).toBe(true);
    expect(store.notSaved(ID)).toBe(0);
    expect(store.unsyncedCount(ID)).toBe(1);
    store.close();
    expect(Store.open(file).loadDoc(ID)?.getText('document').toString()).toBe('tenuto');
  });

  it('counts a change as the updates made here with no pause over 2 s', () => {
    let now = 1_000_000;
    const file = join(dir, 'a.sqlite');
    const store = Store.open(file, () => now);
    const doc = new Y.Doc();
    const type = (text: string, after: number, origin: UpdateOrigin = 'renderer:1') => {
      now += after;
      store.appendUpdate(ID, typed(doc, text), origin);
      return store.unsyncedCount(ID);
    };
    expect(type('a', 0)).toBe(1);
    expect(type('b', 500)).toBe(1);
    expect(type('c', BURST_GAP_MS)).toBe(1);
    // The server's updates neither count nor end a change.
    expect(type('d', 1_000, 'remote')).toBe(1);
    expect(type('e', 1_000)).toBe(1);
    expect(type('f', BURST_GAP_MS + 1)).toBe(2);
    // main's own (a restore) is a change too.
    expect(type('g', 60_000, 'main')).toBe(3);
    store.close();
    // Kept across a relaunch.
    expect(Store.open(file).unsyncedCount(ID)).toBe(3);
  });

  it('starts a new change after the server acknowledged the last one', () => {
    let now = 1_000_000;
    const store = Store.open(join(dir, 'a.sqlite'), () => now);
    const doc = new Y.Doc();
    store.appendUpdate(ID, typed(doc, 'a'), 'renderer:1');
    store.resetUnsynced(ID);
    now += 100;
    store.appendUpdate(ID, typed(doc, 'b'), 'renderer:1');
    expect(store.unsyncedCount(ID)).toBe(1);
    store.close();
  });

  it('resets the unsynced count once the server has everything', () => {
    const file = join(dir, 'a.sqlite');
    const store = Store.open(file);
    store.appendUpdate(ID, typed(new Y.Doc(), 'x'), 'main');
    expect(store.unsyncedCount(ID)).toBe(1);
    store.resetUnsynced(ID);
    expect(store.unsyncedCount(ID)).toBe(0);
    store.close();
    expect(Store.open(file).unsyncedCount(ID)).toBe(0);
  });

  it('removes a project with its document, updates and snapshots', () => {
    const store = Store.open(join(dir, 'a.sqlite'));
    store.appendUpdate(ID, typed(new Y.Doc(), 'x'), 'main');
    store.insertSnapshot({ id: 's1', projectId: ID, createdAt: 1, kind: 'user', label: 'a', text: 'x', words: 1 });
    store.removeProject(ID);
    expect(store.loadDoc(ID)).toBeNull();
    expect(store.listSnapshots(ID)).toEqual([]);
    expect(store.unsyncedCount(ID)).toBe(0);
    store.close();
  });

  it('keeps the server answers and keys', () => {
    const store = Store.open(join(dir, 'a.sqlite'), () => 42);
    store.setCache('settings', { system: 'D&D' });
    expect(store.getCache('settings')).toEqual({ value: { system: 'D&D' }, fetchedAt: 42 });
    store.setCache('snapshots:a', 1);
    store.setCache('snapshot:a:b', 2);
    store.deleteCache('snapshot:');
    expect(store.getCache('snapshot:a:b')).toBeNull();
    expect(store.getCache('snapshots:a')).not.toBeNull();
    store.setKv('local_snapshots', 'off');
    expect(store.getKv('local_snapshots')).toBe('off');
    store.close();
    // Closed: reads answer nothing instead of throwing.
    expect(store.getKv('local_snapshots')).toBeNull();
  });
});
