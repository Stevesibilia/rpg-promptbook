import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { Model, Severity } from 'promptbook-format';
import { analysisField, type Analysis, type Place } from './analysis/field.js';
import { hiddenOf, partitionOf, type HiddenState } from './cm/hidden.js';

// One line of the outline (design decision 6), with its positions in the
// current text.
export interface OutlineItem {
  // Stable while the analysis stays the same: "scene:2", "heading:3".
  key: string;
  kind: Place['kind'] | 'heading';
  // The index in the model's list of that kind; for a campaign heading, its
  // index among the headings.
  index: number;
  // 0 for front matter, sections and campaign ## headings; 1 for scenes,
  // sheets and campaign ### headings.
  depth: 0 | 1;
  // The scene id ("S1"), shown apart from the name.
  id: string | null;
  // What the outline shows.
  name: string;
  // What the status bar shows for the cursor's place.
  place: string;
  from: number;
  to: number;
  // Where a click puts the cursor: the start of the heading.
  head: number;
  // The shown problems that start in this item and not in one of its
  // children.
  badge: { count: number; severity: Severity } | null;
  // Scenes only: they can be moved.
  movable: boolean;
}

const cache = new WeakMap<object, readonly OutlineItem[]>();
// Per analysis, then per hidden state: a hide changes the badges and not the
// analysis (hide-problems design decision 13).
const analysed = new WeakMap<Analysis, { hidden: HiddenState; items: readonly OutlineItem[] }>();

// The outline of the document as it is now: from the latest analysis for an
// adventure or a one-shot (fresh or stale, its positions mapped), from the
// Markdown headings for a campaign (design decision 2).
export function outlineOf(state: EditorState): readonly OutlineItem[] {
  const value = state.field(analysisField, false);
  if (value?.checked) {
    if (!value.result) return [];
    const hidden = hiddenOf(state);
    let cached = analysed.get(value);
    if (cached?.hidden !== hidden) analysed.set(value, (cached = { hidden, items: fromAnalysis(value, hidden) }));
    return cached.items;
  }
  const tree = syntaxTree(state);
  let items = cache.get(tree);
  if (!items) cache.set(tree, (items = fromHeadings(state)));
  return items;
}

function fromAnalysis(analysis: Analysis, hidden: HiddenState): OutlineItem[] {
  const { result, places, spots } = analysis;
  const model: Model = result!.model;
  const scenesSection = model.sections.findIndex((s) => s.role === 'scenes');
  const sheetsSection = model.sections.findIndex((s) => s.role === 'sheets');
  const of = (kind: Place['kind']) => places.filter((p) => p.kind === kind);

  const item = (place: Place, depth: 0 | 1, fields: Pick<OutlineItem, 'id' | 'name' | 'place'>): OutlineItem => ({
    key: `${place.kind}:${place.index}`,
    kind: place.kind,
    index: place.index,
    depth,
    ...fields,
    from: place.from,
    to: place.to,
    head: place.head,
    badge: null,
    movable: place.kind === 'scene',
  });

  const children = (kind: 'scene' | 'sheet') =>
    of(kind).map((place) => {
      if (kind === 'sheet') {
        const { name } = model.sheets[place.index]!;
        return item(place, 1, { id: null, name, place: name });
      }
      const { id, title, heading } = model.scenes[place.index]!;
      return item(place, 1, { id, name: id ? title : heading, place: id ? `${id} · ${title}` : title });
    });

  const items: OutlineItem[] = [];
  for (const place of of('meta')) items.push(item(place, 0, { id: null, name: 'Front matter', place: 'Front matter' }));
  for (const place of of('section')) {
    const section = model.sections[place.index]!;
    items.push(item(place, 0, { id: null, name: section.heading, place: section.name ?? section.heading }));
    if (place.index === scenesSection) items.push(...children('scene'));
    if (place.index === sheetsSection) items.push(...children('sheet'));
  }

  // Each shown problem goes to the deepest item it starts in.
  const counts = new Map<OutlineItem, { count: number; severity: Severity }>();
  partitionOf(result!, analysis.doc!, hidden).shown.forEach(({ problem, index }) => {
    const at = spots[index]?.from ?? problem.range.start.offset;
    const owner = deepest(items, (item) => item.from <= at && at <= item.to);
    if (!owner) return;
    const badge = counts.get(owner) ?? { count: 0, severity: 'warning' as Severity };
    badge.count += 1;
    if (problem.severity === 'error') badge.severity = 'error';
    counts.set(owner, badge);
  });
  return items.map((it) => (counts.has(it) ? { ...it, badge: counts.get(it)! } : it));
}

// The last item at the greatest depth that `holds` accepts.
function deepest(items: readonly OutlineItem[], holds: (item: OutlineItem) => boolean): OutlineItem | null {
  let found: OutlineItem | null = null;
  for (const item of items) if (holds(item) && (!found || item.depth >= found.depth)) found = item;
  return found;
}

const headingText = (state: EditorState, from: number, to: number) =>
  state
    .sliceDoc(from, to)
    .replace(/^#+\s*/, '')
    .replace(/\s+#+\s*$/, '');

// A campaign's ## and ### headings at the top level of the Markdown tree;
// each runs to the next heading.
function fromHeadings(state: EditorState): OutlineItem[] {
  const items: OutlineItem[] = [];
  for (let node = syntaxTree(state).topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== 'ATXHeading2' && node.name !== 'ATXHeading3') continue;
    const name = headingText(state, node.from, node.to);
    const index = items.length;
    items.push({
      key: `heading:${index}`,
      kind: 'heading',
      index,
      depth: node.name === 'ATXHeading2' ? 0 : 1,
      id: null,
      name,
      place: name,
      from: node.from,
      to: state.doc.length,
      head: node.from,
      badge: null,
      movable: false,
    });
    if (index > 0) items[index - 1]!.to = node.from - 1;
  }
  return items;
}

// The item holding the cursor, ends included: the scene, else the front
// matter or the section; for a campaign the last heading before it. The
// blank lines between two items belong to neither.
export function currentItem(state: EditorState, pos = state.selection.main.head): OutlineItem | null {
  return deepest(outlineOf(state), (item) => item.from <= pos && pos <= item.to);
}
