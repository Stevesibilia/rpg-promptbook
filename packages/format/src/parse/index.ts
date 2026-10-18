import type { Heading, RootContent } from 'mdast';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { runChecks } from '../checks/index.js';
import type { Model, ParseResult, Problem, Unplaced } from '../model.js';
import { templateName, type Template } from '../template/schema.js';
import type { ParseContext } from './blocks.js';
import { readFrontMatter } from './frontmatter.js';
import { resolveReferences } from './references.js';
import { readSection } from './sections.js';
import { createSource } from './source.js';

const processor = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkGfm);

export interface ParseOptions {
  template: Template;
}

// Reads an adventure into its model and lists every problem. Pure and
// synchronous; errors never stop the parse, the model is always returned.
export function parseAdventure(text: string, { template }: ParseOptions): ParseResult {
  const source = createSource(text);
  const problems: Problem[] = [];
  const ctx: ParseContext = { source, template, problems };
  const tree = processor.parse(text);
  const children = tree.children;

  const yaml = children[0]?.type === 'yaml' ? children[0] : undefined;
  const model: Model = {
    template: templateName(template),
    meta: readFrontMatter(ctx, yaml),
    sections: [],
    scenes: [],
    sheets: [],
    pregenerated: null,
    revelations: [],
    clues: [],
    reminders: [],
    sceneMap: [],
    tracker: [],
    npcs: [],
    appendix: [],
    unplaced: [],
  };

  // Everything before the first ## heading, other than the front matter, has
  // no place in the template.
  let current: { heading: Heading; nodes: RootContent[] } | null = null;
  const flush = () => {
    if (current) readSection(ctx, model, current.heading, current.nodes);
  };
  for (const node of children.slice(yaml ? 1 : 0)) {
    if (node.type === 'heading' && node.depth === 2) {
      flush();
      current = { heading: node, nodes: [] };
    } else if (current) {
      current.nodes.push(node);
    } else {
      model.unplaced.push({ text: source.slice(node), range: source.nodeRange(node), sceneId: null, section: null });
    }
  }
  flush();
  resolveReferences(model);

  model.unplaced.sort((a, b) => a.range.start.offset - b.range.start.offset);
  for (const item of model.unplaced) problems.push(unplacedProblem(item));
  problems.push(...runChecks({ model, template, source }));
  problems.sort((a, b) => a.range.start.offset - b.range.start.offset);
  return { model, problems };
}

function unplacedProblem(item: Unplaced): Problem {
  const firstLine = item.text.trim().split('\n')[0] ?? '';
  const excerpt = firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
  const where = item.sceneId
    ? `in scene ${item.sceneId}`
    : item.section
      ? `in section "${item.section}"`
      : 'before the first section';
  return {
    code: 'content.unplaced',
    severity: 'error',
    message: `Content ${where} that the template does not place: "${excerpt}".`,
    range: item.range,
    ...(item.sceneId ? { sceneId: item.sceneId } : {}),
  };
}
