import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Where an account's data lives (desktop-app design decision 4):
// <userData>/accounts/<id>/promptbook.sqlite, one folder per server and user,
// and <userData>/device.json naming the server and the account last used.

export interface DeviceFile {
  server: string;
  lastAccount: string | null;
}

// The first 16 hex characters of sha256(serverOrigin + '\n' + userId).
export function accountId(serverOrigin: string, userId: string): string {
  return createHash('sha256').update(`${serverOrigin}\n${userId}`).digest('hex').slice(0, 16);
}

export const accountFolder = (userData: string, id: string) => join(userData, 'accounts', id);
export const databaseFile = (userData: string, id: string) => join(accountFolder(userData, id), 'promptbook.sqlite');

export function readDeviceFile(userData: string): DeviceFile {
  try {
    const parsed = JSON.parse(readFileSync(join(userData, 'device.json'), 'utf8')) as Partial<DeviceFile>;
    return {
      server: typeof parsed.server === 'string' ? parsed.server : '',
      lastAccount: typeof parsed.lastAccount === 'string' && /^[0-9a-f]{16}$/.test(parsed.lastAccount)
        ? parsed.lastAccount
        : null,
    };
  } catch {
    return { server: '', lastAccount: null };
  }
}

// Written to a temporary file first, so a crash never leaves half of it.
export function writeDeviceFile(userData: string, file: DeviceFile): void {
  mkdirSync(userData, { recursive: true });
  const path = join(userData, 'device.json');
  writeFileSync(`${path}.tmp`, `${JSON.stringify(file, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
}

// A server origin from what the user typed: http(s) only, no path.
export function serverOrigin(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}
