import { defaultTemplateRef, type Template } from 'promptbook-format';
import { stringify } from 'yaml';
import type { Category } from './model.js';
import { templateKindOf, templateOf } from './template.js';

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

// The format reads a scene id only with a name after it.
const FIRST_SCENE = 'Prima scena';

// Front matter with the keys in the template's order. A key without a value
// is written empty, as a prompt to fill it in; the campaign only when set.
function frontMatter(template: Template, category: Category, input: SkeletonInput): string {
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
  for (const { key } of template.meta) {
    if (!(key in values)) continue;
    const value = values[key]?.trim() ?? '';
    if (key === 'campagna' && !value) continue;
    entries[key] = value || null;
  }
  return `---\n${stringify(entries, { lineWidth: 0, nullStr: '' })}---\n`;
}

// The prep document a new project starts with, from its template: every
// section in order, empty, and for an adventure or a one-shot one scene. A
// campaign's skeleton has no checks. The template is the category's built-in
// when not given (avventura@1, campagna@1).
export function skeletonDocument(
  category: Category,
  input: SkeletonInput,
  template: Template = templateOf({ category, template: defaultTemplateRef(templateKindOf(category)) }),
): string {
  const headings = template.sections.map((section) => {
    const heading = `## ${section.heading ?? section.name}\n`;
    return template.kind === 'adventure' && section.role === 'scenes'
      ? `${heading}\n### ${template.ids.scene}1. ${FIRST_SCENE}\n`
      : heading;
  });
  return [frontMatter(template, category, input), ...headings].join('\n');
}
