import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { channels } from 'promptbook-web/src/platform/bridge.js';
import type {
  AccountUser,
  AuthState,
  BridgeRequestInit,
  BridgeResponse,
  DesktopSyncStatus,
  DeviceUsage,
  LocalSnapshotsMode,
  OpenedDoc,
} from 'promptbook-web/src/platform/bridge.js';
import {
  accountFolder,
  accountId,
  databaseFile,
  readDeviceFile,
  serverOrigin,
  writeDeviceFile,
} from './account.js';
import { deviceName, LoopbackSignIn, type SignedIn } from './auth/loopback.js';
import { Tokens, type SecretStore, type TokenStorage } from './auth/tokens.js';
import { Creator } from './create.js';
import { LIST_EVERY_MS, ProjectList } from './projects.js';
import { json, OFFLINE, Router } from './router.js';
import { HttpError, ServerClient } from './server.js';
import { LocalSnapshots } from './snapshots.js';
import { Store } from './store.js';
import { SyncEngine } from './sync.js';

// The app's state behind the bridge: the account whose projects are open,
// its store, sync engine, list, router and local snapshots, and the sign-in
// in progress (desktop-app design decisions 4, 5, 8 and 10). Electron stays
// outside: the window, IPC and safeStorage are handed in, so this runs in
// Node for the tests.

export interface AppOptions {
  userData: string;
  // PROMPTBOOK_SERVER, or the server device.json names.
  defaultServer: string;
  secrets: SecretStore;
  hostname: string;
  // shell.openExternal; under PROMPTBOOK_E2E the URL is handed to the test.
  openExternal: (url: string) => void | Promise<void>;
  // To every window, and to one.
  broadcast: (channel: string, ...args: unknown[]) => void;
  sendTo: (webContentsId: number, channel: string, ...args: unknown[]) => void;
  fetch?: typeof fetch;
  now?: () => number;
  snapshotIntervalMs?: number;
  WebSocketPolyfill?: unknown;
  log?: (message: string) => void;
}

type Session = AuthState['session'];

const SESSION_KEY = 'session_state';
const USER_KEY = 'user';
const SIGNED_IN_KEY = 'signed_in_at';
const DAY = 86_400_000;

const kvStorage = (store: Store): TokenStorage => ({
  get: () => store.getKv('refresh_token'),
  set: (value) => store.setKv('refresh_token', value),
  clear: () => store.deleteKv('refresh_token'),
});

const isUser = (v: unknown): v is AccountUser => {
  const u = v as Partial<AccountUser> | null;
  return typeof u?.id === 'string' && typeof u.displayName === 'string' && (u.signIn === 'oidc' || u.signIn === 'password');
};

// One account folder, open.
class Account {
  readonly store: Store;
  readonly engine: SyncEngine;
  readonly list: ProjectList;
  readonly creator: Creator;
  readonly snapshots: LocalSnapshots;
  readonly router: Router;
  client: ServerClient | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private probing: Promise<void> | null = null;
  private refused = new Set<string>();

