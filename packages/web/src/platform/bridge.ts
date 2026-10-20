// The desktop app's bridge: what its preload exposes as `window.promptbook`,
// and the IPC channels behind it (desktop-app design decision 3). Types and
// channel names only, so the web client and the desktop's main process and
// preload are built against one definition and cannot drift. Every call is an
// ipcRenderer.invoke on a channel `pb:<area>:<verb>`; every event an
// ipcRenderer.on, whose subscription answers its unsubscribe.

export const channels = {
  deviceInfo: 'pb:device:info',
  apiRequest: 'pb:api:request',

  syncOpen: 'pb:sync:open',
  syncUpdate: 'pb:sync:update',
  syncRelease: 'pb:sync:release',
  syncNow: 'pb:sync:sync-now',
  syncStatus: 'pb:sync:status',
  // Main to renderer.
  syncOnUpdate: 'pb:sync:on-update',
  syncOnStatus: 'pb:sync:on-status',
  syncOnStateless: 'pb:sync:on-stateless',

  authState: 'pb:auth:state',
  authStart: 'pb:auth:start',
  authReopen: 'pb:auth:reopen',
  authCancel: 'pb:auth:cancel',
  authSignOut: 'pb:auth:sign-out',
  authOnState: 'pb:auth:on-state',

  deviceShowDataFolder: 'pb:device:show-data-folder',
  deviceSetLocalSnapshots: 'pb:device:set-local-snapshots',
  deviceUsage: 'pb:device:usage',

  updatesState: 'pb:updates:state',
  updatesCheck: 'pb:updates:check',
  updatesRestart: 'pb:updates:restart',
  updatesOpenRelease: 'pb:updates:open-release',
  updatesOnState: 'pb:updates:on-state',

  filesOpenPdf: 'pb:files:open-pdf',
  filesSave: 'pb:files:save',
} as const;

export type Channel = (typeof channels)[keyof typeof channels];

export type Unsubscribe = () => void;

export type LocalSnapshotsMode = 'hourly' | 'quarter' | 'off';

export interface DeviceInfo {
  os: 'darwin' | 'win32' | 'linux';
  // The app's version, as the release tag gives it.
  version: string;
  packaged: boolean;
  // The server this app signs in to, or the one it last used; '' when none.
  serverOrigin: string;
  // Electron's data folder, or PROMPTBOOK_USER_DATA.
  dataFolder: string;
  // The open account's database file, null with no account open.
  databaseFile: string | null;
  // The refresh token is kept with the system keychain; false on Linux with
  // no keyring, where This device says «Sign-in is not remembered on this
  // computer».
  signInRemembered: boolean;
  localSnapshots: LocalSnapshotsMode;
}

export interface DeviceUsage {
  // The open account's folder on disk.
  bytes: number;
  projects: number;
  localSnapshots: number;
}

// One REST call through main (design decision 7). The body is JSON text, as
// api.ts sends it.
export interface BridgeRequestInit {
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

// The answer, with the server's status and shape. The body is bytes, so an
// export's zip passes as well as JSON.
export interface BridgeResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array | null;
}

// A snapshot row as main answers GET /api/projects/:id/snapshots on the
// desktop: the server's rows and this device's, each with its source. Local
// rows have the kinds hourly, user and restore.
export type DesktopSnapshotKind = 'claude' | 'user' | 'restore' | 'hourly';
export type SnapshotSource = 'server' | 'device';

// pb:sync:open's answer: the project's document as main holds it.
export interface OpenedDoc {
  // Y.encodeStateAsUpdate of main's document; apply it to a fresh Y.Doc.
  state: Uint8Array;
  // ready: on this device; loading: not downloaded yet (first sync); gone:
  // not a project of this account, or in the bin.
  status: 'ready' | 'loading' | 'gone';
}

