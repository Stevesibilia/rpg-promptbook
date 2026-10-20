// The sync pill's state, reduced from what each open project's provider
// reports (design decision 9). Pure, so it is tested without a server.

// Worst first: with several projects open, the first one met wins. The
// browser never reports local; the desktop app never reports reconnecting
// (desktop-app design decision 11).
export const syncStates = ['signed-out', 'not-saved', 'reconnecting', 'local', 'syncing', 'synced'] as const;
export type SyncState = (typeof syncStates)[number];

export interface ProviderSnapshot {
  id: string;
  title: string;
  // The shared socket is open.
  connected: boolean;
  // The first exchange with the server has finished since the last connect.
  synced: boolean;
  // Changes sent and not yet acknowledged, or made while disconnected.
  unsynced: number;
  // The server refused the document because the session ended.
  signedOut: boolean;
  // A store-failed message came with no stored message after it; on the
  // desktop, a disk write failed.
  storeFailed: boolean;
  // The desktop app: changes made while disconnected are kept on this
  // device, so disconnected reads as local, not reconnecting.
  onDevice?: boolean;
}

export function providerState(p: ProviderSnapshot): SyncState {
  if (p.signedOut) return 'signed-out';
  if (p.storeFailed) return 'not-saved';
  if (!p.connected) return p.onDevice ? 'local' : 'reconnecting';
  if (!p.synced || p.unsynced > 0) return 'syncing';
  return 'synced';
}

const rank = (state: SyncState) => syncStates.indexOf(state);

// The worst state across the open projects. A session found ended by the API
// counts even with no project open.
export function overallState(providers: readonly ProviderSnapshot[], sessionEnded = false): SyncState {
  let worst: SyncState = sessionEnded ? 'signed-out' : 'synced';
  for (const p of providers) {
    const state = providerState(p);
    if (rank(state) < rank(worst)) worst = state;
  }
  return worst;
}

// The projects holding changes that have not reached the server.
export function pendingChanges(
  providers: readonly ProviderSnapshot[],
): { id: string; title: string; changes: number }[] {
  return providers
    .filter((p) => p.unsynced > 0 && providerState(p) !== 'synced')
    .map((p) => ({ id: p.id, title: p.title, changes: p.unsynced }));
}

export type StatelessEvent = 'store-failed' | 'stored' | 'deleted' | 'snapshot' | null;

// The server's stateless messages: {"type":"store-failed" | "stored" |
// "deleted" | "snapshot"}. A snapshot message also names the snapshot, which
// the views read again from the API anyway.
export function readStateless(payload: string): StatelessEvent {
  try {
    const type = (JSON.parse(payload) as { type?: unknown }).type;
    return type === 'store-failed' || type === 'stored' || type === 'deleted' || type === 'snapshot' ? type : null;
  } catch {
    return null;
  }
}

export const stateLabels: Record<SyncState, string> = {
  'signed-out': 'Sign in to sync',
  'not-saved': 'Not saved',
  reconnecting: 'Reconnecting…',
  local: 'On this device only',
  syncing: 'Syncing…',
  synced: 'Synced',
};
