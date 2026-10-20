import { startUrl, SIGNED_IN_PATH } from '../auth/oidc.js';
import { NoticeError, POPUPS_BLOCKED } from '../editor/pdf/notice.js';
import type { Platform } from './index.js';
import { WebSyncRegistry } from './webRegistry.js';

// The browser: exactly what the web client did before the desktop app.

const SIGN_IN_WINDOW = 'promptbook-sign-in';

// Bytes as a URL of this page, let go once the browser had time to use it.
function blobUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return url;
}

export function createWebPlatform(): Platform {
  let registry: WebSyncRegistry | null = null;
  let signInWindow: Window | null = null;
  return {
    kind: 'web',
    desktop: null,
    get serverOrigin() {
      return location.origin;
    },
    init: async () => {},
    request: (path, init) => fetch(path, init),
    openSync: () => (registry ??= new WebSyncRegistry()),

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
  };
}
