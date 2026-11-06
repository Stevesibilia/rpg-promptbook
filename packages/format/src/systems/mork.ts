import type { SystemInput } from '../systems.js';

export const mork: SystemInput = {
  id: 'mork',
  name: 'Mörk Borg',
  tables: [],
  kinds: [
    {
      name: 'Creatura',
      fields: [
        { key: 'PF', block: 'boxes', count: { from: 'written' }, group: 5, show: 'row', requirement: 'required' },
        { key: 'Morale', block: 'number', show: 'row' },
        { key: 'Armatura', block: 'text', show: 'row' },
        { key: 'Attacco', block: 'text', show: 'row' },
        { key: 'Speciale', block: 'text', show: 'row' },
      ],
    },
  ],
};
