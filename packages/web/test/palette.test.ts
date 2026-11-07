import { describe, expect, it } from 'vitest';
import sabaoth from '../../format/fixtures/l-ancora-di-sabaoth.converted.md?raw';
import { outlineOf } from '../src/editor/outline.js';
import { filterEntries, fold, matches, paletteEntries, resolveItem } from '../src/editor/palette.js';
import { analysed, campaign } from './analysed.js';
import { characters, withBlock } from './pregenerated.js';

const labels = (query: string, checked = true) =>
  filterEntries(paletteEntries(outlineOf(analysed(sabaoth).state), { checked, printable: true }), query).map((e) => e.label);

describe('the palette filter', () => {
  it('ignores case and accents', () => {
    expect(fold('Verità del Mondo')).toBe('verita del mondo');
    expect(labels('verita')).toEqual(['Go to Verità del mondo']);
    expect(labels('VERITÀ')).toEqual(['Go to Verità del mondo']);
  });

  it('matches words in the order typed', () => {
    expect(matches('Go to S3 Il cordone di Donato', 'cordone donato')).toBe(true);
    expect(matches('Go to S3 Il cordone di Donato', 'donato cordone')).toBe(false);
    expect(labels('cordone')).toEqual(['Go to S3 Il cordone di Donato']);
    expect(labels('go s5')).toEqual(['Go to S5 Capo Peloro, la terza scossa']);
  });

  it('lists the commands first, each with its shortcut, then every outline item', () => {
    const entries = paletteEntries(outlineOf(analysed(sabaoth).state), { checked: true, printable: true });
    expect(entries.slice(0, 14).map((e) => `${e.label}${e.keys ? ` [${e.keys}]` : ''}`)).toEqual([
      'Toggle outline [Mod-1]',
      'Toggle inspector [Mod-2]',
      'Focus mode [Mod-.]',
      'Syntax sheet [Mod-/]',
      'Set status: Draft',
      'Set status: In progress',
      'Set status: Complete',
      'Next problem [F8]',
      'Previous problem [Shift-F8]',
      'PDF preview',
      'Review PDF [Mod-Shift-p]',
      'Choose licence…',
      'Back to projects',
      'Go to Front matter',
    ]);
    expect(entries.filter((e) => e.action.kind === 'go')).toHaveLength(outlineOf(analysed(sabaoth).state).length);
  });

  it('lists the Pregenerati block and its characters, and jumps to a character\'s heading', () => {
    const doc = withBlock(characters);
    const { state } = analysed(doc);
    const items = outlineOf(state);
    const entries = paletteEntries(items, { checked: true, printable: true });
    expect(filterEntries(entries, 'go pregenerati').map((e) => e.label)).toEqual(['Go to Pregenerati']);
    const [ada] = filterEntries(entries, 'ada rossi');
    expect(ada!.label).toBe('Go to Ada Rossi');
    expect(ada!.action.kind).toBe('go');
    const target = resolveItem(items, ada!.action as { kind: 'go'; key: string; name: string })!;
    expect(target.key).toBe('character:0');
    expect(state.sliceDoc(target.head, target.head + 14)).toBe('#### Ada Rossi');
  });

  it('leaves out the problems for a campaign and keeps the PDF, with the ids of its ### headings', () => {
    const entries = paletteEntries(outlineOf(campaign('## Uno\n\n### Due\n\n### F1. La Compagnia\n')), {
      checked: false,
      printable: true,
    });
    const shown = entries.map((e) => `${e.label}${e.keys ? ` [${e.keys}]` : ''}`);
    expect(shown).not.toContain('Next problem [F8]');
    expect(shown).not.toContain('Previous problem [Shift-F8]');
    expect(shown.slice(7, 9)).toEqual(['PDF preview', 'Review PDF [Mod-Shift-p]']);
    expect(shown.slice(-3)).toEqual(['Go to Uno', 'Go to Due', 'Go to F1 La Compagnia']);
    expect(paletteEntries([], { checked: false, printable: false }).map((e) => e.label)).not.toContain('PDF preview');
  });

  it('offers Choose licence… just before Back to projects, with no keys, in every project', () => {
    for (const checked of [true, false]) {
      const entries = paletteEntries(outlineOf(campaign('## Uno\n')), { checked, printable: true });
      const at = entries.findIndex((e) => e.label === 'Choose licence…');
      expect(entries[at]).toEqual({ key: 'licence', label: 'Choose licence…', keys: null, action: { kind: 'licence' } });
      expect(entries[at + 1]!.label).toBe('Back to projects');
    }
  });

  it('finds an item again by its key and name, or by its name alone', () => {
    const items = outlineOf(analysed(sabaoth).state);
    const s3 = items.find((i) => i.id === 'S3')!;
    expect(resolveItem(items, { kind: 'go', key: s3.key, name: s3.name })).toBe(s3);
    expect(resolveItem(items, { kind: 'go', key: 'scene:9', name: s3.name })).toBe(s3);
    expect(resolveItem(items, { kind: 'go', key: s3.key, name: 'Gone' })).toBeNull();
  });
});
