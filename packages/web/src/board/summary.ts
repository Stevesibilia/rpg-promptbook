import { halfStatuses, type BoardRow, type HalfStatus } from 'promptbook-project';

// The board's summary line and filters (asset-board specs, status per half):
// counts per half and state, and the rows each filter keeps.

export const filters = ['all', ...halfStatuses] as const;
export type Filter = (typeof filters)[number];

export const filterLabels: Record<Filter, string> = {
  all: 'All',
  wanted: 'Wanted',
  received: 'Received',
  chosen: 'Chosen',
};

export const statusLabels: Record<HalfStatus, string> = {
  wanted: 'Wanted',
  received: 'Received',
  chosen: 'Chosen',
};

export type HalfCounts = Record<HalfStatus, number>;

export interface Summary {
  scenes: number;
  images: HalfCounts;
  music: HalfCounts;
}

const none = (): HalfCounts => ({ wanted: 0, received: 0, chosen: 0 });

type StatusRow = Pick<BoardRow, 'imageStatus' | 'musicStatus'>;

export function summarize(rows: readonly StatusRow[]): Summary {
  const images = none();
  const music = none();
  for (const row of rows) {
    images[row.imageStatus] += 1;
    music[row.musicStatus] += 1;
  }
  return { scenes: rows.length, images, music };
}

// A filter keeps the rows with at least one half in its state.
export const keeps = (row: StatusRow, filter: Filter): boolean =>
  filter === 'all' || row.imageStatus === filter || row.musicStatus === filter;

// The rows each filter keeps, for the counts beside the filters.
export function filterCounts(rows: readonly StatusRow[]): Record<Filter, number> {
  const counts = { all: 0, wanted: 0, received: 0, chosen: 0 };
  for (const filter of filters) counts[filter] = rows.filter((row) => keeps(row, filter)).length;
  return counts;
}

// The half the filter dims: the one not in its state.
export const dims = (status: HalfStatus, filter: Filter): boolean => filter !== 'all' && status !== filter;

// «S3 · L'ordine di Donato».
export const sceneLabel = (row: Pick<BoardRow, 'sceneId' | 'title'>): string => `${row.sceneId} · ${row.title}`;

// «3:12»; '' when unknown.
export function duration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '';
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

// «2.1 MB», «840 KB».
export function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// A name cut at 40 characters with «…», as the tray's toast shows it.
export const shortName = (name: string): string => (name.length > 40 ? `${name.slice(0, 40)}…` : name);
