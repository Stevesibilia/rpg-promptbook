import type { SystemInput } from '../systems.js';

// A test's difficulty and danger are words; the tables give their tokens.
export const nte: SystemInput = {
  id: 'nte',
  name: 'Not the End',
  tables: [
    {
      name: 'Difficoltà',
      columns: ['Parola', 'Gettoni'],
      rows: [
        ['facilissima', '1'],
        ['facile', '2'],
        ['media', '3'],
        ['difficile', '4'],
        ['difficilissima', '5'],
        ['quasi impossibile', '6'],
        ['impossibile', ''],
      ],
    },
    {
      name: 'Pericolo',
      columns: ['Parola', 'Esce con'],
      rows: [
        ['estremamente pericolosa', '1'],
        ['molto pericolosa', '2'],
        ['abbastanza pericolosa', '3'],
        ['poco pericolosa', '4'],
        ['per niente pericolosa', ''],
      ],
    },
  ],
  kinds: [
    {
      name: 'Sfida',
      fields: [
        { key: 'Descrizione', block: 'text', show: 'none' },
        {
          key: 'Prove',
          block: 'rows',
          columns: [{ name: 'Azione' }, { name: 'Difficoltà', table: 'Difficoltà' }, { name: 'Pericolo', table: 'Pericolo' }],
          show: 'row',
          requirement: 'required',
        },
        { key: 'Sventure', block: 'list', style: 'line', show: 'row' },
        { key: 'Complicazioni', block: 'list', style: 'line', show: 'row' },
        { key: 'Approfondimenti', block: 'text', show: 'none' },
        { key: 'Regole speciali', block: 'text', show: 'row' },
      ],
    },
  ],
};
