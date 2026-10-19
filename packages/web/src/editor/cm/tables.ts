import { syntaxTree } from '@codemirror/language';
import { StateField, type EditorState, type Extension, type Range, type Text } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import type { Tree } from '@lezer/common';
import { activeLines, focusedField } from './preview.js';

// Tables in the live preview (design decision 4, Tables): a GFM table is
// drawn as a table while no selection touches its lines, and shown whole as
// source while one does. Cell text is never read as HTML: bold and italic
// are the only formatting, everything else stays plain text.

export interface Segment {
  text: string;
  bold: boolean;
  italic: boolean;
}

export interface Cell {
  // Where a click puts the cursor: the start of the cell's text, or inside
  // an empty cell.
  from: number;
  segments: Segment[];
}

export type Align = 'left' | 'center' | 'right' | null;

export interface Table {
  // The start of its first line and the end of its last.
  from: number;
  to: number;
  // Its first and last line numbers.
  first: number;
  last: number;
  source: string;
  align: Align[];
  // The header row first; every row has as many cells as the header.
  rows: Cell[][];
}

// The content of each cell of a row, as GFM splits it: on every pipe not
// escaped by a backslash, without the empty edges before a leading and after
// a trailing pipe. Positions are offsets in `text`.
export function splitRow(text: string): { from: number; to: number }[] {
  const pipes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '|') pipes.push(i);
  }
  const bounds = [-1, ...pipes, text.length];
  const cells: { from: number; to: number }[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const start = bounds[i]! + 1;
    const end = bounds[i + 1]!;
    const raw = text.slice(start, end);
    const edge = i === 0 || i + 2 === bounds.length;
    if (edge && !raw.trim()) continue;
    const lead = raw.length - raw.trimStart().length;
    const content = raw.trim();
    // An empty cell takes the cursor after the space that follows its pipe.
    const from = content ? start + lead : Math.min(start + 1, end);
    cells.push({ from, to: content ? from + content.length : from });
  }
  return cells;
}

function alignOf(text: string): Align[] {
  return splitRow(text).map(({ from, to }) => {
    const spec = text.slice(from, to);
    const left = spec.startsWith(':');
    const right = spec.endsWith(':');
    return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
  });
}

// The cell's text with bold, italic and escapes read from the syntax tree:
// emphasis marks and escaping backslashes are left out, the rest is kept as
// it is written.
export function segmentsOf(state: EditorState, from: number, to: number): Segment[] {
  if (to <= from) return [];
  const bold: [number, number][] = [];
  const italic: [number, number][] = [];
  const hidden = new Set<number>();
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (node.to <= from || node.from >= to) return;
      if (node.name === 'StrongEmphasis') bold.push([node.from, node.to]);
      else if (node.name === 'Emphasis') italic.push([node.from, node.to]);
      else if (node.name === 'EmphasisMark') for (let i = node.from; i < node.to; i++) hidden.add(i);
      else if (node.name === 'Escape') hidden.add(node.from);
    },
  });
  const inside = (spans: [number, number][], pos: number) => spans.some(([a, b]) => pos >= a && pos < b);
  const text = state.sliceDoc(from, to);
  const segments: Segment[] = [];
  for (let pos = from; pos < to; pos++) {
    if (hidden.has(pos)) continue;
    const b = inside(bold, pos);
    const i = inside(italic, pos);
    const last = segments.at(-1);
    if (last && last.bold === b && last.italic === i) last.text += text[pos - from];
    else segments.push({ text: text[pos - from]!, bold: b, italic: i });
  }
  return segments;
}

function tableOf(state: EditorState, nodeFrom: number, nodeTo: number): Table {
  const { doc } = state;
  const firstLine = doc.lineAt(nodeFrom);
  const lastLine = doc.lineAt(nodeTo);
  const align = alignOf(doc.line(firstLine.number + 1).text);
  const rows: Cell[][] = [];
  let width = 0;
  for (let n = firstLine.number; n <= lastLine.number; n++) {
    if (n === firstLine.number + 1) continue;
    const line = doc.line(n);
    const cells = splitRow(line.text).map(({ from, to }) => ({
      from: line.from + from,
      segments: segmentsOf(state, line.from + from, line.from + to),
    }));
    if (n === firstLine.number) width = cells.length;
    // As GFM: missing cells are empty, extra ones are dropped.
    while (cells.length < width) cells.push({ from: line.to, segments: [] });
    rows.push(cells.slice(0, width));
  }
  return {
    from: firstLine.from,
    to: lastLine.to,
    first: firstLine.number,
    last: lastLine.number,
    source: doc.sliceString(firstLine.from, lastLine.to),
    align,
    rows,
  };
}

