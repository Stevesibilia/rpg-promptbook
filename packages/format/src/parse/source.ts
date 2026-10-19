import type { Nodes } from 'mdast';
import type { Point, Range } from '../model.js';

// The document text with a line index, to turn offsets into points and nodes
// into ranges.
export interface Source {
  text: string;
  point(offset: number): Point;
  range(from: number, to: number): Range;
  nodeRange(node: Nodes): Range;
  slice(node: Nodes): string;
  start(node: Nodes): number;
  end(node: Nodes): number;
}

export function createSource(text: string): Source {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }

  const point = (offset: number): Point => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (lineStarts[mid]! <= offset) low = mid;
      else high = mid - 1;
    }
    return { offset, line: low + 1, column: offset - lineStarts[low]! + 1 };
  };
  const start = (node: Nodes) => node.position?.start.offset ?? 0;
  const end = (node: Nodes) => node.position?.end.offset ?? start(node);
  const range = (from: number, to: number): Range => ({ start: point(from), end: point(to) });

  return {
    text,
    point,
    range,
    nodeRange: (node) => range(start(node), end(node)),
    slice: (node) => text.slice(start(node), end(node)),
    start,
    end,
  };
}

// The plain text of a node, as mdast-util-to-string would give it.
export function plainText(node: Nodes): string {
  if ('value' in node && typeof node.value === 'string' && node.type !== 'html') return node.value;
  if ('children' in node) return node.children.map((child) => plainText(child)).join('');
  if (node.type === 'image' || node.type === 'imageReference') return node.alt ?? '';
  return '';
}

export function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
