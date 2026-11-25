import { useSyncExternalStore } from 'react';
import type { Desktop } from './desktop.js';
import { platform } from './index.js';
import type { Store } from './store.js';

// The store's value now; a static render (the board's tests) reads it too.
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

// The desktop's state, for the components only the desktop app shows.
export function useDesktop(): Desktop {
  const desktop = platform.desktop;
  if (!desktop) throw new Error('useDesktop outside the desktop app');
  return desktop;
}
