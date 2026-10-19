import type { Heading, RootContent } from 'mdast';
import type {
  AppendixRow,
  ListBlock,
  Model,
  NpcRow,
  Reminder,
  Revelation,
  SceneMapRow,
  Section,
  TableBlock,
  TrackerRow,
  Unplaced,
} from '../model.js';
import type { SectionDefinition } from '../template/schema.js';
import { leadingLabel, toBlock, toList, type BoxIds, type ParseContext } from './blocks.js';
import { readScene, sceneHeading, trailingIds } from './scenes.js';
import { readPregenerated, readSheet } from './sheets.js';
import { escapeRegExp, plainText } from './source.js';

// The template section a ## heading names: the heading equals the name, or
// starts with it followed by a colon or a space. The longest name wins.
export function matchSection(sections: SectionDefinition[], heading: string): SectionDefinition | null {
  let best: SectionDefinition | null = null;
  for (const section of sections) {
    const { name } = section;
    const matches = heading === name || heading.startsWith(`${name}:`) || heading.startsWith(`${name} `);
    if (matches && (!best || name.length > best.name.length)) best = section;
  }
  return best;
}

// Splits a section's nodes at headings of the given depth: what comes before
// the first one, then each heading with its nodes.
function splitAt(nodes: RootContent[], depth: number) {
  const intro: RootContent[] = [];
  const parts: { heading: Heading; nodes: RootContent[] }[] = [];
  for (const node of nodes) {
    if (node.type === 'heading' && node.depth === depth) parts.push({ heading: node, nodes: [] });
    else (parts.at(-1)?.nodes ?? intro).push(node);
  }
  return { intro, parts };
}

// Reads one ## section into the model.
export function readSection(ctx: ParseContext, model: Model, heading: Heading, nodes: RootContent[]): void {
  const { source, template } = ctx;
  const headingText = plainText(heading).trim();
  const definition = matchSection(template.sections, headingText);
  const last = nodes.at(-1) ?? heading;
  const section: Section = {
    id: definition?.name ?? headingText,
    name: definition?.name ?? null,
    heading: headingText,
    known: definition !== null,
    role: definition?.role ?? null,
    range: source.range(source.start(heading), source.end(last)),
    headingRange: source.nodeRange(heading),
    blocks: [],
  };
  model.sections.push(section);
  if (!definition) {
    ctx.problems.push({
      code: 'section.unknown',
      severity: 'warning',
      message: `Section "${headingText}" is not in the template; it is kept as a plain section.`,
      range: section.headingRange,
    });
  }

  const ids: BoxIds = { owner: section.id, count: 0 };
  const plain = (list: RootContent[]) => {
    for (const node of list) section.blocks.push(toBlock(ctx, node, ids));
  };

  switch (section.role) {
    case 'scenes': {
      const { intro, parts } = splitAt(nodes, 3);
      plain(intro);
      for (const part of parts) {
        const { scene, clues, unplaced } = readScene(ctx, part.heading, part.nodes, section.id);
        model.scenes.push(scene);
        model.clues.push(...clues);
        model.unplaced.push(...unplaced);
      }
      return;
    }
    case 'sheets': {
      const systemKey = template.meta.find((k) => k.role === 'system')?.key;
      const system = systemKey === undefined ? undefined : model.meta.values[systemKey];
      const { intro, parts } = splitAt(nodes, 3);
      plain(intro);
      for (const part of parts) {
        if (plainText(part.heading).trim() === template.sheets.pregenerated && !model.pregenerated) {
          model.pregenerated = readPregenerated(ctx, part.heading, part.nodes);
        } else {
          model.sheets.push(readSheet(ctx, part.heading, part.nodes, system));
        }
      }
      return;
    }
    case 'appendix': {
      const { intro, parts } = splitAt(nodes, 3);
      plain(intro);
      for (const part of parts) readAppendixRow(ctx, model, part.heading, part.nodes, section.id);
      return;
    }
  }

  plain(nodes);
  switch (section.role) {
    case 'overview':
      model.revelations.push(...readRevelations(ctx, nodes));
      break;
    case 'reminders':
      model.reminders.push(...readReminders(section));
      break;
    case 'sceneMap':
      model.sceneMap.push(...readSceneMap(ctx, section));
      break;
    case 'clues':
      model.tracker.push(...readTracker(ctx, section));
      break;
    case 'npcs':
      model.npcs.push(...readNpcs(ctx, section));
      break;
  }
}

