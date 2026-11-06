import type { SystemInput } from '../systems.js';

export const coriolis: SystemInput = {
  id: 'coriolis',
  name: 'Coriolis',
  tables: [],
  kinds: [
    {
      name: 'PNG',
      fields: [
        { key: 'Ruolo', block: 'text', show: 'sub' },
        { key: 'Attributi', block: 'stats', labels: ['FOR', 'AGI', 'ACU', 'EMP'], show: 'row', requirement: 'required' },
        { key: 'Abilità', block: 'list', style: 'line', show: 'row' },
        { key: 'PF', block: 'boxes', count: { from: 'written' }, show: 'row' },
        { key: 'PM', block: 'boxes', count: { from: 'written' }, show: 'row' },
        { key: 'Reputazione', block: 'number', show: 'none' },
        { key: 'Armatura', block: 'number', show: 'row' },
        {
          key: 'Armi',
          block: 'rows',
          columns: [{ name: 'Arma' }, { name: 'Danno' }, { name: 'Critico' }, { name: 'Gittata' }],
          show: 'row',
        },
        { key: 'Talenti', block: 'list', style: 'line', show: 'row' },
      ],
    },
  ],
};
