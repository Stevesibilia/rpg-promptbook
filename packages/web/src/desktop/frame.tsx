import { DesktopSyncStrip, DeviceStatus } from './SyncStates.js';
import { UpdateStatus, UpdateStrip } from './Updates.js';

// The desktop's parts of the shell's frame: the strips under the top bar and
// the status bar's items before the sync text.

export function DesktopStrips() {
  return (
    <>
      <DesktopSyncStrip />
      <UpdateStrip />
    </>
  );
}

export function DesktopStatusItems() {
  return (
    <>
      <DeviceStatus />
      <UpdateStatus />
    </>
  );
}
