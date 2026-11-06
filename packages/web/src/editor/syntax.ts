import type {
  AdventureTemplate,
  CalloutDefinition,
  FieldDefinition,
  Place,
  Requirement,
  SystemDefinition,
} from 'promptbook-format';
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

function placeName(place: Place, template: AdventureTemplate): string {
  if (place === 'scene') return 'scenes';
  if (place === 'sheet') return 'sheets';
  if (place === 'anySection') return 'any section';
  return template.sections.find((s) => s.role === place)?.name ?? place;
}

// How a sheet field reads its value, as the syntax sheet says it.
function blockNote(field: FieldDefinition, separator: string): string {
  switch (field.block) {
    case 'text':
      return 'text';
    case 'number':
      return field.line ? 'number, with a line to write on' : 'number';
    case 'choice':
      return `choice from «${field.table}»${field.also ? ', with its other columns' : ''}`;
    case 'stats':
      return `stat row: ${field.labels.join(' · ')}`;
    case 'boxes': {
      const { count } = field;
      const how =
        count.from === 'fixed'
          ? `${count.n} boxes`
          : count.from === 'table'
            ? `boxes from «${count.table}», column ${count.column}`
            : field.marks
              ? 'boxes: the number written, marked ones in brackets «6 (3)»'
              : 'boxes: the number written';
      return [how, field.group ? `in groups of ${field.group}` : '', field.values ? 'numbered' : ''].filter(Boolean).join(', ');
    }
    case 'clock':
      return field.count.from === 'fixed' ? `clock of ${field.count.n}` : 'a clock per item, «Text: 6»';
    case 'list':
      return field.style === 'paras'
        ? `items «Name (text)», separated by «${separator}» or as sub-bullets`
        : `${field.style === 'check' ? 'checklist' : 'list'}, separated by «${separator}» or as sub-bullets`;
    case 'rows': {
      const [first, ...rest] = field.columns.map((c) => (c.table ? `${c.name} from «${c.table}»` : c.name));
      return `a row per sub-bullet, «${[first, rest.join(` ${separator} `)].filter(Boolean).join(': ')}»`;
    }
    case 'lines':
      return `lines to fill in: ${field.labels.join(' · ')}`;
    case 'flag':
      return `yes or no, «${field.word}» when yes`;
  }
}

const places: Record<FieldDefinition['show'], string> = {
  row: '',
  sub: 'in the subtitle',
  quote: 'as a quote',
  none: 'full sheet only',
};

// The sheet's type key, then a group per kind of the project's game system
// with its fields in order (design D9).
function sheetGroups(
  template: AdventureTemplate,
  system: SystemDefinition | undefined,
  sheetsName: string | undefined,
): SyntaxGroup[] {
  const separator = template.sheets.listSeparator.trim();
  const kinds = system?.kinds ?? [];
  return [
    {
      title: `Sheet keys${sheetsName ? ` (under ### Name in «${sheetsName}»)` : ''}`,
      rows: template.sheets.keys
        .filter((k) => k.role === 'type')
        .map((k) => ({
          syntax: `- **${k.key}:** …`,
          name: k.key,
          requirement: null,
          note: system
            ? `the sheet's kind in ${system.name}: ${kinds.map((kind) => kind.name).join(', ')}`
            : "the sheet's kind, from the game system the front matter names",
        })),
    },
    ...kinds.map((kind) => ({
      title: `Sheet kind «${kind.name}» (${system!.name})`,
      rows: kind.fields.map((f) => ({
        syntax: `- **${f.key}:** …`,
        name: f.key,
        requirement: f.requirement,
        note: [blockNote(f, separator), places[f.show]].filter(Boolean).join(' · '),
      })),
    })),
  ];
}

export function syntaxOf(template: AdventureTemplate, system?: SystemDefinition): SyntaxGroup[] {
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
    ...sheetGroups(template, system, sheets?.name),
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
