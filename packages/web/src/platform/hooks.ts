import { useSyncExternalStore } from 'react';
import type { Desktop } from './desktop.js';
import { platform } from './index.js';
import type { Store } from './store.js';

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}

// The desktop's state, for the components only the desktop app shows.
export function useDesktop(): Desktop {
  const desktop = platform.desktop;
  if (!desktop) throw new Error('useDesktop outside the desktop app');
  return desktop;
}
