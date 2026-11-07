import type { Heading, RootContent } from 'mdast';
import type { Block, HeadingBlock, Meta, Problem, Range } from '../model.js';
import { sectionPdf, type SectionPdf } from '../template/pdf.js';
import type { CampaignTemplate } from '../template/schema.js';
import { toBlock, type BlockContext, type BoxIds } from './blocks.js';
import { readFrontMatter } from './frontmatter.js';
import { processor } from './processor.js';
import { matchSection } from './sections.js';
import { createSource, plainText } from './source.js';

// A heading inside a campaign section. `### F1. La Compagnia` gives the id
// "F1" and the name "La Compagnia"; any other heading has no id and its text
// as the name.
export interface SubheadingBlock {
  kind: 'subheading';
  range: Range;
  text: string;
  depth: number;
  id: string | null;
  name: string;
}

export type CampaignBlock = Exclude<Block, HeadingBlock> | SubheadingBlock;

export interface CampaignSection {
  // The heading as written, which the PDF prints, known or not: a prefix
  // match («## Archi narrativi» matches «Archi») never rewrites it. The
  // matched template section gives only the PDF options and the role.
  title: string;
  // Source offsets of the section, from its ## to the end of its last block.
  from: number;
  to: number;
  known: boolean;
  role: 'appendix' | null;
  pdf: SectionPdf;
  blocks: CampaignBlock[];
}

export interface CampaignParse {
  meta: Meta;
  // The text before the first ##, other than the front matter.
  lead: CampaignBlock[];
  sections: CampaignSection[];
}

export interface CampaignParseOptions {
  template: CampaignTemplate;
}

// The ID rule of a scene's heading, for any one to three capitals.
const ID_HEADING = /^([A-Z]{1,3}\d+)\.\s+(\S.*)$/;

// A section the template does not list prints, flowing.
const UNKNOWN_PDF: SectionPdf = { print: true, newPage: false, sideColumn: false };

// Reads a campaign document into its sections and blocks, each with its
// source range. Campaigns are never checked: the problems the readers find
// are dropped.
export function parseCampaign(text: string, { template }: CampaignParseOptions): CampaignParse {
  const source = createSource(text);
  const problems: Problem[] = [];
  const ctx: BlockContext & { template: CampaignTemplate } = { source, problems, template };
  const children = processor.parse(text).children;
  const yaml = children[0]?.type === 'yaml' ? children[0] : undefined;

  const blockOf = (node: RootContent, ids: BoxIds): CampaignBlock => {
    if (node.type !== 'heading') return toBlock(ctx, node, ids) as Exclude<Block, HeadingBlock>;
    const title = plainText(node).trim();
    const match = node.depth === 3 ? ID_HEADING.exec(title) : null;
    return {
      kind: 'subheading',
      range: source.nodeRange(node),
      text: source.slice(node),
      depth: node.depth,
      id: match ? match[1]! : null,
      name: match ? match[2]!.trim() : title,
    };
  };

  const lead: CampaignBlock[] = [];
  const leadIds: BoxIds = { owner: 'lead', count: 0 };
  const parts: { heading: Heading; nodes: RootContent[] }[] = [];
  for (const node of children.slice(yaml ? 1 : 0)) {
    if (node.type === 'heading' && node.depth === 2) parts.push({ heading: node, nodes: [] });
    else if (parts.length > 0) parts.at(-1)!.nodes.push(node);
    else lead.push(blockOf(node, leadIds));
  }

  const sections = parts.map(({ heading, nodes }): CampaignSection => {
    const title = plainText(heading).trim();
    const definition = matchSection(template.sections, title);
    const ids: BoxIds = { owner: title, count: 0 };
    return {
      title,
      from: source.start(heading),
      to: source.end(nodes.at(-1) ?? heading),
      known: definition !== null,
      role: definition?.role === 'appendix' ? 'appendix' : null,
      pdf: definition ? sectionPdf(definition, 'campaign') : UNKNOWN_PDF,
      blocks: nodes.map((node) => blockOf(node, ids)),
    };
  });

  return { meta: readFrontMatter(ctx, yaml), lead, sections };
}
