import { app as electronApp, BrowserWindow, protocol, safeStorage, shell, webContents } from 'electron';
import { autoUpdater } from 'electron-updater';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { channels } from 'promptbook-web/src/platform/bridge.js';
import { App } from './app.js';
import { registerIpc } from './ipc.js';
import { fileRoute, privileges, SCHEME, serveApp } from './protocol.js';
import { installKind, Updater } from './updater.js';
import { createWindow, guardWebContents, lockPermissions } from './window.js';

// The app's lifecycle (desktop-app design decisions 1 to 5): one instance,
// the promptbook:// scheme, the window, the bridge, and every project of the
// account synced in this process. On quit every document is compacted before
// the process ends.
//
// PROMPTBOOK_USER_DATA sets the data folder and PROMPTBOOK_SERVER the server
// the Sign in screen offers; PROMPTBOOK_E2E=1 hands the authorize URL to the
// tests instead of opening the browser, and takes local snapshots every
// PROMPTBOOK_E2E_SNAPSHOT_SECONDS (5 by default); with it,
// PROMPTBOOK_E2E_NO_KEYRING=1 acts as Linux with no keyring: the sign-in is
// kept in memory only.

electronApp.setName('Promptbook');
const userData = process.env.PROMPTBOOK_USER_DATA || join(electronApp.getPath('appData'), 'Promptbook');
electronApp.setPath('userData', userData);

const e2e = process.env.PROMPTBOOK_E2E === '1';

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges }]);

declare global {
  // The sign-in in progress, for the tests (PROMPTBOOK_E2E only).
  var __promptbookAuthorizeUrl: string | undefined;
  var __promptbook: App | undefined;
}

let window: BrowserWindow | null = null;
// The account closed: the next quit goes through.
let closed = false;
let closing: Promise<void> | null = null;

function broadcast(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args);
  }
}

function sendTo(id: number, channel: string, ...args: unknown[]): void {
  const contents = webContents.fromId(id);
  if (contents && !contents.isDestroyed()) contents.send(channel, ...args);
}

if (!electronApp.requestSingleInstanceLock()) {
  electronApp.quit();
} else {
  const app = new App({
    userData,
    defaultServer: process.env.PROMPTBOOK_SERVER ?? '',
    secrets:
      e2e && process.env.PROMPTBOOK_E2E_NO_KEYRING === '1'
        ? {
            isEncryptionAvailable: () => false,
            encryptString: (text: string) => safeStorage.encryptString(text),
            decryptString: (data: Buffer) => safeStorage.decryptString(data),
          }
        : safeStorage,
    hostname: hostname(),
    openExternal: (url) => {
      if (e2e) globalThis.__promptbookAuthorizeUrl = url;
      else return shell.openExternal(url);
    },
    broadcast,
    sendTo,
    ...(e2e ? { snapshotIntervalMs: Number(process.env.PROMPTBOOK_E2E_SNAPSHOT_SECONDS ?? 5) * 1000 } : {}),
  });
  if (e2e) globalThis.__promptbook = app;
  const closeAll = (): Promise<void> =>
    (closing ??= (async () => {
      updater.stop();
      await app.close().catch((error: unknown) => console.error('Closing the account failed:', error));
    })());
  const updater = new Updater({
    packaged: electronApp.isPackaged,
    kind: installKind(process.platform, process.env),
    version: electronApp.getVersion(),
    autoUpdater: () => autoUpdater,
    emit: (state) => broadcast(channels.updatesOnState, state),
    openExternal: (url) => shell.openExternal(url),
    beforeInstall: () =>
      closeAll().then(() => {
        closed = true;
      }),
  });

  electronApp.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  electronApp.on('web-contents-created', (_event, contents) => {
    guardWebContents(contents);
    const id = contents.id;
    contents.on('destroyed', () => app.account?.engine.releaseAll(id));
  });

  void electronApp.whenReady().then(() => {
    const root = join(__dirname, '..', 'app', 'web');
    protocol.handle(SCHEME, (request) => {
      const file = fileRoute(request.url);
      if (file === 'invalid') return new Response('Not found', { status: 404 });
      return file ? app.serveFile(file.projectId, file.sha256, request) : serveApp(root, request);
    });
    lockPermissions();
    registerIpc(app, updater);
    app.start();
    updater.start();
    window = createWindow();
    window.on('closed', () => {
      window = null;
    });
  });

  electronApp.on('activate', () => {
    if (!window && electronApp.isReady()) window = createWindow();
  });

  electronApp.on('window-all-closed', () => {
    if (process.platform !== 'darwin') electronApp.quit();
  });

  // Every document compacted and the database closed before the process
  // ends; the quit asked again on the next turn is the one that lets it go
  // (Electron ignores a quit asked from inside the handler that refused it).
  // Restart now closes the same way before the installer takes over.
  electronApp.on('before-quit', (event) => {
    if (closed) return;
    event.preventDefault();
    void closeAll().finally(() => {
      closed = true;
      setImmediate(() => electronApp.quit());
    });
  });
}
