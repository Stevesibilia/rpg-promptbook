import type { ColumnMark } from '../model.js';
import type { AdventureTemplate, SceneFieldRole, SectionRole } from './schema.js';

// Where the night page and the scene page print their parts. The template
// sets a column for each part, a mark in the text overrides it, and an absent
// setting reads as the default, which is where the layout always put the part.
// columnOf is the only place that decides a part's column.

export type Column = 'main' | 'side';
export type NightPart = 'reminders' | 'revelations' | 'clock' | 'truths';
export type ScenePart = 'mustHave' | 'happens' | 'cast' | 'clues';
export type PlacedPart = NightPart | ScenePart;

// The words a mark is written with: `{principale}`, `{laterale}`. Constants of
// the format, not template data, so every template reads them the same.
export const COLUMN_WORDS: Record<Column, string> = { main: 'principale', side: 'laterale' };

export const NIGHT_PARTS: readonly NightPart[] = ['revelations', 'reminders', 'clock', 'truths'];
export const SCENE_PARTS: readonly ScenePart[] = ['mustHave', 'happens', 'cast', 'clues'];

export const DEFAULT_COLUMN: Record<PlacedPart, Column> = {
  reminders: 'side',
  revelations: 'side',
  clock: 'main',
  truths: 'main',
  mustHave: 'side',
  happens: 'main',
  cast: 'side',
  clues: 'main',
};

const SECTION_PARTS: readonly NightPart[] = ['reminders', 'clock', 'truths'];

// The column a word names, null for any other word. Trimmed, lower-cased.
export function columnOfWord(word: string): Column | null {
  const key = word.trim().toLowerCase();
  if (key === COLUMN_WORDS.main) return 'main';
  if (key === COLUMN_WORDS.side) return 'side';
  return null;
}

// '{laterale}' or '{principale}'.
export function columnMark(column: Column): string {
  return `{${COLUMN_WORDS[column]}}`;
}

// The night part a section is, by its role; null for every other section. The
// revelations are a list inside the overview, not a section.
export function nightPartOf(role: SectionRole | null | undefined): NightPart | null {
  return role && (SECTION_PARTS as readonly string[]).includes(role) ? (role as NightPart) : null;
}

// The scene part a scene field is, by its role; null for the other fields.
export function scenePartOf(role: SceneFieldRole | null | undefined): ScenePart | null {
  return role && (SCENE_PARTS as readonly string[]).includes(role) ? (role as ScenePart) : null;
}

function isNight(part: PlacedPart): part is NightPart {
  return (NIGHT_PARTS as readonly string[]).includes(part);
}

// The column the template stores for a part, undefined when it stores none
// (or has no such section or field).
function storedColumn(template: AdventureTemplate, part: PlacedPart): Column | undefined {
  if (part === 'revelations') return template.overview.column;
  if (isNight(part)) return template.sections.find((s) => s.role === part)?.pdf?.column;
  return template.sceneFields.find((f) => f.role === part)?.column;
}

// What the template says: its stored value, else the default.
export function templateColumn(template: AdventureTemplate, part: PlacedPart): Column {
  return storedColumn(template, part) ?? DEFAULT_COLUMN[part];
}

// The effective column: a mark with a known word, else the template's.
export function columnOf(template: AdventureTemplate, part: PlacedPart, mark?: ColumnMark | null): Column {
  return mark?.column ?? templateColumn(template, part);
}

// The template with the part's column set, storing only what differs from the
// default (as withPdf does): setting a column back leaves the JSON as it was.
// A template without the part's section or field is returned unchanged.
export function withColumn(template: AdventureTemplate, part: PlacedPart, column: Column): AdventureTemplate {
  const stored = column === DEFAULT_COLUMN[part] ? undefined : column;
  if (part === 'revelations') {
    const { column: _old, ...overview } = template.overview;
    return { ...template, overview: stored ? { ...overview, column: stored } : overview };
  }
  if (isNight(part)) {
    const sections = template.sections.map((section) => {
      if (section.role !== part) return section;
      const pdf: NonNullable<typeof section.pdf> = { ...section.pdf };
      delete pdf.column;
      if (stored) pdf.column = stored;
      const { pdf: _old, ...rest } = section;
      return Object.keys(pdf).length > 0 ? { ...rest, pdf } : rest;
    });
    return { ...template, sections };
  }
  const sceneFields = template.sceneFields.map((field) => {
    if (field.role !== part) return field;
    const { column: _old, ...rest } = field;
    return stored ? { ...rest, column: stored } : rest;
  });
  return { ...template, sceneFields };
}
