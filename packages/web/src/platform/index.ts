import type { SyncRegistry } from '../sync/registry.js';
import type { CuebardSaved, PromptbookBridge, PutFileResult } from './bridge.js';
import { createDesktopPlatform, type Desktop } from './desktop.js';
import { createWebPlatform } from './web.js';

// The one place that knows whether the web client runs in a browser or in the
// desktop app (desktop-app design decision 6). Chosen once at start by the
// presence of the desktop's bridge; main.tsx awaits init() before rendering,
// so serverOrigin is known synchronously after it.

export interface Platform {
  kind: 'web' | 'desktop';
  // The server's origin: the page's own in the browser, the configured
  // server on the desktop ('' before the first sign-in).
  readonly serverOrigin: string;
  init(): Promise<void>;
  // What api.ts sends: fetch in the browser, main's router on the desktop.
  request(path: string, init: RequestInit): Promise<Response>;
  // The sync registry, one per page.
  openSync(): SyncRegistry;
  // Signing in again over the current page: the provider's pages in a
  // window of their own in the browser, false when it was blocked; the
  // system browser on the desktop.
  startSignIn(): boolean;
  // The PDF where it can be printed: a tab of its own in the browser, opened
  // at once, before `build` makes the bytes; the system's viewer on the
  // desktop.
  openPdf(build: () => Promise<Uint8Array>, name: string): Promise<void>;
  // An /api/ path's answer (an export) or bytes saved as a file: the
  // browser's download, or the desktop's save dialog.
  download(source: string | Blob, name: string): Promise<void>;
  // The project's CueBard pack (cuebard-export design decision 16): the
  // server's download in the browser, answered at once; built on this
  // computer on the desktop, after its save dialog, online or offline.
  // Rejects with the message to show.
  exportCuebard(projectId: string, title: string): Promise<CuebardSaved>;
  // The release this app runs, as `v0.5.1`: the server's from /api/health in
  // the browser (once), the app's own on the desktop. null when unknown, `dev`
  // or on an error; never rejects.
  releaseVersion(): Promise<string | null>;
  // The URL an <img> or <audio> loads a board's file from: the same path on
  // both, served by the server in the browser and by main's protocol on the
  // desktop (asset-board design decision 13).
  fileUrl(projectId: string, sha256: string): string;
  // Stores a board's file for the project: the browser asks HEAD and PUTs it
  // only when the project does not link it yet (design decision 5's
  // re-link); the desktop keeps it on disk and queues the upload. Rejects
  // with a PutFileError.
  putFile(projectId: string, sha256: string, bytes: Uint8Array, mime: string): Promise<PutFileResult>;
  // The desktop's own state; null in the browser.
  desktop: Desktop | null;
}

export const fileUrl = (projectId: string, sha256: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/files/${sha256}`;

// A file that could not be stored, with the message the board shows: the
// server's, or the network's. `status` is 0 when no answer came.
export class PutFileError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// `0.5.1` and `v0.5.1` both read `v0.5.1`; nothing for an empty value, `dev`
// or the unreleased `0.0.0`.
export function asRelease(version: unknown): string | null {
  if (typeof version !== 'string') return null;
  const bare = version.trim().replace(/^v/i, '');
  if (!bare || bare === 'dev' || bare === '0.0.0') return null;
  return `v${bare}`;
}

type Host = { promptbook?: PromptbookBridge } | undefined;

export function choosePlatform(host: Host): Platform {
  return host?.promptbook ? createDesktopPlatform(host.promptbook) : createWebPlatform();
}

export const platform: Platform = choosePlatform(
  typeof window === 'undefined' ? undefined : (window as unknown as Host),
);

// The server's host as the texts show it, '' when there is none yet.
export function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return '';
  }
}

export const serverHost = () => hostOf(platform.serverOrigin);