  constructor(
    readonly app: App,
    readonly id: string,
    readonly server: string,
    public user: AccountUser,
    public tokens: Tokens,
    public session: Session,
  ) {
    const o = app.options;
    mkdirSync(accountFolder(o.userData, id), { recursive: true });
    this.store = Store.open(databaseFile(o.userData, id), o.now);
    const engine = new SyncEngine({
      url: `${server.replace(/^http/, 'ws')}/sync`,
      healthUrl: `${server}/api/health`,
      store: this.store,
      ...(o.now ? { now: o.now } : {}),
      ...(o.WebSocketPolyfill ? { WebSocketPolyfill: o.WebSocketPolyfill } : {}),
      hooks: {
        token: () => this.tokens.accessToken(),
        sendUpdate: (webContentsId, projectId, update) =>
          o.sendTo(webContentsId, channels.syncOnUpdate, projectId, update),
        status: (status) => o.broadcast(channels.syncOnStatus, status),
        stateless: (projectId, payload) => o.broadcast(channels.syncOnStateless, { id: projectId, payload }),
        docChanged: (projectId, local) => this.list?.docChanged(projectId, local),
        connection: (online) => {
          if (online) void this.whenOnline();
        },
        authFailed: (projectId) => void this.probe(projectId),
        deleted: (projectId) => this.list?.markDeleted(projectId),
        added: (projectId) => this.snapshots?.track(projectId),
        downloaded: (projectId) => this.snapshots?.baseline(projectId),
        removed: (projectId) => this.snapshots?.untrack(projectId),
      },
    });
    this.engine = engine;
    this.list = new ProjectList(this.store, engine, () => this.activeClient(), o.now);
    this.creator = new Creator(this.store, engine, this.list, () => this.activeClient(), o.now, o.log);
    this.snapshots = new LocalSnapshots({
      store: this.store,
      engine,
      ...(o.now ? { now: o.now } : {}),
      ...(o.snapshotIntervalMs ? { intervalMs: o.snapshotIntervalMs } : {}),
      // The server's message for a new snapshot (live.ts).
      taken: (s) =>
        o.broadcast(channels.syncOnStateless, {
          id: s.projectId,
          payload: JSON.stringify({ type: 'snapshot', id: s.id, kind: s.kind }),
        }),
    });
    this.router = new Router({
      store: this.store,
      engine,
      list: this.list,
      creator: this.creator,
      snapshots: this.snapshots,
      server: () => this.activeClient(),
    });
    this.useTokens(tokens);
    for (const record of this.store.listProjects()) {
      if (record.deletedAt === null) engine.add(record.id, { localOnly: !record.uploaded });
    }
    this.list.purge();
    this.snapshots.start();
    this.timers.push(
      setInterval(() => {
        if (this.engine.isOnline && this.session === 'active') void this.list.refreshFromServer().catch(() => {});
      }, LIST_EVERY_MS),
      setInterval(() => this.list.purge(), DAY),
    );
    engine.setActive(session === 'active');
  }

  useTokens(tokens: Tokens): void {
    this.tokens = tokens;
    tokens.attachStorage(kvStorage(this.store));
    this.client = new ServerClient(
      this.server,
      tokens,
      () => this.app.sessionEnded(this),
      this.app.options.fetch,
    );
  }

  activeClient(): ServerClient | null {
    return this.session === 'active' ? this.client : null;
  }

  setSession(session: Session): void {
    this.session = session;
    if (session === 'active') this.store.deleteKv(SESSION_KEY);
    else this.store.setKv(SESSION_KEY, session);
    this.engine.setActive(session === 'active');
    if (session === 'active' && this.engine.isOnline) void this.whenOnline();
  }

  // Back online: the server's list, then the projects made here.
  async whenOnline(): Promise<void> {
    if (this.session !== 'active') return;
    try {
      await this.list.refreshFromServer();
      // An account with nothing on the server has nothing to download.
      if (this.engine.firstSync && this.engine.ids().length === 0) {
        this.engine.firstSync = false;
        this.engine.listChanged();
      }
    } catch {
      // Offline again, or signed out; the next reconnect tries again.
    }
    await this.creator.uploadPending();
  }

  // A provider was refused: with a token that works, the project is not
  // this account's any more; otherwise the session ended (ServerClient).
  // Every project refused meanwhile is concluded by the one probe.
  probe(projectId: string): Promise<void> {
    this.refused.add(projectId);
    this.probing ??= (async () => {
      const client = this.activeClient();
      if (!client) return;
      try {
        const response = await client.request('/api/settings');
        if (response.ok) for (const id of this.refused) this.list.markDeleted(id);
      } catch {
        // Offline or signed out: nothing to conclude.
      }
    })().finally(() => {
      this.refused.clear();
      this.probing = null;
    });
    return this.probing;
  }

  usage(): DeviceUsage {
    let bytes = 0;
    const folder = accountFolder(this.app.options.userData, this.id);
    for (const name of readdirSync(folder)) {
      try {
        bytes += statSync(join(folder, name)).size;
      } catch {
        // Gone meanwhile (the WAL after a checkpoint).
      }
    }
    return {
      bytes,
      projects: this.list.rows().length,
      localSnapshots: this.store.snapshotCount(),
      // Brief D of asset-board counts the files folder (task 4.4).
      files: 0,
      fileBytes: 0,
    };
  }

  // Quit, sign-out with removal, or another account: everything stopped and
  // compacted, a refresh in flight written, the database closed.
  async close(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    this.snapshots.stop();
    this.list.close();
    this.engine.close();
    await this.tokens.settle();
    this.tokens.stop();
    this.store.close();
  }
}

export class App {
  account: Account | null = null;
  private server: string;
  private signIn: AuthState['signIn'] = { step: 'idle' };
  private pending: LoopbackSignIn | null = null;
  // The authorize URL of the sign-in in progress, for the tests.
  authorizeUrl: string | null = null;

