import * as Y from 'yjs';
import type { DocStatus, SyncRegistry, SyncSnapshot } from '../sync/registry.js';
import { overallState, readStateless, type ProviderSnapshot } from '../sync/state.js';
import type { AuthState, DesktopSyncStatus, PromptbookBridge } from './bridge.js';
import type { Store } from './store.js';

// The sync registry of the desktop app (desktop-app design decision 5). Main
// keeps every project in sync and on disk; a page holds a Y.Doc only for the
// projects it shows, filled from pb:sync:open's state and from main's
// updates, and sends its own changes back. Main's updates are applied with
// the origin FROM_MAIN, so they are never sent back to it.

const FROM_MAIN = Symbol('main');
const RELEASE_GRACE_MS = 2_000;

export const EMPTY_STATUS: DesktopSyncStatus = {
  online: false,
  offlineSince: null,
  lastSync: null,
  firstSync: false,
  listVersion: 0,
  diskError: null,
  projects: [],
};

interface Entry {
  id: string;
  doc: Y.Doc;
  refs: number;
  status: DocStatus;
  // Let go: its changes no longer go to main.
  closed: boolean;
  releaseTimer: ReturnType<typeof setTimeout> | null;
}

// The pill's reading of main's status: a project offline is kept on this
// device; a disk write that failed is Not saved; an account whose session
// ended or that signed out is Sign in to sync. Before main first knows
// whether the server is there, the projects read as syncing, not offline.
export function desktopSnapshot(status: DesktopSyncStatus, session: AuthState['session']): SyncSnapshot {
  const connected = status.online || status.offlineSince === null;
  const providers = status.projects.map((p): ProviderSnapshot => ({
    id: p.id,
    title: p.title,
    connected,
    synced: p.synced,
    unsynced: p.unsynced,
    signedOut: false,
    storeFailed: p.notSaved > 0,
    onDevice: true,
  }));
  const sessionEnded = session === 'ended' || session === 'signed-out';
  return {
    state: overallState(providers, sessionEnded),
    providers,
    lastSync: status.lastSync ? new Date(status.lastSync) : null,
    sessionEnded,
    device: status,
  };
}

export class DesktopSyncRegistry implements SyncRegistry {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private storedListeners = new Set<(id: string) => void>();
  private snapshotListeners = new Set<(id: string) => void>();
  private status: DesktopSyncStatus = EMPTY_STATUS;
  private snapshot: SyncSnapshot;
  // Status answers that arrive after a newer one are dropped.
  private statusTicket = 0;

  constructor(
    private readonly bridge: PromptbookBridge,
    private readonly auth: Store<AuthState>,
  ) {
    this.snapshot = desktopSnapshot(this.status, auth.get().session);
    bridge.sync.onUpdate((id, update) => {
      const entry = this.entries.get(id);
      if (entry && !entry.closed) Y.applyUpdate(entry.doc, update, FROM_MAIN);
    });
    bridge.sync.onStatus((status) => {
      this.statusTicket += 1;
      this.setStatus(status);
    });
    bridge.sync.onStateless(({ id, payload }) => this.onStateless(id, payload));
    auth.subscribe(() => this.changed());
  }

  // Main's status read once, at start and after another account opened;
  // later ones come as events.
  async refresh(): Promise<void> {
    const ticket = ++this.statusTicket;
    const status = await this.bridge.sync.status();
    if (ticket === this.statusTicket) this.setStatus(status);
  }

