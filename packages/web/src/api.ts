import type { Category, Settings, Status } from 'promptbook-project';
import type { ConvertReport } from 'promptbook-format';

// A small fetch wrapper for the server's REST API (design decision 7). Every
// call sends the session cookie; a 401 from a signed-in page means the
// session ended, which the shell shows as Sign in to sync.

export interface User {
  id: string;
  username: string;
  displayName: string;
}

// One row of the project list, as GET /api/projects answers it.
export interface ProjectRow {
  id: string;
  title: string;
  category: Category;
  status: Status;
  campaignId: string | null;
  system: string;
  seed: string;
  todoDone: number;
  todoTotal: number;
  nextDue: string | null;
  scenes: number | null;
  words: number | null;
  errors: number | null;
  warnings: number | null;
  createdAt: string;
  editedAt: string;
  deletedAt: string | null;
}

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
    response = await fetch(path, init);
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
};

export const exportUrl = (id: string) => `/api/projects/${encodeURIComponent(id)}/export`;
export const exportAllUrl = '/api/export';
