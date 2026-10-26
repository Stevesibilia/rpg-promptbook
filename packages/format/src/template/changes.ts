import type {
  AdventureTemplate,
  CalloutDefinition,
  MetaKeyDefinition,
  SceneFieldDefinition,
  SectionDefinition,
  Template,
} from './schema.js';
import { sectionPdf } from './pdf.js';

// One difference between two templates, as the editor's save dialog, its save
// bar and the update dialog list them. `label` names the item as `to` has it
// (as `from` had it when removed); `before` and `after` are the old and new
// values of what changed, as text.
export interface TemplateChange {
  kind: 'added' | 'changed' | 'removed';
  what: 'section' | 'field' | 'box' | 'key' | 'limits' | 'name' | 'system';
  label: string;
  before?: string;
  after?: string;
  detail?: 'renamed' | 'requirement' | 'form' | 'climax' | 'column' | 'places' | 'count' | 'moved' | 'type' | 'pdf';
}

type Key<T> = (item: T) => string | undefined;

// Pairs the items of two lists: first by uid, then by each key in turn. Two
// items whose uids differ are never paired: one was removed, the other added.
// Answers, for each index in `to`, the index in `from` it pairs with.
function pair<T extends { uid?: string | undefined }>(from: readonly T[], to: readonly T[], keys: Key<T>[]): Map<number, number> {
  const pairs = new Map<number, number>();
  const taken = new Set<number>();
  const passes: Key<T>[] = [(item) => item.uid, ...keys];
  passes.forEach((key, pass) => {
    to.forEach((item, t) => {
      if (pairs.has(t)) return;
      const value = key(item);
      if (value === undefined) return;
      const f = from.findIndex(
        (other, index) =>
          !taken.has(index) &&
          key(other) === value &&
          (pass === 0 || item.uid === undefined || other.uid === undefined || item.uid === other.uid),
      );
      if (f === -1) return;
      pairs.set(t, f);
      taken.add(f);
    });
  });
  return pairs;
}

// The indices in `to` of the paired items that moved: those outside the
// longest run of paired items that kept their order.
function moved(pairs: Map<number, number>): Set<number> {
  const order = [...pairs.entries()].sort((a, b) => a[0] - b[0]);
  // Longest increasing subsequence of the `from` indices, by patience sorting.
  const tails: number[] = [];
  const prev: number[] = [];
  order.forEach(([, f], i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (order[tails[mid]!]![1] < f) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? tails[lo - 1]! : -1;
    tails[lo] = i;
  });
  const kept = new Set<number>();
  for (let i = tails.length ? tails[tails.length - 1]! : -1; i !== -1; i = prev[i]!) kept.add(order[i]![0]);
  return new Set(order.map(([t]) => t).filter((t) => !kept.has(t)));
}

interface ListOptions<T> {
  what: TemplateChange['what'];
  name: (item: T) => string;
  keys: Key<T>[];
  requirement?: (item: T) => string;
  ordered: boolean;
  compare: (from: T, to: T) => TemplateChange[];
}

function diffList<T extends { uid?: string | undefined }>(from: readonly T[], to: readonly T[], options: ListOptions<T>): TemplateChange[] {
  const { what, name } = options;
  const pairs = pair(from, to, options.keys);
  const moves = options.ordered ? moved(pairs) : new Set<number>();
  const out: TemplateChange[] = [];
  to.forEach((item, t) => {
    const f = pairs.get(t);
    if (f === undefined) {
      const after = options.requirement?.(item);
      out.push({ kind: 'added', what, label: name(item), ...(after ? { after } : {}) });
      return;
    }
    const old = from[f]!;
    out.push(...options.compare(old, item));
    if (moves.has(t)) out.push({ kind: 'changed', what, label: name(item), detail: 'moved' });
  });
  const paired = new Set(pairs.values());
  from.forEach((item, f) => {
    if (!paired.has(f)) out.push({ kind: 'removed', what, label: name(item) });
  });
  return out;
}

function changed(
  what: TemplateChange['what'],
  label: string,
  detail: NonNullable<TemplateChange['detail']>,
  before: string,
  after: string,
): TemplateChange {
  return { kind: 'changed', what, label, detail, before, after };
}

const sectionText = (s: SectionDefinition) => s.heading ?? s.name;

// The section's PDF options as text, as in "printed, new page".
function pdfText(s: SectionDefinition): string {
  const { print, newPage, sideColumn } = sectionPdf(s);
  if (!print) return 'left out';
  return ['printed', ...(newPage ? ['new page'] : []), ...(sideColumn ? ['side column'] : [])].join(', ');
}

function sections(from: readonly SectionDefinition[], to: readonly SectionDefinition[]): TemplateChange[] {
  return diffList(from, to, {
    what: 'section',
    name: (s) => s.name,
    keys: [(s) => s.role, (s) => s.name],
    requirement: (s) => s.requirement,
    ordered: true,
    compare: (a, b) => {
      const out: TemplateChange[] = [];
      if (a.name !== b.name) out.push({ kind: 'changed', what: 'section', label: b.name, before: a.name, detail: 'renamed' });
      else if (sectionText(a) !== sectionText(b)) {
        out.push({ kind: 'changed', what: 'section', label: sectionText(b), before: sectionText(a), detail: 'renamed' });
      }
      if (a.requirement !== b.requirement) out.push(changed('section', b.name, 'requirement', a.requirement, b.requirement));
      if (JSON.stringify(sectionPdf(a)) !== JSON.stringify(sectionPdf(b))) out.push(changed('section', b.name, 'pdf', pdfText(a), pdfText(b)));
      return out;
    },
  });
}

