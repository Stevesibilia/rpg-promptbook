import { HocuspocusProvider, HocuspocusProviderWebsocket, WebSocketStatus } from '@hocuspocus/provider';
import { readMeta } from 'promptbook-project';
import type { DesktopProjectStatus, DesktopSyncStatus, OpenedDoc } from 'promptbook-web/src/platform/bridge.js';
import * as Y from 'yjs';
import { COMPACT_AT, type Store, type UpdateOrigin } from './store.js';

// Every project of the account kept in sync by main, open in a window or not
// (desktop-app design decision 5): one socket to the server's /sync, one
// HocuspocusProvider per project that is on the server, each document loaded
// from the store before its provider attaches. Every update is stored as it
// is applied and passed on to the windows that have the project open: the
// server's to all of them, a window's to the others, main's own to all.

export type StatelessType = 'stored' | 'deleted' | 'snapshot' | 'store-failed';

export interface EngineHooks {
  // The access token for a provider; throws when signed out.
  token: () => Promise<string>;
  // To one window: an update, by webContents id.
  sendUpdate: (webContentsId: number, id: string, update: Uint8Array) => void;
  // To every window.
  status: (status: DesktopSyncStatus) => void;
  stateless: (id: string, payload: string) => void;
  // A document changed; `local` when made on this device.
  docChanged?: (id: string, local: boolean) => void;
  // The socket opened, or closed.
  connection?: (online: boolean) => void;
  // The server refused a project's provider.
  authFailed?: (id: string) => void;
  // The server said a project was binned.
  deleted?: (id: string) => void;
  // The engine started or stopped holding a project.
  added?: (id: string) => void;
  // A project's document arrived from the server for the first time.
  downloaded?: (id: string) => void;
  removed?: (id: string) => void;
}

export interface EngineOptions {
  url: string;
  // Asked while no provider holds the socket open, to know whether the
  // server is there: the server closes a socket that signs in to nothing.
  healthUrl: string;
  store: Store;
  hooks: EngineHooks;
  now?: () => number;
  // How long status messages are gathered before one is sent.
  statusDelayMs?: number;
  healthEveryMs?: number;
  WebSocketPolyfill?: unknown;
}

// Updates from a window, applied with this origin so they go back to the
// other windows but never to their sender.
class RendererOrigin {
  constructor(readonly webContentsId: number) {}
}

export const MAIN_ORIGIN = Symbol('main');

interface Entry {
  id: string;
  doc: Y.Doc;
  provider: HocuspocusProvider | null;
  // Opens per window, by webContents id.
  openBy: Map<number, number>;
  downloaded: boolean;
  bytes: number;
  localOnly: boolean;
  onUpdate: (update: Uint8Array, origin: unknown) => void;
}

export class SyncEngine {
  private socket: HocuspocusProviderWebsocket;
  private entries = new Map<string, Entry>();
  private origins = new Map<number, RendererOrigin>();
  private active = false;
  private online = false;
  private offlineSince: number | null = null;
  private lastSync: number | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  // Projects whose provider was destroyed on the open socket. The server
  // reads the Close message after a new provider's first messages for the
  // same name and ends that session, so a provider made again for one of
  // them reconnects the socket, and every provider starts afresh.
  private detached = new Set<string>();
  private health: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;
  private unsubscribeStore: () => void;
  firstSync = false;
  listVersion = 0;

  constructor(private readonly options: EngineOptions) {
    this.now = options.now ?? Date.now;
    this.socket = new HocuspocusProviderWebsocket({
      url: options.url,
      // Opened while a provider needs it (connection()).
      autoConnect: false,
      // Back within seconds of a restart of the server, as the web is.
      maxDelay: 5_000,
      ...(options.WebSocketPolyfill ? { WebSocketPolyfill: options.WebSocketPolyfill } : {}),
      onStatus: ({ status }) => this.socketStatus(status),
      // What was queued while the socket was down is dropped: every
      // provider syncs its whole document again on open, and a queued Close
      // of a provider destroyed meanwhile would end its successor's session.
      onOpen: () => {
        (this.socket as unknown as { messageQueue: unknown[] }).messageQueue = [];
      },
    });
    this.unsubscribeStore = options.store.onChange(() => this.changed());
    this.connection();
  }

