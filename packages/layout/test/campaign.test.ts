import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  defineTemplate,
  parseAdventure,
  parseCampaign,
  templates,
  type CampaignTemplate,
  type CampaignTemplateInput,
} from 'promptbook-format';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  campaignChecks,
  createEngine,
  defaultLayoutOptions,
  MAX_TABS,
  tabOf,
  toCampaignLayoutInput,
  toLayoutInput,
  type Engine,
  type LayoutOptions,
} from '../src/index.js';
import { nodeAssets } from './helpers.js';

// One engine in this file: a second one keeps vitest from exiting.
let engine: Engine;

beforeAll(async () => {
  engine = await createEngine(await nodeAssets());
});

const fixture = readFileSync(new URL('../../format/fixtures/campagna-di-prova.md', import.meta.url), 'utf8');

function template(change: (t: CampaignTemplateInput) => void): CampaignTemplate {
  const definition = JSON.parse(JSON.stringify(templates.campagnaV2)) as CampaignTemplateInput;
  change(definition);
  return defineTemplate(definition);
}

const inputOf = (doc = fixture, t: CampaignTemplate = templates.campagnaV2, options: Partial<LayoutOptions> = {}) =>
  toCampaignLayoutInput(parseCampaign(doc, { template: t }), { ...defaultLayoutOptions, ...options }, { title: 'Progetto' }, t);

// The text of a PDF page by page, as the e2e suite reads it.
async function pdfTexts(pdf: Uint8Array): Promise<string[]> {
  const path = new URL('../../../e2e/pdf-text.ts', import.meta.url).href;
  const { pdfTexts: read } = (await import(/* @vite-ignore */ path)) as { pdfTexts: (pdf: Buffer) => string[] };
  return read(Buffer.from(pdf));
}

describe('toCampaignLayoutInput', () => {
  const input = inputOf();
  const titles = input.sections.map((s) => s.title);

  it('prints every section but the appendix, in document order', () => {
    expect(titles).toEqual([
      'Premessa',
      'Verità del mondo',
      'Fronti',
      'Fazioni',
      'PNG ricorrenti',
      'Archi',
      'Fili aperti',
      'Appunti del master',
    ]);
  });

  it('leaves out a section the template leaves out', () => {
    const t = template((d) => {
      d.sections.find((s) => s.name === 'Fazioni')!.pdf = { print: false };
    });
    expect(inputOf(fixture, t).sections.map((s) => s.title)).not.toContain('Fazioni');
  });

  it('prints an unknown section flowing, without a tab', () => {
    expect(input.sections.at(-1)).toMatchObject({ title: 'Appunti del master', newPage: false, tab: null, mark: 3 });
  });

  it('gives each section that starts a page a tab from the first word of its title', () => {
    expect(input.tabs).toEqual(['Fronti', 'PNG', 'Archi', 'Fili']);
    expect(input.sections.map((s) => [s.title, s.newPage, s.tab, s.mark])).toEqual([
      ['Premessa', false, null, null],
      ['Verità del mondo', false, null, null],
      ['Fronti', true, 'Fronti', 0],
      ['Fazioni', false, null, 0],
      ['PNG ricorrenti', true, 'PNG', 1],
      ['Archi', true, 'Archi', 2],
      ['Fili aperti', true, 'Fili', 3],
      ['Appunti del master', false, null, 3],
    ]);
    expect(['Fili aperti', 'Fronti:', 'PG e agganci', '«Archi»', 'Appendice: stile'].map(tabOf)).toEqual([
      'Fili',
      'Fronti',
      'PG',
      '«Archi',
      'Appendice',
    ]);
  });

  it('reads the title, the line above it and the credits from the front matter', () => {
    expect(input).toMatchObject({
      title: 'Le lanterne di Valmora',
      author: 'Autore di prova',
      copyright: null,
      licence: { short: 'CC BY 4.0', full: 'CC-BY-4.0', url: 'https://spdx.org/licenses/CC-BY-4.0.html' },
    });
    expect(input.head.over.map((b) => b.markdown)).toEqual(['**Sistema:** Kulthos', '**Formato:** campagna']);
    expect(input.head.from).toBe(0);
    expect(inputOf('## Premessa\n\nTesto.\n').title).toBe('Progetto');
  });

  it('sets the campaign layout template', () => {
    expect(input.options.template).toBe('campagna@1');
  });

  it('prints a prefix-matched heading as written, its tab from it', () => {
    const doc = '## Archi narrativi\n\nUno.\n\n## Premessa: la città\n\nDue.\n';
    const written = inputOf(doc);
    expect(written.sections.map((s) => [s.title, s.newPage, s.tab])).toEqual([
      ['Archi narrativi', true, 'Archi'],
      ['Premessa: la città', false, null],
    ]);
  });

  it('leaves the adventure layout to adventures', () => {
    const t = templates.avventura;
    const adventure = toLayoutInput(parseAdventure('', { template: t }).model, { ...defaultLayoutOptions, template: 'campagna@1' }, { title: 'x' }, t);
    expect(adventure.options.template).toBe('avventura@1');
  });

  it('prints a quote and a callout as quote boxes, the callout without its title line', () => {
    const boxes = input.sections.flatMap((s) => s.blocks).filter((b) => b.kind === 'quote' || b.kind === 'callout');
    expect(boxes.map((b) => b.kind !== 'subheading' && [b.kind, b.box, b.markdown])).toEqual([
      [
        'quote',
        { role: 'quote', label: null, title: null, side: false },
        "Sotto il ponte dei Sospiri l'acqua non riflette nulla: né la luna, né le lanterne, né chi si sporge a guardare.",
      ],
      [
        'callout',
        { role: 'quote', label: null, title: null, side: false },
        "Nane mente sempre sulla profondità dell'acqua, mai sulla strada.",
      ],
    ]);
  });

  it('keeps subheadings as their own blocks with their ID', () => {
    const fronti = input.sections.find((s) => s.title === 'Fronti')!;
    expect(fronti.blocks[0]).toEqual({ from: fixture.indexOf('### F1.'), kind: 'subheading', id: 'F1', name: 'La Gilda dei Lumi' });
    expect(input.lead.map((b) => b.kind)).toEqual(['paragraph']);
  });

  it('gives no tab to a section that starts a page past the twelfth, and no filled tab while it prints', () => {
    const names = Array.from({ length: 14 }, (_, i) => `Parte ${i + 1}`);
    const t = template((d) => {
      d.sections = names.map((name) => ({ name, requirement: 'optional', pdf: { newPage: true } }));
    });
    const doc = `${names.map((n) => `## ${n}\n\nTesto.\n`).join('\n')}\n## Coda\n\nAltro testo.\n`;
    const many = inputOf(doc, t);
    expect(many.tabs).toHaveLength(MAX_TABS);
    expect(many.sections.slice(11).map((s) => [s.title, s.tab, s.mark])).toEqual([
      ['Parte 12', 'Parte', 11],
      ['Parte 13', null, null],
      ['Parte 14', null, null],
      ['Coda', null, null],
    ]);
  });
});