// "**Rivelazioni**" on its own, then a list of "- **R1.** text (I1, I2)".
function readRevelations(ctx: ParseContext, nodes: RootContent[]): Revelation[] {
  const { template } = ctx;
  const revelationId = new RegExp(`^(${escapeRegExp(template.ids.revelation)}\\d+)\\.?$`);
  const revelations: Revelation[] = [];
  nodes.forEach((node, index) => {
    const label = leadingLabel(ctx, node);
    const next = nodes[index + 1];
    if (label?.label !== template.overview.revelations || next?.type !== 'list') return;
    for (const item of toList(ctx, next).items) {
      const match = item.label ? revelationId.exec(item.label) : null;
      if (!match) continue;
      const { text, ids } = trailingIds(item.value, template.ids.clue);
      revelations.push({ id: match[1]!, text, clues: ids, range: item.range });
    }
  });
  return revelations;
}

function readReminders(section: Section): Reminder[] {
  return section.blocks
    .filter((block): block is ListBlock => block.kind === 'list')
    .flatMap((list) => list.items.map((item) => ({ text: item.text, checked: item.checked, range: item.range })));
}

// The tables of a section whose header has the given column.
function tablesWith(section: Section, column: string): TableBlock[] {
  return section.blocks.filter(
    (block): block is TableBlock => block.kind === 'table' && block.header.includes(column),
  );
}

function rowCells(table: TableBlock, cells: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  table.header.forEach((name, index) => {
    out[name] = cells[index] ?? '';
  });
  return out;
}

function idsIn(text: string, prefix: string): string[] {
  return text.match(new RegExp(`\\b${escapeRegExp(prefix)}\\d+\\b`, 'g')) ?? [];
}

function exactId(text: string | undefined, prefix: string): string | null {
  const value = (text ?? '').trim();
  return new RegExp(`^${escapeRegExp(prefix)}\\d+$`).test(value) ? value : null;
}

function readSceneMap(ctx: ParseContext, section: Section): SceneMapRow[] {
  const { id } = ctx.template.tables.sceneMap;
  return tablesWith(section, id).flatMap((table) =>
    table.rows.map((row) => {
      const cells = rowCells(table, row.cells);
      return { sceneId: exactId(cells[id], ctx.template.ids.scene), cells, range: row.range };
    }),
  );
}

function readTracker(ctx: ParseContext, section: Section): TrackerRow[] {
  const { template } = ctx;
  const columns = template.tables.tracker;
  return tablesWith(section, columns.id).flatMap((table) =>
    table.rows.map((row) => {
      const cells = rowCells(table, row.cells);
      return {
        clueId: exactId(cells[columns.id], template.ids.clue),
        text: cells[columns.text] ?? '',
        revelations: idsIn(cells[columns.revelations] ?? '', template.ids.revelation),
        scenes: idsIn(cells[columns.scenes] ?? '', template.ids.scene),
        done: (cells[columns.done] ?? '').trim() !== '',
        cells,
        range: row.range,
      };
    }),
  );
}

function readNpcs(ctx: ParseContext, section: Section): NpcRow[] {
  const { name } = ctx.template.tables.npcs;
  return tablesWith(section, name).flatMap((table) =>
    table.rows.map((row) => {
      const cells = rowCells(table, row.cells);
      return { name: cells[name] ?? '', cells, range: row.range };
    }),
  );
}

// "### S1. Name" with its "visual:" and "mood:" paragraphs.
function readAppendixRow(
  ctx: ParseContext,
  model: Model,
  heading: Heading,
  nodes: RootContent[],
  sectionId: string,
): void {
  const { source, template } = ctx;
  const headingText = plainText(heading).trim();
  const parsed = sceneHeading(ctx, headingText);
  const last = nodes.at(-1) ?? heading;
  const row: AppendixRow = {
    sceneId: parsed?.id ?? null,
    title: parsed?.title ?? headingText,
    heading: headingText,
    range: source.range(source.start(heading), source.end(last)),
    headingRange: source.nodeRange(heading),
    visual: null,
    mood: null,
  };
  model.appendix.push(row);
  const keys = [
    ['visual', template.appendix.visual],
    ['mood', template.appendix.mood],
  ] as const;
  for (const node of nodes) {
    const text = source.slice(node);
    const key = node.type === 'paragraph' ? keys.find(([, name]) => text.startsWith(`${name}:`)) : undefined;
    if (key && row[key[0]] === null) {
      row[key[0]] = { text: text.slice(key[1].length + 1).trim(), range: source.nodeRange(node) };
      continue;
    }
    const unplaced: Unplaced = { text, range: source.nodeRange(node), sceneId: null, section: sectionId };
    model.unplaced.push(unplaced);
  }
}

