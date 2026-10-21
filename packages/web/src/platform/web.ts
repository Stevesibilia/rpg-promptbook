import { cuebardFileName } from 'promptbook-project';
import { cuebardUrl } from '../api.js';
import { startUrl, SIGNED_IN_PATH } from '../auth/oidc.js';
import { NoticeError, POPUPS_BLOCKED } from '../editor/pdf/notice.js';
import type { PutFileResult } from './bridge.js';
import { asRelease, fileUrl, PutFileError, type Platform } from './index.js';
import { WebSyncRegistry } from './webRegistry.js';

// The browser: exactly what the web client did before the desktop app.

const SIGN_IN_WINDOW = 'promptbook-sign-in';

// Bytes as a URL of this page, let go once the browser had time to use it.
function blobUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return url;
}

const UNREACHABLE = 'The server cannot be reached.';

// HEAD first: a file the project still links (removed within the grace
// period, or added from another device) is not sent again. Then the raw
// bytes, which the server hashes and checks against the name.
async function putFile(projectId: string, sha256: string, bytes: Uint8Array, mime: string): Promise<PutFileResult> {
  const url = fileUrl(projectId, sha256);
  try {
    const head = await fetch(url, { method: 'HEAD', credentials: 'include' });
    if (head.ok) return { mime: head.headers.get('content-type') ?? mime, state: 'uploaded' };
  } catch {
    throw new PutFileError(0, UNREACHABLE);
  }
  let answer: Response;
  try {
    answer = await fetch(url, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/octet-stream' },
      body: bytes as Uint8Array<ArrayBuffer>,
    });
  } catch {
    throw new PutFileError(0, UNREACHABLE);
  }
  const data = (await answer.json().catch(() => null)) as { mime?: unknown; message?: unknown } | null;
  if (!answer.ok) {
    const message = typeof data?.message === 'string' && data.message ? data.message : null;
    throw new PutFileError(answer.status, message ?? `The server answered ${answer.status}.`);
  }
  return { mime: typeof data?.mime === 'string' ? data.mime : mime, state: 'uploaded' };
}

export function createWebPlatform(): Platform {
  let registry: WebSyncRegistry | null = null;
  let signInWindow: Window | null = null;
  let release: Promise<string | null> | null = null;
  return {
    kind: 'web',
    desktop: null,
    get serverOrigin() {
      return location.origin;
    },
    init: async () => {},
    request: (path, init) => fetch(path, init),
    fileUrl,
    putFile,
    openSync: () => (registry ??= new WebSyncRegistry()),

    // One request for the page's life; the server's `dev` is no release.
    releaseVersion: () =>
      (release ??= fetch('/api/health')
        .then(async (answer) => (answer.ok ? asRelease(((await answer.json()) as { version?: unknown }).version) : null))
        .catch(() => null)),

    startSignIn() {
      // A second click while the window is still open brings it forward
      // rather than starting a second sign-in, which would void the first.
      if (signInWindow && !signInWindow.closed) {
        signInWindow.focus();
        return true;
      }
      const popup = window.open(startUrl(SIGNED_IN_PATH), SIGN_IN_WINDOW, 'popup,width=520,height=720');
      if (!popup) return false;
      // The tabs talk over a BroadcastChannel; the provider's pages need no
      // handle on this one.
      try {
        popup.opener = null;
      } catch {
        // Already on another origin: it has no use for it either.
      }
      signInWindow = popup;
      return true;
    },

    // The tab is opened at the click, before the build, or the browser may
    // block it; a blocked or closed tab is never opened again after the
    // build.
    async openPdf(build) {
      const tab = window.open('', '_blank');
      if (!tab) throw new NoticeError(POPUPS_BLOCKED);
      try {
        const pdf = await build();
        if (tab.closed) throw new NoticeError(POPUPS_BLOCKED);
        tab.location.href = blobUrl(new Blob([pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }));
      } catch (error) {
        tab.close();
        throw error;
      }
    },

    // A path keeps the server's own file name (Content-Disposition), as the
    // plain links did.
    async download(source, name) {
      const link = document.createElement('a');
      link.href = typeof source === 'string' ? source : blobUrl(source);
      link.download = typeof source === 'string' ? '' : name;
      link.click();
    },

    // The server names the pack (Content-Disposition) and lists what it
    // left out in it.
    async exportCuebard(projectId, title) {
      const link = document.createElement('a');
      link.href = cuebardUrl(projectId);
      link.download = '';
      link.click();
      return { saved: true, leftOut: 0, name: cuebardFileName(title) };
    },
  };
}
