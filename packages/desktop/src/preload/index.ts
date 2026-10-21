import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { channels, type PromptbookBridge } from 'promptbook-web/src/platform/bridge.js';

// window.promptbook (desktop-app design decision 3): every call an invoke on
// its pb:<area>:<verb> channel, every event a listener whose subscription
// answers its unsubscribe. Nothing else of Electron reaches the page.

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

function on<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const listener = (_event: IpcRendererEvent, ...args: unknown[]) => cb(...(args as A));
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const bridge: PromptbookBridge = {
  info: () => invoke(channels.deviceInfo),
  request: (path, init) => invoke(channels.apiRequest, path, init),
  sync: {
    open: (id) => invoke(channels.syncOpen, id),
    update: (id, update) => invoke(channels.syncUpdate, id, update),
    release: (id) => invoke(channels.syncRelease, id),
    syncNow: () => invoke(channels.syncNow),
    status: () => invoke(channels.syncStatus),
    onUpdate: (cb) => on(channels.syncOnUpdate, cb),
    onStatus: (cb) => on(channels.syncOnStatus, cb),
    onStateless: (cb) => on(channels.syncOnStateless, cb),
  },
  auth: {
    state: () => invoke(channels.authState),
    start: (server) => invoke(channels.authStart, server),
    reopen: () => invoke(channels.authReopen),
    cancel: () => invoke(channels.authCancel),
    signOut: (options) => invoke(channels.authSignOut, { remove: options.remove }),
    onState: (cb) => on(channels.authOnState, cb),
  },
  device: {
    showDataFolder: () => invoke(channels.deviceShowDataFolder),
    setLocalSnapshots: (mode) => invoke(channels.deviceSetLocalSnapshots, mode),
    usage: () => invoke(channels.deviceUsage),
  },
  updates: {
    state: () => invoke(channels.updatesState),
    check: () => invoke(channels.updatesCheck),
    restart: () => invoke(channels.updatesRestart),
    openRelease: () => invoke(channels.updatesOpenRelease),
    onState: (cb) => on(channels.updatesOnState, cb),
  },
  files: {
    openPdf: (bytes, name) => invoke(channels.filesOpenPdf, bytes, name),
    save: (source, name) => invoke(channels.filesSave, source, name),
    put: (projectId, sha256, bytes, mime) => invoke(channels.filesPut, projectId, sha256, bytes, mime),
    status: () => invoke(channels.filesStatus),
    onStatus: (cb) => on(channels.filesOnStatus, cb),
    exportCuebard: (projectId, name) => invoke(channels.filesExportCuebard, projectId, name),
  },
};

contextBridge.exposeInMainWorld('promptbook', bridge);