  private get attached(): number {
    let n = 0;
    for (const entry of this.entries.values()) if (entry.provider) n += 1;
    return n;
  }

  // The socket is open while a provider needs it; otherwise the server's
  // health route says whether it is there.
  private connection(): void {
    if (this.closed) return;
    if (this.attached > 0) {
      if (this.health) clearInterval(this.health);
      this.health = null;
      if (this.socket.status === WebSocketStatus.Disconnected) void this.socket.connect();
      return;
    }
    if (this.socket.status !== WebSocketStatus.Disconnected || this.socket.shouldConnect) this.socket.disconnect();
    this.detached.clear();
    if (this.health) return;
    void this.checkHealth();
    this.health = setInterval(() => void this.checkHealth(), this.options.healthEveryMs ?? 10_000);
  }

  private async checkHealth(): Promise<void> {
    let ok = false;
    try {
      ok = (await fetch(this.options.healthUrl, { signal: AbortSignal.timeout(5_000) })).ok;
    } catch {
      ok = false;
    }
    if (!this.closed && this.attached === 0) this.setOnline(ok);
  }

  get isOnline(): boolean {
    return this.online;
  }

  private socketStatus(status: WebSocketStatus): void {
    // Closed on purpose a moment before a provider wanted it again.
    if (status === WebSocketStatus.Disconnected && this.attached > 0 && !this.socket.shouldConnect) {
      void this.socket.connect();
    }
    // Closed on purpose with no provider left: the health check speaks.
    // Connecting changes nothing yet: offline is a closed socket.
    if (this.attached === 0 || status === WebSocketStatus.Connecting) return;
    this.setOnline(status === WebSocketStatus.Connected);
  }

  private setOnline(online: boolean): void {
    if (online === this.online && (online || this.offlineSince !== null)) return;
    this.online = online;
    this.offlineSince = online ? null : this.now();
    // A new socket: the server forgot every session of the old one.
    if (!online) this.detached.clear();
    this.options.hooks.connection?.(online);
    this.changed();
  }

  // Loads a project's document from the store and keeps it; its provider
  // attaches when the session is active and the project is on the server.
  add(id: string, { localOnly = false, doc }: { localOnly?: boolean; doc?: Y.Doc } = {}): void {
    if (this.closed || this.entries.has(id)) return;
    const stored = doc ?? this.options.store.loadDoc(id);
    const entry: Entry = {
      id,
      doc: stored ?? new Y.Doc(),
      provider: null,
      openBy: new Map(),
      downloaded: stored !== null,
      bytes: 0,
      localOnly,
      onUpdate: (update, origin) => this.onUpdate(entry, update, origin),
    };
    if (entry.downloaded) entry.bytes = Y.encodeStateAsUpdate(entry.doc).byteLength;
    entry.doc.on('update', entry.onUpdate);
    this.entries.set(id, entry);
    if (this.active && !localOnly) this.attach(entry);
    this.options.hooks.added?.(id);
    this.changed();
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  ids(): string[] {
    return [...this.entries.keys()];
  }

  doc(id: string): Y.Doc | null {
    return this.entries.get(id)?.doc ?? null;
  }

  isDownloaded(id: string): boolean {
    return this.entries.get(id)?.downloaded ?? false;
  }

  // A project made on this device reached the server: its provider attaches.
  uploaded(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.localOnly = false;
    if (this.active) this.attach(entry);
    this.changed();
  }

  // The project left this account's list: its provider goes, its document is
  // compacted and stays in the store. Windows that have it open see it gone.
  remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.detach(entry);
    this.compactEntry(entry);
    entry.doc.off('update', entry.onUpdate);
    entry.doc.destroy();
    this.entries.delete(id);
    this.options.hooks.removed?.(id);
    this.changed();
  }

