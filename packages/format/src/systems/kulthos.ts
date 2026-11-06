import type { SystemInput } from '../systems.js';

// A threat's grade picks its wounds and afflictions from «Gradi».
export const kulthos: SystemInput = {
  id: 'kulthos',
  name: 'Kulthos',
  tables: [
    {
      name: 'Gradi',
      columns: ['Grado', 'Ferite', 'Afflizioni'],
      rows: [
        ['Ordinaria', '3', '1'],
        ['Straordinaria', '6', '2'],
        ['Leggendaria', '9', '3'],
      ],
    },
  ],
  kinds: [
    {
      name: 'Minaccia',
      fields: [
        { key: 'Grado', block: 'choice', table: 'Gradi', show: 'sub', afterType: true, requirement: 'required' },
        { key: 'Natura', block: 'text', show: 'none' },
        { key: 'Branco', block: 'flag', word: 'branco', show: 'sub' },
        { key: 'Ferite', block: 'boxes', count: { from: 'table', table: 'Gradi', column: 'Ferite' }, group: 3, show: 'row' },
        { key: 'Afflizioni', block: 'boxes', count: { from: 'table', table: 'Gradi', column: 'Afflizioni' }, show: 'row' },
        { key: 'Volontà', block: 'text', show: 'none' },
        { key: 'Condotta', block: 'text', show: 'none' },
        { key: 'Talenti', block: 'list', style: 'paras', show: 'row' },
      ],
    },
  ],
};