// One project as main's sync engine sees it.
export interface DesktopProjectStatus {
  id: string;
  title: string;
  // The document is on this device: loaded from disk, or synced once.
  downloaded: boolean;
  // Bytes of the encoded document once downloaded, for First sync.
  bytes: number;
  // Made on this device and not on the server yet (D9).
  localOnly: boolean;
  // The provider finished its exchange with the server since it connected.
  synced: boolean;
  // Changes made on this device not yet acknowledged by the server; kept
  // across a relaunch.
  unsynced: number;
  // Changes held in memory because the disk write failed (D4); 0 when saved.
  notSaved: number;
}

export interface DesktopSyncStatus {
  // The socket to the server's /sync is open.
  online: boolean;
  // ISO time the socket went down, null while online or never connected.
  offlineSince: string | null;
  // ISO time the server last confirmed every change, null before.
  lastSync: string | null;
  // The first sync after signing in to an account folder with no projects:
  // true until every project is downloaded.
  firstSync: boolean;
  // Bumped whenever the projects list changes, so the renderer reads it again.
  listVersion: number;
  // The last disk error, as «disk full», while any project is not saved.
  diskError: string | null;
  projects: DesktopProjectStatus[];
}

// A stateless message from the server, for one project.
export interface DesktopStateless {
  id: string;
  payload: string;
}

export interface AccountUser {
  id: string;
  displayName: string;
  signIn: 'oidc' | 'password';
}

// The account and the sign-in, as main reports them (D8, D11).
export interface AuthState {
  // The configured server, '' before the first sign-in.
  server: string;
  // The account whose projects are open; null shows the Sign in screen.
  account: { id: string; user: AccountUser; signedInAt: string } | null;
  // none: never signed in on this account; active: tokens held; ended: the
  // refresh was refused or the grant revoked; signed-out: the user signed out
  // and kept the projects.
  session: 'none' | 'active' | 'ended' | 'signed-out';
  // The browser step of a sign-in in progress, or how the last one failed.
  signIn:
    | { step: 'idle' }
    | { step: 'browser'; host: string }
    | { step: 'failed'; reason: 'timeout' | 'denied' | 'error'; message: string };
  // The refresh token is stored with safeStorage.
  remembered: boolean;
}

// The updater's state, filled in by the updater (design decision 14).
export type UpdatesState =
  | { kind: 'off' }
  | { kind: 'idle'; checking: boolean }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string; notes: string }
  | { kind: 'available'; version: string; notes: string; url: string };

export interface PromptbookBridge {
  info(): Promise<DeviceInfo>;
  request(path: string, init: BridgeRequestInit): Promise<BridgeResponse>;
  sync: {
    open(id: string): Promise<OpenedDoc>;
    update(id: string, update: Uint8Array): Promise<void>;
    release(id: string): Promise<void>;
    syncNow(): Promise<void>;
    onUpdate(cb: (id: string, update: Uint8Array) => void): Unsubscribe;
    onStatus(cb: (status: DesktopSyncStatus) => void): Unsubscribe;
    onStateless(cb: (message: DesktopStateless) => void): Unsubscribe;
    status(): Promise<DesktopSyncStatus>;
  };
  auth: {
    state(): Promise<AuthState>;
    // A server origin such as https://promptbook.siberio.eu.
    start(server: string): Promise<void>;
    reopen(): Promise<void>;
    cancel(): Promise<void>;
    signOut(options: { remove: boolean }): Promise<void>;
    onState(cb: (state: AuthState) => void): Unsubscribe;
  };
  device: {
    showDataFolder(): Promise<void>;
    setLocalSnapshots(mode: LocalSnapshotsMode): Promise<void>;
    usage(): Promise<DeviceUsage>;
  };
  updates: {
    state(): Promise<UpdatesState>;
    check(): Promise<void>;
    restart(): Promise<void>;
    openRelease(): Promise<void>;
    onState(cb: (state: UpdatesState) => void): Unsubscribe;
  };
  files: {
    // A temporary file opened with the system's viewer, for printing.
    openPdf(bytes: Uint8Array, name: string): Promise<void>;
    // A save dialog, then the bytes, or what an /api/ path answers (an
    // export), written to the chosen file. False when the user cancelled.
    save(source: string | Uint8Array, name: string): Promise<boolean>;
  };
}
