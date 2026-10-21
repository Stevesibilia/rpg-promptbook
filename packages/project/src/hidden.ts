import type { Problem } from 'promptbook-format';
import type * as Y from 'yjs';
import { isIsoDateTime } from './model.js';

// Problems the owner has dismissed or snoozed (hide-problems change, design
// decisions 1 to 4). They live in the project's Y.Doc, in the flat Y.Map
// `hiddenProblems`: keys are a problem's fingerprint, values plain JSON set
// whole, so hides of different problems merge and two writes of one key keep
// the last. Everything here is a pure function of a document, a problem and a
// clock; the checks themselves stay pure functions of the text.

export type HiddenHow = 'dismissed' | 'snoozed';

export interface HiddenEntry {
  // The problem's code.
  code: string;
  // The problem's sceneId; null when the check sets none.
  sceneId: string | null;
  how: HiddenHow;
  // ISO date-time for a snooze, null when dismissed.
  until: string | null;
  // ISO date-time of the hide.
  at: string;
}

export const SNOOZE_MS = { day: 86_400_000, week: 604_800_000 } as const;

const MAP = 'hiddenProblems';

const mapOf = (doc: Y.Doc): Y.Map<unknown> => doc.getMap(MAP);

// FNV-1a, 32 bits, over UTF-16 code units, as 8 lowercase hex digits.
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// The fingerprint of a problem: its code, its scene, and a hash of its message
// and the whole source lines its range covers, whitespace collapsed. The
// message tells apart the problems one check raises on one heading (one per
// missing field). `text` is the text the problem was
// computed for: the range holds offsets into it. The lines are cut by offset,
// not by line number, so no line index is built.
export function problemKey(problem: Problem, text: string): string {
  const clamp = (offset: number) => Math.min(Math.max(offset, 0), text.length);
  const start = clamp(problem.range.start.offset);
  let end = clamp(problem.range.end.offset);
  // A range that ends just after a line break covers that line only.
  if (end > start && text[end - 1] === '\n') end--;
  const from = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
  const to = text.indexOf('\n', end);
  const lines = text.slice(from, to === -1 ? text.length : to);
  return `${problem.code}|${problem.sceneId ?? ''}|${fnv1a(`${problem.message}\n${lines.replace(/\s+/g, ' ').trim()}`)}`;
}

// A value written by another client is not trusted: one that is not a whole
// entry reads as absent.
function parseEntry(value: unknown): HiddenEntry | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.code !== 'string') return null;
  if (v.sceneId !== null && typeof v.sceneId !== 'string') return null;
  if (!isIsoDateTime(v.at)) return null;
  if (v.how === 'dismissed') {
    if (v.until !== null) return null;
    return { code: v.code, sceneId: v.sceneId, how: 'dismissed', until: null, at: v.at };
  }
  if (v.how === 'snoozed') {
    if (!isIsoDateTime(v.until)) return null;
    return { code: v.code, sceneId: v.sceneId, how: 'snoozed', until: v.until, at: v.at };
  }
  return null;
}

export function readHidden(doc: Y.Doc): ReadonlyMap<string, HiddenEntry> {
  const entries = new Map<string, HiddenEntry>();
  mapOf(doc).forEach((value, key) => {
    const entry = parseEntry(value);
    if (entry) entries.set(key, entry);
  });
  return entries;
}

// A dismissal always; a snooze until its end. An expired snooze counts as
// absent.
export function isActive(entry: HiddenEntry, now: Date): boolean {
  if (entry.how === 'dismissed') return true;
  return entry.until !== null && Date.parse(entry.until) > now.getTime();
}

// Housekeeping inside a writer's transaction: expired snoozes are never
// shown, so deleting them is safe. Only those that ended over a day ago go,
// so a device whose clock runs fast does not delete another device's snooze
// that is still running there.
function dropExpired(map: Y.Map<unknown>, now: Date): void {
  const before = now.getTime() - SNOOZE_MS.day;
  for (const [key, value] of [...map.entries()]) {
    const entry = parseEntry(value);
    if (entry?.how === 'snoozed' && Date.parse(entry.until!) <= before) map.delete(key);
  }
}

// What a key held before a write, as Undo puts it back: only an active entry
// counts.
function activeAt(map: Y.Map<unknown>, key: string, now: Date): HiddenEntry | null {
  const entry = parseEntry(map.get(key));
  return entry && isActive(entry, now) ? entry : null;
}

export function hideProblem(
  doc: Y.Doc,
  problem: Problem,
  text: string,
  how: HiddenHow,
  until: string | null,
  now: Date,
): { key: string; previous: HiddenEntry | null } {
  if (how === 'snoozed' && !isIsoDateTime(until)) throw new Error('A snooze needs an ISO date-time to end at.');
  const key = problemKey(problem, text);
  const entry: HiddenEntry = {
    code: problem.code,
    sceneId: problem.sceneId ?? null,
    how,
    until: how === 'snoozed' ? until : null,
    at: now.toISOString(),
  };
  let previous: HiddenEntry | null = null;
  doc.transact(() => {
    const map = mapOf(doc);
    previous = activeAt(map, key, now);
    dropExpired(map, now);
    map.set(key, entry);
  });
  return { key, previous };
}

export function restoreProblem(doc: Y.Doc, key: string, now: Date): HiddenEntry | null {
  let previous: HiddenEntry | null = null;
  doc.transact(() => {
    const map = mapOf(doc);
    previous = activeAt(map, key, now);
    dropExpired(map, now);
    map.delete(key);
  });
  return previous;
}

// The entries it removed, by key, for Undo.
export function restoreAll(doc: Y.Doc, keys: readonly string[], now: Date): Map<string, HiddenEntry> {
  const removed = new Map<string, HiddenEntry>();
  doc.transact(() => {
    const map = mapOf(doc);
    for (const key of keys) {
      const entry = activeAt(map, key, now);
      if (entry) removed.set(key, entry);
    }
    dropExpired(map, now);
    for (const key of keys) map.delete(key);
  });
  return removed;
}

// Undo: writes each key's previous value back, or deletes the key for null.
export function putHidden(doc: Y.Doc, entries: ReadonlyMap<string, HiddenEntry | null>, now: Date): void {
  doc.transact(() => {
    const map = mapOf(doc);
    dropExpired(map, now);
    for (const [key, entry] of entries) {
      if (entry) map.set(key, { ...entry });
      else map.delete(key);
    }
  });
}

export function partitionProblems(
  problems: readonly Problem[],
  text: string,
  hidden: ReadonlyMap<string, HiddenEntry>,
  now: Date,
): {
  shown: Problem[];
  hidden: Array<{ problem: Problem; entry: HiddenEntry; key: string }>;
} {
  const shown: Problem[] = [];
  const out: Array<{ problem: Problem; entry: HiddenEntry; key: string }> = [];
  if (hidden.size === 0) return { shown: [...problems], hidden: out };
  for (const problem of problems) {
    const key = problemKey(problem, text);
    const entry = hidden.get(key);
    if (entry && isActive(entry, now)) out.push({ problem, entry, key });
    else shown.push(problem);
  }
  return { shown, hidden: out };
}

// The earliest end of an active snooze, for the editor's timer.
export function nextExpiry(hidden: ReadonlyMap<string, HiddenEntry>, now: Date): Date | null {
  let soonest: number | null = null;
  for (const entry of hidden.values()) {
    if (entry.how !== 'snoozed' || !isActive(entry, now)) continue;
    const at = Date.parse(entry.until!);
    if (soonest === null || at < soonest) soonest = at;
  }
  return soonest === null ? null : new Date(soonest);
}
