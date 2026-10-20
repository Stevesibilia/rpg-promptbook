import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { documentWords, expiresAt, LocalSnapshots, MODES } from '../../src/main/snapshots.js';
import type { LocalSnapshotRecord } from '../../src/main/store.js';
import { projectDoc, rowOf } from './helpers.js';
import { world, type World } from './world.js';

// Local snapshots (desktop-app design decision 12): taken on a timer only
// when the text changed, labelled by the setting, expired by it.

const A = '0b9d2c3e-1f4a-4b5c-8d6e-7f8a9b0c1d2e';
const HOUR = 3_600_000;
const DAY = 86_400_000;

let w: World;
afterEach(async () => {
  vi.useRealTimers();
  await w?.close();
});

async function setup(now: () => number, taken?: (record: LocalSnapshotRecord) => void) {
  w = await world(() => {}, { online: false });
  const doc = projectDoc(A, 'Ancora', '---\ntitolo: Ancora\n---\nUna due tre.');
  w.store.appendUpdate(A, Y.encodeStateAsUpdate(doc), 'remote');
  w.store.putProject({ id: A, row: rowOf(doc), serverEditedAt: null, deletedAt: null, createdLocal: false, uploaded: true });
  w.engine.add(A);
  w.snapshots.stop();
  return new LocalSnapshots({ store: w.store, engine: w.engine, now, ...(taken ? { taken } : {}) });
}

const type = (text: string) => w.engine.transact(A, (doc) => doc.getText('document').insert(doc.getText('document').length, text));

describe('local snapshots', () => {
  it('takes one each hour only when the text changed, kept 7 days', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let now = Date.parse('2026-10-20T10:00:00.000Z');
    const snapshots = await setup(() => now);
    snapshots.start();
    now += HOUR;
    vi.advanceTimersByTime(HOUR);
    expect(w.store.listSnapshots(A)).toEqual([]);

    type(' Quattro.');
    now += HOUR;
    vi.advanceTimersByTime(HOUR);
    const [taken] = w.store.listSnapshots(A);
    expect(taken).toMatchObject({ kind: 'hourly', label: 'Hourly, while editing', words: 4 });
    expect(expiresAt(taken!)).toBe(taken!.createdAt + 7 * DAY);

    now += HOUR;
    vi.advanceTimersByTime(HOUR);
    expect(w.store.listSnapshots(A)).toHaveLength(1);
    snapshots.stop();
  });

  it('takes one every 15 minutes, kept 2 days, or none when off', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const snapshots = await setup(() => Date.now());
    snapshots.start();
    snapshots.setMode('quarter');
    type(' Quattro.');
    vi.advanceTimersByTime(15 * 60_000);
    const [taken] = w.store.listSnapshots(A);
    expect(taken?.label).toBe('Every 15 minutes, while editing');
    expect(expiresAt(taken!)).toBe(taken!.createdAt + 2 * DAY);

    snapshots.setMode('off');
    expect(w.store.getKv('local_snapshots')).toBe('off');
    type(' Cinque.');
    vi.advanceTimersByTime(2 * HOUR);
    expect(w.store.listSnapshots(A)).toHaveLength(1);
    expect(snapshots.tick(A)).toBeNull();
    snapshots.stop();
  });

  it('expires hourly rows by their setting, restore rows after 30 days, user rows never', async () => {
    const now = Date.parse('2026-10-20T10:00:00.000Z');
    const snapshots = await setup(() => now);
    const at = (days: number) => now - days * DAY;
    const row = (id: string, kind: 'hourly' | 'user' | 'restore', label: string, days: number) =>
      w.store.insertSnapshot({ id, projectId: A, createdAt: at(days), kind, label, text: 'x', words: 1 });
    row('h7', 'hourly', MODES.hourly!.label, 8);
    row('h6', 'hourly', MODES.hourly!.label, 6);
    row('q3', 'hourly', MODES.quarter!.label, 3);
    row('r31', 'restore', 'x · 2026-09-01T00:00:00.000Z', 31);
    row('r29', 'restore', 'x · 2026-09-01T00:00:00.000Z', 29);
    row('u99', 'user', 'mine', 99);
    expect(snapshots.expire()).toBe(3);
    expect(w.store.listSnapshots(A).map((s) => s.id).sort()).toEqual(['h6', 'r29', 'u99']);
  });

  it('starts from the text a project had when it was downloaded', async () => {
    const snapshots = await setup(() => Date.now());
    const B = '1c0e3d4f-2a5b-4c6d-9e7f-8a9b0c1d2e3f';
    w.engine.add(B);
    snapshots.track(B);
    // Downloaded, then edited before the first tick.
    w.engine.transact(B, (doc) => doc.getText('document').insert(0, 'Scaricato.'));
    snapshots.baseline(B);
    w.engine.transact(B, (doc) => doc.getText('document').insert(0, 'Modificato. '));
    expect(snapshots.tick(B)?.text).toBe('Modificato. Scaricato.');
    snapshots.stop();
  });

  it('announces every snapshot it takes, so History reads them at once', async () => {
    const taken: LocalSnapshotRecord[] = [];
    const snapshots = await setup(() => Date.now(), (record) => taken.push(record));
    snapshots.track(A);
    type(' Quattro.');
    const hourly = snapshots.tick(A);
    const user = snapshots.take(A, 'user', 'prima della prova');
    expect(taken.map((s) => [s.id, s.kind])).toEqual([
      [hourly!.id, 'hourly'],
      [user!.id, 'user'],
    ]);
    // Nothing changed: no snapshot, no message.
    snapshots.tick(A);
    expect(taken).toHaveLength(2);
    snapshots.stop();
  });

  it('counts words as the server does, after the front matter', () => {
    expect(documentWords('---\ntitolo: Ancora\n---\nUna due tre.', 'one-shot')).toBe(3);
    expect(documentWords('Uno due', 'campaign')).toBe(2);
  });
});
