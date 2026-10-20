import type { SnapshotKind, SnapshotRow } from '../api.js';
import { dayOf, snapshotTime } from '../dates.js';

// How History names a snapshot and says how long it is kept (connector specs,
// snapshots). The server keeps the raw label; dates are formatted here.

// The desktop's hourly snapshots have no chip (desktop.html).
export const kindLabels: Record<SnapshotKind, string> = {
  claude: 'Claude',
  user: 'You',
  restore: 'Restore',
  hourly: '',
};
// The mockup's chip classes.
export const kindClasses: Record<SnapshotKind, string> = { claude: 'cl', user: 'you', restore: 'rs', hourly: '' };

const RESTORED = / · (\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))$/;

// A restore snapshot's label is «<restored label> · <ISO date>»: the snapshot
// that was restored, by its label and date. Null for any other label, such as
// the one an undo writes.
export function restoredFrom(label: string): { label: string; at: string } | null {
  const match = RESTORED.exec(label);
  if (!match || Number.isNaN(Date.parse(match[1]!))) return null;
  return { label: label.slice(0, match.index), at: match[1]! };
}

type Row = Pick<SnapshotRow, 'kind' | 'label' | 'createdAt' | 'expiresAt'>;

// The snapshot's line in History: «Before Claude's edit: S3 · Il cordone di
// Donato», «Saved by you: before playtest», «Before restore».
export function snapshotTitle(s: Row): string {
  if (s.kind === 'claude') return `Before Claude's edit: ${s.label}`;
  if (s.kind === 'user') return `Saved by you: ${s.label}`;
  return restoredFrom(s.label) ? 'Before restore' : s.label;
}

// The line under it: how long it is kept, or which snapshot a restore came
// from.
export function snapshotKept(s: Row, now: Date = new Date()): string {
  if (s.kind === 'restore') {
    const from = restoredFrom(s.label);
    if (from) return `made when you restored the snapshot of ${snapshotTime(from.at, now)}`;
  }
  if (!s.expiresAt) return 'kept until you delete it';
  return `kept until ${dayOf(s.expiresAt, now)}`;
}

// «3 412»: thousands set apart with a space, as the mockup writes them.
export const wordCount = (n: number) => String(n).replace(/\B(?=(\d{3})+$)/g, ' ');
