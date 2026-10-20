import { clockTime } from '../dates.js';
import type { DesktopProjectStatus } from '../platform/bridge.js';
import { useSync } from '../sync/hooks.js';
import { CheckIcon, DownIcon, UpIcon } from '../ui/icons.js';
import { changes } from './words.js';

// Where a project stands on this computer (projects.html's desktop parts):
// the list's last column and the panel's line.

export function DeviceCell({ device }: { device: DesktopProjectStatus }) {
  if (!device.downloaded) {
    return (
      <span className="dev dl" title="Not on this device yet">
        <DownIcon className="ic" />
      </span>
    );
  }
  const waiting = Math.max(device.unsynced, device.notSaved);
  if (waiting > 0 || device.localOnly) {
    return (
      <span className="dev up" title={`${changes(Math.max(waiting, 1))} waiting to sync`}>
        <UpIcon className="ic" />
      </span>
    );
  }
  return (
    <span className="dev" title="On this device, synced">
      <CheckIcon className="ic" />
    </span>
  );
}

export function DeviceLine({ device }: { device: DesktopProjectStatus }) {
  const { lastSync } = useSync();
  const waiting = Math.max(device.unsynced, device.notSaved, device.localOnly ? 1 : 0);
  return (
    <div className="ondev">
      <CheckIcon className="ic" />
      {waiting > 0
        ? `On this device · ${changes(waiting)} waiting`
        : `On this device · synced${lastSync && device.synced ? ` ${clockTime(lastSync)}` : ''}`}
    </div>
  );
}
