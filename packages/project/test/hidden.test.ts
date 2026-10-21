import type { Point, Problem } from 'promptbook-format';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  hideProblem,
  isActive,
  nextExpiry,
  partitionProblems,
  problemKey,
  putHidden,
  readHidden,
  restoreAll,
  restoreProblem,
  SNOOZE_MS,
  type HiddenEntry,
} from '../src/index.js';
import { project, replica, sync } from './helpers.js';

const NOW = new Date('2026-10-21T10:00:00.000Z');
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

function point(text: string, offset: number): Point {
  const before = text.slice(0, offset);
  return { offset, line: before.split('\n').length, column: offset - (before.lastIndexOf('\n') + 1) + 1 };
}

// A problem covering the first `needle` found at or after `from`.
function problem(text: string, needle: string, over: Partial<Problem> = {}, from = 0): Problem {
  const start = text.indexOf(needle, from);
  if (start < 0) throw new Error(`no «${needle}»`);
  return {
    code: 'style.dash',
    severity: 'warning',
    message: 'm',
    range: { start: point(text, start), end: point(text, start + needle.length) },
    sceneId: 'S1',
    ...over,
  };
}

const TEXT = '### S1. Uno\n\nIl ballo — 3 e il resto.\nUn altro — dash qui.\n';
const entry = (over: Partial<HiddenEntry> = {}): HiddenEntry => ({
  code: 'style.dash',
  sceneId: 'S1',
  how: 'dismissed',
  until: null,
  at: at(0),
  ...over,
});

describe('problemKey', () => {
  it('has the code, the scene and an 8-digit hash', () => {
    expect(problemKey(problem(TEXT, '—'), TEXT)).toMatch(/^style\.dash\|S1\|[0-9a-f]{8}$/);
  });

  it('is stable when text is added above and below', () => {
    const p = problem(TEXT, '—');
    const longer = `# Titolo\n\nUna riga in più\n${TEXT}\nCoda\n`;
    expect(problemKey(problem(longer, '—', { sceneId: 'S1' }), longer)).toBe(problemKey(p, TEXT));
  });

  it('changes when the flagged line is rewritten', () => {
    const edited = TEXT.replace('Il ballo', 'La danza');
    expect(problemKey(problem(edited, '—'), edited)).not.toBe(problemKey(problem(TEXT, '—'), TEXT));
  });

  it('tells two dashes on different lines apart', () => {
    const a = problem(TEXT, '—');
    const b = problem(TEXT, '—', {}, TEXT.indexOf('—') + 1);
    expect(problemKey(a, TEXT)).not.toBe(problemKey(b, TEXT));
  });

  it('ignores whitespace changes inside the line', () => {
    const spaced = TEXT.replace('Il ballo — 3', '  Il   ballo \t— 3 ');
    expect(problemKey(problem(spaced, '—'), spaced)).toBe(problemKey(problem(TEXT, '—'), TEXT));
  });

  it('works with no sceneId', () => {
    const { sceneId: _scene, ...p } = problem(TEXT, '—');
    expect(problemKey(p, TEXT)).toMatch(/^style\.dash\|\|[0-9a-f]{8}$/);
  });

  it('covers every line of a multi-line range', () => {
    const p = problem(TEXT, 'Il ballo — 3 e il resto.\nUn altro');
    const key = problemKey(p, TEXT);
    const edited = TEXT.replace('dash qui', 'altro');
    expect(problemKey(problem(edited, 'Il ballo — 3 e il resto.\nUn altro'), edited)).not.toBe(key);
  });

  it('reads the first line of a problem at offset 0', () => {
    const text = 'Prima riga\nSeconda\n';
    expect(problemKey(problem(text, 'Prima'), text)).not.toBe(problemKey(problem(text, 'Seconda'), text));
  });

  it('copes with CRLF and offsets beyond the text', () => {
    const crlf = TEXT.replace(/\n/g, '\r\n');
    expect(problemKey(problem(crlf, '—'), crlf)).toBe(problemKey(problem(TEXT, '—'), TEXT));
    const p = problem(TEXT, '—');
    p.range.end.offset = TEXT.length + 50;
    expect(() => problemKey(p, TEXT)).not.toThrow();
  });
});

