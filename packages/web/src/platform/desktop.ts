import type { AuthState, DeviceInfo, FilesStatus, PromptbookBridge, UpdatesState } from './bridge.js';
import { DesktopSyncRegistry } from './desktopRegistry.js';
import { asRelease, fileUrl, PutFileError, type Platform } from './index.js';
import { createStore, type Store } from './store.js';

// The desktop app: everything through window.promptbook (desktop-app design
// decisions 3 and 6). The page holds no token and opens no connection; main
// answers REST, syncs the projects and owns the account.

export interface Desktop {
  bridge: PromptbookBridge;
  // The device facts, read again after a change (the local snapshots mode,
  // the account's database).
  info: Store<DeviceInfo>;
  refreshInfo(): Promise<void>;
  auth: Store<AuthState>;
  updates: Store<UpdatesState>;
  // The board's files waiting to upload, downloading, or refused.
  files: Store<FilesStatus>;
  registry: DesktopSyncRegistry;
  // Starts a sign-in through the browser, once: another call before main
  // reports the browser step (or a failure) does nothing.
  startSignIn(server: string): void;
}

const NO_INFO: DeviceInfo = {
  os: 'linux',
  version: '',
  packaged: false,
  serverOrigin: '',
  dataFolder: '',
  databaseFile: null,
  signInRemembered: true,
  localSnapshots: 'hourly',
  updates: 'manual',
};

export const NO_FILES: FilesStatus = { waiting: [], downloading: 0, refused: [] };

const NO_AUTH: AuthState = {
  server: '',
  account: null,
  session: 'none',
  signIn: { step: 'idle' },
  remembered: true,
};

// A REST call as main's router takes it: method, the two headers it keeps,
// and the JSON text; the answer back as a Response, as fetch gives it.
export async function bridgeRequest(bridge: PromptbookBridge, path: string, init: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, name) => (headers[name] = value));
  const answer = await bridge.request(path, {
    method: init.method ?? 'GET',
    headers,
    ...(typeof init.body === 'string' ? { body: init.body } : {}),
  });
  const empty = answer.status === 204 || answer.status === 304;
  return new Response(empty ? null : (answer.body as Uint8Array<ArrayBuffer> | null), {
    status: answer.status,
    headers: answer.headers,
  });
}

export function createDesktopPlatform(bridge: PromptbookBridge): Platform {
  const info = createStore<DeviceInfo>(NO_INFO);
  const auth = createStore<AuthState>(NO_AUTH);
  const updates = createStore<UpdatesState>({ kind: 'off' });
  const files = createStore<FilesStatus>(NO_FILES);
  const registry = new DesktopSyncRegistry(bridge, auth);
  const refreshInfo = async () => info.set(await bridge.info());
  // Events counted, so a first read answered before a newer event never
  // overwrites it.
  let authEvents = 0;
  let updateEvents = 0;
  let fileEvents = 0;
  let starting: ReturnType<typeof setTimeout> | null = null;
  const startSignIn = (server: string) => {
    if (starting) return;
    // Main answers with the browser step or a failure; a minute is the
    // fallback should neither come.
    starting = setTimeout(() => (starting = null), 60_000);
    bridge.auth.start(server).catch(() => {
      if (starting) clearTimeout(starting);
      starting = null;
    });
  };
  const desktop: Desktop = { bridge, info, refreshInfo, auth, updates, files, registry, startSignIn };

  // Events first, so nothing that changes during the first reads is lost.
  bridge.auth.onState((state) => {
    authEvents += 1;
    if (starting && state.signIn.step !== 'idle') {
      clearTimeout(starting);
      starting = null;
    }
    const before = auth.get().account?.id ?? null;
    auth.set(state);
    // Another account, or none: the documents of the old one are let go,
    // and the device facts name the new database.
    if ((state.account?.id ?? null) !== before) {
      registry.closeAll();
      void registry.refresh();
      void refreshInfo();
    }
  });
  bridge.updates.onState((state) => {
    updateEvents += 1;
    updates.set(state);
  });
  bridge.files.onStatus((status) => {
    fileEvents += 1;
    files.set(status);
  });

  return {
    kind: 'desktop',
    desktop,
    get serverOrigin() {
      return auth.get().server || info.get().serverOrigin;
    },
    async init() {
      // The desktop's own styles apply under this class only.
      if (typeof document !== 'undefined') document.documentElement.classList.add('desktop');
      const seen = { auth: authEvents, updates: updateEvents };
      const [i, a, u] = await Promise.all([bridge.info(), bridge.auth.state(), bridge.updates.state()]);
      info.set(i);
      if (authEvents === seen.auth) auth.set(a);
      if (updateEvents === seen.updates) updates.set(u);
      // Read apart, so a main without the files' handlers still starts.
      const fileSeen = fileEvents;
      void bridge.files
        .status()
        .then((status) => fileEvents === fileSeen && files.set(status))
        .catch(() => {});
      await registry.refresh();
    },
    request: (path, init) => bridgeRequest(bridge, path, init),
    // Served by main's protocol from this computer (design decision 14).
    fileUrl,
    async putFile(projectId, sha256, bytes, mime) {
      try {
        return await bridge.files.put(projectId, sha256, bytes, mime);
      } catch (error) {
        throw new PutFileError(0, error instanceof Error && error.message ? error.message : 'The file could not be stored.');
      }
    },
    openSync: () => registry,
    // The app's own version, there offline too.
    releaseVersion: async () => asRelease(info.get().version),
    startSignIn() {
      startSignIn(auth.get().server || info.get().serverOrigin);
      return true;
    },
    async openPdf(build, name) {
      await bridge.files.openPdf(await build(), name);
    },
    async download(source, name) {
      await bridge.files.save(typeof source === 'string' ? source : new Uint8Array(await source.arrayBuffer()), name);
    },
  };
}
