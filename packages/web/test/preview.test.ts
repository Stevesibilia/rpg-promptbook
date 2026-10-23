import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { templates } from 'promptbook-format';
import { describe, expect, it } from 'vitest';
import { markdownWithTables } from '../src/editor/cm/language.js';
import {
  focusedField,
  frontMatterItems,
  frontMatterOf,
  hiddenRanges,
  inlineItems,
  previewConfigOf,
} from '../src/editor/cm/preview.js';

const text = [
  '---',
  'titolo: La casa',
  'sistema: Kulthos',
  'formato: one-shot',
  'durata: 4 ore',
  'autore: Stefano',
  'licenza: CC-BY-4.0',
  '---',
  '',
  '## Scene',
  '',
  '### S1. La casa che cede',
  '',
  '**Luogo e momento:** casa di *Neri*, al porto.',
  '',
  '> [!documento] La lettera di Neri',
  '> Umberto, non sei pazzo.',
  '',
  '> [!ignoto] Altro',
  '> testo',
  '',
].join('\n');

const config = previewConfigOf(templates.avventura, true);

// A state with the cursor at `cursor`, the editor focused or not. The view
// sets the focus through the field; here the field starts with it.
function stateAt(cursor: number, focused: boolean): EditorState {
  return EditorState.create({
    doc: text,
    selection: EditorSelection.cursor(cursor),
    extensions: [markdownWithTables(), focusedField.init(() => focused)],
  });
}

const at = (needle: string, offset = 0) => {
  const index = text.indexOf(needle);
  if (index < 0) throw new Error(`not found: ${needle}`);
  return index + offset;
};

function hidden(state: EditorState) {
  ensureSyntaxTree(state, state.doc.length, 5000);
  const items = [...frontMatterItems(state), ...inlineItems(state, [{ from: 0, to: state.doc.length }], config)];
  return { items, text: hiddenRanges(items).map(({ from, to }) => state.sliceDoc(from, to)) };
}

describe('the live preview', () => {
  it('hides every mark when the editor has no focus', () => {
    const { text: gone } = hidden(stateAt(0, false));
    expect(gone).toEqual([
      'autore: Stefano\nlicenza: CC-BY-4.0',
      '## ',
      '### ',
      '**',
      '**',
      '*',
      '*',
      '> [!documento] La lettera di Neri',
      '> ',
    ]);
  });

  it('shows the heading marks on the line with the cursor', () => {
    const state = stateAt(at('### S1'), true);
    const { text: gone } = hidden(state);
    expect(gone).not.toContain('### ');
    expect(gone).toContain('## ');
  });

  it('shows the bold and italic marks on the line with the cursor, and keeps the field label', () => {
    const state = stateAt(at('**Luogo'), true);
    const { items, text: gone } = hidden(state);
    expect(gone).not.toContain('**');
    expect(gone).not.toContain('*');
    const label = items.find((i) => i.kind === 'mark' && i.className === 'cm-fl');
    expect(label?.kind === 'mark' && state.sliceDoc(label.from, label.to)).toBe('**Luogo e momento:**');
  });

  it('draws a known callout as a box with its label and title', () => {
    const { items } = hidden(stateAt(0, false));
    const header = items.find((i) => i.kind === 'callout');
    expect(header && 'label' in header && header.label).toBe('Documento da consegnare · La lettera di Neri');
    const lines = items.filter((i) => i.kind === 'line' && i.className.startsWith('cm-callout'));
    expect(lines).toHaveLength(2);
    expect(lines[0]!.kind === 'line' && lines[0]!.className).toContain('cm-callout-handout cm-callout-head');
  });

  it('shows the callout source on the line with the cursor', () => {
    const { text: gone } = hidden(stateAt(at('> [!documento]'), true));
    expect(gone).not.toContain('> [!documento] La lettera di Neri');
    expect(gone).toContain('> ');
  });

  it('leaves a callout of an unknown type as a plain quote', () => {
    const { items, text: gone } = hidden(stateAt(0, false));
    expect(gone.some((g) => g.includes('ignoto'))).toBe(false);
    expect(items.filter((i) => i.kind === 'callout')).toHaveLength(1);
  });

  it('folds the front matter past its fourth key, and opens it while the cursor is inside', () => {
    const folded = hidden(stateAt(0, false)).items.find((i) => i.kind === 'fold');
    expect(folded && 'keys' in folded && folded.keys).toBe(2);
    expect(hidden(stateAt(at('durata'), true)).items.some((i) => i.kind === 'fold')).toBe(false);
    // Unfocused, the cursor at the top does not count as being inside.
    expect(hidden(stateAt(at('durata'), false)).items.some((i) => i.kind === 'fold')).toBe(true);
  });

  it('does not fold four keys or fewer, and finds no front matter without a closing fence', () => {
    const short = EditorState.create({ doc: '---\na: 1\nb: 2\n---\n\ntext' });
    expect(frontMatterItems(short).some((i) => i.kind === 'fold')).toBe(false);
    expect(frontMatterOf(EditorState.create({ doc: '---\na: 1\n\n## Scene' }).doc)).toBeNull();
  });

  it('ends the licenza line with «Choose…» while that line shows', () => {
    const licence = (state: EditorState) => frontMatterItems(state).filter((i) => i.kind === 'licence');
    const end = at('licenza: CC-BY-4.0', 'licenza: CC-BY-4.0'.length);
    expect(licence(stateAt(at('durata'), true))).toEqual([{ kind: 'licence', at: end }]);
    // Folded with the rest past the fourth key.
    expect(licence(stateAt(at('### S1'), true))).toEqual([]);
    expect(licence(stateAt(0, false))).toEqual([]);
    // Among the first four keys it never folds.
    const early = EditorState.create({ doc: '---\nlicenza: CC0-1.0\na: 1\nb: 2\nc: 3\nd: 4\n---\n\ntext' });
    expect(frontMatterItems(early).filter((i) => i.kind === 'licence')).toEqual([{ kind: 'licence', at: 20 }]);
    // Not in the body, nor without a front matter.
    const body = EditorState.create({ doc: '---\na: 1\n---\n\nlicenza: CC0-1.0' });
    expect(frontMatterItems(body).some((i) => i.kind === 'licence')).toBe(false);
    expect(frontMatterItems(EditorState.create({ doc: 'licenza: CC0-1.0\n' }))).toEqual([]);
  });

  it('hides nothing more for «Choose…»', () => {
    const state = stateAt(at('durata'), true);
    const items = frontMatterItems(state);
    expect(hiddenRanges(items)).toEqual(hiddenRanges(items.filter((i) => i.kind !== 'licence')));
    expect(items.some((i) => i.kind === 'licence')).toBe(true);
  });

  it('never changes the text', () => {
    const state = stateAt(0, false);
    hidden(state);
    expect(state.doc.toString()).toBe(text);
  });
});
