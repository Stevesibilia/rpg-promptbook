import { defaultSettings } from 'promptbook-project';
import type {
  BridgeRequestInit,
  BridgeResponse,
  DesktopSnapshotKind,
  SnapshotSource,
} from 'promptbook-web/src/platform/bridge.js';
import { SignedOutError } from './auth/tokens.js';
import { InvalidCampaignError, readNewProject, ValidationError, type Creator } from './create.js';
import type { ProjectList } from './projects.js';
import { OfflineError, type ServerClient } from './server.js';
import { expiresAt, type LocalSnapshots } from './snapshots.js';
import type { LocalSnapshotRecord, Store } from './store.js';
import type { SyncEngine } from './sync.js';
import { setDocumentText } from './text.js';

// The web client's REST calls on the desktop (desktop-app design decision
// 7). The list, settings, the account, the auth config and snapshots are
// answered from the store, refreshed from the server when online; a new
// project is made here (D9); snapshots merge the server's with this
// device's. Everything else goes to the server with the bearer token, or
// answers 503 offline.

export interface RouterDeps {
  store: Store;
  engine: SyncEngine;
  list: ProjectList;
  creator: Creator;
  snapshots: LocalSnapshots;
  // Null with no active session.
  server: () => ServerClient | null;
}

// A server snapshot row, or one of this device's, with its source.
export interface MergedSnapshot {
  id: string;
  kind: DesktopSnapshotKind;
  label: string;
  tool: string | null;
  target: string | null;
  words: number;
  createdAt: string;
  expiresAt: string | null;
  source: SnapshotSource;
}

// What the IPC handler lets through: the REST API, and the connector's
// resource metadata, which Connected apps reads.
const allowed = (path: string) => path.startsWith('/api/') || path.startsWith('/.well-known/oauth-protected-resource');

export function isRoutablePath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length > 2048 || !allowed(path)) return false;
  // Printable ASCII only, no backslash: the path is appended to the server's
  // origin, and stays on it.
  if (!/^[\x21-\x7e]+$/.test(path) || path.includes('\\')) return false;
  // As fetch reads it, dot segments taken out: still under the API.
  try {
    const url = new URL(path, 'http://x');
    return url.origin === 'http://x' && allowed(url.pathname) && `${url.pathname}${url.search}` === path;
  } catch {
    return false;
  }
}

const encoder = new TextEncoder();

export function json(status: number, body: unknown): BridgeResponse {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: encoder.encode(JSON.stringify(body)),
  };
}

const empty = (status: number): BridgeResponse => ({ status, headers: {}, body: null });

export const OFFLINE = () => json(503, { error: 'offline', message: 'Needs the server.' });
const SIGNED_OUT = () => json(401, { error: 'unauthenticated', message: 'Sign in to sync.' });
const NOT_FOUND = () => json(404, { error: 'not_found', message: 'Not found.' });
const invalid = (message: string) => json(400, { error: 'validation_error', message });

const KEPT_HEADERS = ['content-type', 'content-disposition', 'cache-control'];

