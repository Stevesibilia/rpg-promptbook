import { sectionPdf, type Template } from 'promptbook-format';
import type { ListItems, ListName } from './draft.js';

// Which rows of the draft are new or changed since the saved version (the
// rows' green and amber bars), and which lines of the starting document they
// write (the preview's marks). Items pair as templateChanges pairs them: by
// uid, else by role, else by name.

export type Mark = 'added' | 'changed';

type Keyed = { uid?: string | undefined; role?: string | undefined };

const nameOf: { [L in ListName]: (item: ListItems[L]) => string } = {
  sections: (s) => s.name,
  sceneFields: (f) => f.label,
  callouts: (c) => (c.meta ? `${c.type}|${c.meta}` : c.type),
  meta: (k) => k.key,
};

function listOf<L extends ListName>(t: Template, list: L): ListItems[L][] {
  if (list === 'sections') return t.sections as ListItems[L][];
  if (list === 'meta') return t.meta as ListItems[L][];
  if (t.kind !== 'adventure') return [];
  return (list === 'sceneFields' ? t.sceneFields : t.callouts) as ListItems[L][];
}

// The mark of each row of the draft's list, by index; unchanged rows have
// none.
export function rowMarks<L extends ListName>(saved: Template, draft: Template, list: L): (Mark | null)[] {
  const before = listOf(saved, list);
  const after = listOf(draft, list);
  const name = nameOf[list] as (item: ListItems[L]) => string;
  const taken = new Set<number>();
  const partner = (item: ListItems[L]): number => {
    const keyed = item as Keyed;
    const tries: ((other: ListItems[L]) => boolean)[] = [];
    if (keyed.uid !== undefined) tries.push((o) => (o as Keyed).uid === keyed.uid);
    if (keyed.role !== undefined) {
      tries.push((o) => (o as Keyed).role === keyed.role && ((o as Keyed).uid === undefined || keyed.uid === undefined));
    }
    tries.push((o) => name(o) === name(item) && ((o as Keyed).uid === undefined || keyed.uid === undefined));
    for (const test of tries) {
      const index = before.findIndex((o, i) => !taken.has(i) && test(o));
      if (index !== -1) return index;
    }
    return -1;
  };
  return after.map((item) => {
    const index = partner(item);
    if (index === -1) return 'added';
    taken.add(index);
    return JSON.stringify(before[index]) === JSON.stringify(item) ? null : 'changed';
  });
}

export interface LineMark {
  // 0-based line of the starting document.
  line: number;
  mark: Mark | null;
  // A ## heading of an optional section.
  optional: boolean;
  // A ## heading of an adventure's section that does not print: the
  // appendix, or one the template leaves out.
  out: boolean;
}

// The marks on the starting document's lines: a heading by its section, a
// bold label by its field, a box by its type, a front matter key by its key.
export function previewMarks(text: string, saved: Template, draft: Template): LineMark[] {
  const marked = <L extends ListName>(list: L, key: (item: ListItems[L]) => string) => {
    const marks = rowMarks(saved, draft, list);
    const out = new Map<string, Mark | null>();
    listOf(draft, list).forEach((item, i) => out.set(key(item), marks[i] ?? null));
    return out;
  };
  const sections = marked('sections', (s) => s.heading ?? s.name);
  const optional = new Set(draft.sections.filter((s) => s.requirement === 'optional').map((s) => s.heading ?? s.name));
  const out = new Set(
    draft.kind === 'adventure' ? draft.sections.filter((s) => !sectionPdf(s).print).map((s) => s.heading ?? s.name) : [],
  );
  const fields = marked('sceneFields', (f) => f.label);
  const boxes = marked('callouts', (c) => (c.meta ? `${c.type}|${c.meta}` : c.type));
  const keys = marked('meta', (k) => k.key);

  const lines: LineMark[] = [];
  let frontMatter = false;
  text.split('\n').forEach((line, index) => {
    if (line === '---') {
      frontMatter = index === 0;
      return;
    }
    let mark: Mark | null = null;
    let isOptional = false;
    let isOut = false;
    if (frontMatter) {
      const key = /^([^:\s][^:]*):/.exec(line)?.[1];
      if (key) mark = keys.get(key) ?? null;
    } else if (line.startsWith('## ')) {
      const heading = line.slice(3);
      mark = sections.get(heading) ?? null;
      isOptional = optional.has(heading);
      isOut = out.has(heading);
    } else if (line.startsWith('**')) {
      const label = /^\*\*(.+?):?\*\*/.exec(line)?.[1];
      if (label) mark = fields.get(label) ?? null;
    } else if (line.startsWith('> [!')) {
      const type = /^> \[!([^\]]+)\]/.exec(line)?.[1];
      if (type) mark = boxes.get(type) ?? null;
    }
    if (mark || isOptional || isOut) lines.push({ line: index, mark, optional: isOptional, out: isOut });
  });
  return lines;
}
