import type { List, ListItem as MdListItem, Nodes, RootContent, Table } from 'mdast';
import type {
  AssetImage,
  Block,
  BoxBlock,
  ListBlock,
  ListItem,
  Problem,
  TableBlock,
} from '../model.js';
import type { SystemDefinition } from '../systems.js';
import type { AdventureTemplate } from '../template/schema.js';
import { plainText, type Source } from './source.js';

// What every part of the parser shares: the text, the template, and the list
// the parser's own problems go to.
export interface ParseContext {
  source: Source;
  template: AdventureTemplate;
  systems: readonly SystemDefinition[];
  problems: Problem[];
}

// Numbers the boxes of one owner (a scene, a section, a sheet): "S3.1", "S3.2".
export interface BoxIds {
  owner: string;
  count: number;
}

const CALLOUT = /^\[!([A-Za-z][\w-]*)(?:\|([\w-]+))?\](?:[ \t]+(.*?))?[ \t]*$/;

export function toBlock(ctx: ParseContext, node: RootContent, ids: BoxIds, sceneId?: string): Block {
  const { source } = ctx;
  const range = source.nodeRange(node);
  const text = source.slice(node);
  switch (node.type) {
    case 'paragraph':
      return { kind: 'paragraph', range, text };
    case 'list':
      return toList(ctx, node);
    case 'table':
      return toTable(ctx, node);
    case 'blockquote':
      return toBox(ctx, node, ids, sceneId);
    case 'heading':
      return { kind: 'heading', range, text, depth: node.depth, title: plainText(node).trim() };
    case 'code':
    case 'html':
    case 'thematicBreak':
      return { kind: node.type, range, text };
    default:
      return { kind: 'other', range, text };
  }
}

export function toList(ctx: ParseContext, node: List): ListBlock {
  return {
    kind: 'list',
    range: ctx.source.nodeRange(node),
    text: ctx.source.slice(node),
    ordered: node.ordered ?? false,
    items: node.children.map((item) => toListItem(ctx, item)),
  };
}

function toListItem(ctx: ParseContext, item: MdListItem): ListItem {
  const { source } = ctx;
  const first = item.children[0];
  const from = first ? source.start(first) : source.end(item);
  const text = source.text.slice(from, source.end(item));
  const label = leadingLabel(ctx, first);
  return {
    range: source.nodeRange(item),
    text,
    checked: item.checked ?? null,
    label: label?.label ?? null,
    value: label ? afterLabel(source.text.slice(label.end, source.end(item))) : text,
  };
}

// The bold text a paragraph opens with: "**Tipo:** …" gives "Tipo".
export function leadingLabel(
  ctx: ParseContext,
  node: Nodes | undefined,
): { label: string; colon: boolean; start: number; end: number } | null {
  if (!node || node.type !== 'paragraph') return null;
  const strong = node.children[0];
  if (!strong || strong.type !== 'strong') return null;
  const { source } = ctx;
  if (source.start(strong) !== source.start(node)) return null;
  const raw = plainText(strong).trim();
  const colon = raw.endsWith(':') || source.text.charAt(source.end(strong)) === ':';
  const label = raw.replace(/:$/, '').trim();
  if (!label) return null;
  return { label, colon, start: source.start(strong), end: source.end(strong) };
}

// The text after a bold label, without the colon or comma that follows it.
export function afterLabel(text: string): string {
  return text.replace(/^[:,]?[ \t]*/, '').trim();
}

export function toTable(ctx: ParseContext, node: Table): TableBlock {
  const { source } = ctx;
  const rows = node.children.map((row) => ({
    range: source.nodeRange(row),
    cells: row.children.map((cell) => cellText(source.slice(cell))),
  }));
  return {
    kind: 'table',
    range: source.nodeRange(node),
    text: source.slice(node),
    header: rows[0]?.cells ?? [],
    rows: rows.slice(1),
  };
}

function cellText(raw: string): string {
  return raw.replace(/^\s*\|/, '').replace(/(?<!\\)\|\s*$/, '').trim();
}

// The lines of a blockquote without their quote markers.
function quoteLines(raw: string): string[] {
  return raw.split(/\r?\n/).map((line) => line.replace(/^[ \t]*>[ \t]?/, ''));
}

function toBox(ctx: ParseContext, node: Nodes, ids: BoxIds, sceneId?: string): BoxBlock {
  const { source } = ctx;
  const range = source.nodeRange(node);
  const text = source.slice(node);
  const lines = quoteLines(text);
  const first = (lines[0] ?? '').trim();
  ids.count += 1;
  const id = `${ids.owner}.${ids.count}`;
  if (first.startsWith('[!')) {
    const from = source.start(node);
    const lineEnd = text.search(/\r?\n/);
    const headerRange = source.range(from, lineEnd === -1 ? source.end(node) : from + lineEnd);
    const match = CALLOUT.exec(first);
    if (match) {
      return {
        kind: 'callout',
        id,
        range,
        text,
        headerRange,
        type: match[1]!,
        meta: match[2] ?? null,
        title: match[3]?.trim() || null,
        content: lines.slice(1).join('\n').trim(),
      };
    }
    ctx.problems.push({
      code: 'callout.malformed',
      severity: 'error',
      message: `Malformed callout line "${first}": expected [!type], [!type] Title or [!type|meta] Title. Kept as a plain quote.`,
      range: headerRange,
      ...(sceneId ? { sceneId } : {}),
    });
  }
  return { kind: 'quote', id, range, text, content: lines.join('\n').trim() };
}

// Images that point at the project's assets ("asset:<id>"), anywhere in a node.
export function assetImages(ctx: ParseContext, node: Nodes, found: AssetImage[] = []): AssetImage[] {
  const { scheme } = ctx.template.assets;
  if (node.type === 'image' && node.url.startsWith(scheme)) {
    found.push({ assetId: node.url.slice(scheme.length), alt: node.alt ?? '', range: ctx.source.nodeRange(node) });
  }
  if ('children' in node) for (const child of node.children) assetImages(ctx, child, found);
  return found;
}

// A paragraph made only of asset images (and the spaces between them).
export function isAssetImageParagraph(ctx: ParseContext, node: Nodes): boolean {
  const { scheme } = ctx.template.assets;
  return (
    node.type === 'paragraph' &&
    node.children.some((child) => child.type === 'image') &&
    node.children.every(
      (child) =>
        (child.type === 'image' && child.url.startsWith(scheme)) || (child.type === 'text' && !child.value.trim()),
    )
  );
}
