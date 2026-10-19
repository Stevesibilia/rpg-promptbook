import { describe, expect, it } from 'vitest';
import { dateAndTime, dayOf, longDay, snapshotTime } from '../src/dates.js';
import { restoredFrom, snapshotKept, snapshotTitle, wordCount } from '../src/history/labels.js';

const now = new Date(2026, 9, 19, 21, 30);
const at = (...args: [number, number, number, number, number]) => new Date(...args).toISOString();

describe('snapshot dates', () => {
  it('says today, yesterday, the day, or the day and the year', () => {
    expect(snapshotTime(at(2026, 9, 19, 21, 14), now)).toBe('Today 21:14');
    expect(snapshotTime(at(2026, 9, 18, 9, 2), now)).toBe('Yesterday 09:02');
    expect(snapshotTime(at(2026, 9, 17, 22, 40), now)).toBe('17 Oct 22:40');
    expect(snapshotTime(at(2025, 9, 17, 22, 40), now)).toBe('17 Oct 2025 22:40');
    expect(snapshotTime('nonsense', now)).toBe('');
  });

  it('formats days and entries', () => {
    expect(dayOf(at(2026, 10, 18, 21, 14), now)).toBe('18 Nov');
    expect(dayOf(at(2027, 0, 3, 9, 0), now)).toBe('3 Jan 2027');
    expect(dateAndTime(at(2026, 9, 19, 21, 16))).toBe('19 Oct 2026 · 21:16');
    expect(dateAndTime(at(2026, 9, 14, 22, 10), ', ')).toBe('14 Oct 2026, 22:10');
    expect(longDay('2026-10-12')).toBe('12 Oct 2026');
    expect(longDay('12/10/2026')).toBe('');
  });
});

describe('snapshot labels', () => {
  const restored = { label: 'before playtest', at: at(2026, 9, 17, 22, 40) };
  const restore = {
    kind: 'restore' as const,
    label: `${restored.label} · ${restored.at}`,
    createdAt: at(2026, 9, 19, 18, 2),
    expiresAt: at(2026, 10, 18, 18, 2),
  };

  it('reads the restored snapshot out of a restore label', () => {
    expect(restoredFrom(restore.label)).toEqual(restored);
    expect(restoredFrom(`x · ${restored.at} · ${at(2026, 9, 18, 9, 0)}`)).toEqual({
      label: `x · ${restored.at}`,
      at: at(2026, 9, 18, 9, 0),
    });
    expect(restoredFrom("Before undoing Claude's edit of S3 · Il cordone di Donato")).toBeNull();
  });

  it('names each kind as the mockup does', () => {
    const claude = {
      kind: 'claude' as const,
      label: 'S3 · Il cordone di Donato',
      createdAt: '',
      expiresAt: at(2026, 10, 18, 21, 14),
    };
    const user = { kind: 'user' as const, label: 'before playtest', createdAt: '', expiresAt: null };
    expect(snapshotTitle(claude)).toBe("Before Claude's edit: S3 · Il cordone di Donato");
    expect(snapshotKept(claude, now)).toBe('kept until 18 Nov');
    expect(snapshotTitle(user)).toBe('Saved by you: before playtest');
    expect(snapshotKept(user, now)).toBe('kept until you delete it');
    expect(snapshotTitle(restore)).toBe('Before restore');
    expect(snapshotKept(restore, now)).toBe('made when you restored the snapshot of 17 Oct 22:40');
  });

  it('keeps an undo snapshot by its label and its expiry', () => {
    const undo = { ...restore, label: "Before undoing Claude's edit of S3 · Il cordone di Donato" };
    expect(snapshotTitle(undo)).toBe(undo.label);
    expect(snapshotKept(undo, now)).toBe('kept until 18 Nov');
  });

  it('sets thousands apart', () => {
    expect(wordCount(3412)).toBe('3 412');
    expect(wordCount(980)).toBe('980');
    expect(wordCount(1234567)).toBe('1 234 567');
  });
});
