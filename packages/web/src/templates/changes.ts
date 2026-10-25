import type { Place, Template, TemplateChange } from 'promptbook-format';

// The changes between two versions as the save dialog and the update dialog
// list them (template-editor design decision 8): «Section «Inizio forte»
// renamed «Apertura»», «Scene field «Prove e regole» now required».

const what: Record<TemplateChange['what'], string> = {
  section: 'Section',
  field: 'Scene field',
  box: 'Box',
  key: 'Front matter key',
  limits: 'Limit',
  name: 'Name',
  system: 'Game system',
};

const limitNames: Record<string, string> = {
  synopsisWords: 'Synopsis length (words)',
  preambleWords: 'Text before the scenes (words, at most)',
  reminders: 'Reminders, at most',
  revelationClues: 'Clues per revelation, at least',
  revelationScenes: 'Scenes per revelation, at least',
  style: 'Style warnings',
};

const placeNames: Record<string, string> = { scene: 'scenes', sheet: 'sheets', anySection: 'any section' };

// A place a box is allowed in, as the editor names it: a section by its
// heading in `template`.
export function placeName(place: Place, template: Template): string {
  if (place in placeNames) return placeNames[place]!;
  const section = template.sections.find((s) => s.role === place);
  return section ? section.name : place;
}

const places = (list: string, template: Template) =>
  list
    .split(', ')
    .map((p) => placeName(p as Place, template))
    .join(', ');

export type ChangeKind = TemplateChange['kind'];

export function changeText(change: TemplateChange, to: Template): string {
  const subject = `${what[change.what]} «${change.label}»`;
  if (change.what === 'name') return `Name «${change.before}» changed to «${change.label}»`;
  if (change.what === 'system') {
    if (!change.after) return `Game system «${change.before}» removed`;
    return change.before ? `Game system «${change.before}» changed to «${change.after}»` : `Game system «${change.after}»`;
  }
  if (change.what === 'limits') return `${limitNames[change.label] ?? change.label}: ${change.before} → ${change.after}`;
  if (change.kind === 'added') return change.after ? `${subject}, ${change.after}` : subject;
  if (change.kind === 'removed') return subject;
  switch (change.detail) {
    case 'renamed':
      return `${what[change.what]} «${change.before}» renamed «${change.label}»`;
    case 'requirement':
      return `${subject} now ${change.after}`;
    case 'form':
      return `${subject} now ${change.after}`;
    case 'climax':
      return change.after === 'true' ? `${subject} now climax only` : `${subject} no longer climax only`;
    case 'column':
      return `${subject} now in the ${change.after} column`;
    case 'places':
      return `${subject} now allowed in ${places(change.after ?? '', to)}`;
    case 'count':
      return `${subject} now ${change.after} per place`;
    case 'type':
      return `${subject} now ${change.after}`;
    case 'moved':
      return `${subject} moved`;
    default:
      return subject;
  }
}

export const kindLabel: Record<ChangeKind, string> = { added: 'Added', changed: 'Changed', removed: 'Removed' };

const listNames: Record<string, string> = {
  sections: 'Sections',
  sceneFields: 'Scene fields',
  callouts: 'Boxes',
  meta: 'Front matter',
  limits: 'Limits',
  name: 'Name',
};

// A schema issue as the editor shows it: «Sections, row 4: expected a
// non-empty label».
export function issueText(issue: string): string {
  const match = /^(\w+)(?:\[(\d+)\])?[.\w[\]]*: (.*)$/.exec(issue);
  if (!match) return issue;
  const [, list, row, message] = match;
  const where = listNames[list!] ?? list!;
  return row === undefined ? `${where}: ${message}` : `${where}, row ${Number(row) + 1}: ${message}`;
}