describe('the campaign PDF', () => {
  const errors = (diagnostics: { severity: string }[]) => diagnostics.filter((d) => d.severity === 'error');

  it.each([
    ['A4', {}],
    ['US Letter', { paper: 'us-letter' as const }],
    ['ink saver', { inkSaver: true }],
  ])('builds the fixture on %s, every section on its page', async (_, options) => {
    const input = inputOf(fixture, templates.campagnaV2, options);
    const result = await engine.build(input);
    expect(errors(result.diagnostics)).toEqual([]);
    expect(result.pages.length).toBeGreaterThanOrEqual(4);
    expect(result.pages.length).toBeLessThanOrEqual(6);
    const parts = result.positions.filter((p) => p.kind === 'part');
    expect(parts.map((p) => [p.label, p.page])).toEqual([
      ['Premessa', 1],
      ['Fronti', 2],
      ['PNG ricorrenti', 3],
      ['Archi', 4],
      ['Fili aperti', 5],
    ]);
    // Every printed section and block has a position.
    const froms = new Set(result.positions.map((p) => p.from));
    for (const s of input.sections) {
      expect(froms.has(s.from), s.title).toBe(true);
      for (const b of s.blocks) expect(froms.has(b.from), `${s.title} ${b.from}`).toBe(true);
    }
    expect(froms.has(fixture.indexOf('## Appendice'))).toBe(false);
  });

  it('prints the same bytes twice', async () => {
    const input = inputOf();
    const hash = async () => createHash('sha256').update(await engine.pdf(input)).digest('hex');
    expect(await hash()).toBe(await hash());
  });

  it('numbers the contents with the pages the sections print on', async () => {
    const input = inputOf();
    const [result, pdf] = await Promise.all([engine.build(input), engine.pdf(input)]);
    const pages = await pdfTexts(pdf);
    // pdfTexts shows every text run through every font's map: in the map of
    // the label's font (Plex semibold, as the page numbers), the runs after
    // the label that read as whole numbers are the contents' page numbers,
    // in section order (the columns fill top to bottom), then the footer's.
    const line = pages[0]!.split('\n').find((l) => l.includes('IN QUESTA CAMPAGNA'))!;
    const numbers = line
      .slice(line.indexOf('IN QUESTA CAMPAGNA'))
      .split(' ')
      .filter((t) => /^\d+$/.test(t))
      .map(Number);
    const heading = (from: number) => result.positions.find((p) => p.kind === 'block' && p.from === from)!.page;
    const expected = input.sections.map((s) => heading(s.from));
    expect(expected).toEqual([1, 1, 2, 2, 3, 4, 5, 5]);
    expect(numbers.slice(0, expected.length)).toEqual(expected);
    for (const s of input.sections) expect(pages[heading(s.from) - 1], s.title).toContain(s.title);
    expect(pages.join('\n')).not.toContain('stile visivo e sonoro');
  });

  it('builds a campaign with no section, and one with empty sections', async () => {
    for (const doc of ['', 'Solo appunti.\n\n### F1. Un fronte\n', '## Premessa\n## Fronti\n## Archi\n']) {
      const result = await engine.build(inputOf(doc));
      expect(errors(result.diagnostics), JSON.stringify(doc)).toEqual([]);
      expect(result.pages.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('lists a check for the sections that start a page past the twelfth tab', async () => {
    const names = Array.from({ length: 14 }, (_, i) => `Parte ${i + 1}`);
    const t = template((d) => {
      d.sections = names.map((name) => ({ name, requirement: 'optional', pdf: { newPage: true } }));
    });
    const doc = names.map((n) => `## ${n}\n\nTesto.\n`).join('\n');
    for (const paper of ['a4', 'us-letter'] as const) {
      const input = inputOf(doc, t, { paper });
      const result = await engine.build(input);
      expect(errors(result.diagnostics)).toEqual([]);
      expect(campaignChecks(input, result.positions)).toEqual([
        // Parte 1 starts page 2, after the head and the contents.
        { message: '«Parte 13» and 1 more section start a page without a tab', where: 'Parte 13 · page 14', page: 14, sceneId: null },
      ]);
    }
    expect(campaignChecks(inputOf(), [])).toEqual([]);
  });
});
