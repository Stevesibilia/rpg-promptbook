import type { SystemInput } from '../systems.js';

// Apocalypse World and Monster of the Week kinds.
export const pbta: SystemInput = {
  id: 'pbta',
  name: 'PbtA',
  tables: [],
  kinds: [
    {
      name: 'Minaccia',
      fields: [
        { key: 'Tipo di minaccia', block: 'text', show: 'sub' },
        { key: 'Impulso', block: 'text', show: 'quote' },
        { key: 'Danno', block: 'text', show: 'row' },
        { key: 'Armatura', block: 'number', show: 'row' },
        { key: 'Ferite', block: 'clock', count: { from: 'fixed', n: 6 }, show: 'row' },
        { key: 'Mosse', block: 'list', style: 'line', show: 'row' },
      ],
    },
    {
      name: 'Mostro',
      fields: [
        { key: 'Specie', block: 'text', show: 'sub' },
        { key: 'Motivazione', block: 'text', show: 'quote' },
        { key: 'Attacchi', block: 'list', style: 'line', show: 'row' },
        { key: 'Capacità di danno', block: 'boxes', count: { from: 'written' }, show: 'row' },
        { key: 'Armatura', block: 'number', show: 'row' },
        { key: 'Debolezza', block: 'text', show: 'row' },
        { key: 'Poteri', block: 'list', style: 'line', show: 'row' },
      ],
    },
  ],
};
