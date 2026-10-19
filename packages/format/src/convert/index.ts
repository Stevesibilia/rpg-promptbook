import type { Blockquote, Heading, Html, List, Nodes, RootContent } from 'mdast';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { stringify } from 'yaml';
import type { Problem, Range, TextEdit } from '../model.js';
import { parseAdventure } from '../parse/index.js';
import { matchSection } from '../parse/sections.js';
import { createSource, escapeRegExp, plainText, type Source } from '../parse/source.js';
import { avventura } from '../template/avventura.js';
import type { CalloutDefinition, SheetKeyDefinition, Template } from '../template/schema.js';

// The conventions of today's notes that the template does not hold, since
// they are not part of the format: the word a threat's Tipo line opens with,
// the word that marks a pack, and the value written for it.
const legacy = {
  threat: 'Minaccia',
  pack: 'branco',
  yes: 'sì',
};

export type ConvertEditKind = 'frontMatter' | 'callout' | 'threat' | 'comment';

// A change the converter made, against the original text.
export interface ConvertEdit extends TextEdit {
  kind: ConvertEditKind;
  // English, with the template's Italian labels quoted.
  message: string;
}

// Something the conversion left for a human, at its place in the original
// text: a handout to give a title, a header label with no key, a Tipo line
// it could not split.
export interface ConvertNotice {
  code: string;
  message: string;
  range: Range;
}

export interface ConvertReport {
  // How many edits of each kind were made.
  counts: Record<ConvertEditKind, number>;
  notices: ConvertNotice[];
  // The problems left after parsing the converted text, with ranges in the
  // converted text.
  problems: Problem[];
}

export interface ConvertResult {
  text: string;
  // Sorted, not overlapping, with offsets in the original text.
  edits: ConvertEdit[];
  report: ConvertReport;
}

export interface ConvertOptions {
  // The note's title from outside the text (a Joplin note title), used when
  // the note has no "# Title" line.
  title?: string;
  // avventura@1 when not given.
  template?: Template;
}

const processor = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkGfm);

const COMMENT = /^(?:\s*<!--[\s\S]*?-->)+\s*$/;

interface Context {
  source: Source;
  template: Template;
  edits: ConvertEdit[];
  notices: ConvertNotice[];
}

// Brings a note written in today's conventions into the format, with edits
// computed from the tree's positions and applied to the original text, so
// every line the rules do not name stays as it was. Idempotent: a converted
// text gives no edits.
export function convertNote(text: string, options: ConvertOptions = {}): ConvertResult {
  const template = options.template ?? avventura;
  const source = createSource(text);
  const ctx: Context = { source, template, edits: [], notices: [] };
  const children = processor.parse(text).children;

  const header = readHeader(ctx, children, options.title);
  removeComments(ctx, children, header);
  if (header) {
    // Front matter opens the document: the edit starts where the comments
    // removed before the header end.
    const from = Math.max(0, ...ctx.edits.filter((e) => e.to <= header.start).map((e) => e.to));
    ctx.edits.push({ ...header.edit, from });
  }
  convertQuotes(ctx, children);
  splitThreats(ctx, children);

  const edits = ctx.edits.sort((a, b) => a.from - b.from || a.to - b.to);
  edits.forEach((edit, index) => {
    const next = edits[index + 1];
    if (next && next.from < edit.to) throw new Error(`Overlapping conversion edits at offset ${next.from}`);
  });
  let out = '';
  let at = 0;
  for (const edit of edits) {
    out += text.slice(at, edit.from) + edit.insert;
    at = edit.to;
  }
  out += text.slice(at);

  const counts: Record<ConvertEditKind, number> = { frontMatter: 0, callout: 0, threat: 0, comment: 0 };
  for (const edit of edits) counts[edit.kind] += 1;
  const notices = ctx.notices.sort((a, b) => a.range.start.offset - b.range.start.offset);
  const { problems } = parseAdventure(out, { template });
  return { text: out, edits, report: { counts, notices, problems } };
}

