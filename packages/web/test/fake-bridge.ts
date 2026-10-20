import * as Y from 'yjs';
import type {
  AuthState,
  DesktopStateless,
  DesktopSyncStatus,
  DeviceInfo,
  FilesStatus,
  OpenedDoc,
  PromptbookBridge,
  UpdatesState,
} from '../src/platform/bridge.js';

// window.promptbook as the tests drive it: main's documents are Y.Docs here,
// its events are fired by hand, and every call is recorded.

type Listener<A extends unknown[]> = (...args: A) => void;

function emitter<A extends unknown[]>() {
  const listeners = new Set<Listener<A>>();
  return {
    on: (cb: Listener<A>) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    emit: (...args: A) => {
      for (const cb of [...listeners]) cb(...args);
    },
  };
}

export const info: DeviceInfo = {
  os: 'darwin',
  version: '0.5.0',
  packaged: false,
  serverOrigin: 'https://promptbook.example',
  dataFolder: '/Users/gm/Library/Application Support/Promptbook',
  databaseFile: '/Users/gm/Library/Application Support/Promptbook/accounts/0123/promptbook.sqlite',
  signInRemembered: true,
  localSnapshots: 'hourly',
  updates: 'manual',
};

export const signedIn: AuthState = {
  server: 'https://promptbook.example',
  account: {
    id: '0123456789abcdef',
    user: { id: 'u1', displayName: 'Stefano', signIn: 'oidc' },
    signedInAt: '2026-10-18T09:00:00.000Z',
  },
  session: 'active',
  signIn: { step: 'idle' },
  remembered: true,
};

export const status = (patch: Partial<DesktopSyncStatus> = {}): DesktopSyncStatus => ({
  online: true,
  offlineSince: null,
  lastSync: '2026-10-20T10:41:00.000Z',
  firstSync: false,
  listVersion: 1,
  diskError: null,
  projects: [],
  ...patch,
});

export function fakeBridge() {
  const docs = new Map<string, Y.Doc>();
  const calls = {
    request: [] as unknown[][],
    open: [] as string[],
    update: [] as [string, Uint8Array][],
    release: [] as string[],
    put: [] as [string, string][],
  };
  const events = {
    update: emitter<[string, Uint8Array]>(),
    status: emitter<[DesktopSyncStatus]>(),
    stateless: emitter<[DesktopStateless]>(),
    auth: emitter<[AuthState]>(),
    updates: emitter<[UpdatesState]>(),
    files: emitter<[FilesStatus]>(),
  };
  // Open answers held back until released, for the races.
  let hold: Promise<void> | null = null;
  let current = status();
  let auth = signedIn;

  const bridge: PromptbookBridge = {
    info: async () => info,
    request: async (path, init) => {
      calls.request.push([path, init]);
      if (init.method === 'DELETE') return { status: 204, headers: {}, body: null };
      return {
        status: 503,
        headers: { 'content-type': 'application/json' },
        body: new TextEncoder().encode(JSON.stringify({ error: 'offline', message: 'Needs the server.' })),
      };
    },
    sync: {
      open: async (id): Promise<OpenedDoc> => {
        calls.open.push(id);
        if (hold) await hold;
        const doc = docs.get(id);
        // Listed and not downloaded yet: loading; unknown: gone.
        if (!doc) {
          const listed = current.projects.some((p) => p.id === id);
          return { state: Y.encodeStateAsUpdate(new Y.Doc()), status: listed ? 'loading' : 'gone' };
        }
        return { state: Y.encodeStateAsUpdate(doc), status: 'ready' };
      },
      update: async (id, update) => {
        calls.update.push([id, update]);
        const doc = docs.get(id);
        if (doc) Y.applyUpdate(doc, update, 'renderer');
      },
      release: async (id) => {
        calls.release.push(id);
      },
      syncNow: async () => {},
      status: async () => current,
      onUpdate: events.update.on,
      onStatus: events.status.on,
      onStateless: events.stateless.on,
    },
    auth: {
      state: async () => auth,
      start: async () => {},
      reopen: async () => {},
      cancel: async () => {},
      signOut: async () => {},
      onState: events.auth.on,
    },
    device: {
      showDataFolder: async () => {},
      setLocalSnapshots: async () => {},
      usage: async () => ({ bytes: 38_000_000, projects: 12, localSnapshots: 214, files: 0, fileBytes: 0 }),
    },
    updates: {
      state: async () => ({ kind: 'off' }),
      check: async () => {},
      restart: async () => {},
      openRelease: async () => {},
      onState: events.updates.on,
    },
    files: {
      openPdf: async () => {},
      save: async () => true,
      put: async (projectId, sha256, _bytes, mime) => {
        calls.put.push([projectId, sha256]);
        return { mime, state: 'waiting' };
      },
      status: async (): Promise<FilesStatus> => ({ waiting: [], downloading: 0, refused: [] }),
      onStatus: events.files.on,
    },
  };

  return {
    bridge,
    calls,
    events,
    docs,
    setStatus(next: DesktopSyncStatus) {
      current = next;
      events.status.emit(next);
    },
    setAuth(next: AuthState) {
      auth = next;
      events.auth.emit(next);
    },
    // Open answers wait until the function returned is called.
    holdOpens(): () => void {
      let release!: () => void;
      hold = new Promise((resolve) => (release = resolve));
      return () => {
        hold = null;
        release();
      };
    },
  };
}
