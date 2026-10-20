import { DesktopSyncStrip, DeviceStatus } from './SyncStates.js';

// The desktop's parts of the shell's frame: the strips under the top bar and
// the status bar's items before the sync text.

export function DesktopStrips() {
  return <DesktopSyncStrip />;
}

export function DesktopStatusItems() {
  return <DeviceStatus />;
}