const lineStart = (source: Source, offset: number) => source.text.lastIndexOf('\n', offset - 1) + 1;

const lineEnd = (source: Source, offset: number) => {
  const end = source.text.indexOf('\n', offset);
  return end === -1 ? source.text.length : end;
};

const isComment = (node: Nodes): node is Html => node.type === 'html' && COMMENT.test(node.value);

// Splits the nodes after a ## heading of the given role into its ### parts.
function partsOf(ctx: Context, children: RootContent[], role: string): { heading: Heading; nodes: RootContent[] }[] {
  const parts: { heading: Heading; nodes: RootContent[] }[] = [];
  let inside = false;
  for (const node of children) {
    if (node.type === 'heading' && node.depth === 2) {
      inside = matchSection(ctx.template.sections, plainText(node).trim())?.role === role;
    } else if (inside && node.type === 'heading' && node.depth === 3) {
      parts.push({ heading: node, nodes: [] });
    } else if (inside) {
      parts.at(-1)?.nodes.push(node);
    }
  }
  return parts;
}

// The nodes of the ## section with the given role, up to the next ## heading.
function sectionNodes(ctx: Context, children: RootContent[], role: string): RootContent[] {
  const nodes: RootContent[] = [];
  let inside = false;
  for (const node of children) {
    if (node.type === 'heading' && node.depth === 2) {
      inside = matchSection(ctx.template.sections, plainText(node).trim())?.role === role;
    } else if (inside) {
      nodes.push(node);
    }
  }
  return nodes;
}

// --- Header ---

interface Header {
  edit: ConvertEdit;
  // Where the title line or the first header line starts, and where the last
  // one ends; comments between them go with the header.
  start: number;
  end: number;
}

interface HeaderLabel {
  label: string;
  value: string;
  range: Range;
  // Whether an inline comment was dropped from the value.
  comment: boolean;
}

// "**Sistema:** Kulthos · **Formato:** one-shot" gives its labels and values,
// or null when the paragraph is not made only of bold labels. Inline comments
// are dropped from the values.
function headerLabels(ctx: Context, node: RootContent): HeaderLabel[] | null {
  if (node.type !== 'paragraph') return null;
  const { source } = ctx;
  const from = source.start(node);
  const raw = source.slice(node);
  const labels: HeaderLabel[] = [];
  const starts = [...raw.matchAll(/(?:^|[ \t]·[ \t]+)(?=\*\*)/g)].map((m) => m.index + m[0].length);
  if (starts[0] !== 0) return null;
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!;
    const end = i + 1 < starts.length ? raw.lastIndexOf('·', starts[i + 1]! - 1) : raw.length;
    const text = raw.slice(start, end);
    const match = /^\*\*([^*\n]+?)\*\*/.exec(text);
    if (!match) return null;
    const inner = match[1]!.trim();
    let rest = text.slice(match[0].length);
    const colon = inner.endsWith(':') || rest.startsWith(':');
    if (!colon) return null;
    rest = rest.replace(/^:/, '');
    const value = rest
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    labels.push({
      label: inner.replace(/:$/, '').trim(),
      value,
      comment: /<!--[\s\S]*?-->/.test(rest),
      range: source.range(from + start, from + start + text.trimEnd().length),
    });
  }
  return labels;
}

