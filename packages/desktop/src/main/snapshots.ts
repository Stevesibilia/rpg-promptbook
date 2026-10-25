import { randomUUID } from 'node:crypto';
import { parseAdventure, type Template } from 'promptbook-format';
import { countWords, readDocument, readMeta, templateOf } from 'promptbook-project';
import type { LocalSnapshotsMode } from 'promptbook-web/src/platform/bridge.js';
import type { LocalSnapshotKind, LocalSnapshotRecord, Store } from './store.js';
import { cachedTemplates } from './templates.js';
import type { SyncEngine } from './sync.js';

// Snapshots of the prep document taken on this device (desktop-app design
// decision 12): every hour while editing, kept 7 days, or every 15 minutes,
// kept 2 days, or off, by kv['local_snapshots']. A timer per project takes
// one only when the text changed since that project's last local snapshot.
// A user snapshot saved offline is kept until deleted, a restore snapshot 30
// days. Expired rows go at start and every 24 hours.

const MINUTE = 60_000;
const DAY = 86_400_000;

export const MODES: Record<LocalSnapshotsMode, { everyMs: number; keepMs: number; label: string } | null> = {
  hourly: { everyMs: 60 * MINUTE, keepMs: 7 * DAY, label: 'Hourly, while editing' },
  quarter: { everyMs: 15 * MINUTE, keepMs: 2 * DAY, label: 'Every 15 minutes, while editing' },
  off: null,
};
export const RESTORE_KEEP_MS = 30 * DAY;
export const EXPIRY_EVERY_MS = DAY;
const KEY = 'local_snapshots';
const LABEL_MAX = 200;

export const isMode = (v: unknown): v is LocalSnapshotsMode => v === 'hourly' || v === 'quarter' || v === 'off';

// Words as the server counts them: after the front matter for an adventure
// or a one-shot, read with the project's template, the whole text for a
// campaign.
export function documentWords(text: string, template: Template): number {
  if (template.kind === 'campaign') return countWords(text);
  const { model } = parseAdventure(text, { template });
  return countWords(model.meta.range ? text.slice(model.meta.range.end.offset) : text);
}

// When a local snapshot goes: an hourly one by the setting it was taken
// under, which its label names; a restore after 30 days; a user one never.
export function expiresAt(s: Pick<LocalSnapshotRecord, 'kind' | 'label' | 'createdAt'>): number | null {
  if (s.kind === 'user') return null;
  if (s.kind === 'restore') return s.createdAt + RESTORE_KEEP_MS;
  const keep = s.label === MODES.quarter!.label ? MODES.quarter!.keepMs : MODES.hourly!.keepMs;
  return s.createdAt + keep;
}

export interface LocalSnapshotsOptions {
  store: Store;
  engine: SyncEngine;
  now?: () => number;
  // A shorter interval for the tests (PROMPTBOOK_E2E only).
  intervalMs?: number;
  // A snapshot was taken: the windows with the project open read History
  // again, as for the server's own.
  taken?: (record: LocalSnapshotRecord) => void;
}

export class LocalSnapshots {
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  // The text each project's last local snapshot holds, or had at start.
  private last = new Map<string, string>();
  private expiry: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;

  constructor(private readonly options: LocalSnapshotsOptions) {
    this.now = options.now ?? Date.now;
  }

  get mode(): LocalSnapshotsMode {
    const value = this.options.store.getKv(KEY);
    return isMode(value) ? value : 'hourly';
  }

  setMode(mode: LocalSnapshotsMode): void {
    this.options.store.setKv(KEY, mode);
    this.restart();
  }

  start(): void {
    this.expire();
    this.expiry = setInterval(() => this.expire(), EXPIRY_EVERY_MS);
    this.restart();
  }

  // Timers for every project the engine holds, at the setting's interval.
  restart(): void {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
    for (const id of this.options.engine.ids()) this.track(id);
  }

  // A project the engine started holding.
  track(id: string): void {
    const mode = MODES[this.mode];
    if (!mode || this.timers.has(id)) return;
    this.baseline(id);
    const timer = setInterval(() => this.tick(id), this.options.intervalMs ?? mode.everyMs);
    this.timers.set(id, timer);
  }

  // Where editing starts: the project's last local snapshot, or its text
  // when it is first on this device. Called again once it is downloaded.
  baseline(id: string): void {
    if (this.last.has(id)) return;
    const doc = this.options.engine.doc(id);
    const text =
      this.options.store.latestSnapshotText(id) ??
      (doc && this.options.engine.isDownloaded(id) ? readDocument(doc) : null);
    if (text !== null) this.last.set(id, text);
  }

  untrack(id: string): void {
    const timer = this.timers.get(id);
    if (timer) clearInterval(timer);
    this.timers.delete(id);
    this.last.delete(id);
  }

  // One timer's turn: a snapshot when the text changed since the last one.
  tick(id: string): LocalSnapshotRecord | null {
    const mode = MODES[this.mode];
    const doc = this.options.engine.doc(id);
    if (!mode || !doc || !this.options.engine.isDownloaded(id)) return null;
    const text = readDocument(doc);
    const last = this.last.get(id);
    if (last === undefined) {
      // Missed its download: this text is where editing starts.
      this.last.set(id, text);
      return null;
    }
    if (text === last) return null;
    return this.take(id, 'hourly', mode.label, text);
  }

  // A snapshot of the text as it is now: the user's own while offline, or
  // the one a local restore keeps first.
  take(id: string, kind: LocalSnapshotKind, label: string, text?: string): LocalSnapshotRecord | null {
    const doc = this.options.engine.doc(id);
    if (!doc) return null;
    const body = text ?? readDocument(doc);
    const record: LocalSnapshotRecord = {
      id: randomUUID(),
      projectId: id,
      createdAt: this.now(),
      kind,
      label: cutLabel(label),
      text: body,
      words: documentWords(body, templateOf(readMeta(doc), cachedTemplates(this.options.store))),
    };
    this.options.store.insertSnapshot(record);
    this.last.set(id, body);
    this.options.taken?.(record);
    return record;
  }

  // Removes the expired rows. Answers how many went.
  expire(): number {
    const now = this.now();
    const expired = this.options.store
      .allSnapshots()
      .filter((s) => {
        const at = expiresAt(s);
        return at !== null && at <= now;
      })
      .map((s) => s.id);
    this.options.store.deleteSnapshots(expired);
    return expired.length;
  }

  stop(): void {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
    if (this.expiry) clearInterval(this.expiry);
    this.expiry = null;
  }
}

// At most LABEL_MAX UTF-16 units, never half a surrogate pair.
function cutLabel(label: string): string {
  if (label.length <= LABEL_MAX) return label;
  const code = label.charCodeAt(LABEL_MAX - 1);
  return label.slice(0, code >= 0xd800 && code <= 0xdbff ? LABEL_MAX - 1 : LABEL_MAX);
}
