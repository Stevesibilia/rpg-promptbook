import type { Heading, RootContent } from 'mdast';
import type { Block, Clue, Reference, Scene, SceneField, TableBlock, Unplaced } from '../model.js';
import {
  afterLabel,
  assetImages,
  isAssetImageParagraph,
  leadingLabel,
  toBlock,
  toList,
  toTable,
  type BoxIds,
  type ParseContext,
} from './blocks.js';
import { escapeRegExp, plainText, slug } from './source.js';

export interface SceneOutput {
  scene: Scene;
  clues: Clue[];
  unplaced: Unplaced[];
}

// "### S1. La casa che cede" gives S1 and the title.
export function sceneHeading(ctx: ParseContext, title: string): { id: string; title: string } | null {
  const prefix = escapeRegExp(ctx.template.ids.scene);
  const match = new RegExp(`^(${prefix}\\d+)\\.\\s+(\\S.*)$`).exec(title);
  return match ? { id: match[1]!, title: match[2]!.trim() } : null;
}

// A scene from its ### heading and the blocks up to the next one.
export function readScene(ctx: ParseContext, heading: Heading, nodes: RootContent[], section: string): SceneOutput {
  const { source, template } = ctx;
  const headingText = plainText(heading).trim();
  const parsed = sceneHeading(ctx, headingText);
  const last = nodes.at(-1) ?? heading;
  const scene: Scene = {
    id: parsed?.id ?? null,
    title: parsed?.title ?? headingText,
    heading: headingText,
    range: source.range(source.start(heading), source.end(last)),
    headingRange: source.nodeRange(heading),
    fields: [],
    boxes: [],
    readAloud: null,
    reactions: null,
    tables: [],
    references: [],
    images: [],
  };
  const sceneId = scene.id ?? undefined;
  if (!parsed) {
    ctx.problems.push({
      code: 'scene.id.missing',
      severity: 'error',
      message: `Scene heading "${headingText}" has no id: expected "### ${template.ids.scene}1. Name".`,
      range: scene.headingRange,
    });
  }

  const unplaced: Unplaced[] = [];
  const ids: BoxIds = { owner: scene.id ?? slug(headingText), count: 0 };
  const reactionsHeader = template.tables.reactions.firstHeader;
  // The block field whose list or table may follow: only directly after its
  // label or after another of its blocks.
  let open: SceneField | null = null;

  const attach = (field: SceneField, block: Block) => {
    field.blocks.push(block);
    field.range = source.range(field.range.start.offset, block.range.end.offset);
  };

  for (const node of nodes) {
    let next: SceneField | null = null;
    const label = node.type === 'paragraph' ? leadingLabel(ctx, node) : null;

    if (label) {
      const known = template.sceneFields.some((f) => f.label === label.label);
      const rest = afterLabel(source.text.slice(label.end, source.end(node)));
      const field: SceneField = {
        label: label.label,
        known,
        form: label.colon || rest ? 'inline' : 'block',
        range: source.nodeRange(node),
        labelRange: source.range(label.start, label.end),
        text: rest,
        blocks: [],
      };
      scene.fields.push(field);
      next = field.form === 'block' ? field : null;
    } else if (node.type === 'table') {
      const table: TableBlock = toTable(ctx, node);
      if (table.header[0]?.startsWith(reactionsHeader) && !scene.reactions) scene.reactions = table;
      else if (open) {
        attach(open, table);
        next = open;
      } else scene.tables.push(table);
    } else if (node.type === 'list' && open) {
      attach(open, toList(ctx, node));
      next = open;
    } else if (node.type === 'blockquote') {
      const box = toBlock(ctx, node, ids, sceneId);
      if (box.kind === 'callout' || box.kind === 'quote') scene.boxes.push(box);
    } else if (isAssetImageParagraph(ctx, node)) {
      // Kept through scene.images below.
    } else {
      unplaced.push({ text: source.slice(node), range: source.nodeRange(node), sceneId: scene.id, section });
    }
    open = next;
    assetImages(ctx, node, scene.images);
  }

  const readAloud = template.callouts.filter((c) => c.role === 'readAloud');
  scene.readAloud =
    scene.boxes.find(
      (box) => box.kind === 'callout' && readAloud.some((c) => c.type === box.type && (c.meta ?? null) === box.meta),
    )?.id ?? null;
  scene.references = findReferences(ctx, scene, nodes);
  return { scene, clues: readClues(ctx, scene), unplaced };
}

// "→ Schede: Name" anywhere in the scene. The name runs to the end of the
// line, a semicolon, a closing parenthesis or a full stop.
function findReferences(ctx: ParseContext, scene: Scene, nodes: RootContent[]): Reference[] {
  const { source, template } = ctx;
  const marker = new RegExp(`${escapeRegExp(template.references.marker)}[ \\t]*([^\\n;)]*?)(?=[;)]|\\.(?:\\s|$)|\\n|$)`, 'g');
  const references: Reference[] = [];
  for (const node of nodes) {
    const from = source.start(node);
    const text = source.slice(node);
    for (const match of text.matchAll(marker)) {
      const target = match[1]!.trim();
      if (!target) continue;
      const start = from + match.index;
      const end = start + match[0].length;
      const field = scene.fields.find((f) => f.range.start.offset <= start && end <= f.range.end.offset);
      references.push({ target, range: source.range(start, end), field: field?.label ?? null });
    }
  }
  return references;
}

// "- **I1.** text (R1, R2)" in the field the template marks as the clues field.
function readClues(ctx: ParseContext, scene: Scene): Clue[] {
  const { template } = ctx;
  const label = template.sceneFields.find((f) => f.role === 'clues')?.label;
  const clueId = new RegExp(`^(${escapeRegExp(template.ids.clue)}\\d+)\\.?$`);
  const clues: Clue[] = [];
  for (const field of scene.fields) {
    if (field.label !== label) continue;
    for (const block of field.blocks) {
      if (block.kind !== 'list') continue;
      for (const item of block.items) {
        const match = item.label ? clueId.exec(item.label) : null;
        if (!match) continue;
        const { text, ids } = trailingIds(item.value, template.ids.revelation);
        clues.push({ id: match[1]!, text, revelations: ids, sceneId: scene.id, range: item.range });
      }
    }
  }
  return clues;
}

// Splits "text (R1, R2)" into the text and the ids with the given prefix.
export function trailingIds(value: string, prefix: string): { text: string; ids: string[] } {
  const match = /\s*\(([^()]*)\)\s*$/.exec(value);
  const id = new RegExp(`\\b${escapeRegExp(prefix)}\\d+\\b`, 'g');
  if (!match) return { text: value, ids: [] };
  const ids = match[1]!.match(id) ?? [];
  if (ids.length === 0) return { text: value, ids: [] };
  return { text: value.slice(0, match.index).trim(), ids };
}
