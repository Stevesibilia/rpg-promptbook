import { parseAdventure, templates } from 'promptbook-format';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { defaultSettings, readTodo, skeletonDocument } from '../src/index.js';
import { project } from './helpers.js';

const frontMatter = (text: string) => parse(/^---\n([\s\S]*?)---\n/.exec(text)![1]!) as Record<string, unknown>;
const forbidden = (text: string) =>
  parseAdventure(text, { template: templates.avventura })
    .problems.map((p) => p.code)
    .filter((code) => /^(meta\.|section\.|scene\.id\.)/.test(code));

const settings = { ...defaultSettings(), author: 'Stefano Sibilia', licence: 'CC-BY-NC-SA-4.0' };

describe('skeleton documents', () => {
  it('starts an adventure in a campaign from avventura@1 with no structural error', () => {
    const text = skeletonDocument('adventure', {
      title: 'Il ballo dei Lorenzetti',
      system: 'Not The End',
      campaignTitle: 'Blacksad - Il Continentale',
      author: settings.author,
      copyright: settings.copyright,
      licence: settings.licence,
    });
    expect(Object.keys(frontMatter(text))).toEqual([
      'titolo',
      'sistema',
      'formato',
      'campagna',
      'autore',
      'copyright',
      'licenza',
    ]);
    expect(frontMatter(text)).toMatchObject({
      titolo: 'Il ballo dei Lorenzetti',
      sistema: 'Not The End',
      formato: 'avventura',
      campagna: 'Blacksad - Il Continentale',
      autore: 'Stefano Sibilia',
      licenza: 'CC-BY-NC-SA-4.0',
    });
    expect(forbidden(text)).toEqual([]);
    const headings = text.split('\n').filter((line) => line.startsWith('#'));
    expect(headings).toEqual([
      ...templates.avventura.sections.slice(0, 10).map((s) => `## ${s.heading ?? s.name}`),
      '### S1. Prima scena',
      ...templates.avventura.sections.slice(10).map((s) => `## ${s.heading ?? s.name}`),
    ]);
    expect(headings.at(-1)).toBe('## Appendice: immagini e musica');
  });

  it('copies the author and licence defaults into a one-shot', () => {
    const text = skeletonDocument('one-shot', {
      title: "L'Ancora di Sabaoth",
      system: '',
      campaignTitle: null,
      author: settings.author,
      copyright: '',
      licence: settings.licence,
    });
    expect(text).toContain('\nautore: Stefano Sibilia\n');
    expect(text).toContain('\nlicenza: CC-BY-NC-SA-4.0\n');
    expect(text).toContain('\nformato: one-shot\n');
    expect(text).not.toContain('campagna');
    expect(frontMatter(text).titolo).toBe("L'Ancora di Sabaoth");
    expect(forbidden(text)).toEqual([]);
  });

  it('gives a campaign the plain skeleton', () => {
    const text = skeletonDocument('campaign', {
      title: 'Apocrypha',
      system: '',
      campaignTitle: 'ignored',
      author: '',
      copyright: '',
      licence: '',
    });
    expect(frontMatter(text)).toEqual({
      titolo: 'Apocrypha',
      sistema: null,
      formato: 'campagna',
      autore: null,
      copyright: null,
      licenza: null,
    });
    expect(text.split('\n').filter((line) => line.startsWith('#'))).toEqual([
      '## Premessa',
      '## Fronti',
      '## PNG ricorrenti',
      '## Fili aperti',
      '## Sessioni',
    ]);
  });

  it('quotes a title YAML would misread', () => {
    const text = skeletonDocument('one-shot', {
      title: 'Prova: due punti',
      system: '2026',
      campaignTitle: null,
      author: '',
      copyright: '',
      licence: '',
    });
    expect(frontMatter(text)).toMatchObject({ titolo: 'Prova: due punti', sistema: '2026' });
  });
});

describe('default settings', () => {
  it('holds the to-do templates of the spec and empty defaults', () => {
    const adventure = [
      'Scrivere le scene',
      'Schede dei PNG',
      'Prompt Midjourney',
      'Immagini scelte',
      'Prompt Suno',
      'Brani scelti',
      'PDF per il tavolo',
      'Export CueBard',
      'Rilettura',
    ];
    expect(defaultSettings()).toEqual({
      todoTemplates: {
        adventure,
        'one-shot': adventure,
        campaign: [
          'Fronti e minacce',
          'PNG ricorrenti',
          'Mappa',
          'Fili aperti dopo ogni sessione',
          'Rileggere le note prima di giocare',
        ],
      },
      author: '',
      copyright: '',
      licence: '',
      system: '',
    });
  });

  it('copies the template, so a later edit leaves existing projects alone', () => {
    const settings = defaultSettings();
    const doc = project({ todo: settings.todoTemplates['one-shot'] });
    settings.todoTemplates['one-shot'].push('Stampare le schede');
    expect(readTodo(doc)).toHaveLength(9);
    expect(defaultSettings().todoTemplates['one-shot']).toHaveLength(9);
    expect(project({ todo: settings.todoTemplates['one-shot'] }).getArray('todo').length).toBe(10);
  });
});