function readHeader(ctx: Context, children: RootContent[], callerTitle: string | undefined): Header | null {
  const { source, template } = ctx;
  if (children[0]?.type === 'yaml') return null;

  const first = children.findIndex((node) => !isComment(node));
  const head = children[first];
  if (!head) return null;
  let index = first;
  let title: string | null = null;
  let titleRange: Range | null = null;
  if (head.type === 'heading' && head.depth === 1) {
    title = plainText(head).trim();
    titleRange = source.nodeRange(head);
    index += 1;
  }
  const labels: HeaderLabel[] = [];
  let last: RootContent | null = title !== null ? head : null;
  for (; index < children.length; index++) {
    const node = children[index]!;
    if (isComment(node)) continue;
    const found = headerLabels(ctx, node);
    if (!found) break;
    labels.push(...found);
    last = node;
  }

  if (!last) {
    // A title line or header labels further down, before the first section,
    // are not converted: front matter must open the document.
    const stray = children.find(
      (node, i) =>
        i > first &&
        children.slice(0, i).every((n) => !(n.type === 'heading' && n.depth === 2)) &&
        ((node.type === 'heading' && node.depth === 1) || headerLabels(ctx, node) !== null),
    );
    if (stray) {
      ctx.notices.push({
        code: 'convert.header.position',
        message:
          'A title line or header line that does not open the note was left as it is; move it to the top and convert again.',
        range: source.nodeRange(stray),
      });
    }
    return null;
  }

  const titleKey = template.meta.find((k) => k.role === 'title')?.key;
  const values = new Map<string, string>();
  const unknown: [string, string][] = [];
  if (title !== null) {
    const parts = /^(.*?\S)\s*\((.+)\)$/.exec(title) ?? /^(.+?):\s+(.+)$/.exec(title);
    const subtitleKey = template.meta.find((k) => k.role === 'subtitle')?.key;
    if (parts && subtitleKey) {
      title = parts[1]!.trim();
      values.set(subtitleKey, parts[2]!.trim());
    }
  } else if (callerTitle?.trim()) {
    title = callerTitle.trim();
  }
  if (title !== null && titleKey) values.set(titleKey, title);
  else if (title !== null && titleRange) {
    ctx.notices.push({
      code: 'convert.header.key',
      message: 'The template has no title key; the title line was dropped.',
      range: titleRange,
    });
  }

  for (const { label, value, range } of labels) {
    const key = label.toLowerCase();
    const known = template.meta.some((k) => k.key === key);
    if (values.has(key) || unknown.some(([k]) => k === key)) {
      ctx.notices.push({
        code: 'convert.header.duplicate',
        message: `Header label "${label}" appears twice; only the first value was kept.`,
        range,
      });
    } else if (known) {
      values.set(key, value);
    } else {
      unknown.push([key, value]);
      ctx.notices.push({
        code: 'convert.header.unknown',
        message: `Header label "${label}" has no front matter key in the template; it was kept as "${key}".`,
        range,
      });
    }
  }

  const entries = [
    ...template.meta.filter((k) => values.has(k.key)).map((k) => [k.key, values.get(k.key)!] as const),
    ...unknown,
  ];
  const yaml = entries.map(([key, value]) => stringify({ [key]: value }, { lineWidth: 0 })).join('');
  const start = source.start(head);
  const end = source.end(last);
  const comments =
    children.filter((node) => isComment(node) && source.start(node) >= start && source.end(node) <= end).length +
    labels.filter((l) => l.comment).length;
  const changed = [
    title !== null ? 'the title' : null,
    labels.length ? `${labels.length} header ${labels.length === 1 ? 'label' : 'labels'}` : null,
  ].filter(Boolean);
  return {
    start,
    end,
    edit: {
      kind: 'frontMatter',
      from: start,
      to: end,
      insert: `---\n${yaml}---`,
      message: `Moved ${changed.join(' and ')} to the front matter${comments ? `, with ${comments} comment${comments === 1 ? '' : 's'} among them` : ''}.`,
    },
  };
}

// --- Comments ---

