import { skeletonDocument } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import sabaoth from '../../format/fixtures/l-ancora-di-sabaoth.converted.md?raw';
import { currentItem, outlineOf } from '../src/editor/outline.js';
import { analysed, campaign } from './analysed.js';

const line = (item: {
  depth: number;
  id: string | null;
  name: string;
  badge: { count: number; severity: string } | null;
}) =>
  `${item.depth ? '  ' : ''}${item.id ? `${item.id} ` : ''}${item.name}${item.badge ? ` [${item.badge.count} ${item.badge.severity}]` : ''}`;

describe('outlineOf', () => {
  it('lists the front matter, sections, scenes and sheets of Sabaoth with their badges', () => {
    const { state } = analysed(sabaoth);
    expect(outlineOf(state).map(line)).toEqual([
      // «La vicenda in breve» is missing: reported at the top of the text.
      'Front matter [1 error]',
      "A colpo d'occhio [1 warning]",
      'Da non perdere stasera',
      'Orologio',
      'Verità del mondo',
      'Inizio forte',
      'Mappa delle scene',
      'Scene',
      '  S1 La casa che cede',
      "  S2 L'ambulatorio di Salvi",
      '  S3 Il cordone di Donato',
      '  S4 Torre Faro e la canzone',
      // An unknown field (error) and a threat outside «Chi c'è» (warning).
      '  S5 Capo Peloro, la terza scossa [2 error]',
      'Indizi',
      'PNG',
      'Schede',
      '  Sabaoth',
      '  Dottor Umberto Salvi [1 warning]',
      '  Tenente Donato',
      '  Pattuglia di Quieti',
      '  Il Circolo dello Stretto',
      'Prima della sessione',
      'Appendice: immagini e musica',
    ]);
  });

  it('points each item at its heading, and only scenes move', () => {
    const { state } = analysed(sabaoth);
    const items = outlineOf(state);
    const s4 = items.find((i) => i.id === 'S4')!;
    expect(state.sliceDoc(s4.head, s4.head + 7)).toBe('### S4.');
    expect(items.filter((i) => i.movable).map((i) => i.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5']);
  });

  it('follows the text while the analysis is stale', () => {
    const { state } = analysed(sabaoth);
    const typed = state.update({ changes: { from: 0, insert: 'abc' } }).state;
    const s4 = outlineOf(typed).find((i) => i.id === 'S4')!;
    expect(typed.sliceDoc(s4.head, s4.head + 7)).toBe('### S4.');
  });

  it('lists the ## and ### headings of a campaign, without badges or moves', () => {
    const doc = skeletonDocument('campaign', {
      title: 'La campagna',
      system: '',
      campaignTitle: null,
      author: '',
      copyright: '',
      licence: '',
    }).concat('\n### Sessione 1\n');
    const items = outlineOf(campaign(doc));
    expect(items.map(line)).toEqual([
      'Premessa',
      'Fronti',
      'PNG ricorrenti',
      'Fili aperti',
      'Sessioni',
      '  Sessione 1',
    ]);
    expect(items.some((i) => i.movable || i.badge)).toBe(false);
  });
});

describe('currentItem', () => {
  it('is the scene holding the cursor, else its section or the front matter', () => {
    const at = (needle: string) => sabaoth.indexOf(needle);
    const place = (pos: number) => currentItem(analysed(sabaoth, pos).state)?.place;
    expect(place(at('### S3.') + 10)).toBe('S3 · Il cordone di Donato');
    expect(place(at('## Orologio') + 5)).toBe('Orologio');
    expect(place(5)).toBe('Front matter');
    expect(place(at('## Appendice'))).toBe('Appendice');
    expect(place(sabaoth.length - 1)).toBe('Appendice');
  });

  it('stays on the item while typing at its end, before the next result', () => {
    const end = sabaoth.indexOf('\n\n### S4.');
    let { state } = analysed(sabaoth, end);
    for (const ch of ' e poi') {
      const at = state.selection.main.head;
      state = state.update({ changes: { from: at, insert: ch }, selection: { anchor: at + 1 } }).state;
    }
    expect(state.sliceDoc(end, end + 6)).toBe(' e poi');
    expect(currentItem(state)?.place).toBe('S3 · Il cordone di Donato');
  });

  it('is the last heading before the cursor in a campaign', () => {
    const doc = '## Premessa\n\nTesto.\n\n### Dettaglio\n\nAltro.\n';
    expect(currentItem(campaign(doc, doc.indexOf('Altro')))?.place).toBe('Dettaglio');
    expect(currentItem(campaign(doc, 0))?.place).toBe('Premessa');
  });
});