describe('hiding', () => {
  it('hides, reads back and restores', () => {
    const doc = project();
    const p = problem(TEXT, '—');
    const { key, previous } = hideProblem(doc, p, TEXT, 'dismissed', null, NOW);
    expect(previous).toBeNull();
    expect(readHidden(doc).get(key)).toEqual(entry());
    expect(restoreProblem(doc, key, NOW)).toEqual(entry());
    expect(readHidden(doc).size).toBe(0);
    expect(restoreProblem(doc, key, NOW)).toBeNull();
  });

  it('keeps the other dash shown', () => {
    const doc = project();
    const a = problem(TEXT, '—');
    const b = problem(TEXT, '—', {}, TEXT.indexOf('—') + 1);
    hideProblem(doc, a, TEXT, 'dismissed', null, NOW);
    const { shown, hidden } = partitionProblems([a, b], TEXT, readHidden(doc), NOW);
    expect(shown).toEqual([b]);
    expect(hidden.map((h) => h.problem)).toEqual([a]);
    expect(hidden[0]!.key).toBe(problemKey(a, TEXT));
  });

  it('keeps the problems order in both lists', () => {
    const doc = project();
    const ps = [problem(TEXT, 'Uno'), problem(TEXT, '—'), problem(TEXT, '—', {}, TEXT.indexOf('—') + 1)];
    hideProblem(doc, ps[0]!, TEXT, 'dismissed', null, NOW);
    hideProblem(doc, ps[2]!, TEXT, 'dismissed', null, NOW);
    const { shown, hidden } = partitionProblems(ps, TEXT, readHidden(doc), NOW);
    expect(shown).toEqual([ps[1]]);
    expect(hidden.map((h) => h.problem)).toEqual([ps[0], ps[2]]);
  });

  it('answers the entry it replaced', () => {
    const doc = project();
    const p = problem(TEXT, '—');
    hideProblem(doc, p, TEXT, 'snoozed', at(SNOOZE_MS.day), NOW);
    const { previous } = hideProblem(doc, p, TEXT, 'dismissed', null, NOW);
    expect(previous).toMatchObject({ how: 'snoozed', until: at(SNOOZE_MS.day) });
  });

  it('refuses a snooze with no valid end and writes a null until for a dismissal', () => {
    const doc = project();
    const p = problem(TEXT, '—');
    expect(() => hideProblem(doc, p, TEXT, 'snoozed', null, NOW)).toThrow();
    expect(() => hideProblem(doc, p, TEXT, 'snoozed', 'tomorrow', NOW)).toThrow();
    const { key } = hideProblem(doc, p, TEXT, 'dismissed', at(5), NOW);
    expect(readHidden(doc).get(key)!.until).toBeNull();
  });
});

describe('expiry', () => {
  const snoozed = entry({ how: 'snoozed', until: at(1000) });

  it('is active one millisecond before until and absent at until', () => {
    expect(isActive(snoozed, new Date(NOW.getTime() + 999))).toBe(true);
    expect(isActive(snoozed, new Date(NOW.getTime() + 1000))).toBe(false);
    expect(isActive(entry(), new Date('2099-01-01'))).toBe(true);
  });

  it('puts an expired snooze back among the shown problems', () => {
    const doc = project();
    const p = problem(TEXT, '—');
    hideProblem(doc, p, TEXT, 'snoozed', at(1000), NOW);
    const hidden = readHidden(doc);
    expect(partitionProblems([p], TEXT, hidden, NOW).shown).toEqual([]);
    expect(partitionProblems([p], TEXT, hidden, new Date(at(1000))).shown).toEqual([p]);
  });

  it('every writer deletes expired snoozes, leaving active ones and dismissals', () => {
    const later = new Date(at(2 * SNOOZE_MS.day));
    const write = (run: (doc: Y.Doc) => void) => {
      const doc = project();
      const dash = problem(TEXT, '—');
      const dash2 = problem(TEXT, '—', {}, TEXT.indexOf('—') + 1);
      const uno = problem(TEXT, 'Uno', { code: 'x.y' });
      hideProblem(doc, dash, TEXT, 'snoozed', at(SNOOZE_MS.day), NOW);
      hideProblem(doc, dash2, TEXT, 'snoozed', at(SNOOZE_MS.week), NOW);
      hideProblem(doc, uno, TEXT, 'dismissed', null, NOW);
      run(doc);
      return [...readHidden(doc).values()].map((e) => e.how + ':' + e.until).sort();
    };
    const kept = ['dismissed:null', `snoozed:${at(SNOOZE_MS.week)}`];
    const extra = problem(TEXT, 'altro', { code: 'z.z' });
    expect(write((d) => hideProblem(d, extra, TEXT, 'dismissed', null, later))).toEqual(
      [...kept, 'dismissed:null'].sort(),
    );
    expect(write((d) => restoreProblem(d, 'nothing', later))).toEqual(kept);
    expect(write((d) => restoreAll(d, [], later))).toEqual(kept);
    expect(write((d) => putHidden(d, new Map(), later))).toEqual(kept);
  });

  it('nextExpiry is the earliest active snooze', () => {
    const map = new Map<string, HiddenEntry>([
      ['a', entry({ how: 'snoozed', until: at(SNOOZE_MS.week) })],
      ['b', entry({ how: 'snoozed', until: at(SNOOZE_MS.day) })],
      ['c', entry({ how: 'snoozed', until: at(-1000) })],
      ['d', entry()],
    ]);
    expect(nextExpiry(map, NOW)).toEqual(new Date(at(SNOOZE_MS.day)));
    expect(nextExpiry(new Map([['d', entry()]]), NOW)).toBeNull();
    expect(nextExpiry(new Map(), NOW)).toBeNull();
  });
});