function removeComments(ctx: Context, children: RootContent[], header: Header | null): void {
  const { source } = ctx;
  const text = source.text;
  const inHeader = (node: Nodes) =>
    header !== null && source.start(node) >= header.start && source.end(node) <= header.end;

  for (const node of children) {
    if (!isComment(node) || inHeader(node)) continue;
    // The comment's whole lines, and one blank line after them, so no double
    // blank line is left behind. Before the header, up to where it starts.
    const from = lineStart(source, source.start(node));
    let to = Math.min(lineEnd(source, source.end(node)) + 1, text.length);
    const next = lineEnd(source, to);
    if (to < text.length && text.slice(to, next).trim() === '') to = Math.min(next + 1, text.length);
    if (header && from < header.start) to = Math.min(to, header.start);
    ctx.edits.push({ kind: 'comment', from, to, insert: '', message: 'Removed a template comment.' });
  }

  // Comments inside paragraphs, lists and quotes: the comment and the spaces
  // before it.
  const visit = (node: Nodes) => {
    if (node.type === 'html' && COMMENT.test(node.value)) {
      let from = source.start(node);
      while (from > 0 && (text[from - 1] === ' ' || text[from - 1] === '\t')) from -= 1;
      ctx.edits.push({ kind: 'comment', from, to: source.end(node), insert: '', message: 'Removed a template comment.' });
      return;
    }
    if ('children' in node) for (const child of node.children) visit(child);
  };
  for (const node of children) {
    if (isComment(node) || inHeader(node) || !('children' in node)) continue;
    for (const child of node.children) visit(child);
  }
}

// --- Quotes ---

const calloutLine = (source: Source, node: Blockquote) => {
  const first = source.slice(node).split('\n')[0]!.replace(/^[ \t]*>[ \t]?/, '').trim();
  return first.startsWith('[!') ? first : null;
};

function convertQuotes(ctx: Context, children: RootContent[]): void {
  const { template } = ctx;
  const readAloud = template.callouts.find((c) => c.role === 'readAloud' && !c.meta);
  const handout = template.callouts.find((c) => c.role === 'handout' && !c.meta);
  if (!readAloud || !handout) return;
  for (const part of partsOf(ctx, children, 'scenes')) convertPlace(ctx, part.nodes, readAloud, handout);
  convertPlace(ctx, sectionNodes(ctx, children, 'strongStart'), readAloud, handout);
}

// In one place, the first plain quote becomes the read-aloud unless the place
// has one already; every other plain quote becomes a handout to give a title.
function convertPlace(ctx: Context, nodes: RootContent[], readAloud: CalloutDefinition, handout: CalloutDefinition) {
  const { source } = ctx;
  const quotes = nodes.filter((node): node is Blockquote => node.type === 'blockquote');
  const marker = new RegExp(`^\\[!${escapeRegExp(readAloud.type)}\\]`);
  let hasReadAloud = quotes.some((quote) => marker.test(calloutLine(source, quote) ?? ''));
  for (const quote of quotes) {
    if (calloutLine(source, quote) !== null) continue;
    const definition = hasReadAloud ? handout : readAloud;
    hasReadAloud = true;
    const at = lineStart(source, source.start(quote));
    const indent = source.text.slice(at, source.start(quote));
    ctx.edits.push({
      kind: 'callout',
      from: at,
      to: at,
      insert: `${indent}> [!${definition.type}]\n`,
      message: `Marked a plain quote as a "${definition.label}" box.`,
    });
    if (definition === handout) {
      ctx.notices.push({
        code: 'convert.handout.title',
        message: `A plain quote became a "${handout.label}" box without a title; give it one.`,
        range: source.nodeRange(quote),
      });
    }
  }
}

// --- Threat lines ---

function splitThreats(ctx: Context, children: RootContent[]): void {
  const { template, source } = ctx;
  const key = (role: SheetKeyDefinition['role']) => template.sheets.keys.find((k) => k.role === role)?.key;
  const typeKey = key('type');
  if (!typeKey) return;
  for (const part of partsOf(ctx, children, 'sheets')) {
    if (plainText(part.heading).trim() === template.sheets.pregenerated) continue;
    const lists = part.nodes.filter((node): node is List => node.type === 'list');
    const written = new Set(
      lists.flatMap((list) => list.children.map((item) => itemKey(source, item.children[0]))).filter(Boolean),
    );
    for (const list of lists) {
      for (const item of list.children) {
        if (itemKey(source, item.children[0]) !== typeKey) continue;
        splitThreat(ctx, list, item, written);
      }
    }
  }
}