  open(id: string): Entry {
    const known = this.entries.get(id);
    if (known) {
      known.refs += 1;
      if (known.releaseTimer) clearTimeout(known.releaseTimer);
      known.releaseTimer = null;
      return known;
    }
    const entry: Entry = { id, doc: new Y.Doc(), refs: 1, status: 'loading', closed: false, releaseTimer: null };
    entry.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === FROM_MAIN || entry.closed) return;
      // Refused only when main no longer has the project open for this page
      // (another account opened meanwhile): nothing to keep.
      this.bridge.sync.update(id, update).catch(() => {});
    });
    this.entries.set(id, entry);
    // Main counts this open; release() sends exactly one release for it,
    // after it, whatever happens to the answer.
    this.bridge.sync.open(id).then(
      ({ state, status }) => {
        if (entry.closed) return;
        Y.applyUpdate(entry.doc, state, FROM_MAIN);
        // Downloaded meanwhile: main's status said so before this answer.
        entry.status = status === 'loading' && this.downloaded(id) ? 'ready' : status;
        this.changed();
      },
      () => {
        if (entry.closed) return;
        entry.status = 'gone';
        this.changed();
      },
    );
    this.changed();
    return entry;
  }

  // Lets go of a project's document after a short grace period, so a view
  // that closes and opens it again at once keeps the same document. Main
  // keeps every change, so nothing waits for the server.
  release(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.refs = Math.max(0, entry.refs - 1);
    if (entry.refs > 0 || entry.releaseTimer) return;
    entry.releaseTimer = setTimeout(() => {
      entry.releaseTimer = null;
      if (entry.refs > 0 || this.entries.get(id) !== entry) return;
      this.drop(entry);
      this.changed();
    }, RELEASE_GRACE_MS);
  }

  private drop(entry: Entry): void {
    entry.closed = true;
    if (entry.releaseTimer) clearTimeout(entry.releaseTimer);
    entry.releaseTimer = null;
    this.entries.delete(entry.id);
    this.bridge.sync.release(entry.id).catch(() => {});
    entry.doc.destroy();
  }

  // Main signs in again and resyncs by itself.
  reconnect(): void {}

  syncNow(): void {
    this.bridge.sync.syncNow().catch(() => {});
  }

  // Main reports the session; a 401 changed its state already.
  markSessionEnded(): void {}

  // Another account, or none: the documents of the old one are let go
  // without being destroyed, as views may still hold them until they
  // unmount.
  closeAll(): void {
    for (const entry of [...this.entries.values()]) {
      entry.closed = true;
      if (entry.releaseTimer) clearTimeout(entry.releaseTimer);
      this.entries.delete(entry.id);
      this.bridge.sync.release(entry.id).catch(() => {});
    }
    this.changed();
  }

  docStatus(id: string): DocStatus {
    return this.entries.get(id)?.status ?? 'loading';
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  onStored(listener: (id: string) => void): () => void {
    this.storedListeners.add(listener);
    return () => this.storedListeners.delete(listener);
  }

  onSnapshot(listener: (id: string) => void): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  getSnapshot = (): SyncSnapshot => this.snapshot;

  private downloaded(id: string): boolean {
    return this.status.projects.some((p) => p.id === id && p.downloaded);
  }

  private setStatus(status: DesktopSyncStatus): void {
    const before = this.status;
    this.status = status;
    const now = new Map(status.projects.map((p) => [p.id, p]));
    for (const entry of this.entries.values()) {
      const project = now.get(entry.id);
      // Downloaded since it opened (first sync).
      if (entry.status === 'loading' && project?.downloaded) entry.status = 'ready';
      // Left the account's list (binned, or purged): gone. Only on the
      // change, as a project just made here may not be in an older status.
      if (!project && entry.status === 'ready' && before.projects.some((p) => p.id === entry.id)) {
        entry.status = 'gone';
      }
    }
    this.changed();
    if (status.listVersion !== before.listVersion) for (const listener of this.storedListeners) listener('');
  }

  private onStateless(id: string, payload: string): void {
    const event = readStateless(payload);
    if (event === 'stored') for (const listener of this.storedListeners) listener(id);
    if (event === 'snapshot') for (const listener of this.snapshotListeners) listener(id);
    if (event === 'deleted') {
      const entry = this.entries.get(id);
      if (entry) entry.status = 'gone';
      this.changed();
    }
  }

  private changed(): void {
    this.snapshot = desktopSnapshot(this.status, this.auth.get().session);
    for (const listener of [...this.listeners]) listener();
  }
}
