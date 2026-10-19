import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { markdownWithTables } from '../src/editor/cm/language.js';
import { focusedField } from '../src/editor/cm/preview.js';
import { cellTarget, fillCell, segmentsOf, splitRow, tableItems, tablesOf } from '../src/editor/cm/tables.js';

const text = [
  '## Mappa',
  '',
  '| #   | Scena            | Note          |',
  '| --- | :--------------: | ------------: |',
  '| S1  | La **casa** cede | *piove* \\| forte |',
  '| S2  |                  | <b>x</b> & y  |',
  '| S3  | corta',
  '',
  'Dopo la tabella.',
  '',
].join('\n');

const at = (needle: string, offset = 0) => {
  const index = text.indexOf(needle);
  if (index < 0) throw new Error(`not found: ${needle}`);
  return index + offset;
};

function stateAt(cursor: number, focused = true): EditorState {
  const state = EditorState.create({
    doc: text,
    selection: EditorSelection.cursor(cursor),
    extensions: [markdownWithTables(), focusedField.init(() => focused)],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return state;
}

const plain = (segments: { text: string; bold: boolean; italic: boolean }[]) =>
  segments.map((s) => (s.bold ? `[b:${s.text}]` : s.italic ? `[i:${s.text}]` : s.text)).join('');

describe('splitRow', () => {
  it('splits on pipes not escaped, without the empty edges', () => {
    const row = '| a | b \\| c |  |';
    expect(splitRow(row).map(({ from, to }) => row.slice(from, to))).toEqual(['a', 'b \\| c', '']);
    expect(splitRow('a | b').map(({ from, to }) => 'a | b'.slice(from, to))).toEqual(['a', 'b']);
  });

  it('puts an empty cell after the space that follows its pipe', () => {
    expect(splitRow('| a |   |')[1]).toEqual({ from: 6, to: 6 });
  });
});

describe('the tables', () => {
  it('reads the header, the rows padded to its width, and the alignment', () => {
    const [table] = tablesOf(stateAt(0));
    expect(table!.first).toBe(3);
    expect(table!.last).toBe(7);
    expect(table!.align).toEqual([null, 'center', 'right']);
    expect(table!.rows.map((cells) => cells.map((c) => plain(c.segments)))).toEqual([
      ['#', 'Scena', 'Note'],
      ['S1', 'La [b:casa] cede', '[i:piove] | forte'],
      ['S2', '', '<b>x</b> & y'],
      ['S3', 'corta', ''],
    ]);
  });

  it('is drawn while no selection touches its lines, and source while one does', () => {
    expect(tableItems(stateAt(at('Dopo'))).map((t) => t.drawn)).toEqual([true]);
    expect(tableItems(stateAt(at('| S2'))).map((t) => t.drawn)).toEqual([false]);
    expect(tableItems(stateAt(at('| ---'))).map((t) => t.drawn)).toEqual([false]);
    // A selection from above into the table touches it.
    const across = EditorState.create({
      doc: text,
      selection: EditorSelection.range(0, at('| S1')),
      extensions: [markdownWithTables(), focusedField.init(() => true)],
    });
    expect(tableItems(across).map((t) => t.drawn)).toEqual([false]);
    // Without focus every table is drawn.
    expect(tableItems(stateAt(at('| S2'), false)).map((t) => t.drawn)).toEqual([true]);
  });

  it('maps a click on a cell to the start of its text in the source', () => {
    const state = stateAt(at('Dopo'));
    const { from } = tablesOf(state)[0]!;
    expect(state.sliceDoc(cellTarget(state, from, 1, 1), cellTarget(state, from, 1, 1) + 4)).toBe('La *');
    expect(cellTarget(state, from, 0, 2)).toBe(at('Note'));
    // An empty cell: after the space following its pipe.
    expect(cellTarget(state, from, 2, 1)).toBe(at('| S2  |', 8));
    // A missing cell: the end of its line.
    expect(cellTarget(state, from, 4, 2)).toBe(at('corta', 5));
  });

  it('maps a click on a table that changed to a cell that still exists', () => {
    const state = stateAt(at('Dopo'));
    const { from } = tablesOf(state)[0]!;
    expect(cellTarget(state, from, 9, 9)).toBe(at('corta', 5));
    expect(cellTarget(state, at('Dopo'), 1, 1)).toBe(at('Dopo'));
  });

  it('never reads cell text as HTML', () => {
    const state = stateAt(0);
    const cell = tablesOf(state)[0]!.rows[2]![2]!;
    expect(cell.segments).toEqual([{ text: '<b>x</b> & y', bold: false, italic: false }]);
    // The DOM gets text nodes only.
    const made: string[] = [];
    const fakeDoc = {
      createTextNode: (data: string) => (made.push(`text:${data}`), { data }),
      createElement: (tag: string) => (made.push(`el:${tag}`), { appendChild() {} }),
    };
    const element = {
      ownerDocument: fakeDoc,
      appendChild() {},
      set innerHTML(_: string) {
        throw new Error('innerHTML used');
      },
    } as unknown as HTMLElement;
    fillCell(element, cell.segments);
    fillCell(element, tablesOf(state)[0]!.rows[1]![1]!.segments);
    expect(made).toEqual(['text:<b>x</b> & y', 'text:La ', 'text:casa', 'el:strong', 'text: cede']);
  });

  it('keeps bold and italic only', () => {
    const doc = '| a |\n| - |\n| ***both*** `code` [link](x) |\n';
    const state = EditorState.create({ doc, extensions: [markdownWithTables()] });
    ensureSyntaxTree(state, doc.length, 5000);
    const cell = tablesOf(state)[0]!.rows[1]![0]!;
    expect(cell.segments.map((s) => [s.text, s.bold, s.italic])).toEqual([
      ['both', true, true],
      [' `code` [link](x)', false, false],
    ]);
    expect(segmentsOf(state, 0, 0)).toEqual([]);
  });
});
