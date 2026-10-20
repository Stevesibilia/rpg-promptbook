import { app as electronApp, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { channels, type BridgeRequestInit, type DeviceInfo } from 'promptbook-web/src/platform/bridge.js';
import type { App } from './app.js';
import type { Updater } from './updater.js';
import { isRoutablePath } from './router.js';
import { isMode } from './snapshots.js';
import { installKind } from './updater.js';
import { appVersion } from './version.js';
import { isAppUrl } from './window.js';

// The handlers behind window.promptbook (desktop-app design decision 3).
// Every message must come from a frame on promptbook://app/, and every
// argument is checked before main acts on it: project ids are UUIDs, REST
// paths start with /api/, updates and files are bytes of a bounded size.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_UPDATE_BYTES = 20 * 1024 * 1024;
const MAX_BODY_CHARS = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

class InvalidArgument extends Error {}

const fail = (what: string): never => {
  throw new InvalidArgument(`Invalid ${what}.`);
};

export function checkSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url;
  if (!url || !isAppUrl(url)) throw new InvalidArgument('Not from the app.');
}

export function projectId(v: unknown): string {
  return typeof v === 'string' && UUID.test(v) ? v : fail('project id');
}

export function bytes(v: unknown, max: number): Uint8Array {
  return v instanceof Uint8Array && v.byteLength <= max ? v : fail('bytes');
}

export function requestInit(v: unknown): BridgeRequestInit {
  const i = v as Partial<BridgeRequestInit> | null;
  if (!i || typeof i !== 'object') return fail('request');
  const method = typeof i.method === 'string' ? i.method.toUpperCase() : fail('method');
  if (!METHODS.has(method)) fail('method');
  const init: BridgeRequestInit = { method };
  if (i.headers !== undefined) {
    if (!i.headers || typeof i.headers !== 'object') fail('headers');
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(i.headers)) {
      // The renderer names the body's type and what it accepts; never
      // credentials or the host.
      const lower = name.toLowerCase();
      if (typeof value !== 'string' || (lower !== 'content-type' && lower !== 'accept')) continue;
      headers[lower] = value;
    }
    init.headers = headers;
  }
  if (i.body !== undefined) {
    if (typeof i.body !== 'string' || i.body.length > MAX_BODY_CHARS) fail('body');
    init.body = i.body as string;
  }
  return init;
}

// A file name for the save dialog: its last part only, printable.
export function fileName(v: unknown): string {
  if (typeof v !== 'string') return fail('file name');
  const name = basename(v.replace(/\\/g, '/')).replace(/[\u0000-\u001f<>:"|?*]/g, '_').slice(0, 200);
  return name && name !== '.' && name !== '..' ? name : fail('file name');
}

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function handle(channel: string, handler: Handler): void {
  ipcMain.handle(channel, (event, ...args) => {
    checkSender(event);
    return handler(event, ...args);
  });
}

export function registerIpc(app: App, updater: Updater): void {
  handle(channels.deviceInfo, (): DeviceInfo => ({
    os: process.platform === 'win32' || process.platform === 'darwin' ? process.platform : 'linux',
    version: electronApp.isPackaged ? electronApp.getVersion() : appVersion(__dirname, electronApp.getVersion()),
    packaged: electronApp.isPackaged,
    serverOrigin: app.serverOrigin(),
    dataFolder: app.options.userData,
    databaseFile: app.databaseFile(),
    signInRemembered: app.options.secrets.isEncryptionAvailable(),
    localSnapshots: app.localSnapshots(),
    updates: installKind(process.platform, process.env),
  }));

  handle(channels.apiRequest, (_event, path, init) => {
    if (!isRoutablePath(path)) fail('path');
    return app.request(path as string, requestInit(init));
  });

  handle(channels.syncOpen, (event, id) => app.open(event.sender.id, projectId(id)));
  handle(channels.syncUpdate, (event, id, update) => {
    app.account?.engine.applyFromRenderer(event.sender.id, projectId(id), bytes(update, MAX_UPDATE_BYTES));
  });
  handle(channels.syncRelease, (event, id) => {
    app.account?.engine.release(event.sender.id, projectId(id));
  });
  handle(channels.syncNow, () => {
    app.account?.engine.syncNow();
  });
  handle(channels.syncStatus, () => app.syncStatus());

  handle(channels.authState, () => app.authState());
  handle(channels.authStart, (_event, server) => {
    if (typeof server !== 'string' || server.length > 2048) fail('server');
    // Answers once the browser step started; the outcome comes as state.
    void app.startSignIn(server as string);
  });
  handle(channels.authReopen, () => app.reopenSignIn());
  handle(channels.authCancel, () => app.cancelSignIn());
  handle(channels.authSignOut, (_event, options) => {
    const remove = (options as { remove?: unknown } | null)?.remove;
    if (typeof remove !== 'boolean') fail('options');
    return app.signOut({ remove: remove as boolean });
  });

  handle(channels.deviceShowDataFolder, () => {
    const file = app.databaseFile();
    if (file) shell.showItemInFolder(file);
    else void shell.openPath(app.options.userData);
  });
  handle(channels.deviceSetLocalSnapshots, (_event, mode) => {
    if (!isMode(mode)) fail('mode');
    app.setLocalSnapshots(mode as Parameters<App['setLocalSnapshots']>[0]);
  });
  handle(channels.deviceUsage, () => app.usage());

  handle(channels.updatesState, () => updater.state);
  handle(channels.updatesCheck, () => updater.check());
  handle(channels.updatesRestart, () => updater.restart());
  handle(channels.updatesOpenRelease, () => updater.openRelease());

  handle(channels.filesOpenPdf, async (_event, data, name) => {
    const pdf = bytes(data, MAX_FILE_BYTES);
    const dir = await mkdtemp(join(tmpdir(), 'promptbook-'));
    const file = join(dir, fileName(name).replace(/(\.pdf)?$/i, '.pdf'));
    await writeFile(file, pdf);
    const error = await shell.openPath(file);
    if (error) throw new Error(error);
  });
  handle(channels.filesSave, async (event, source, name) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = { defaultPath: fileName(name) };
    const { canceled, filePath } = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    if (canceled || !filePath) return false;
    let data: Uint8Array;
    if (typeof source === 'string') {
      if (!isRoutablePath(source)) fail('path');
      data = await app.fetchBytes(source);
    } else {
      data = bytes(source, MAX_FILE_BYTES);
    }
    await writeFile(filePath, data);
    return true;
  });
}
