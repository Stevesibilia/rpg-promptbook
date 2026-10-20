import type * as Y from 'yjs';
import { platform } from '../platform/index.js';
import type { DesktopSyncStatus } from '../platform/bridge.js';
import type { ProviderSnapshot, SyncState } from './state.js';

// The project documents the page has open and how their sync stands
// (design decision 9). The browser keeps one Hocuspocus provider per open
// project (platform/webRegistry.ts); the desktop app asks its main process,
// which syncs every project (platform/desktopRegistry.ts, desktop-app
// design decision 5). The hooks and components see this API only.

export interface SyncSnapshot {
  state: SyncState;
  providers: ProviderSnapshot[];
  // When the server last confirmed a store or a finished sync.
  lastSync: Date | null;
  sessionEnded: boolean;
  // The desktop app's whole picture, every project of the account; null in
  // the browser.
  device: DesktopSyncStatus | null;
}

export type DocStatus = 'loading' | 'ready' | 'gone';

export interface SyncRegistry {
  // Opens a project's document, or shares the one already open.
  open(id: string): { doc: Y.Doc };
  // One view fewer; the document goes after a short grace period.
  release(id: string): void;
  // After signing in again: every provider authenticates and sends what it
  // holds.
  reconnect(): void;
  // Tries at once instead of waiting for the next attempt.
  syncNow(): void;
  // A request answered 401: the session ended.
  markSessionEnded(): void;
  // Signing out closes everything.
  closeAll(): void;
  docStatus(id: string): DocStatus;
  subscribe(listener: () => void): () => void;
  getSnapshot(): SyncSnapshot;
  // Called after a project's document was stored on the server, or the list
  // of projects changed.
  onStored(listener: (id: string) => void): () => void;
  // Called when the server made a snapshot of a project's document.
  onSnapshot(listener: (id: string) => void): () => void;
}

export const registry: SyncRegistry = platform.openSync();
