import type { SystemInput } from '../systems.js';

export const fate: SystemInput = {
  id: 'fate',
  name: 'Fate',
  tables: [],
  kinds: [
    {
      name: 'PNG principale',
      fields: [
        { key: 'Concetto', block: 'text', show: 'sub', requirement: 'required' },
        { key: 'Problema', block: 'text', show: 'row' },
        { key: 'Aspetti', block: 'list', style: 'line', show: 'row' },
        { key: 'Abilità', block: 'list', style: 'line', show: 'row' },
        { key: 'Stunt', block: 'list', style: 'paras', show: 'row' },
        { key: 'Stress fisico', block: 'boxes', count: { from: 'written' }, values: true, show: 'row' },
        { key: 'Stress mentale', block: 'boxes', count: { from: 'written' }, values: true, show: 'row' },
        { key: 'Conseguenze', block: 'lines', labels: ['Lieve −2', 'Moderata −4', 'Grave −6'], show: 'row' },
      ],
    },
    {
      name: 'Comparsa',
      fields: [
        { key: 'Aspetti', block: 'list', style: 'line', show: 'sub' },
        { key: 'Abilità', block: 'list', style: 'line', show: 'row' },
        { key: 'Stress', block: 'boxes', count: { from: 'written' }, show: 'row' },
      ],
    },
  ],
};
