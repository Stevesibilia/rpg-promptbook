import type { Heading, Paragraph } from 'mdast';
import type { ColumnMark } from '../model.js';
import { columnOfWord } from '../template/placement.js';
import type { BlockContext } from './blocks.js';
import { plainText } from './source.js';

// A column mark is one word of letters in braces, with optional spaces inside:
// `{laterale}`, `{ Principale }`. It is read at the end of a ## heading and
// right after a bold label alone in its paragraph (design decision A1 of
// template-placement); anywhere else the braces are text. A brace escaped
// with a backslash is never a mark.
const AT_END = /(?<!\\)\{[ \t]*(\p{L}+)[ \t]*\}$/u;
const IN_TITLE = /[ \t]*\{[ \t]*\p{L}+[ \t]*\}$/u;
const AFTER_LABEL = /^[ \t]*((?<!\\)\{[ \t]*(\p{L}+)[ \t]*\})[ \t]*$/u;

function columnMarkAt(ctx: BlockContext, start: number, end: number, word: string): ColumnMark {
  const trimmed = word.trim();
  return { word: trimmed, column: columnOfWord(trimmed), range: ctx.source.range(start, end) };
}

// A ## heading's text without its mark, and the mark. The heading keeps its
// mark when nothing but the mark is in it.
export function headingMark(ctx: BlockContext, heading: Heading): { title: string; mark: ColumnMark | null } {
  const { source } = ctx;
  const title = plainText(heading).trim();
  const last = heading.children.at(-1);
  if (!last || last.type !== 'text') return { title, mark: null };
  const from = source.start(last);
  const end = source.end(last);
  const match = AT_END.exec(source.text.slice(from, end));
  const stripped = title.replace(IN_TITLE, '').trim();
  if (!match || stripped === title || !stripped) return { title, mark: null };
  return { title: stripped, mark: columnMarkAt(ctx, from + match.index, end, match[1]!) };
}

// The mark after a bold label that opens the paragraph, has no colon and is
// followed by nothing but the mark; null for every other paragraph.
export function labelMark(
  ctx: BlockContext,
  node: Paragraph,
  label: { colon: boolean; end: number },
): ColumnMark | null {
  if (label.colon) return null;
  const { source } = ctx;
  const match = AFTER_LABEL.exec(source.text.slice(label.end, source.end(node)));
  if (!match) return null;
  const start = label.end + match.index + match[0].indexOf(match[1]!);
  return columnMarkAt(ctx, start, start + match[1]!.length, match[2]!);
}
