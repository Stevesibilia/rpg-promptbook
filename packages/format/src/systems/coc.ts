import type { SystemInput } from '../systems.js';

export const coc: SystemInput = {
  id: 'coc',
  name: 'Call of Cthulhu',
  tables: [],
  kinds: [
    {
      name: 'Creatura',
      fields: [
        {
          key: 'Caratteristiche',
          block: 'stats',
          labels: ['FOR', 'COS', 'TAG', 'DES', 'INT', 'POT'],
          show: 'row',
          requirement: 'required',
        },
        { key: 'PF', block: 'boxes', count: { from: 'written' }, group: 5, show: 'row', requirement: 'required' },
        { key: 'PM', block: 'number', show: 'row' },
        { key: 'Movimento', block: 'text', show: 'row' },
        { key: 'Bonus al danno', block: 'text', show: 'row' },
        { key: 'Corporatura', block: 'number', show: 'row' },
        { key: 'Attacchi', block: 'list', style: 'paras', show: 'row' },
        { key: 'Schivare', block: 'text', show: 'row' },
        { key: 'Armatura', block: 'text', show: 'row' },
        { key: 'Perdita di Sanità', block: 'text', show: 'row' },
        { key: 'Incantesimi', block: 'list', style: 'line', show: 'none' },
      ],
    },
  ],
};