async function toBridge(response: Response): Promise<BridgeResponse> {
  const headers: Record<string, string> = {};
  for (const name of KEPT_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { status: response.status, headers, body: response.status === 204 ? null : bytes };
}

const decoder = new TextDecoder();

const parse = (body: Uint8Array | null): unknown => {
  if (!body) return null;
  try {
    return JSON.parse(decoder.decode(body));
  } catch {
    return null;
  }
};

const SNAPSHOTS = /^\/api\/projects\/([0-9a-f-]{36})\/snapshots(?:\/([^/]+)(?:\/(restore|undo))?)?$/;

export class Router {
  constructor(private readonly deps: RouterDeps) {}

  async handle(path: string, init: BridgeRequestInit): Promise<BridgeResponse> {
    if (!isRoutablePath(path)) return NOT_FOUND();
    const url = new URL(path, 'http://x');
    const method = init.method.toUpperCase();
    const route = `${method} ${url.pathname}`;
    try {
      if (route === 'GET /api/projects') return await this.projects(url.searchParams.get('bin') === '1');
      if (route === 'POST /api/projects') return this.createProject(init.body);
      if (route === 'GET /api/settings') return await this.cached('settings', path, () => defaultSettings());
      if (route === 'GET /api/auth/me') return await this.cached('me', path, () => ({ user: null }));
      if (route === 'GET /api/auth/config') return await this.cached('auth-config', path, null);
      const snapshots = SNAPSHOTS.exec(url.pathname);
      if (snapshots) {
        const [, id, sid, action] = snapshots as unknown as [string, string, string | undefined, string | undefined];
        const answer = await this.snapshots(method, id, sid, action, url.searchParams, init);
        if (answer) return answer;
      }
      const answer = await this.forward(path, init);
      // What the store keeps, as the server now has it.
      if (answer.status >= 200 && answer.status < 300) {
        if (route === 'PUT /api/settings') this.deps.store.setCache('settings', parse(answer.body));
        if (route === 'PATCH /api/auth/me') this.deps.store.setCache('me', parse(answer.body));
        if (method !== 'GET' && /^\/api\/(projects|import)/.test(url.pathname)) void this.refreshList();
      }
      return answer;
    } catch (error) {
      if (error instanceof OfflineError) return OFFLINE();
      if (error instanceof SignedOutError) return SIGNED_OUT();
      throw error;
    }
  }

  // Sends the request on with the bearer token.
  async forward(path: string, init: BridgeRequestInit): Promise<BridgeResponse> {
    const server = this.deps.server();
    if (!server) return SIGNED_OUT();
    if (!this.deps.engine.isOnline) return OFFLINE();
    const response = await server.request(path, {
      method: init.method,
      headers: init.headers ?? {},
      ...(init.body !== undefined ? { body: init.body } : {}),
    });
    return toBridge(response);
  }

  private refreshList(): Promise<void> {
    if (!this.deps.server() || !this.deps.engine.isOnline) return Promise.resolve();
    return this.deps.list.refreshFromServer().catch(() => {});
  }

  private async projects(bin: boolean): Promise<BridgeResponse> {
    if (!bin) {
      void this.refreshList();
      return json(200, { projects: this.deps.list.rows() });
    }
    try {
      const answer = await this.forward('/api/projects?bin=1', { method: 'GET' });
      if (answer.status === 200) {
        this.deps.store.setCache('projects-bin', parse(answer.body));
        return answer;
      }
      if (answer.status !== 503 && answer.status !== 401) return answer;
    } catch (error) {
      if (!(error instanceof OfflineError) && !(error instanceof SignedOutError)) throw error;
    }
    return json(200, this.deps.store.getCache('projects-bin')?.value ?? { projects: [] });
  }

  private createProject(body: string | undefined): BridgeResponse {
    let input;
    try {
      input = readNewProject(body === undefined ? null : JSON.parse(body));
    } catch (error) {
      return invalid(error instanceof ValidationError ? error.message : 'The body must be JSON.');
    }
    try {
      return json(201, { project: this.deps.creator.create(input) });
    } catch (error) {
      if (error instanceof InvalidCampaignError) return json(400, { error: 'invalid_campaign', message: error.message });
      throw error;
    }
  }

  // A read the store keeps: the server's answer when online, else the last
  // one, else `fallback` (or 503 offline when there is none).
  private async cached(key: string, path: string, fallback: (() => unknown) | null): Promise<BridgeResponse> {
    try {
      const answer = await this.forward(path, { method: 'GET' });
      if (answer.status === 200) {
        this.deps.store.setCache(key, parse(answer.body));
        return answer;
      }
      if (answer.status !== 503 && answer.status !== 401) return answer;
    } catch (error) {
      if (!(error instanceof OfflineError) && !(error instanceof SignedOutError)) throw error;
    }
    const cached = this.deps.store.getCache(key);
    if (cached) return json(200, cached.value);
    return fallback ? json(200, fallback()) : OFFLINE();
  }

  private onServer(projectId: string): boolean {
    return this.deps.store.getProject(projectId)?.uploaded ?? false;
  }

  // Snapshots routes; null for those only the server answers (undo, and
  // restoring or deleting a server snapshot).
  private async snapshots(
    method: string,
    projectId: string,
    sid: string | undefined,
    action: string | undefined,
    query: URLSearchParams,
    init: BridgeRequestInit,
  ): Promise<BridgeResponse | null> {
    const record = this.deps.store.getProject(projectId);
    if (!record || record.deletedAt !== null) return NOT_FOUND();
    const local = sid ? this.deps.store.getSnapshot(sid) : null;
    const mine = local && local.projectId === projectId ? local : null;

    if (method === 'GET' && !sid) return this.listSnapshots(projectId, query);
    if (method === 'GET' && sid && !action) {
      if (mine) return json(200, { snapshot: { ...localRow(mine), text: mine.text } });
      return this.serverSnapshot(projectId, sid);
    }
    if (method === 'POST' && !sid) return this.saveSnapshot(projectId, init);
    if (method === 'POST' && action === 'restore' && mine) return this.restoreLocal(projectId, mine);
    if (method === 'DELETE' && sid && !action && mine) {
      if (mine.kind !== 'user') {
        return json(409, {
          error: 'not_deletable',
          message: 'Only your own snapshots can be deleted; the others expire.',
        });
      }
      this.deps.store.deleteSnapshots([mine.id]);
      return empty(204);
    }
    return null;
  }

  private async listSnapshots(projectId: string, query: URLSearchParams): Promise<BridgeResponse> {
    const key = `snapshots:${projectId}`;
    let server: MergedSnapshot[] = [];
    if (this.onServer(projectId)) {
      let fetched = false;
      try {
        const answer = await this.forward(`/api/projects/${projectId}/snapshots`, { method: 'GET' });
        if (answer.status === 200) {
          const body = parse(answer.body) as { snapshots?: Omit<MergedSnapshot, 'source'>[] } | null;
          const rows = body?.snapshots ?? [];
          this.deps.store.setCache(key, { snapshots: rows });
          server = rows.map((s) => ({ ...s, source: 'server' as const }));
          fetched = true;
        } else if (answer.status !== 503 && answer.status !== 401) {
          return answer;
        }
      } catch (error) {
        if (!(error instanceof OfflineError) && !(error instanceof SignedOutError)) throw error;
      }
      if (!fetched) {
        const cached = this.deps.store.getCache(key)?.value as { snapshots?: Omit<MergedSnapshot, 'source'>[] } | null;
        server = (cached?.snapshots ?? []).map((s) => ({ ...s, source: 'server' as const }));
      }
    }
    const device = this.deps.store.listSnapshots(projectId).map(localRow);
    let merged = [...server, ...device].sort((a, b) =>
      a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? 1 : -1,
    );
    const kind = query.get('kind');
    if (kind) merged = merged.filter((s) => s.kind === kind);
    const limit = Number(query.get('limit'));
    if (Number.isInteger(limit) && limit > 0) merged = merged.slice(0, limit);
    return json(200, { snapshots: merged });
  }

  // A server snapshot's text, fetched once and kept: it never changes.
  private async serverSnapshot(projectId: string, sid: string): Promise<BridgeResponse> {
    const key = `snapshot:${projectId}:${sid}`;
    const cached = this.deps.store.getCache(key);
    if (cached) return json(200, cached.value);
    if (!/^[0-9a-f-]{36}$/.test(sid)) return NOT_FOUND();
    const answer = await this.forward(`/api/projects/${projectId}/snapshots/${sid}`, { method: 'GET' });
    if (answer.status !== 200) return answer;
    const body = parse(answer.body) as { snapshot?: Record<string, unknown> } | null;
    const value = { snapshot: { ...body?.snapshot, source: 'server' } };
    this.deps.store.setCache(key, value);
    return json(200, value);
  }

  // Online, the server's user snapshot; offline, or for a project not on the
  // server yet, one on this device.
  private async saveSnapshot(projectId: string, init: BridgeRequestInit): Promise<BridgeResponse> {
    let label: string;
    try {
      const raw = (JSON.parse(init.body ?? 'null') as { label?: unknown } | null)?.label;
      label = typeof raw === 'string' ? raw.trim() : '';
    } catch {
      return invalid('The body must be JSON.');
    }
    if (!label || label.length > 200) return invalid('label: is required, up to 200 characters.');
    if (this.onServer(projectId) && this.deps.server() && this.deps.engine.isOnline) {
      try {
        const answer = await this.forward(`/api/projects/${projectId}/snapshots`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ label }),
        });
        if (answer.status !== 503) {
          if (answer.status !== 201) return answer;
          const body = parse(answer.body) as { snapshot?: Record<string, unknown> } | null;
          return json(201, { snapshot: { ...body?.snapshot, source: 'server' } });
        }
      } catch (error) {
        if (!(error instanceof OfflineError)) throw error;
      }
    }
    const record = this.deps.snapshots.take(projectId, 'user', label);
    if (!record) return NOT_FOUND();
    return json(201, { snapshot: localRow(record) });
  }

  // A local snapshot restored on the local document: a local restore
  // snapshot of the current text first, then the snapshot's text with the
  // smallest edit, from main, so it reaches the windows and the server.
  private restoreLocal(projectId: string, source: LocalSnapshotRecord): BridgeResponse {
    const createdAt = new Date(source.createdAt).toISOString();
    // The server's label for a restore: «<restored label> · <ISO date>»,
    // which History shows as Before restore.
    const kept = this.deps.snapshots.take(projectId, 'restore', `${source.label} · ${createdAt}`);
    if (!kept) return NOT_FOUND();
    this.deps.engine.transact(projectId, (doc) => setDocumentText(doc, source.text));
    return json(200, { snapshot: localRow(kept) });
  }
}

export function localRow(s: LocalSnapshotRecord): MergedSnapshot {
  const expires = expiresAt(s);
  return {
    id: s.id,
    kind: s.kind,
    label: s.label,
    tool: null,
    target: null,
    words: s.words,
    createdAt: new Date(s.createdAt).toISOString(),
    expiresAt: expires === null ? null : new Date(expires).toISOString(),
    source: 'device',
  };
}

