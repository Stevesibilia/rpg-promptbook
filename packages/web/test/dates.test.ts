import { describe, expect, it } from 'vitest';
import { purgeDate, relativeTime, shortDate } from '../src/dates.js';

const now = new Date(2026, 9, 19, 15, 0);
const at = (...args: [number, number, number, number, number]) => new Date(...args).toISOString();

describe('relativeTime', () => {
  it('says how long ago, then the day', () => {
    expect(relativeTime(at(2026, 9, 19, 15, 0), now)).toBe('just now');
    expect(relativeTime(at(2026, 9, 19, 14, 59), now)).toBe('1 min ago');
    expect(relativeTime(at(2026, 9, 19, 14, 40), now)).toBe('20 min ago');
    expect(relativeTime(at(2026, 9, 19, 13, 0), now)).toBe('2 h ago');
    expect(relativeTime(at(2026, 9, 19, 8, 40), now)).toBe('today 08:40');
    expect(relativeTime(at(2026, 9, 18, 22, 0), now)).toBe('yesterday');
    expect(relativeTime(at(2026, 9, 16, 9, 0), now)).toBe('3 days ago');
    expect(relativeTime(at(2026, 7, 9, 9, 0), now)).toBe('9 Aug');
    expect(relativeTime(at(2025, 0, 9, 9, 0), now)).toBe('Jan 2025');
  });
});

describe('shortDate and purgeDate', () => {
  it('formats a due date and the day the bin removes a project', () => {
    expect(shortDate('2026-10-24')).toBe('24 Oct');
    expect(purgeDate(at(2026, 9, 1, 12, 0))).toBe('31 Oct 2026');
  });
});
