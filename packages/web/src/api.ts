import { exportFolderName, type Category, type ProjectRow, type Settings, type Status } from 'promptbook-project';
import type { ConvertReport } from 'promptbook-format';
import { platform } from './platform/index.js';

// A small fetch wrapper for the server's REST API (design decision 7). Every
// call sends the session cookie; a 401 from a signed-in page means the
// session ended, which the shell shows as Sign in to sync. On the desktop the
// same calls go to main's router through the platform (desktop-app design
// decisions 6 and 7), which answers 503 offline for what needs the server.

export interface User {
  id: string;
  username: string;
  displayName: string;
  // From the provider, for display only; null for a password account.
  email: string | null;
  // How this account signs in.
  signIn: 'oidc' | 'password';
}

// Which sign-in the server offers, as GET /api/auth/config answers it.
export type AuthConfig = { signIn: 'oidc'; providerName: string; issuerHost: string } | { signIn: 'password' };

// One row of the project list, as GET /api/projects answers it.
export type { ProjectRow };

export interface NewProject {
  category: Category;
  title: string;
  campaignId: string | null;
  system: string;
  status: Status;
  seed: string;
}

export interface ImportNote {
  text: string;
  fileName: string;
  title: string;
  category: Category;
  campaignId: string | null;
}

export interface ImportResult {
  project: ProjectRow;
  report: ConvertReport;
  imagesNotImported: number;
}

export type SnapshotKind = 'claude' | 'user' | 'restore';

// A snapshot of the prep document, as GET /api/projects/:id/snapshots lists it.
export interface SnapshotRow {
  id: string;
  kind: SnapshotKind;
  // user: the name; claude: the target and its title; restore: what was
  // restored, as «<label> · <ISO date>».
  label: string;
  tool: string | null;
  target: string | null;
  words: number;
  createdAt: string;
  // Null for the user's own.
  expiresAt: string | null;
}

export interface Snapshot extends SnapshotRow {
  text: string;
}

export type OAuthScope = 'read' | 'read_write';
// What a grant carries: a connector's scope, or app for the desktop app.
export type GrantScope = OAuthScope | 'app';

// An authorization request as the server validated it, for the consent page.
export interface ConsentRequest {
  client_name: string;
  // The host of the client's own address, as text, never a link.
  client_host: string | null;
  redirect_host: string;
  loopback_only: boolean;
  requested_scopes: GrantScope[];
  // The desktop app: approved at once, with no question.
  first_party: boolean;
}

// An app the user allowed, as GET /api/auth/grants lists it.
export interface Grant {
  id: string;
  client_name: string;
  client_uri: string | null;
  scope: GrantScope;
  // The desktop app's grant, and the computer it was made on.
  first_party: boolean;
  device_name: string | null;
  created_at: string;
  last_used_at: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};

// The shell sets this once: what to do when a request answers 401.
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'include', headers: { accept: 'application/json' } };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { ...init.headers, 'content-type': 'application/json' };
  }
  let response: Response;
  try {
    response = await platform.request(path, init);
  } catch {
    throw new ApiError(0, 'network', 'The server cannot be reached.');
  }
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
  if (!response.ok) {
    // Sign-in answers 401 for a wrong password; that is not a session ending.
    if (response.status === 401 && path !== '/api/auth/login') onUnauthorized();
    throw new ApiError(
      response.status,
      data?.error ?? 'error',
      data?.message ?? `The server answered ${response.status}.`,
    );
  }
  return data as T;
}

export const api = {
  config: () => request<AuthConfig>('GET', '/api/auth/config'),
  me: () => request<{ user: User | null }>('GET', '/api/auth/me'),
  login: (username: string, password: string) =>
    request<{ user: User }>('POST', '/api/auth/login', { username, password }),
  logout: () => request<void>('POST', '/api/auth/logout'),
  setDisplayName: (displayName: string) => request<{ user: User }>('PATCH', '/api/auth/me', { displayName }),
  changePassword: (current: string, next: string) => request<void>('POST', '/api/auth/password', { current, next }),

  settings: () => request<Settings>('GET', '/api/settings'),
  saveSettings: (settings: Settings) => request<Settings>('PUT', '/api/settings', settings),

  projects: (bin = false) => request<{ projects: ProjectRow[] }>('GET', bin ? '/api/projects?bin=1' : '/api/projects'),
  createProject: (project: NewProject) => request<{ project: ProjectRow }>('POST', '/api/projects', project),
  deleteProject: (id: string) => request<void>('DELETE', `/api/projects/${encodeURIComponent(id)}`),
  restoreProject: (id: string) =>
    request<{ project: ProjectRow }>('POST', `/api/projects/${encodeURIComponent(id)}/restore`),
  importNotes: (notes: ImportNote[]) => request<{ results: ImportResult[] }>('POST', '/api/import', { notes }),

  snapshots: (projectId: string, query: { kind?: SnapshotKind; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (query.kind) params.set('kind', query.kind);
    if (query.limit) params.set('limit', String(query.limit));
    const search = params.size ? `?${params}` : '';
    return request<{ snapshots: SnapshotRow[] }>('GET', `${snapshotsPath(projectId)}${search}`);
  },
  snapshot: (projectId: string, id: string) =>
    request<{ snapshot: Snapshot }>('GET', `${snapshotsPath(projectId)}/${encodeURIComponent(id)}`),
  createSnapshot: (projectId: string, label: string) =>
    request<{ snapshot: SnapshotRow }>('POST', snapshotsPath(projectId), { label }),
  // Both answer the restore snapshot of the text they replaced.
  restoreSnapshot: (projectId: string, id: string) =>
    request<{ snapshot: SnapshotRow }>('POST', `${snapshotsPath(projectId)}/${encodeURIComponent(id)}/restore`),
  undoClaudeEdit: (projectId: string, id: string) =>
    request<{ snapshot: SnapshotRow }>('POST', `${snapshotsPath(projectId)}/${encodeURIComponent(id)}/undo`),
  deleteSnapshot: (projectId: string, id: string) =>
    request<void>('DELETE', `${snapshotsPath(projectId)}/${encodeURIComponent(id)}`),

  // The consent page sends the request's parameters back as it received them;
  // the server builds the address the browser goes to.
  consentRequest: (params: URLSearchParams) => request<ConsentRequest>('GET', `/api/oauth/authorize?${params}`),
  approve: (params: Record<string, string>, grantedScope: GrantScope) =>
    request<{ redirect_to: string }>('POST', '/api/oauth/authorize', { ...params, granted_scope: grantedScope }),
  deny: (params: Record<string, string>) =>
    request<{ redirect_to: string }>('POST', '/api/oauth/authorize/deny', params),
  grants: () => request<{ grants: Grant[] }>('GET', '/api/auth/grants'),
  revokeGrant: (id: string) => request<void>('DELETE', `/api/auth/grants/${encodeURIComponent(id)}`),
  // The connector's address, as the server names it from PUBLIC_URL.
  mcpResource: () => request<{ resource: string }>('GET', '/.well-known/oauth-protected-resource'),
};

const snapshotsPath = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/snapshots`;

export const exportUrl = (id: string) => `/api/projects/${encodeURIComponent(id)}/export`;
export const exportAllUrl = '/api/export';

// The names the server gives the exports, for the desktop's save dialog.
export const exportName = (title: string) => `${exportFolderName(title, new Set())}.zip`;
export const exportAllName = () => `promptbook-${new Date().toISOString().slice(0, 10)}.zip`;