  // Signed in: every project on the server gets its provider. Signed out:
  // they all go, and editing goes on in the store.
  setActive(active: boolean): void {
    if (this.closed || active === this.active) return;
    this.active = active;
    for (const entry of this.entries.values()) {
      if (active && !entry.localOnly) this.attach(entry);
      if (!active) this.detach(entry);
    }
    this.changed();
  }

  private attach(entry: Entry): void {
    if (entry.provider) return;
    const provider = new HocuspocusProvider({
      websocketProvider: this.socket,
      name: entry.id,
      document: entry.doc,
      token: () => this.options.hooks.token(),
      onSynced: () => {
        if (!entry.downloaded) {
          entry.downloaded = true;
          entry.bytes = Y.encodeStateAsUpdate(entry.doc).byteLength;
          this.options.hooks.downloaded?.(entry.id);
          this.options.hooks.docChanged?.(entry.id, false);
        }
        this.acknowledged(entry);
        this.changed();
      },
      onUnsyncedChanges: () => {
        this.acknowledged(entry);
        this.changed();
      },
      onAuthenticationFailed: () => this.options.hooks.authFailed?.(entry.id),
      onStateless: ({ payload }) => this.onStateless(entry, payload),
    });
    entry.provider = provider;
    provider.attach();
    this.connection();
    if (this.detached.has(entry.id)) {
      this.detached.clear();
      this.socket.webSocket?.close();
    }
  }

  private detach(entry: Entry): void {
    const provider = entry.provider;
    if (!provider) return;
    entry.provider = null;
    provider.destroy();
    if (this.online) this.detached.add(entry.id);
    this.connection();
  }

  // Every change the server has, kept or not: the count of changes on this
  // device starts again from zero.
  private acknowledged(entry: Entry): void {
    const p = entry.provider;
    if (!p || !this.online || !p.isSynced || p.unsyncedChanges !== 0) return;
    if (this.options.store.notSaved(entry.id) > 0) return;
    this.options.store.resetUnsynced(entry.id);
    this.lastSync = this.now();
  }

  private onStateless(entry: Entry, payload: string): void {
    let type: unknown;
    try {
      type = (JSON.parse(payload) as { type?: unknown }).type;
    } catch {
      return;
    }
    if (type === 'stored') this.lastSync = this.now();
    if (type === 'deleted') this.options.hooks.deleted?.(entry.id);
    this.options.hooks.stateless(entry.id, payload);
    this.changed();
  }

  private originOf(entry: Entry, origin: unknown): UpdateOrigin {
    if (origin instanceof RendererOrigin) return `renderer:${origin.webContentsId}`;
    if (entry.provider && origin === entry.provider) return 'remote';
    return 'main';
  }

  private onUpdate(entry: Entry, update: Uint8Array, origin: unknown): void {
    const label = this.originOf(entry, origin);
    this.options.store.appendUpdate(entry.id, update, label);
    const sender = origin instanceof RendererOrigin ? origin.webContentsId : null;
    for (const webContentsId of entry.openBy.keys()) {
      if (webContentsId !== sender) this.options.hooks.sendUpdate(webContentsId, entry.id, update);
    }
    if (label !== 'remote') entry.downloaded = true;
    if (this.options.store.updateRows(entry.id) > COMPACT_AT) this.compactEntry(entry);
    this.options.hooks.docChanged?.(entry.id, label !== 'remote');
    this.changed();
  }

  private compactEntry(entry: Entry): void {
    if (!entry.downloaded && this.options.store.updateRows(entry.id) === 0) return;
    if (this.options.store.compact(entry.id, Y.encodeStateAsUpdate(entry.doc))) {
      entry.bytes = Y.encodeStateAsUpdate(entry.doc).byteLength;
    }
  }

  // A window's change. Refused for a project this account does not have.
  applyFromRenderer(webContentsId: number, id: string, update: Uint8Array): void {
    const entry = this.entries.get(id);
    if (!entry || !entry.openBy.has(webContentsId)) throw new Error('This project is not open in the window.');
    let origin = this.origins.get(webContentsId);
    if (!origin) {
      origin = new RendererOrigin(webContentsId);
      this.origins.set(webContentsId, origin);
    }
    Y.applyUpdate(entry.doc, update, origin);
  }

