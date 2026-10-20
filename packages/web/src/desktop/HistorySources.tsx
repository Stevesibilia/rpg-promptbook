import { Link } from 'react-router';
import type { SnapshotRow } from '../api.js';
import { clockTime } from '../dates.js';
import { useDesktop, useStore } from '../platform/hooks.js';
import { useSync } from '../sync/hooks.js';
import { CloudIcon, LaptopIcon, OfflineIcon } from '../ui/icons.js';

// History on the desktop (desktop.html, desktop-app design decisions 7 and
// 12): the server's snapshots and this device's in one list, with a Source
// column, a filter and an offline line.

export type SourceFilter = 'all' | 'server' | 'device';

export const matchesSource = (s: SnapshotRow, filter: SourceFilter) => filter === 'all' || s.source === filter;

export function SourceTag({ source }: { source: SnapshotRow['source'] }) {
  if (source === 'device') {
    return (
      <span className="src-tag dev">
        <LaptopIcon className="ic" />
        This device
      </span>
    );
  }
  return (
    <span className="src-tag srv">
      <CloudIcon className="ic" />
      Server
    </span>
  );
}

const filters: { key: SourceFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'server', label: 'Server' },
  { key: 'device', label: 'This device' },
];

export function SourceFilterBar({ value, onChange }: { value: SourceFilter; onChange(next: SourceFilter): void }) {
  return (
    <div className="row src-filter">
      <div className="seg" role="radiogroup" aria-label="Source">
        {filters.map((f) => (
          <button
            key={f.key}
            role="radio"
            aria-checked={value === f.key}
            className={value === f.key ? 'on' : ''}
            onClick={() => onChange(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// The server's snapshots as main last fetched them: at the latest when the
// connection went down.
export function OfflineLine() {
  const since = useSync().device?.offlineSince;
  return (
    <div className="info offline-line">
      <OfflineIcon className="ic" />
      Offline. Server snapshots are shown as of {since ? clockTime(new Date(since)) : 'the last sync'}; new ones appear
      when you are back online.
    </div>
  );
}

const deviceRule = {
  hourly: 'every hour while you edit, kept 7 days',
  quarter: 'every 15 minutes while you edit, kept 2 days',
  off: 'off',
};

export function DeviceHint() {
  const mode = useStore(useDesktop().info).localSnapshots;
  return (
    <p className="hint">
      Server: Claude's snapshots are kept 30 days, yours until you delete them. This device: {deviceRule[mode]} (
      <Link to="/settings/device">Settings → This device</Link>).
    </p>
  );
}