const cache = new WeakMap<Tree, { doc: Text; tables: Table[] }>();

// The tables at the top level of the document, as far as the syntax tree
// has been parsed. Tables inside quotes and lists stay source.
export function tablesOf(state: EditorState): Table[] {
  const tree = syntaxTree(state);
  const cached = cache.get(tree);
  if (cached && cached.doc === state.doc) return cached.tables;
  const tables: Table[] = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name === 'Table') tables.push(tableOf(state, node.from, node.to));
  }
  cache.set(tree, { doc: state.doc, tables });
  return tables;
}

// Each table, drawn or not: drawn when no selection touches its lines while
// the editor has focus.
export function tableItems(state: EditorState): { table: Table; drawn: boolean }[] {
  const active = activeLines(state);
  return tablesOf(state).map((table) => ({
    table,
    drawn: !active.some(([a, b]) => b >= table.first && a <= table.last),
  }));
}

// Where a click on a cell puts the cursor, in the table starting at `pos`
// in the text as it is now; the table's start when the cell is gone.
export function cellTarget(state: EditorState, pos: number, row: number, column: number): number {
  const table = tablesOf(state).find((t) => t.from <= pos && pos <= t.to);
  if (!table) return Math.min(pos, state.doc.length);
  const cells = table.rows[Math.min(row, table.rows.length - 1)]!;
  return cells[Math.min(column, cells.length - 1)]?.from ?? table.from;
}

// A cell's content as DOM: text nodes, in <strong> and <em> for bold and
// italic. Never markup from the document.
export function fillCell(element: HTMLElement, segments: readonly Segment[]): void {
  const doc = element.ownerDocument;
  for (const segment of segments) {
    let node: Node = doc.createTextNode(segment.text);
    if (segment.italic) {
      const em = doc.createElement('em');
      em.appendChild(node);
      node = em;
    }
    if (segment.bold) {
      const strong = doc.createElement('strong');
      strong.appendChild(node);
      node = strong;
    }
    element.appendChild(node);
  }
}

class TableWidget extends WidgetType {
  constructor(readonly table: Table) {
    super();
  }

  // Typing elsewhere moves the table without redrawing it.
  eq(other: TableWidget) {
    return other.table.source === this.table.source;
  }

  get estimatedHeight() {
    return 12 + this.table.rows.length * 32;
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-table-wrap';
    const table = document.createElement('table');
    table.className = 'cm-table';
    this.table.rows.forEach((cells, r) => {
      const tr = document.createElement('tr');
      cells.forEach((cell, c) => {
        const td = document.createElement(r === 0 ? 'th' : 'td');
        td.dataset.row = String(r);
        td.dataset.col = String(c);
        const align = this.table.align[c];
        if (align) td.style.textAlign = align;
        fillCell(td, cell.segments);
        tr.appendChild(td);
      });
      (r === 0 ? table.createTHead() : (table.tBodies[0] ?? table.createTBody())).appendChild(tr);
    });
    wrap.appendChild(table);
    // A click in a cell puts the cursor in that cell's source, found in the
    // text as it is at the time of the click.
    wrap.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      const cell = (event.target as Element).closest<HTMLElement>('th, td');
      event.preventDefault();
      const at = view.posAtDOM(wrap);
      const pos = cell ? cellTarget(view.state, at, Number(cell.dataset.row), Number(cell.dataset.col)) : at;
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      view.focus();
    });
    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

const sourceLine = Decoration.line({ class: 'cm-table-src' });

function decorationsOf(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const { table, drawn } of tableItems(state)) {
    if (drawn) {
      ranges.push(Decoration.replace({ widget: new TableWidget(table), block: true }).range(table.from, table.to));
      continue;
    }
    for (let n = table.first; n <= table.last; n++) ranges.push(sourceLine.range(state.doc.line(n).from));
  }
  return Decoration.set(ranges, true);
}

// A field, not a view plugin: a drawn table hides line breaks.
const tableField = StateField.define<DecorationSet>({
  create: decorationsOf,
  update(value, tr) {
    const changed =
      tr.docChanged ||
      tr.selection ||
      tr.state.field(focusedField, false) !== tr.startState.field(focusedField, false) ||
      syntaxTree(tr.state) !== syntaxTree(tr.startState);
    return changed ? decorationsOf(tr.state) : value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const tables: Extension = tableField;
