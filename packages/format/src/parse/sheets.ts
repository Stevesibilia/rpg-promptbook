import type { Heading, RootContent } from 'mdast';
import type { Block, JsonValue, Pregenerated, Sheet, SheetField, Threat } from '../model.js';
import type { SheetKeyDefinition } from '../template/schema.js';
import { toBlock, toList, type BoxIds, type ParseContext } from './blocks.js';
import { plainText, slug } from './source.js';

// A sheet from its ### heading and the blocks up to the next one. List items
// are its fields; anything else is kept in its blocks, #### headings included.
export function readSheet(
  ctx: ParseContext,
  heading: Heading,
  nodes: RootContent[],
  system: JsonValue | undefined,
): Sheet {
  const { source, template } = ctx;
  const title = plainText(heading).trim();
  const name = title.split(',')[0]!.trim();
  const id = slug(name);
  const last = nodes.at(-1) ?? heading;
  const fields: SheetField[] = [];
  const blocks: Block[] = [];
  const ids: BoxIds = { owner: id, count: 0 };

  for (const node of nodes) {
    if (node.type === 'list') {
      for (const item of toList(ctx, node).items) {
        fields.push({ key: item.label, value: item.value, range: item.range });
      }
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
    threat: readThreat(ctx, fields, system),
    blocks,
  };
}

function readThreat(ctx: ParseContext, fields: SheetField[], system: JsonValue | undefined): Threat | null {
  const { template, systems } = ctx;
  const value = (role: SheetKeyDefinition['role']): string | null => {
    const key = template.sheets.keys.find((k) => k.role === role)?.key;
    return fields.find((f) => key !== undefined && f.key === key)?.value ?? null;
  };
  const values = template.sheets.keys.map((k) => value(k.role));
  if (values.every((v) => v === null)) return null;

  const grade = value('grade');
  const talents = value('talents');
  const systemName = typeof system === 'string' ? system.trim().toLowerCase() : null;
  const definition = systems.find((s) => s.name.toLowerCase() === systemName);
  const gradeDefinition = definition?.grades.find((g) => g.name.toLowerCase() === grade?.trim().toLowerCase());
  return {
    type: value('type'),
    grade,
    nature: value('nature'),
    wounds: value('wounds'),
    afflictions: value('afflictions'),
    pack: value('pack'),
    talents: talents
      ? talents
          .split(template.sheets.listSeparator)
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
    counts:
      definition && gradeDefinition
        ? {
            wounds: gradeDefinition.wounds,
            afflictions: gradeDefinition.afflictions,
            woundsPerCounter: definition.woundsPerCounter,
          }
        : null,
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
