import { useSyncExternalStore } from 'react';
import type { DesktopProjectStatus } from '../platform/bridge.js';
import { platform } from '../platform/index.js';
import { registry } from '../sync/registry.js';

const never = () => () => {};
const none = () => null;

// A project as main's sync sees it on the desktop: on this device or not,
// changes waiting. Null in the browser, which never subscribes.
export function useDeviceProject(id: string): DesktopProjectStatus | null {
  const desktop = platform.kind === 'desktop';
  return useSyncExternalStore(
    desktop ? registry.subscribe : never,
    desktop ? () => registry.getSnapshot().device?.projects.find((p) => p.id === id) ?? null : none,
  );
}

// Offline on the desktop: what only the server can do is disabled.
export function useOffline(): boolean {
  const desktop = platform.kind === 'desktop';
  return useSyncExternalStore(
    desktop ? registry.subscribe : never,
    desktop ? () => registry.getSnapshot().device?.online === false : () => false,
  );
}
