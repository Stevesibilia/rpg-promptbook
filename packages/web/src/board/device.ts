import { useMemo } from 'react';
import type { FilesStatus } from '../platform/bridge.js';
import { platform } from '../platform/index.js';
import { useStore } from '../platform/hooks.js';
import { createStore } from '../platform/store.js';

// The board's files as the desktop's main holds them (asset-board screen 8):
// those on this computer and not yet on the server, by sha256, with the
// server's message when it refused one. Always empty in the browser.

const none = createStore<FilesStatus>({ waiting: [], downloading: 0, refused: [] });
const files = platform.desktop?.files ?? none;

export function useFilesStatus(): FilesStatus {
  return useStore(files);
}

// sha256 → null while waiting to upload, or the server's refusal.
export function useLocalFiles(projectId: string): Map<string, string | null> {
  const status = useFilesStatus();
  return useMemo(() => {
    const here = new Map<string, string | null>();
    for (const w of status.waiting) if (w.projectId === projectId) here.set(w.sha256, null);
    for (const r of status.refused) if (r.projectId === projectId) here.set(r.sha256, r.message);
    return here;
  }, [status, projectId]);
}

// The «on this device» badge's title.
export const localTitle = (refused: string | null) =>
  refused === null ? 'On this computer. Uploads when you are back online' : `The server refused this file: ${refused}`;

// «4 files on this computer, uploaded when you are back online.»
export const localLine = (n: number) =>
  `${n} ${n === 1 ? 'file' : 'files'} on this computer, uploaded when you are back online.`;

// Bumped each time a download ends, so a picture that failed to load
// (not on this computer yet) is asked for again.
let downloads = 0;
let last = files.get().downloading;
const version = createStore(0);
files.subscribe(() => {
  const now = files.get().downloading;
  if (now < last) version.set(++downloads);
  last = now;
});

export function useDownloadsVersion(): number {
  return useStore(version);
}
