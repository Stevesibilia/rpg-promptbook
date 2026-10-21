import { describe, expect, it } from 'vitest';
import type { ProjectRow } from '../src/api.js';
import {
  buildList,
  categoryCounts,
  defaultFilters,
  metaLine,
  readFilters,
  type ListFilters,
} from '../src/projects/list.js';

let n = 0;
function project(patch: Partial<ProjectRow>): ProjectRow {
  n += 1;
  return {
    id: `p${n}`,
    title: `Project ${n}`,
    category: 'adventure',
    status: 'draft',
    campaignId: null,
    system: '',
    seed: '',
    todoDone: 0,
    todoTotal: 0,
    nextDue: null,
    scenes: null,
    words: null,
    errors: null,
    warnings: null,
    gdrarchive: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    editedAt: `2026-10-${String(n).padStart(2, '0')}T10:00:00.000Z`,
    deletedAt: null,
    ...patch,
  };
}

// The mockup's eight projects, as far as filtering cares.
const blacksad = project({
  id: 'bl',
  title: 'Blacksad - Il Continentale',
  category: 'campaign',
  status: 'in-progress',
});
const lorenzetti = project({
  id: 'lo',
  title: 'Il ballo dei Lorenzetti',
  campaignId: 'bl',
  seed: 'Un ballo in maschera',
});
const kenmore = project({ id: 'sp', title: 'Pioggia su Kenmore Street', campaignId: 'bl', status: 'complete' });
const gabbiano = project({ id: 'cg', title: 'Cronaca del Gabbiano', category: 'campaign', status: 'in-progress' });
const ali = project({ id: 'ca', title: "Le ali di Ca' Malamocco", campaignId: 'cg', status: 'in-progress' });
const sabaoth = project({ id: 'sa', title: "L'Ancora di Sabaoth", category: 'one-shot', status: 'in-progress' });
const esempio = project({ id: 'ex', title: "L'Ancora di Sabaoth (esempio del modello)", category: 'one-shot' });
const apocrypha = project({ id: 'ap', title: 'Apocrypha', category: 'campaign', status: 'complete' });
const all = [blacksad, lorenzetti, kenmore, gabbiano, ali, sabaoth, esempio, apocrypha];

const ids = (filters: Partial<ListFilters>) =>
  buildList(all, { ...defaultFilters(), sort: 'title', ...filters }).rows.map(
    (r) => `${r.child ? '  ' : ''}${r.project.id}${r.dimmed ? ' (dimmed)' : ''}`,
  );

describe('buildList', () => {
  it('hides complete projects at first and groups under campaigns', () => {
    const result = buildList(all, { ...defaultFilters(), sort: 'title' });
    expect(result.shown).toBe(6);
    expect(result.total).toBe(8);
    expect(ids({})).toEqual(['bl', '  lo', 'cg', '  ca', 'sa', 'ex']);
  });

  it('shows adventures under their campaign, dimmed, with Complete on', () => {
    expect(ids({ category: 'adventure', statuses: ['draft', 'in-progress', 'complete'] })).toEqual([
      'bl (dimmed)',
      '  lo',
      '  sp',
      'cg (dimmed)',
      '  ca',
    ]);
    expect(
      buildList(all, { ...defaultFilters(), category: 'adventure', statuses: ['draft', 'in-progress', 'complete'] })
        .shown,
    ).toBe(3);
  });

  it('lists flat without grouping', () => {
    expect(ids({ grouped: false, category: 'adventure' })).toEqual(['lo', 'ca']);
  });

  it('searches titles and seeds, ignoring case', () => {
    expect(ids({ query: 'MASCHERA' })).toEqual(['bl (dimmed)', '  lo']);
    expect(ids({ query: 'sabaoth', grouped: false })).toEqual(['sa', 'ex']);
  });

  it('says nothing matches with an empty result', () => {
    expect(buildList(all, { ...defaultFilters(), query: 'nessuno' })).toMatchObject({ rows: [], shown: 0 });
  });

  it('treats a project whose campaign is gone as stand-alone', () => {
    const orphan = project({ id: 'or', title: 'Orfano', campaignId: 'missing' });
    expect(buildList([orphan], defaultFilters()).rows).toEqual([{ project: orphan, child: false, dimmed: false }]);
  });

  it('sorts by last edit, next due date and to-do left', () => {
    const a = project({
      title: 'A',
      editedAt: '2026-10-10T00:00:00Z',
      nextDue: '2026-11-01',
      todoDone: 1,
      todoTotal: 9,
    });
    const b = project({ title: 'B', editedAt: '2026-10-12T00:00:00Z', nextDue: null, todoDone: 4, todoTotal: 5 });
    const c = project({
      title: 'C',
      editedAt: '2026-10-11T00:00:00Z',
      nextDue: '2026-10-24',
      todoDone: 0,
      todoTotal: 3,
    });
    const order = (sort: ListFilters['sort']) =>
      buildList([a, b, c], { ...defaultFilters(), sort }).rows.map((r) => r.project.title);
    expect(order('edited')).toEqual(['B', 'C', 'A']);
    expect(order('due')).toEqual(['C', 'A', 'B']);
    expect(order('left')).toEqual(['B', 'C', 'A']);
    expect(order('title')).toEqual(['A', 'B', 'C']);
  });
});

describe('categoryCounts', () => {
  it('counts every project per category', () => {
    expect(categoryCounts(all)).toEqual({ all: 8, campaign: 3, adventure: 3, 'one-shot': 2 });
  });
});

describe('readFilters', () => {
  it('falls back to the defaults for missing or broken values', () => {
    expect(readFilters(null)).toEqual(defaultFilters());
    expect(readFilters('not json')).toEqual(defaultFilters());
    expect(readFilters('{"category":"nope","statuses":["complete","bogus"],"grouped":false,"sort":"title"}')).toEqual({
      ...defaultFilters(),
      statuses: ['complete'],
      grouped: false,
      sort: 'title',
    });
  });
});

describe('metaLine', () => {
  it('shows the system, scenes and problems of an adventure', () => {
    expect(metaLine(project({ system: 'Kulthos', category: 'one-shot', scenes: 5, errors: 1, warnings: 3 }))).toBe(
      'Kulthos · 5 scenes · 1 error, 3 warnings',
    );
    expect(metaLine(project({ system: 'Historia', category: 'campaign', scenes: null }))).toBe('Historia');
  });
});
