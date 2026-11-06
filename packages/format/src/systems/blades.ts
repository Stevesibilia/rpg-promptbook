import type { SystemInput } from '../systems.js';

export const blades: SystemInput = {
  id: 'blades',
  name: 'Blades in the Dark',
  tables: [{ name: 'Presa', columns: ['Presa'], rows: [['debole'], ['forte']] }],
  kinds: [
    {
      name: 'Fazione',
      fields: [
        { key: 'Livello', block: 'text', show: 'sub', requirement: 'required' },
        { key: 'Presa', block: 'choice', table: 'Presa', show: 'sub' },
        { key: 'Natura', block: 'text', show: 'sub' },
        { key: 'Territorio', block: 'list', style: 'line', show: 'row' },
        { key: 'Risorse', block: 'list', style: 'line', show: 'row' },
        { key: 'Obiettivi', block: 'clock', count: { from: 'written' }, show: 'row' },
        { key: 'Alleati', block: 'list', style: 'line', show: 'row' },
        { key: 'Nemici', block: 'list', style: 'line', show: 'row' },
        { key: 'Situazione', block: 'text', show: 'none' },
      ],
    },
    {
      name: 'PNG',
      fields: [
        { key: 'Ruolo', block: 'text', show: 'sub' },
        { key: 'Qualità', block: 'number', show: 'row' },
        { key: 'Tratti', block: 'list', style: 'line', show: 'row' },
        { key: 'Vuole', block: 'text', show: 'row' },
      ],
    },
  ],
};
