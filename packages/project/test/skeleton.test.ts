import { defineTemplate, parseAdventure, templates, type AdventureTemplateInput } from 'promptbook-format';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { defaultSettings, readTodo, skeletonDocument, templateOf } from '../src/index.js';
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

  // The starting documents of template-editor design decision 9: the
  // campaign's is the text it always was; an adventure's first scene holds
  // its required and recommended fields, the boxes a scene needs and an
  // empty reactions table, and the strong start the boxes it needs.
  it('writes the starting documents from the built-in templates', () => {
    const input = { title: 'Il ballo', system: 'Kulthos', campaignTitle: 'Blacksad', author: 'A', copyright: '© C', licence: 'CC-BY-4.0' };
    const oneShot = { ...input, campaignTitle: null, system: '' };
    const sections =
      "## La vicenda in breve\n\n## Antefatto\n\n## A colpo d'occhio\n\n## Da non perdere stasera\n\n## Orologio\n\n## Verità del mondo\n\n## Inizio forte\n\n> [!leggi]\n> \n\n## Mappa delle scene\n\n## Regole della notte\n\n## Scene\n\n### S1. Prima scena\n\n**Luogo e momento:** \n\n**In gioco:** \n\n**Da non perdere qui**\n\n**Cosa succede da sé**\n\n**Indizi qui**\n\n**Se deragliano:** \n\n> [!leggi]\n> \n\n| Se i PG… | Allora… |\n| --- | --- |\n|  |  |\n\n## Indizi\n\n## PNG\n\n## Schede\n\n## Prima della sessione\n\n## Appendice: immagini e musica\n";
    const expected = {
      campaign:
        '---\ntitolo: Il ballo\nsistema: Kulthos\nformato: campagna\nautore: A\ncopyright: © C\nlicenza: CC-BY-4.0\n---\n\n## Premessa\n\n## Fronti\n\n## PNG ricorrenti\n\n## Fili aperti\n\n## Sessioni\n',
      adventure: `---\ntitolo: Il ballo\nsistema: Kulthos\nformato: avventura\ncampagna: Blacksad\nautore: A\ncopyright: © C\nlicenza: CC-BY-4.0\n---\n\n${sections}`,
      oneShot: `---\ntitolo: Il ballo\nsistema:\nformato: one-shot\nautore: A\ncopyright: © C\nlicenza: CC-BY-4.0\n---\n\n${sections}`,
    };
    expect(skeletonDocument('campaign', input)).toBe(expected.campaign);
    expect(skeletonDocument('adventure', input)).toBe(expected.adventure);
    expect(skeletonDocument('one-shot', oneShot)).toBe(expected.oneShot);
    const campagna = templateOf({ category: 'campaign', template: { id: 'campagna', version: 1 } });
    const avventura = templateOf({ category: 'adventure', template: { id: 'avventura', version: 1 } });
    expect(skeletonDocument('campaign', input, campagna)).toBe(expected.campaign);
    expect(skeletonDocument('adventure', input, avventura)).toBe(expected.adventure);
  });

  it('reads the starting scene back with its fields, box and reactions table', () => {
    const text = skeletonDocument('one-shot', { ...settings, title: 'Prova', system: '', campaignTitle: null });
    const { model } = parseAdventure(text, { template: templates.avventura });
    const [scene] = model.scenes;
    expect(scene?.id).toBe('S1');
    expect(scene?.fields.map((f) => [f.label, f.form])).toEqual([
      ['Luogo e momento', 'inline'],
      ['In gioco', 'inline'],
      ['Da non perdere qui', 'block'],
      ['Cosa succede da sé', 'block'],
      ['Indizi qui', 'block'],
      ['Se deragliano', 'inline'],
    ]);
    expect(scene?.readAlouds).toHaveLength(1);
    expect(scene?.reactions?.header).toEqual(['Se i PG…', 'Allora…']);
  });

  it("writes a template's own sections, fields and boxes", () => {
    const definition = JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
    definition.id = 't-0123456789';
    definition.sections.find((s) => s.role === 'strongStart')!.name = 'Apertura';
    definition.sections.splice(6, 0, { name: 'Atmosfera', requirement: 'optional', uid: 'u1' });
    definition.sceneFields.find((f) => f.label === 'Prove e regole')!.requirement = 'required';
    definition.sceneFields.find((f) => f.label === 'Indizi qui')!.requirement = 'optional';
    definition.callouts.push({
      type: 'mappa',
      role: 'box',
      column: 'side',
      label: 'Mappa',
      title: 'none',
      allowedIn: ['strongStart'],
      perPlace: { min: 1, max: 1 },
      uid: 'u2',
    });
    const text = skeletonDocument('adventure', { ...settings, title: 'Prova', system: '', campaignTitle: null }, defineTemplate(definition));
    expect(text).toContain('\n## Verità del mondo\n\n## Atmosfera\n\n## Apertura\n\n> [!leggi]\n> \n\n> [!mappa]\n> \n\n## Mappa delle scene\n');
    expect(text).toContain('\n**Cosa succede da sé**\n\n**Prove e regole:** \n\n**Se deragliano:** \n');
    expect(text).not.toContain('Indizi qui');
  });

  it("names the template's game system unless the settings name one", () => {
    const definition = JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
    definition.system = 'D&D 5e';
    const own = defineTemplate(definition);
    const input = { ...settings, title: 'Prova', campaignTitle: null };
    expect(frontMatter(skeletonDocument('one-shot', { ...input, system: '' }, own)).sistema).toBe('D&D 5e');
    expect(frontMatter(skeletonDocument('one-shot', { ...input, system: 'Kulthos' }, own)).sistema).toBe('Kulthos');
  });

  it("refuses a template of the other kind", () => {
    const input = { ...settings, title: 'Prova', system: '', campaignTitle: null };
    expect(() => skeletonDocument('campaign', input, templates.avventura)).toThrow(
      'A campaign cannot start from the adventure template avventura@1',
    );
    expect(() => skeletonDocument('one-shot', input, templates.campagna)).toThrow(
      'A one-shot cannot start from the campaign template campagna@1',
    );
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
      defaultTemplates: { adventure: 'avventura', campaign: 'campagna' },
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
