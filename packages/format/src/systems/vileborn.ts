import type { SystemInput } from '../systems.js';

export const vileborn: SystemInput = {
  id: 'vileborn',
  name: 'Vileborn',
  tables: [
    {
      name: 'Difficoltà',
      columns: ['Parola', 'Valore'],
      rows: [
        ['facile', '4'],
        ['normale', '5'],
        ['difficile', '6'],
        ['molto difficile', '7'],
      ],
    },
  ],
  kinds: [
    {
      name: 'Sfida',
      fields: [
        { key: 'Specie', block: 'text', show: 'sub' },
        { key: 'Motto', block: 'text', show: 'quote' },
        {
          key: 'Approcci',
          block: 'stats',
          labels: ['Forza', 'Sotterfugio', 'Precisione', 'Ragione', 'Influenza', 'Volontà'],
          show: 'row',
          requirement: 'required',
        },
        { key: 'Resistenze', block: 'list', style: 'line', show: 'row' },
        { key: 'Debolezze', block: 'list', style: 'line', show: 'row' },
        { key: 'Colpi', block: 'boxes', count: { from: 'written' }, marks: true, show: 'row', requirement: 'required' },
        { key: 'Eventi', block: 'text', show: 'row' },
        { key: 'Regole uniche', block: 'text', show: 'row' },
        { key: 'Complicazioni', block: 'list', style: 'check', show: 'row' },
        { key: 'Dado dell’oscurità', block: 'rows', columns: [{ name: 'Soglia' }, { name: 'Effetto' }], show: 'row' },
      ],
    },
  ],
};
