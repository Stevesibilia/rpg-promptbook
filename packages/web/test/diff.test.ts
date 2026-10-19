import { describe, expect, it } from 'vitest';
import { diffRows } from '../src/history/diff.js';

const lines = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `riga ${i + from}`);

describe('diffRows', () => {
  it('gives no rows for the same text', () => {
    expect(diffRows('a\nb\n', 'a\nb\n')).toEqual({ rows: [], added: 0, removed: 0 });
  });

  it('counts added and removed lines, with three lines of context and line numbers', () => {
    const before = [
      '## Scene',
      '### S3. Il cordone di Donato',
      ...lines(8),
      'Donato non lascia passare nessuno.',
      ...lines(8, 9),
    ].join('\n');
    const after = before
      .replace('Donato non lascia passare nessuno.', 'Donato ascolta chi ha visto Salvi.')
      .replace('riga 2\n', 'riga 2\n> [!leggi]\n> I soldati.\n\n');
    const diff = diffRows(before, after);
    expect(diff.added).toBe(4);
    expect(diff.removed).toBe(1);
    const changed = diff.rows.filter((r) => r.kind === 'add' || r.kind === 'del');
    expect(changed).toEqual([
      { kind: 'add', old: null, new: 5, text: '> [!leggi]' },
      { kind: 'add', old: null, new: 6, text: '> I soldati.' },
      { kind: 'add', old: null, new: 7, text: '' },
      { kind: 'del', old: 11, new: null, text: 'Donato non lascia passare nessuno.' },
      { kind: 'add', old: null, new: 14, text: 'Donato ascolta chi ha visto Salvi.' },
    ]);
    // Context lines carry both numbers.
    expect(diff.rows[1]).toEqual({ kind: 'context', old: 2, new: 2, text: '### S3. Il cordone di Donato' });
  });

  it('starts each hunk with the heading it falls under', () => {
    const before = ['# Titolo', '## Scene', '### S1. La casa', ...lines(20), '### S2. Salvi', ...lines(10, 21)].join(
      '\n',
    );
    const after = before.replace('riga 25', 'riga venticinque').replace('riga 3\n', 'riga tre\n');
    const gaps = diffRows(before, after).rows.filter((r) => r.kind === 'gap');
    expect(gaps).toEqual([
      { kind: 'gap', text: '@@ S1. La casa @@' },
      { kind: 'gap', text: '@@ S2. Salvi @@' },
    ]);
  });

  it('names the line when no heading comes before', () => {
    expect(diffRows('uno\ndue', 'uno\ntre').rows[0]).toEqual({ kind: 'gap', text: '@@ line 1 @@' });
  });

  it('numbers the lines of a text that was empty, and of one emptied', () => {
    expect(diffRows('', 'uno\ndue\n')).toEqual({
      rows: [
        { kind: 'gap', text: '@@ line 1 @@' },
        { kind: 'add', old: null, new: 1, text: 'uno' },
        { kind: 'add', old: null, new: 2, text: 'due' },
      ],
      added: 2,
      removed: 0,
    });
    expect(diffRows('uno\ndue\n', '').rows.slice(1)).toEqual([
      { kind: 'del', old: 1, new: null, text: 'uno' },
      { kind: 'del', old: 2, new: null, text: 'due' },
    ]);
  });
});