describe('undo', () => {
  it('putHidden writes the previous entry back and deletes a key whose previous was null', () => {
    const doc = project();
    const p = problem(TEXT, '—');
    const q = problem(TEXT, 'Uno', { code: 'x.y' });
    const first = hideProblem(doc, p, TEXT, 'snoozed', at(SNOOZE_MS.day), NOW);
    const second = hideProblem(doc, p, TEXT, 'dismissed', null, NOW);
    const third = hideProblem(doc, q, TEXT, 'dismissed', null, NOW);
    putHidden(
      doc,
      new Map([
        [second.key, second.previous],
        [third.key, third.previous],
      ]),
      NOW,
    );
    const now = readHidden(doc);
    expect([...now.keys()]).toEqual([first.key]);
    expect(now.get(first.key)).toMatchObject({ how: 'snoozed' });
  });

  it('restoreAll answers what it removed, and putHidden brings it back exactly', () => {
    const doc = project();
    const a = hideProblem(doc, problem(TEXT, '—'), TEXT, 'dismissed', null, NOW);
    const b = hideProblem(doc, problem(TEXT, 'Uno', { code: 'x.y' }), TEXT, 'snoozed', at(SNOOZE_MS.week), NOW);
    const before = readHidden(doc);
    const removed = restoreAll(doc, [a.key, b.key, 'missing'], NOW);
    expect(readHidden(doc).size).toBe(0);
    expect([...removed.keys()].sort()).toEqual([a.key, b.key].sort());
    putHidden(doc, removed, NOW);
    expect(readHidden(doc)).toEqual(before);
  });
});

describe('readHidden', () => {
  it('skips every malformed value and reads the good one', () => {
    const doc = project();
    const map = doc.getMap('hiddenProblems');
    const good = entry({ how: 'snoozed', until: at(1000) });
    map.set('good', good);
    const bad: Record<string, unknown> = {
      notObject: 'x',
      nul: null,
      array: [good],
      noCode: { ...good, code: 3 },
      sceneNumber: { ...good, sceneId: 4 },
      sceneMissing: (({ sceneId: _s, ...rest }) => rest)(good),
      unknownHow: { ...good, how: 'forever' },
      snoozeNoUntil: { ...good, until: null },
      snoozeBadUntil: { ...good, until: 'next week' },
      dismissWithUntil: { ...good, how: 'dismissed' },
      badAt: { ...good, at: 'yesterday' },
      noAt: { ...good, at: undefined },
    };
    for (const [k, v] of Object.entries(bad)) map.set(k, v);
    expect([...readHidden(doc).keys()]).toEqual(['good']);
  });

  it('reads an older document as empty', () => {
    expect(readHidden(project()).size).toBe(0);
  });
});

describe('two replicas', () => {
  it('both hiding different problems keep their entries', () => {
    const a = project();
    const b = replica(a);
    const p = hideProblem(a, problem(TEXT, '—'), TEXT, 'dismissed', null, NOW);
    const q = hideProblem(b, problem(TEXT, 'Uno', { code: 'x.y' }), TEXT, 'snoozed', at(SNOOZE_MS.day), NOW);
    sync(a, b);
    for (const doc of [a, b]) expect([...readHidden(doc).keys()].sort()).toEqual([p.key, q.key].sort());
  });

  it('the same key written on both keeps one entry', () => {
    const a = project();
    const b = replica(a);
    const dash = problem(TEXT, '—');
    const { key } = hideProblem(a, dash, TEXT, 'dismissed', null, NOW);
    hideProblem(b, dash, TEXT, 'snoozed', at(SNOOZE_MS.week), NOW);
    sync(a, b);
    expect(readHidden(a).size).toBe(1);
    expect(readHidden(a).get(key)).toEqual(readHidden(b).get(key));
  });

  it('a restore on one side and a hide of another problem on the other both stand', () => {
    const a = project();
    const dash = hideProblem(a, problem(TEXT, '—'), TEXT, 'dismissed', null, NOW);
    const b = replica(a);
    restoreProblem(a, dash.key, NOW);
    const q = hideProblem(b, problem(TEXT, 'Uno', { code: 'x.y' }), TEXT, 'dismissed', null, NOW);
    sync(a, b);
    for (const doc of [a, b]) expect([...readHidden(doc).keys()]).toEqual([q.key]);
  });
});
