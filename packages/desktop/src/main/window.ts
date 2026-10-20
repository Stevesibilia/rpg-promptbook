import { app, BrowserWindow, session, shell, type WebContents } from 'electron';
import { join } from 'node:path';
import { APP_URL } from './protocol.js';

// The window and its guards (desktop-app design decision 3): context
// isolation, the sandbox, no Node, only promptbook://app/ ever loaded in it;
// http and https links go to the system browser, every other new window is
// denied.

export const isAppUrl = (url: string) => url.startsWith(APP_URL);

export const isExternalUrl = (url: string) => {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

// Guards for every web contents the app makes, the window's and any other.
export function guardWebContents(contents: WebContents): void {
  const refuse = (event: { preventDefault(): void }, url: string) => {
    if (!isAppUrl(url)) event.preventDefault();
  };
  contents.on('will-navigate', refuse);
  contents.on('will-redirect', refuse);
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
}

// The page asks for nothing: no camera, location or notifications. Writing
// to the clipboard (Copy buttons) is the one permission it gets.
export function lockPermissions(): void {
  const allowed = new Set(['clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) =>
    callback(allowed.has(permission) && isAppUrl(contents.getURL())),
  );
  session.defaultSession.setPermissionCheckHandler((contents, permission) =>
    allowed.has(permission) && !!contents && isAppUrl(contents.getURL()),
  );
}

const TITLE = 'Promptbook';

export function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: TITLE,
    backgroundColor: '#131917',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
    },
  });
  // «Promptbook», or «<project title> · Promptbook» when the page names one.
  window.webContents.on('page-title-updated', (event, title) => {
    event.preventDefault();
    window.setTitle(title.trim() ? title : TITLE);
  });
  window.once('ready-to-show', () => window.show());
  void window.loadURL(APP_URL);
  if (!app.isPackaged && process.env.PROMPTBOOK_DEVTOOLS === '1') window.webContents.openDevTools();
  return window;
}
