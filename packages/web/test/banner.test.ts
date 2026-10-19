import { describe, expect, it } from 'vitest';
import { dismissKey, readDismissed, showBanner } from '../src/claude/banner.js';

const edit = { id: 'b', createdAt: '2026-10-19T19:14:00.000Z' };

describe('the Claude edit banner', () => {
  it('shows the newest Claude snapshot when nothing was dismissed', () => {
    expect(showBanner(edit, null)).toBe(true);
    expect(showBanner(null, null)).toBe(false);
  });

  it('stays hidden for the dismissed snapshot and older ones', () => {
    expect(showBanner(edit, { id: 'b', at: edit.createdAt })).toBe(false);
    expect(showBanner(edit, { id: 'c', at: '2026-10-19T20:00:00.000Z' })).toBe(false);
  });

  it('shows again for a later Claude edit', () => {
    expect(showBanner({ id: 'd', createdAt: '2026-10-19T21:00:00.000Z' }, { id: 'b', at: edit.createdAt })).toBe(true);
  });

  it('shows when the dismissed date cannot be read', () => {
    expect(showBanner(edit, { id: 'a', at: 'later' })).toBe(true);
  });

  it('reads what this device stored, and nothing else', () => {
    expect(dismissKey('p1')).toBe('promptbook.claudeEdit.p1');
    expect(readDismissed('{"id":"b","at":"2026-10-19T19:14:00.000Z"}')).toEqual({ id: 'b', at: edit.createdAt });
    expect(readDismissed(null)).toBeNull();
    expect(readDismissed('not json')).toBeNull();
    expect(readDismissed('{"id":1}')).toBeNull();
    expect(readDismissed('null')).toBeNull();
  });
});
