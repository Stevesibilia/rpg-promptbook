import type { SystemInput } from '../systems.js';

export const dnd5e: SystemInput = {
  id: 'dnd5e',
  name: 'D&D 5e',
  tables: [
    {
      name: 'Grado di sfida',
      columns: ['GS', 'PE', 'BC'],
      rows: [
        ['1/4', '50', '+2'],
        ['1/2', '100', '+2'],
        ['1', '200', '+2'],
        ['2', '450', '+2'],
        ['3', '700', '+2'],
        ['5', '1.800', '+3'],
        ['8', '3.900', '+3'],
        ['10', '5.900', '+4'],
      ],
    },
  ],
  kinds: [
    {
      name: 'Creatura',
      fields: [
        { key: 'Taglia e tipo', block: 'text', show: 'sub' },
        { key: 'CA', block: 'text', show: 'row', requirement: 'required' },
        { key: 'PF', block: 'number', line: true, show: 'row', requirement: 'required' },
        { key: 'Velocità', block: 'text', show: 'row' },
        {
          key: 'Caratteristiche',
          block: 'stats',
          labels: ['FOR', 'DES', 'COS', 'INT', 'SAG', 'CAR'],
          show: 'row',
          requirement: 'required',
        },
        { key: 'Tiri salvezza', block: 'text', show: 'none' },
        { key: 'Abilità', block: 'text', show: 'row' },
        { key: 'Immunità', block: 'text', show: 'row' },
        { key: 'Sensi', block: 'text', show: 'none' },
        { key: 'Linguaggi', block: 'text', show: 'none' },
        { key: 'Sfida', block: 'choice', table: 'Grado di sfida', also: true, show: 'row' },
        { key: 'Tratti', block: 'list', style: 'paras', show: 'row' },
        { key: 'Azioni', block: 'list', style: 'paras', show: 'row' },
        { key: 'Azioni leggendarie', block: 'boxes', count: { from: 'written' }, show: 'row' },
      ],
    },
  ],
};

// Historia uses the D&D 5e sheet under its own name.
export const historia: SystemInput = {
  ...(JSON.parse(JSON.stringify(dnd5e)) as SystemInput),
  id: 'historia',
  name: 'Historia',
};