function fields(from: readonly SceneFieldDefinition[], to: readonly SceneFieldDefinition[]): TemplateChange[] {
  return diffList(from, to, {
    what: 'field',
    name: (f) => f.label,
    keys: [(f) => f.role, (f) => f.label],
    requirement: (f) => f.requirement,
    ordered: true,
    compare: (a, b) => {
      const out: TemplateChange[] = [];
      if (a.label !== b.label) out.push({ kind: 'changed', what: 'field', label: b.label, before: a.label, detail: 'renamed' });
      if (a.requirement !== b.requirement) out.push(changed('field', b.label, 'requirement', a.requirement, b.requirement));
      if (a.form !== b.form) out.push(changed('field', b.label, 'form', a.form, b.form));
      if (a.climax !== b.climax) out.push(changed('field', b.label, 'climax', String(a.climax), String(b.climax)));
      return out;
    },
  });
}

const calloutType = (c: CalloutDefinition) => `[!${c.type}${c.meta ? `|${c.meta}` : ''}]`;
const places = (c: CalloutDefinition) => c.allowedIn.join(', ');
function count(c: CalloutDefinition): string {
  const { min, max } = c.perPlace;
  if (max === null) return min ? `at least ${min}` : 'any';
  return `${min} to ${max}`;
}

function boxes(from: readonly CalloutDefinition[], to: readonly CalloutDefinition[]): TemplateChange[] {
  return diffList(from, to, {
    what: 'box',
    name: (c) => c.label,
    keys: [calloutType],
    ordered: false,
    compare: (a, b) => {
      const out: TemplateChange[] = [];
      if (a.label !== b.label) out.push({ kind: 'changed', what: 'box', label: b.label, before: a.label, detail: 'renamed' });
      if (calloutType(a) !== calloutType(b)) {
        out.push({ kind: 'changed', what: 'box', label: calloutType(b), before: calloutType(a), detail: 'renamed' });
      }
      if (a.column !== b.column) out.push(changed('box', b.label, 'column', a.column, b.column));
      if (places(a) !== places(b)) out.push(changed('box', b.label, 'places', places(a), places(b)));
      if (count(a) !== count(b)) out.push(changed('box', b.label, 'count', count(a), count(b)));
      return out;
    },
  });
}

function keys(from: readonly MetaKeyDefinition[], to: readonly MetaKeyDefinition[]): TemplateChange[] {
  return diffList(from, to, {
    what: 'key',
    name: (k) => k.key,
    keys: [(k) => k.role, (k) => k.key],
    requirement: (k) => k.requirement,
    ordered: true,
    compare: (a, b) => {
      const out: TemplateChange[] = [];
      if (a.key !== b.key) out.push({ kind: 'changed', what: 'key', label: b.key, before: a.key, detail: 'renamed' });
      if (a.requirement !== b.requirement) out.push(changed('key', b.key, 'requirement', a.requirement, b.requirement));
      if (a.type !== b.type) out.push(changed('key', b.key, 'type', a.type, b.type));
      return out;
    },
  });
}

type Limit = 'synopsisWords' | 'preambleWords' | 'reminders' | 'revelationClues' | 'revelationScenes' | 'style';

function limitTexts(t: AdventureTemplate): Record<Limit, string> {
  const { synopsisWords, preambleWords, reminders, revelationClues, revelationScenes } = t.limits;
  return {
    synopsisWords: `${synopsisWords.min} to ${synopsisWords.max}`,
    preambleWords: String(preambleWords),
    reminders: String(reminders),
    revelationClues: String(revelationClues),
    revelationScenes: String(revelationScenes),
    style: t.style.forbidden.map((f) => f.name).join(', ') || 'none',
  };
}

function limits(from: AdventureTemplate, to: AdventureTemplate): TemplateChange[] {
  const a = limitTexts(from);
  const b = limitTexts(to);
  return (Object.keys(b) as Limit[])
    .filter((key) => a[key] !== b[key])
    .map((key) => ({ kind: 'changed' as const, what: 'limits' as const, label: key, before: a[key], after: b[key] }));
}

// The changes from one template to another, in the order the editor lists
// them: name, game system, sections, scene fields, boxes, front matter keys,
// limits and style. Items pair by uid, else by role, else by name (a box by
// its type and meta). The parts the editor does not edit (ids, tables,
// sheets, appendix, references) are not compared.
export function templateChanges(from: Template, to: Template): TemplateChange[] {
  const out: TemplateChange[] = [];
  if (from.name !== to.name) out.push({ kind: 'changed', what: 'name', label: to.name, before: from.name, detail: 'renamed' });
  const fromAdventure = from.kind === 'adventure' ? from : undefined;
  const toAdventure = to.kind === 'adventure' ? to : undefined;
  const fromSystem = fromAdventure?.system ?? '';
  const toSystem = toAdventure?.system ?? '';
  if (fromSystem !== toSystem) out.push({ kind: 'changed', what: 'system', label: toSystem, before: fromSystem, after: toSystem });
  out.push(...sections(from.sections, to.sections));
  out.push(...fields(fromAdventure?.sceneFields ?? [], toAdventure?.sceneFields ?? []));
  out.push(...boxes(fromAdventure?.callouts ?? [], toAdventure?.callouts ?? []));
  out.push(...keys(from.meta, to.meta));
  if (fromAdventure && toAdventure) out.push(...limits(fromAdventure, toAdventure));
  return out;
}
