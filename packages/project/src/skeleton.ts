import { defaultTemplateRef, type AdventureTemplate, type Place, type Template } from 'promptbook-format';
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

// The reactions table's second header: the template has no data for it yet,
// so the skeleton and the editor's inserts share this one.
export const REACTIONS_THEN = 'Allora…';

// Front matter with the keys in the template's order. A key without a value
// is written empty, as a prompt to fill it in; the campaign only when set.
function frontMatter(template: Template, category: Category, input: SkeletonInput): string {
  const values: Record<string, string | null> = {
    titolo: input.title,
    // The user's system from the settings wins over the template's.
    sistema: input.system.trim() || (template.kind === 'adventure' ? (template.system ?? '') : ''),
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

// The callouts every place of this kind must hold, each as an empty box.
function requiredCallouts(template: AdventureTemplate, place: Place): string[] {
  return template.callouts
    .filter((c) => c.perPlace.min >= 1 && c.allowedIn.includes(place))
    .map((c) => `> [!${c.meta ? `${c.type}|${c.meta}` : c.type}]\n> \n`);
}

// The first scene: its heading, the fields a scene needs or should have
// (climax-only ones aside), the boxes a scene needs and the reactions table
// with one empty row (template-editor design decision 9).
function firstScene(template: AdventureTemplate): string[] {
  const fields = template.sceneFields
    .filter((f) => f.requirement !== 'optional' && !f.climax)
    .map((f) => (f.form === 'inline' ? `**${f.label}:** \n` : `**${f.label}**\n`));
  const reactions = `| ${template.tables.reactions.firstHeader}… | ${REACTIONS_THEN} |\n| --- | --- |\n|  |  |\n`;
  return [`### ${template.ids.scene}1. ${FIRST_SCENE}\n`, ...fields, ...requiredCallouts(template, 'scene'), reactions];
}

// The prep document a new project starts with, from its template: every
// section in order, empty; for an adventure or a one-shot, the boxes the
// strong start needs and one scene with its parts. A campaign's skeleton has
// no checks. The template is the category's built-in when not given
// (avventura@1, campagna@1); one of the other kind is refused.
export function skeletonDocument(
  category: Category,
  input: SkeletonInput,
  template: Template = templateOf({ category, template: defaultTemplateRef(templateKindOf(category)) }),
): string {
  if (template.kind !== templateKindOf(category)) {
    throw new Error(`A ${category} cannot start from the ${template.kind} template ${template.id}@${template.version}`);
  }
  const blocks = template.sections.flatMap((section) => {
    const heading = `## ${section.heading ?? section.name}\n`;
    if (template.kind !== 'adventure') return [heading];
    if (section.role === 'scenes') return [heading, ...firstScene(template)];
    if (section.role === 'strongStart') return [heading, ...requiredCallouts(template, 'strongStart')];
    return [heading];
  });
  return [frontMatter(template, category, input), ...blocks].join('\n');
}