  constructor(readonly options: AppOptions) {
    const device = readDeviceFile(options.userData);
    this.server = options.defaultServer || device.server;
  }

  private get now(): number {
    return (this.options.now ?? Date.now)();
  }

  // The account last used, when its folder is there.
  start(): void {
    const device = readDeviceFile(this.options.userData);
    if (!device.lastAccount || !device.server) return;
    if (!existsSync(databaseFile(this.options.userData, device.lastAccount))) return;
    const tokens = this.newTokens(device.server);
    const store = Store.open(databaseFile(this.options.userData, device.lastAccount));
    let user: unknown;
    let session: Session;
    try {
      user = JSON.parse(store.getKv(USER_KEY) ?? 'null');
      const restored = tokens.restore(kvStorage(store));
      const kept = store.getKv(SESSION_KEY);
      session = restored ? 'active' : kept === 'signed-out' ? 'signed-out' : 'ended';
    } finally {
      store.close();
    }
    if (!isUser(user)) return;
    this.server = device.server;
    this.account = new Account(this, device.lastAccount, device.server, user, tokens, session);
    this.emitAuth();
  }

  private newTokens(server: string): Tokens {
    const tokens: Tokens = new Tokens({
      server,
      secrets: this.options.secrets,
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
      ...(this.options.now ? { now: this.options.now } : {}),
      onEnded: () => {
        if (this.account?.tokens === tokens) this.sessionEnded(this.account);
      },
    });
    return tokens;
  }

  sessionEnded(account: Account): void {
    if (account !== this.account || account.session !== 'active') return;
    account.tokens.clear();
    account.setSession('ended');
    this.emitAuth();
  }

  authState(): AuthState {
    const a = this.account;
    return {
      server: a?.server ?? this.server,
      account: a
        ? {
            id: a.id,
            user: a.user,
            signedInAt: a.store.getKv(SIGNED_IN_KEY) ?? new Date(this.now).toISOString(),
          }
        : null,
      session: a?.session ?? 'none',
      signIn: this.signIn,
      remembered: this.options.secrets.isEncryptionAvailable(),
    };
  }

  private emitAuth(): void {
    this.options.broadcast(channels.authOnState, this.authState());
  }

  // Sign in through the browser to `input`'s server.
  async startSignIn(input: string): Promise<void> {
    const origin = serverOrigin(input);
    this.pending?.cancel();
    if (!origin) {
      this.signIn = { step: 'failed', reason: 'error', message: 'That is not a server address.' };
      this.emitAuth();
      return;
    }
    const tokens = this.newTokens(origin);
    let user: AccountUser | null = null;
    const exchange = async (code: string, verifier: string, redirectUri: string): Promise<SignedIn> => {
      const access = await tokens.exchange(code, verifier, redirectUri);
      user = await this.whoIs(origin, access);
      return { displayName: user.displayName, signIn: user.signIn };
    };
    let signIn: LoopbackSignIn;
    try {
      signIn = await LoopbackSignIn.start({
        server: origin,
        deviceName: deviceName(this.options.hostname),
        open: (url) => {
          this.authorizeUrl = url;
          return this.options.openExternal(url);
        },
        exchange,
      });
    } catch (error) {
      this.signIn = { step: 'failed', reason: 'error', message: error instanceof Error ? error.message : String(error) };
      this.emitAuth();
      return;
    }
    this.pending = signIn;
    this.signIn = { step: 'browser', host: new URL(origin).host };
    this.emitAuth();
    const result = await signIn.result;
    // Tokens a sign-in got and nothing uses: revoked, not left rotating.
    const drop = () => {
      if (tokens.hasSession) void tokens.signOut();
    };
    if (this.pending !== signIn) return drop();
    this.pending = null;
    this.authorizeUrl = null;
    if (!result.ok || !user) {
      drop();
      this.signIn =
        result.ok || result.reason === 'cancelled'
          ? { step: 'idle' }
          : { step: 'failed', reason: result.reason, message: result.message };
      this.emitAuth();
      return;
    }
    this.signIn = { step: 'idle' };
    await this.openSignedIn(origin, user, tokens);
    this.emitAuth();
  }

