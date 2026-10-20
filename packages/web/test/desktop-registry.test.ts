import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { DesktopProjectStatus } from '../src/platform/bridge.js';
import { desktopSnapshot, DesktopSyncRegistry } from '../src/platform/desktopRegistry.js';
import { createStore } from '../src/platform/store.js';
import { fakeBridge, signedIn, status } from './fake-bridge.js';

const ID = '7d1c2b3a-0000-4000-8000-000000000001';

const project = (patch: Partial<DesktopProjectStatus> = {}): DesktopProjectStatus => ({
  id: ID,
  title: "L'Ancora di Sabaoth",
  downloaded: true,
  bytes: 1400,
  localOnly: false,
  refused: false,
  synced: true,
  unsynced: 0,
  notSaved: 0,
  ...patch,
});

function setup() {
  const fake = fakeBridge();
  const main = new Y.Doc();
  main.getText('document').insert(0, '# Sabaoth\n');
  fake.docs.set(ID, main);
  const auth = createStore(signedIn);
  const registry = new DesktopSyncRegistry(fake.bridge, auth);
  return { fake, main, auth, registry };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('DesktopSyncRegistry', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => vi.useRealTimers());

  it("opens a project from main's state and sends its own changes, never main's back", async () => {
    const { fake, main, registry } = setup();
    const { doc } = registry.open(ID);
    expect(registry.docStatus(ID)).toBe('loading');
    await vi.waitFor(() => expect(registry.docStatus(ID)).toBe('ready'));
    expect(doc.getText('document').toString()).toBe('# Sabaoth\n');

    doc.getText('document').insert(0, 'Bozza. ');
    expect(fake.calls.update).toHaveLength(1);
    expect(main.getText('document').toString()).toBe('Bozza. # Sabaoth\n');

    // An edit from the server, as main forwards it.
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(main));
    let update: Uint8Array | null = null;
    remote.on('update', (u: Uint8Array) => (update = u));
    remote.getText('document').insert(remote.getText('document').length, 'Fine.');
    fake.events.update.emit(ID, update!);
    expect(doc.getText('document').toString()).toBe('Bozza. # Sabaoth\nFine.');
    expect(fake.calls.update).toHaveLength(1);
  });

  it("keeps main's updates that arrive before the open's answer", async () => {
    const { fake, main, registry } = setup();
    const release = fake.holdOpens();
    const { doc } = registry.open(ID);
    const later = new Y.Doc();
    Y.applyUpdate(later, Y.encodeStateAsUpdate(main));
    let update: Uint8Array | null = null;
    later.on('update', (u: Uint8Array) => (update = u));
    later.getText('document').insert(0, 'Prima. ');
    fake.events.update.emit(ID, update!);
    release();
    await vi.waitFor(() => expect(registry.docStatus(ID)).toBe('ready'));
    expect(doc.getText('document').toString()).toBe('Prima. # Sabaoth\n');
    expect(fake.calls.update).toHaveLength(0);
  });

  it('shares one open between views and releases it once, after the grace period', async () => {
    const { fake, registry } = setup();
    const a = registry.open(ID);
    const b = registry.open(ID);
    expect(a.doc).toBe(b.doc);
    registry.release(ID);
    registry.release(ID);
    // Opened again within the grace period (strict mode, a quick reselect).
    const c = registry.open(ID);
    expect(c.doc).toBe(a.doc);
    vi.advanceTimersByTime(5_000);
    expect(fake.calls.release).toEqual([]);
    registry.release(ID);
    vi.advanceTimersByTime(2_000);
    expect(fake.calls.open).toEqual([ID]);
    expect(fake.calls.release).toEqual([ID]);
    // Opened afresh: a second open, a second release.
    registry.open(ID);
    registry.release(ID);
    vi.advanceTimersByTime(2_000);
    expect(fake.calls.open).toEqual([ID, ID]);
    expect(fake.calls.release).toEqual([ID, ID]);
  });

  it('releases a project whose open has not answered yet, and drops the late answer', async () => {
    const { fake, registry } = setup();
    const answer = fake.holdOpens();
    const { doc } = registry.open(ID);
    registry.release(ID);
    vi.advanceTimersByTime(2_000);
    expect(fake.calls.release).toEqual([ID]);
    answer();
    vi.useRealTimers();
    await flush();
    expect(doc.getText('document').toString()).toBe('');
    expect(registry.docStatus(ID)).toBe('loading');
  });

  it('follows main: downloaded during the first sync, gone when binned or deleted', async () => {
    const { fake, registry } = setup();
    fake.docs.delete(ID);
    fake.setStatus(status({ projects: [project({ downloaded: false, synced: false })] }));
    registry.open(ID);
    await vi.waitFor(() => expect(fake.calls.open).toEqual([ID]));
    vi.useRealTimers();
    await flush();
    expect(registry.docStatus(ID)).toBe('loading');
    fake.setStatus(status({ listVersion: 2, projects: [project()] }));
    expect(registry.docStatus(ID)).toBe('ready');
    fake.setStatus(status({ listVersion: 3, projects: [] }));
    expect(registry.docStatus(ID)).toBe('gone');
  });

  it('does not take a project just made here for gone before main lists it', async () => {
    const { fake, registry } = setup();
    fake.setStatus(status({ projects: [] }));
    registry.open(ID);
    await vi.waitFor(() => expect(registry.docStatus(ID)).toBe('ready'));
    fake.setStatus(status({ projects: [] }));
    expect(registry.docStatus(ID)).toBe('ready');
    fake.events.stateless.emit({ id: ID, payload: '{"type":"deleted"}' });
    expect(registry.docStatus(ID)).toBe('gone');
  });

  it('tells the list when main stored a project or the list changed, and History of a snapshot', () => {
    const { fake, registry } = setup();
    const stored: string[] = [];
    const snapshots: string[] = [];
    registry.onStored((id) => stored.push(id));
    registry.onSnapshot((id) => snapshots.push(id));
    fake.setStatus(status({ listVersion: 2 }));
    fake.setStatus(status({ listVersion: 2 }));
    fake.events.stateless.emit({ id: ID, payload: '{"type":"stored"}' });
    fake.events.stateless.emit({ id: ID, payload: '{"type":"snapshot","id":"s1"}' });
    expect(stored).toEqual(['', ID]);
    expect(snapshots).toEqual([ID]);
  });

  it('lets go of every document when the account goes, sending nothing more', async () => {
    const { fake, registry } = setup();
    const { doc } = registry.open(ID);
    await vi.waitFor(() => expect(registry.docStatus(ID)).toBe('ready'));
    registry.closeAll();
    expect(fake.calls.release).toEqual([ID]);
    doc.getText('document').insert(0, 'x');
    expect(fake.calls.update).toEqual([]);
    registry.release(ID);
    vi.advanceTimersByTime(2_000);
    expect(fake.calls.release).toEqual([ID]);
  });

  it('reads the pill from main and the session', () => {
    const { fake, auth, registry } = setup();
    fake.setStatus(status({ projects: [project()] }));
    expect(registry.getSnapshot().state).toBe('synced');
    fake.setStatus(status({ projects: [project({ unsynced: 2, synced: false })] }));
    expect(registry.getSnapshot().state).toBe('syncing');
    fake.setStatus(
      status({ online: false, offlineSince: '2026-10-20T10:05:00.000Z', projects: [project({ unsynced: 3 })] }),
    );
    expect(registry.getSnapshot().state).toBe('local');
    expect(registry.getSnapshot().device?.offlineSince).toBe('2026-10-20T10:05:00.000Z');
    fake.setStatus(
      status({ online: false, offlineSince: '2026-10-20T10:05:00.000Z', projects: [project({ notSaved: 3 })] }),
    );
    expect(registry.getSnapshot().state).toBe('not-saved');
    auth.set({ ...signedIn, session: 'ended' });
    expect(registry.getSnapshot().state).toBe('signed-out');
    expect(registry.getSnapshot().sessionEnded).toBe(true);
  });
});

describe('desktopSnapshot', () => {
  it('reads syncing, not offline, before main first knows whether the server is there', () => {
    const snapshot = desktopSnapshot(
      status({ online: false, offlineSince: null, projects: [project({ synced: false })] }),
      'active',
    );
    expect(snapshot.state).toBe('syncing');
  });

  it('is local with no project while offline', () => {
    expect(desktopSnapshot(status({ online: false, offlineSince: '2026-10-20T10:05:00.000Z' }), 'active').state).toBe(
      'local',
    );
  });

  it('keeps a project the server refused on this device, online', () => {
    const refused = project({ localOnly: true, refused: true, synced: false, unsynced: 1 });
    expect(desktopSnapshot(status({ projects: [refused] }), 'active').state).toBe('local');
    // Its upload in flight reads as syncing.
    expect(desktopSnapshot(status({ projects: [{ ...refused, refused: false }] }), 'active').state).toBe('syncing');
  });

  it('is synced with no project and the server there', () => {
    expect(desktopSnapshot(status(), 'active').state).toBe('synced');
    expect(desktopSnapshot(status(), 'signed-out').state).toBe('signed-out');
  });
});
