import { describe, expect, it } from 'vitest';
import {
  overallState,
  pendingChanges,
  providerState,
  readStateless,
  type ProviderSnapshot,
} from '../src/sync/state.js';

const synced: ProviderSnapshot = {
  id: 'a',
  title: 'A',
  connected: true,
  synced: true,
  unsynced: 0,
  signedOut: false,
  storeFailed: false,
};

describe('providerState', () => {
  it('reads each state from what the provider reports', () => {
    expect(providerState(synced)).toBe('synced');
    expect(providerState({ ...synced, unsynced: 2 })).toBe('syncing');
    expect(providerState({ ...synced, synced: false })).toBe('syncing');
    expect(providerState({ ...synced, connected: false, unsynced: 3 })).toBe('reconnecting');
    expect(providerState({ ...synced, storeFailed: true })).toBe('not-saved');
    expect(providerState({ ...synced, signedOut: true, connected: false })).toBe('signed-out');
  });
});

describe('overallState', () => {
  it('is synced with nothing open', () => {
    expect(overallState([])).toBe('synced');
  });

  it('shows the worst state of the open projects', () => {
    const b = { ...synced, id: 'b' };
    expect(overallState([synced, { ...b, unsynced: 1 }])).toBe('syncing');
    expect(
      overallState([
        { ...synced, storeFailed: true },
        { ...b, connected: false },
      ]),
    ).toBe('not-saved');
    expect(
      overallState([
        { ...synced, storeFailed: true },
        { ...b, signedOut: true },
      ]),
    ).toBe('signed-out');
  });

  it('counts a session ended through the API with no project open', () => {
    expect(overallState([], true)).toBe('signed-out');
  });
});

describe('pendingChanges', () => {
  it('lists the projects with unsent changes', () => {
    expect(
      pendingChanges([
        { ...synced, id: 'a', title: 'Il ballo dei Lorenzetti', connected: false, unsynced: 3 },
        { ...synced, id: 'b' },
      ]),
    ).toEqual([{ id: 'a', title: 'Il ballo dei Lorenzetti', changes: 3 }]);
  });
});

describe('readStateless', () => {
  it('reads the server messages and ignores anything else', () => {
    expect(readStateless('{"type":"store-failed"}')).toBe('store-failed');
    expect(readStateless('{"type":"stored"}')).toBe('stored');
    expect(readStateless('{"type":"deleted"}')).toBe('deleted');
    expect(readStateless('{"type":"other"}')).toBeNull();
    expect(readStateless('nonsense')).toBeNull();
  });
});
