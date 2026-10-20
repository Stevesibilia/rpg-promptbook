import { HocuspocusProvider, HocuspocusProviderWebsocket, WebSocketStatus } from '@hocuspocus/provider';
import { readMeta } from 'promptbook-project';
import * as Y from 'yjs';
import { api } from '../api.js';
import type { DocStatus, SyncRegistry, SyncSnapshot } from '../sync/registry.js';
import { overallState, readStateless, type ProviderSnapshot } from '../sync/state.js';

// The browser's sync registry: one HocuspocusProvider per project the user
// has open, all on one shared WebSocket to /sync (design decision 9). The
// registry reference-counts them: the list's panel and the project page share
// a project's provider, and a provider whose changes have not reached the
// server outlives its last view, so leaving a page while offline does not
// lose what was typed there.

interface Entry {
  id: string;
  doc: Y.Doc;
  provider: HocuspocusProvider;
  refs: number;
  status: DocStatus;
  signedOut: boolean;
  storeFailed: boolean;
}

type Listener = () => void;

const RELEASE_GRACE_MS = 2_000;

const socketUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/sync`;

export class WebSyncRegistry implements SyncRegistry {
  private socket: HocuspocusProviderWebsocket | null = null;
  private entries = new Map<string, Entry>();
  private listeners = new Set<Listener>();
  private storedListeners = new Set<(id: string) => void>();
  private snapshotListeners = new Set<(id: string) => void>();
  private snapshot: SyncSnapshot = {
    state: 'synced',
    providers: [],
    lastSync: null,
    sessionEnded: false,
    device: null,
  };
  private lastSync: Date | null = null;
  private sessionEnded = false;

  private ensureSocket(): HocuspocusProviderWebsocket {
    if (!this.socket) {
      this.socket = new HocuspocusProviderWebsocket({
        url: socketUrl(),
        // Reconnect within seconds of a restart of the server.
        maxDelay: 5_000,
        onStatus: () => {
          this.changed();
          for (const entry of [...this.entries.values()]) this.releaseIfDone(entry);
        },
      });
    }
    return this.socket;
  }

  // Opens a project's document, or shares the one already open.
  open(id: string): Entry {
    let entry = this.entries.get(id);
    if (entry) {
      entry.refs += 1;
      return entry;
    }
    const doc = new Y.Doc();
    const created: Entry = {
      id,
      doc,
      refs: 1,
      status: 'loading',
      signedOut: false,
      storeFailed: false,
      provider: new HocuspocusProvider({
        websocketProvider: this.ensureSocket(),
        name: id,
        document: doc,
        onSynced: () => {
          created.status = 'ready';
          created.signedOut = false;
          if (created.provider.unsyncedChanges === 0) this.lastSync = new Date();
          this.changed();
        },
        onUnsyncedChanges: () => {
          if (created.provider.unsyncedChanges === 0 && created.provider.isSynced) this.lastSync = new Date();
          this.changed();
          this.releaseIfDone(created);
        },
        onAuthenticated: () => {
          created.signedOut = false;
          this.changed();
        },
        // The server answers every refusal the same way; the session check
        // tells an ended session from a project that is gone.
        onAuthenticationFailed: () => {
          void api
            .me()
            .then(({ user }) => {
              if (user) created.status = 'gone';
              else {
                created.signedOut = true;
                this.sessionEnded = true;
              }
            })
            .catch(() => {})
            .finally(() => this.changed());
        },
        onStateless: ({ payload }) => {
          const event = readStateless(payload);
          if (event === 'store-failed') created.storeFailed = true;
          if (event === 'stored') {
            created.storeFailed = false;
            this.lastSync = new Date();
            for (const listener of this.storedListeners) listener(id);
          }
          if (event === 'deleted') created.status = 'gone';
          if (event === 'snapshot') for (const listener of this.snapshotListeners) listener(id);
          this.changed();
        },
      }),
    };
    created.provider.attach();
    this.entries.set(id, created);
    this.changed();
    return created;
  }

  // Lets go of a project's document after a short grace period, so a view
  // that closes and opens it again at once (a quick reselect, React's strict
  // mode) keeps the same provider.
  release(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.refs = Math.max(0, entry.refs - 1);
    setTimeout(() => this.releaseIfDone(entry), RELEASE_GRACE_MS);
  }

  // Destroys an unused provider once nothing it holds is unsent. Never while
  // the socket is down: the Close message would wait in the queue behind a
  // new provider's first messages for the same project and end its session.
  private releaseIfDone(entry: Entry): void {
    if (entry.refs > 0 || this.entries.get(entry.id) !== entry) return;
    if (this.socket?.status !== WebSocketStatus.Connected) return;
    const unsent = entry.provider.unsyncedChanges > 0 && entry.status !== 'gone';
    if (unsent) return;
    entry.provider.destroy();
    entry.doc.destroy();
    this.entries.delete(entry.id);
    this.changed();
  }

  // After signing in again: open a new socket, which carries the new session
  // cookie, and let every provider authenticate and send what it holds.
  reconnect(): void {
    this.sessionEnded = false;
    for (const entry of this.entries.values()) entry.signedOut = false;
    this.socket?.webSocket?.close();
    this.changed();
  }

  // Tries at once instead of waiting for the next attempt, and asks the
  // server for what this tab may have missed.
  syncNow(): void {
    if (this.socket && this.socket.status !== WebSocketStatus.Connected) void this.socket.connect();
    for (const entry of this.entries.values()) if (entry.status === 'ready') entry.provider.forceSync();
  }

  // A request answered 401: the session ended.
  markSessionEnded(): void {
    if (this.sessionEnded) return;
    this.sessionEnded = true;
    this.changed();
  }

  // Signing out closes everything.
  closeAll(): void {
    for (const entry of this.entries.values()) {
      entry.provider.destroy();
      entry.doc.destroy();
    }
    this.entries.clear();
    this.socket?.destroy();
    this.socket = null;
    this.sessionEnded = false;
    this.changed();
  }

  docStatus(id: string): DocStatus {
    return this.entries.get(id)?.status ?? 'loading';
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // Called after a project's document was stored on the server.
  onStored(listener: (id: string) => void): () => void {
    this.storedListeners.add(listener);
    return () => this.storedListeners.delete(listener);
  }

  // Called when the server made a snapshot of a project's document: saved by
  // the user, before Claude's edit, or before a restore or an undo.
  onSnapshot(listener: (id: string) => void): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  getSnapshot = (): SyncSnapshot => this.snapshot;

  private changed(): void {
    const connected = this.socket?.status === WebSocketStatus.Connected;
    const providers = [...this.entries.values()]
      .filter((entry) => entry.status !== 'gone')
      .map((entry): ProviderSnapshot => ({
        id: entry.id,
        title: readMeta(entry.doc).title || 'Untitled project',
        connected,
        synced: entry.provider.isSynced,
        unsynced: entry.provider.unsyncedChanges,
        signedOut: entry.signedOut,
        storeFailed: entry.storeFailed,
      }));
    this.snapshot = {
      state: overallState(providers, this.sessionEnded),
      providers,
      lastSync: this.lastSync,
      sessionEnded: this.sessionEnded,
      device: null,
    };
    for (const listener of this.listeners) listener();
  }
}
