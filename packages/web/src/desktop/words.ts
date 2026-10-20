import type { DeviceInfo } from '../platform/bridge.js';

// The words the desktop app changes by operating system (desktop.html's
// platform switch), and its sizes.

export interface OsWords {
  computer: string;
  show: string;
  manager: string;
}

const words: Record<DeviceInfo['os'], OsWords> = {
  darwin: { computer: 'this Mac', show: 'Show in Finder', manager: 'Finder' },
  win32: { computer: 'this PC', show: 'Show in Explorer', manager: 'Explorer' },
  linux: { computer: 'this computer', show: 'Show in Files', manager: 'Files' },
};

export const osWords = (os: DeviceInfo['os']): OsWords => words[os];

// «1.3 GB», «38 MB», «4.2 MB», «0.3 MB», «48 kB».
export function size(bytes: number): string {
  if (bytes < 100_000) return `${Math.max(1, Math.round(bytes / 1000))} kB`;
  if (bytes >= 1_000_000_000) {
    const gb = bytes / 1_000_000_000;
    return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`;
  }
  const mb = bytes / 1_000_000;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export const changes = (n: number) => `${n} change${n === 1 ? '' : 's'}`;
