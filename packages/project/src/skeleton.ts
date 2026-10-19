import { templates } from 'promptbook-format';
import { stringify } from 'yaml';
import type { Category } from './model.js';

export interface SkeletonInput {
  title: string;
  system: string;
  // The campaign's title, null for a stand-alone project.
  campaignTitle: string | null;
  author: string;
  copyright: string;
  licence: string;
}

// The front matter's `formato` for each category.
export const formatOf: Record<Category, string> = {
  campaign: 'campagna',
  adventure: 'avventura',
  'one-shot': 'one-shot',
};

const campaignSections = ['Premessa', 'Fronti', 'PNG ricorrenti', 'Fili aperti', 'Sessioni'];

// The format reads a scene id only with a name after it.
const FIRST_SCENE = 'Prima scena';

// Front matter with the keys in the template's order. A key without a value
// is written empty, as a prompt to fill it in; the campaign only when set.
function frontMatter(category: Category, input: SkeletonInput): string {
  const values: Record<string, string | null> = {
    titolo: input.title,
    sistema: input.system,
    formato: formatOf[category],
    campagna: category === 'campaign' ? null : input.campaignTitle,
    autore: input.author,
    copyright: input.copyright,
    licenza: input.licence,
  };
  const entries: Record<string, string | null> = {};
  for (const { key } of templates.avventura.meta) {
    if (!(key in values)) continue;
    const value = values[key]?.trim() ?? '';
    if (key === 'campagna' && !value) continue;
    entries[key] = value || null;
  }
  return `---\n${stringify(entries, { lineWidth: 0, nullStr: '' })}---\n`;
}

// The prep document a new project starts with. Adventures and one-shots get
// every section of avventura@1 in order, empty, with one scene; a
// campaign gets a plain skeleton with no checks.
export function skeletonDocument(category: Category, input: SkeletonInput): string {
  const headings =
    category === 'campaign'
      ? campaignSections.map((name) => `## ${name}\n`)
      : templates.avventura.sections.map((section) => {
          const heading = `## ${section.heading ?? section.name}\n`;
          return section.role === 'scenes' ? `${heading}\n### ${templates.avventura.ids.scene}1. ${FIRST_SCENE}\n` : heading;
        });
  return [frontMatter(category, input), ...headings].join('\n');
}
