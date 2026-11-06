import type { Heading, RootContent } from 'mdast';
import type { Block, JsonValue, Pregenerated, Sheet, SheetField } from '../model.js';
import { itemLead, toBlock, toList, type BoxIds, type ParseContext } from './blocks.js';
import { readKind } from './kinds.js';
import { plainText, slug } from './source.js';

// A sheet from its ### heading and the blocks up to the next one. List items
// are its fields; anything else is kept in its blocks, #### headings included.
export function readSheet(
  ctx: ParseContext,
  heading: Heading,
  nodes: RootContent[],
  system: JsonValue | undefined,
): Sheet {
  const { source } = ctx;
  const title = plainText(heading).trim();
  const name = title.split(',')[0]!.trim();
  const id = slug(name);
  const last = nodes.at(-1) ?? heading;
  const fields: SheetField[] = [];
  const blocks: Block[] = [];
  const ids: BoxIds = { owner: id, count: 0 };

  for (const node of nodes) {
    if (node.type === 'list') {
      toList(ctx, node).items.forEach((item, index) => {
        fields.push({
          key: item.label,
          value: item.value,
          lead: itemLead(ctx, node.children[index]!),
          items: item.items.map((sub) => sub.text.trim()),
          range: item.range,
        });
      });
    } else {
      blocks.push(toBlock(ctx, node, ids));
    }
  }

  return {
    id,
    name,
    title,
    range: source.range(source.start(heading), source.end(last)),
    headingRange: source.nodeRange(heading),
    fields,
    kind: readKind(ctx, fields, system),
    blocks,
  };
}

// The pregenerated characters: the ### heading the template names, with a
// #### heading per character.
export function readPregenerated(ctx: ParseContext, heading: Heading, nodes: RootContent[]): Pregenerated {
  const { source } = ctx;
  const last = nodes.at(-1) ?? heading;
  const result: Pregenerated = {
    range: source.range(source.start(heading), source.end(last)),
    headingRange: source.nodeRange(heading),
    blocks: [],
    characters: [],
  };
  const ids: BoxIds = { owner: slug(plainText(heading)), count: 0 };
  for (const node of nodes) {
    const character = result.characters.at(-1);
    if (node.type === 'heading' && node.depth === 4) {
      result.characters.push({
        name: plainText(node).trim(),
        range: source.nodeRange(node),
        headingRange: source.nodeRange(node),
        blocks: [],
      });
    } else if (character) {
      character.blocks.push(toBlock(ctx, node, ids));
      character.range = source.range(character.range.start.offset, source.end(node));
    } else {
      result.blocks.push(toBlock(ctx, node, ids));
    }
  }
  return result;
}
