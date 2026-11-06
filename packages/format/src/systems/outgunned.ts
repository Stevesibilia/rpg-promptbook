import type { SystemInput } from '../systems.js';

type FieldInput = SystemInput['kinds'][number]['fields'][number];

const grit: FieldInput[] = [
  { key: 'Grinta', block: 'boxes', count: { from: 'written' }, marks: true, show: 'row', requirement: 'required' },
  { key: 'Difesa', block: 'choice', table: 'Livelli', show: 'row' },
  { key: 'Attacco', block: 'text', show: 'row' },
];
const talents: FieldInput = { key: 'Talenti', block: 'list', style: 'paras', show: 'row' };

export const outgunned: SystemInput = {
  id: 'outgunned',
  name: 'Outgunned',
  tables: [{ name: 'Livelli', columns: ['Livello'], rows: [['Base'], ['Critico'], ['Estremo'], ['Impossibile']] }],
  kinds: [
    { name: 'Scagnozzi', fields: [...grit, { key: 'Branco', block: 'flag', word: 'in gruppo', show: 'sub' }] },
    { name: 'Cattivo', fields: [...grit, talents] },
    { name: 'Boss', fields: [...grit, talents] },
  ],
};
