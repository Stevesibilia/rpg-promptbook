import type { CalloutDefinition, Place, Requirement, Template } from 'promptbook-format';
import { REACTIONS_THEN } from './inserts.js';

// The syntax sheet's data (design decision 10), generated from the template
// so it never drifts from what the checks expect.

export interface SyntaxRow {
  // What to type, as source.
  syntax: string;
  // What it is: a label, a section name.
  name: string;
  requirement: Requirement | null;
  // Where it goes, how many, what else to know.
  note: string;
}

export interface SyntaxGroup {
  title: string;
  rows: SyntaxRow[];
}

const perScene = ({ min, max }: CalloutDefinition['perPlace']): string =>
  max === null ? (min > 0 ? `at least ${min}` : 'any number') : min === max ? `exactly ${min}` : `${min} to ${max}`;

const titles: Record<CalloutDefinition['title'], string> = {
  none: 'no title',
  optional: 'title optional',
  expected: 'title expected',
};

function placeName(place: Place, template: Template): string {
  if (place === 'scene') return 'scenes';
  if (place === 'sheet') return 'sheets';
  if (place === 'anySection') return 'any section';
  return template.sections.find((s) => s.role === place)?.name ?? place;
}

export function syntaxOf(template: Template): SyntaxGroup[] {
  const scenes = template.sections.find((s) => s.role === 'scenes');
  const sheets = template.sections.find((s) => s.role === 'sheets');
  return [
    {
      title: 'Front matter',
      rows: template.meta.map((m) => ({
        syntax: `${m.key}: ${m.type === 'list' ? '[…]' : '…'}`,
        name: m.key,
        requirement: m.requirement,
        note: m.type === 'list' ? 'a list' : m.type === 'licence' ? 'a licence (SPDX id or text)' : '',
      })),
    },
    {
      title: 'Sections, in this order',
      rows: template.sections.map((s) => ({
        syntax: `## ${s.heading ?? s.name}`,
        name: s.name,
        requirement: s.requirement,
        note: '',
      })),
    },
    {
      title: `Scene fields, in this order${scenes ? ` (under ### ${template.ids.scene}1. Title in «${scenes.name}»)` : ''}`,
      rows: template.sceneFields.map((f) => ({
        syntax: f.form === 'inline' ? `**${f.label}:** …` : `**${f.label}**, then a list or a table`,
        name: f.label,
        requirement: f.requirement,
        note: f.climax ? 'climax scene' : '',
      })),
    },
    {
      title: 'Callouts',
      rows: template.callouts.map((c) => ({
        syntax: `> [!${c.meta ? `${c.type}|${c.meta}` : c.type}]${c.title === 'none' ? '' : ' Title'}`,
        name: c.label,
        requirement: null,
        note: [
          titles[c.title],
          `in ${c.allowedIn.map((p) => placeName(p, template)).join(', ')}`,
          `${perScene(c.perPlace)} per place`,
          c.column === 'side' ? 'side column' : '',
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    },
    {
      title: 'References and tables',
      rows: [
        {
          syntax: `${template.references.marker} Name`,
          name: 'Sheet reference',
          requirement: null,
          note: `a sheet's name${sheets ? ` in «${sheets.name}»` : ''}`,
        },
        {
          syntax: `| ${template.tables.reactions.firstHeader}… | ${REACTIONS_THEN} |`,
          name: 'Reactions table',
          requirement: template.tables.reactions.requirement,
          note: 'in a scene',
        },
      ],
    },
    {
      title: `Sheet keys${sheets ? ` (under ### Name in «${sheets.name}»)` : ''}`,
      rows: template.sheets.keys.map((k) => ({
        syntax: `- **${k.key}:** …`,
        name: k.key,
        requirement: null,
        note: k.role === 'talents' ? `separated by «${template.sheets.listSeparator.trim()}»` : '',
      })),
    },
    {
      title: 'Ids',
      rows: [
        {
          syntax: `### ${template.ids.scene}1. Title`,
          name: 'Scene',
          requirement: null,
          note: 'never renumbered: references use it',
        },
        {
          syntax: `- **${template.ids.revelation}1.** … (${template.ids.clue}1, ${template.ids.clue}2)`,
          name: 'Revelation',
          requirement: null,
          note: `in «${template.overview.revelations}», with its clues`,
        },
        {
          syntax: `- **${template.ids.clue}1.** … (${template.ids.revelation}1)`,
          name: 'Clue',
          requirement: null,
          note: 'with its revelations',
        },
      ],
    },
  ];
}