  // Who the token belongs to, and how the server signs in.
  private async whoIs(origin: string, access: string): Promise<AccountUser> {
    const f = this.options.fetch ?? fetch;
    const headers = { authorization: `Bearer ${access}`, accept: 'application/json' };
    const [me, config] = await Promise.all([
      f(`${origin}/api/auth/me`, { headers }).then((r) => r.json() as Promise<{ user: Record<string, unknown> | null }>),
      f(`${origin}/api/auth/config`, { headers }).then((r) => r.json() as Promise<{ signIn?: string }>),
    ]);
    if (!me.user || typeof me.user.id !== 'string') throw new Error('The server did not accept the sign-in.');
    return {
      id: me.user.id,
      displayName: String(me.user.displayName ?? me.user.username ?? ''),
      signIn: me.user.signIn === 'oidc' || config.signIn === 'oidc' ? 'oidc' : 'password',
    };
  }

  private async openSignedIn(origin: string, user: AccountUser, tokens: Tokens): Promise<void> {
    const id = accountId(origin, user.id);
    const current = this.account;
    if (current && current.id === id) {
      current.tokens.stop();
      current.useTokens(tokens);
      current.user = user;
    } else {
      this.account = null;
      await current?.close();
    }
    const account = this.account ?? new Account(this, id, origin, user, tokens, 'none');
    this.account = account;
    account.store.setKv(USER_KEY, JSON.stringify(user));
    account.store.setKv(SIGNED_IN_KEY, new Date(this.now).toISOString());
    account.store.setCache('me', { user: { ...user } });
    if (account.store.listProjects().length === 0) account.engine.firstSync = true;
    this.server = origin;
    writeDeviceFile(this.options.userData, { server: origin, lastAccount: id });
    account.setSession('active');
  }

  async reopenSignIn(): Promise<void> {
    await this.pending?.reopen();
  }

  cancelSignIn(): void {
    this.pending?.cancel();
  }

  // Revokes the grant when the server answers, forgets the tokens, and with
  // `remove` deletes the account's folder.
  async signOut({ remove }: { remove: boolean }): Promise<void> {
    const account = this.account;
    if (!account) return;
    this.pending?.cancel();
    account.setSession('signed-out');
    await account.tokens.signOut();
    // Not when the same account signed in again meanwhile.
    if (remove && this.account === account && account.session === 'signed-out') {
      this.account = null;
      await account.close();
      rmSync(accountFolder(this.options.userData, account.id), { recursive: true, force: true });
      writeDeviceFile(this.options.userData, { server: account.server, lastAccount: null });
    }
    this.emitAuth();
  }

  // Bridge calls.

  async request(path: string, init: BridgeRequestInit): Promise<BridgeResponse> {
    const account = this.account;
    if (account) return account.router.handle(path, init);
    // No account yet: the Sign in screen asks the server how it signs in.
    if (path === '/api/auth/me') return json(200, { user: null });
    if (path === '/api/auth/config' && this.server) {
      try {
        const response = await (this.options.fetch ?? fetch)(`${this.server}/api/auth/config`, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        });
        return json(response.status, await response.json());
      } catch {
        return OFFLINE();
      }
    }
    return json(401, { error: 'unauthenticated', message: 'Sign in first.' });
  }

  open(webContentsId: number, id: string): OpenedDoc {
    if (!this.account) return { state: new Uint8Array([0, 0]), status: 'gone' };
    return this.account.engine.open(webContentsId, id);
  }

  syncStatus(): DesktopSyncStatus {
    return (
      this.account?.engine.status() ?? {
        online: false,
        offlineSince: null,
        lastSync: null,
        firstSync: false,
        listVersion: 0,
        diskError: null,
        projects: [],
      }
    );
  }

  setLocalSnapshots(mode: LocalSnapshotsMode): void {
    this.account?.snapshots.setMode(mode);
  }

  localSnapshots(): LocalSnapshotsMode {
    return this.account?.snapshots.mode ?? 'hourly';
  }

  usage(): DeviceUsage {
    // Brief D of asset-board fills files and fileBytes in (task 4.4).
    return this.account?.usage() ?? { bytes: 0, projects: 0, localSnapshots: 0, files: 0, fileBytes: 0 };
  }

  databaseFile(): string | null {
    return this.account ? databaseFile(this.options.userData, this.account.id) : null;
  }

  serverOrigin(): string {
    return this.account?.server ?? this.server;
  }

  // What an /api/ path answers, as bytes (an export to save).
  async fetchBytes(path: string): Promise<Uint8Array> {
    const answer = await this.request(path, { method: 'GET' });
    if (answer.status !== 200 || !answer.body) throw new HttpError(answer.status, null);
    return answer.body;
  }

  async close(): Promise<void> {
    this.pending?.cancel();
    const account = this.account;
    this.account = null;
    await account?.close();
  }
}

