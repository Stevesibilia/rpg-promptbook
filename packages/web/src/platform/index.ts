import type { SyncRegistry } from '../sync/registry.js';
import type { PromptbookBridge } from './bridge.js';
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
  // at once while the bytes are built; the system's viewer on the desktop.
  openPdf(bytes: Promise<Uint8Array>, name: string): Promise<void>;
  // An /api/ path's answer (an export) or bytes saved as a file: the
  // browser's download, or the desktop's save dialog.
  download(source: string | Blob, name: string): Promise<void>;
  // The desktop's own state; null in the browser.
  desktop: Desktop | null;
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
