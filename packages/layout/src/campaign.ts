// What campagna.typ reads: a campaign's printed sections in document order,
// each block with its source offset and its Markdown (campaign-pdf design
// decisions 1, 6 and 9). As for adventures, every decision about what prints
// where is made here.

import type { CampaignBlock, CampaignParse, CampaignTemplate } from 'promptbook-format';
import { authors, text, type LayoutBlock, type LayoutInput, type LayoutOptions, type LayoutProject } from './input.js';
import { licenceShort, licenceUrl } from './licence.js';

// An ID subheading (`### F1. La Compagnia`: id "F1", name "La Compagnia") or
// a plain one (id null).
export interface CampaignLayoutSubheading {
  from: number;
  kind: 'subheading';
  id: string | null;
  name: string;
}

export type CampaignLayoutBlock = LayoutBlock | CampaignLayoutSubheading;

export interface CampaignLayoutSection {
  // The heading as written, which the PDF prints.
  title: string;
  from: number;
  newPage: boolean;
  // Its own edge tab: it starts a page and is among the first MAX_TABS.
  tab: string | null;
  // The edge tab filled while it prints, as an index into `tabs`: its own,
  // else the one of the section before it; null before the first tabbed
  // section and after a section that starts a page without a tab.
  mark: number | null;
  blocks: CampaignLayoutBlock[];
}

export interface CampaignLayoutInput {
  options: LayoutOptions;
  title: string;
  author: string | null;
  copyright: string | null;
  licence: { short: string; full: string; url: string | null } | null;
  head: {
    from: number;
    // The grey line above the title: «**Sistema:** X», «**Formato:** Y».
    over: LayoutBlock[];
  };
  // The text before the first ##, printed after the contents box.
  lead: CampaignLayoutBlock[];
  // The tabbed sections' tabs, in order.
  tabs: string[];
  // The printed sections only.
  sections: CampaignLayoutSection[];
}

// From 20 mm below the top edge, 18 mm tabs with 1 mm gaps reach the bottom
// margin after 13 tabs on A4 and 12 on US Letter: 12 for both.
export const MAX_TABS = 12;

// The front matter keys on the line above the title.
const OVER = ['sistema', 'formato'];

const capitalised = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

// A tab is the first word of the title without trailing punctuation:
// «PNG ricorrenti» → «PNG», «Fili aperti» → «Fili».
export function tabOf(title: string): string {
  const word = title.trim().split(/\s+/)[0] ?? '';
  return word.replace(/[\p{P}]+$/u, '') || word;
}

function blockOf(block: CampaignBlock): CampaignLayoutBlock {
  const from = block.range.start.offset;
  if (block.kind === 'subheading') return { from, kind: 'subheading', id: block.id, name: block.name };
  // Campaign templates have no callouts: a callout prints as a quote, without
  // its title line.
  if (block.kind === 'quote' || block.kind === 'callout') {
    return { from, kind: block.kind, markdown: block.content, box: { role: 'quote', label: null, title: null, side: false } };
  }
  return { from, kind: block.kind, markdown: block.text, box: null };
}

export function toCampaignLayoutInput(
  parsed: CampaignParse,
  options: LayoutOptions,
  project: LayoutProject,
  template: CampaignTemplate,
): CampaignLayoutInput {
  const { meta } = parsed;
  const values = meta.values;
  const titleKey = template.meta.find((m) => m.role === 'title')?.key;
  const over = meta.entries
    .filter((e) => OVER.includes(e.key) && text(e.value))
    .sort((a, b) => OVER.indexOf(a.key) - OVER.indexOf(b.key))
    .map((e): LayoutBlock => ({
      from: e.range.start.offset,
      kind: 'paragraph',
      markdown: `**${capitalised(e.key)}:** ${text(e.value)}`,
      box: null,
    }));

  const tabs: string[] = [];
  let mark: number | null = null;
  const sections = parsed.sections
    .filter((s) => s.role !== 'appendix' && s.pdf.print)
    .map((s): CampaignLayoutSection => {
      const newPage = s.pdf.newPage;
      let tab: string | null = null;
      if (newPage && tabs.length < MAX_TABS) {
        tab = tabOf(s.title);
        tabs.push(tab);
        mark = tabs.length - 1;
      } else if (newPage) {
        mark = null;
      }
      return { title: s.title, from: s.from, newPage, tab, mark, blocks: s.blocks.map(blockOf) };
    });

  return {
    options: { ...options, template: 'campagna@1' },
    title: text(titleKey === undefined ? undefined : values[titleKey]) ?? project.title,
    author: authors(values['autore']),
    copyright: text(values['copyright']),
    licence: meta.licence
      ? { short: licenceShort(meta.licence), full: meta.licence.text, url: licenceUrl(meta.licence) }
      : null,
    head: { from: meta.range?.start.offset ?? 0, over },
    lead: parsed.lead.map(blockOf),
    tabs,
    sections,
  };
}

// Either kind of layout input, as the engine takes it.
export type AnyLayoutInput = LayoutInput | CampaignLayoutInput;