// The bold key a list item opens with: "**Tipo:** …" gives "Tipo".
function itemKey(source: Source, node: Nodes | undefined): string | null {
  if (!node || node.type !== 'paragraph') return null;
  const match = /^\*\*([^*\n]+?)\*\*/.exec(source.slice(node));
  return match ? match[1]!.replace(/:$/, '').trim() : null;
}

function splitThreat(ctx: Context, list: List, item: List['children'][number], written: Set<string | null>): void {
  const { source, template } = ctx;
  const keys = template.sheets.keys;
  const keyOf = (role: SheetKeyDefinition['role']) => keys.find((k) => k.role === role)?.key;
  const range = source.nodeRange(item);
  const from = lineStart(source, source.start(item));
  const to = source.end(item);
  const line = source.text.slice(from, to);
  const leave = (why: string) =>
    ctx.notices.push({ code: 'convert.threat', message: `The "${keyOf('type')}" line was left as it is: ${why}.`, range });

  const match = /^([ \t]*[-*+][ \t]+)\*\*([^*\n]+?)\*\*:?[ \t]*(.*)$/.exec(line);
  if (!match || list.ordered || item.checked !== null && item.checked !== undefined) {
    leave('it is not a single bullet line');
    return;
  }
  const prefix = match[1]!;
  const value = match[3]!.trim();
  if (value === legacy.threat) return;

  const separator = template.sheets.listSeparator;
  const [head, ...rest] = value.split(separator).map((s) => s.trim());
  const grades = template.systems.flatMap((s) => s.grades.map((g) => g.name));
  const opening = new RegExp(`^${escapeRegExp(legacy.threat)}[ \\t]+(\\S+?)(?:[ \\t]*,[ \\t]*(.*))?$`, 'u').exec(head ?? '');
  const grade = opening ? grades.find((g) => g.toLowerCase() === opening[1]!.toLowerCase()) : undefined;
  if (!opening || grade === undefined) {
    leave(`it does not read "${legacy.threat} <grade>, <nature>", with a grade of the template's systems`);
    return;
  }

  const out = new Map<SheetKeyDefinition['role'], string>([['type', legacy.threat], ['grade', opening[1]!]]);
  const packWord = new RegExp(`(?<![\\p{L}])${escapeRegExp(legacy.pack)}(?![\\p{L}])`, 'iu');
  let pack = false;
  const nature = (opening[2] ?? '')
    .split(/[ \t]*,[ \t]*/)
    .map((s) => s.trim())
    .filter((part) => {
      if (packWord.test(part)) pack = true;
      return part !== '' && part.toLowerCase() !== legacy.pack;
    });
  if (nature.length) out.set('nature', nature.join(', '));
  for (const segment of rest) {
    if (segment.toLowerCase() === legacy.pack) {
      pack = true;
      continue;
    }
    const pair = /^([^:]+?):[ \t]*(.+)$/.exec(segment);
    const definition = pair ? keys.find((k) => k.key.toLowerCase() === pair[1]!.trim().toLowerCase()) : undefined;
    if (!pair || !definition || out.has(definition.role)) {
      leave(`"${segment}" is not one of the template's threat keys`);
      return;
    }
    out.set(definition.role, pair[2]!.trim());
  }
  if (pack && !out.has('pack')) out.set('pack', legacy.yes);

  const already = [...out.keys()].map(keyOf).filter((k) => k !== keyOf('type') && written.has(k ?? null));
  if (already.length) {
    leave(`the sheet already has ${already.map((k) => `"${k}"`).join(', ')}`);
    return;
  }
  const lines = keys.filter((k) => out.has(k.role)).map((k) => `${prefix}**${k.key}:** ${out.get(k.role)}`);
  ctx.edits.push({
    kind: 'threat',
    from,
    to,
    insert: lines.join('\n'),
    message: `Split the "${keyOf('type')}" line into ${keys
      .filter((k) => out.has(k.role))
      .map((k) => `"${k.key}"`)
      .join(', ')}.`,
  });
}