  // main's own change (a local restore): it reaches the windows and the
  // server like any edit.
  transact(id: string, fn: (doc: Y.Doc) => void): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    entry.doc.transact(() => fn(entry.doc), MAIN_ORIGIN);
    return true;
  }

  open(webContentsId: number, id: string): OpenedDoc {
    const entry = this.entries.get(id);
    if (!entry) return { state: Y.encodeStateAsUpdate(new Y.Doc()), status: 'gone' };
    entry.openBy.set(webContentsId, (entry.openBy.get(webContentsId) ?? 0) + 1);
    return { state: Y.encodeStateAsUpdate(entry.doc), status: entry.downloaded ? 'ready' : 'loading' };
  }

  // One open fewer; the window stops getting the project's updates after
  // its last.
  release(webContentsId: number, id: string): void {
    const openBy = this.entries.get(id)?.openBy;
    const opens = openBy?.get(webContentsId) ?? 0;
    if (opens > 1) openBy!.set(webContentsId, opens - 1);
    else openBy?.delete(webContentsId);
  }

  // A window closed.
  releaseAll(webContentsId: number): void {
    for (const entry of this.entries.values()) entry.openBy.delete(webContentsId);
    this.origins.delete(webContentsId);
  }

  // Tries at once instead of waiting for the next attempt, and asks the
  // server again for every document.
  syncNow(): void {
    if (this.closed) return;
    this.options.store.flushAll();
    if (this.attached === 0) void this.checkHealth();
    else if (this.socket.status !== WebSocketStatus.Connected) void this.socket.connect();
    else for (const entry of this.entries.values()) if (entry.provider?.isSynced) entry.provider.forceSync();
  }

  // The list changed: the windows read it again.
  listChanged(): void {
    this.listVersion += 1;
    this.changed();
  }

  status(): DesktopSyncStatus {
    const store = this.options.store;
    const projects = [...this.entries.values()].map(
      (entry): DesktopProjectStatus => ({
        id: entry.id,
        title: (entry.downloaded ? readMeta(entry.doc).title : '') || 'Untitled project',
        downloaded: entry.downloaded,
        bytes: entry.bytes,
        localOnly: entry.localOnly,
        synced: !!entry.provider?.isSynced && this.online,
        unsynced: store.unsyncedCount(entry.id),
        notSaved: store.notSaved(entry.id),
      }),
    );
    if (this.firstSync && projects.length > 0 && projects.every((p) => p.downloaded)) this.firstSync = false;
    const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
    return {
      online: this.online,
      offlineSince: iso(this.offlineSince),
      lastSync: iso(this.lastSync),
      firstSync: this.firstSync,
      listVersion: this.listVersion,
      diskError: projects.some((p) => p.notSaved > 0) ? store.lastError : null,
      projects,
    };
  }

  // Status messages are gathered for a moment: typing makes one per key.
  private changed(): void {
    if (this.closed || this.statusTimer) return;
    this.statusTimer = setTimeout(() => {
      this.statusTimer = null;
      if (!this.closed) this.options.hooks.status(this.status());
    }, this.options.statusDelayMs ?? 100);
  }

  // Quit or sign-out: providers destroyed (their last updates sent when the
  // socket is open), every document compacted, the socket closed. The store
  // stays open for the caller to close.
  close(): void {
    if (this.closed) return;
    for (const entry of this.entries.values()) {
      this.detach(entry);
      this.compactEntry(entry);
      entry.doc.off('update', entry.onUpdate);
      entry.doc.destroy();
    }
    this.entries.clear();
    this.closed = true;
    if (this.health) clearInterval(this.health);
    this.health = null;
    if (this.statusTimer) clearTimeout(this.statusTimer);
    this.statusTimer = null;
    this.unsubscribeStore();
    this.socket.destroy();
  }
}
