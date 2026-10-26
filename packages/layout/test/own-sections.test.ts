import { createHash } from 'node:crypto';
import {
  defineTemplate,
  parseAdventure,
  templates,
  type AdventureTemplate,
  type AdventureTemplateInput,
} from 'promptbook-format';
import { beforeAll, describe, expect, it } from 'vitest';
import { createEngine, defaultLayoutOptions, toLayoutInput, type Engine } from '../src/index.js';
import { nodeAssets, sabaoth } from './helpers.js';

// One engine in this file: a second one keeps vitest from exiting.
let engine: Engine;

beforeAll(async () => {
  engine = await createEngine(await nodeAssets());
});

function template(change: (t: AdventureTemplateInput) => void): AdventureTemplate {
  const definition = JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
  change(definition);
  return defineTemplate(definition);
}

const withAtmosfera = (pdf?: { newPage?: boolean; sideColumn?: boolean }) =>
  template((t) => {
    const at = t.sections.findIndex((s) => s.role === 'strongStart') + 1;
    t.sections.splice(at, 0, { name: 'Atmosfera', requirement: 'optional', ...(pdf ? { pdf } : {}) });
  });

// Sabaoth with «## Atmosfera» right after «Inizio forte».
const text = (() => {
  const doc = sabaoth();
  const at = doc.indexOf('## Mappa delle scene');
  return `${doc.slice(0, at)}## Atmosfera\n\nIl vento porta odore di salsedine.\n\n${doc.slice(at)}`;
})();

const build = (t: AdventureTemplate, doc = text) =>
  engine.build(toLayoutInput(parseAdventure(doc, { template: t }).model, defaultLayoutOptions, { title: 'Sabaoth' }, t));
const errors = (result: Awaited<ReturnType<typeof build>>) => result.diagnostics.filter((d) => d.severity === 'error');

describe('an own section', () => {
  it('prints on its own page right after the start page, before the scenes', async () => {
    const result = await build(withAtmosfera());
    expect(errors(result)).toEqual([]);
    // Sabaoth has no «Regole della notte»: the first scene follows.
    const parts = result.positions.filter((p) => p.kind === 'part' || p.kind === 'scene');
    const labels = parts.map((p) => p.label);
    expect(labels.slice(labels.indexOf('Inizio'), labels.indexOf('Inizio') + 3)).toEqual(['Inizio', 'Atmosfera', 'S1']);
    const start = parts.find((p) => p.id === 'start')!;
    const own = parts.find((p) => p.label === 'Atmosfera')!;
    expect(own.page).toBe(start.page + 1);
  });

  it('prints on the start page without «New page»', async () => {
    const result = await build(withAtmosfera({ newPage: false }));
    expect(errors(result)).toEqual([]);
    expect(result.positions.some((p) => p.kind === 'part' && p.label === 'Atmosfera')).toBe(false);
    const start = result.positions.find((p) => p.kind === 'part' && p.id === 'start')!;
    const heading = result.positions.find((p) => p.kind === 'block' && text.slice(p.from).startsWith('## Atmosfera'))!;
    expect(heading.page).toBe(start.page);
  });

  it('prints its side box beside its text with «Side column»', async () => {
    const doc = text.replace(
      'Il vento porta odore di salsedine.\n\n',
      `${'Il vento porta odore di salsedine. '.repeat(30)}\n\nLe onde battono sul molo.\n\n> [!riquadro|laterale] Suoni\n> Campane lontane.\n\n`,
    );
    const at = (result: Awaited<ReturnType<typeof build>>, needle: string) =>
      result.positions.find((p) => p.kind === 'block' && p.from === doc.indexOf(needle))!;
    // Written after the second paragraph, the box prints at the top of the
    // side column, above it; without the option, below it.
    const side = await build(withAtmosfera({ sideColumn: true }), doc);
    expect(errors(side)).toEqual([]);
    expect(at(side, '> [!riquadro|laterale] Suoni').page).toBe(at(side, 'Le onde battono sul molo.').page);
    expect(at(side, '> [!riquadro|laterale] Suoni').y).toBeLessThan(at(side, 'Le onde battono sul molo.').y);
    const flow = await build(withAtmosfera(), doc);
    expect(at(flow, '> [!riquadro|laterale] Suoni').y).toBeGreaterThan(at(flow, 'Le onde battono sul molo.').y);
  });
});

describe('sections left out', () => {
  it('builds without the sheets, sheet references as text', async () => {
    const t = template((d) => {
      d.sections.find((s) => s.role === 'sheets')!.pdf = { print: false };
    });
    const input = toLayoutInput(parseAdventure(sabaoth(), { template: t }).model, defaultLayoutOptions, { title: 'Sabaoth' }, t);
    expect(input.references.sheets).toEqual([]);
    expect(input.references.pregenerated).toBeNull();
    const result = await engine.build(input);
    expect(errors(result)).toEqual([]);
    expect(result.positions.some((p) => p.id === 'pregenerated')).toBe(false);
  });

  it('builds without «Prima della sessione»', async () => {
    const t = template((d) => {
      d.sections.find((s) => s.role === 'before')!.pdf = { print: false };
    });
    const result = await build(t, sabaoth());
    expect(errors(result)).toEqual([]);
    expect(result.positions.some((p) => p.id === 'before')).toBe(false);
  });
});

describe('the built-in template', () => {
  it('prints Sabaoth with the same bytes as before PDF options', async () => {
    const t = templates.avventura;
    const pdf = await engine.pdf(toLayoutInput(parseAdventure(sabaoth(), { template: t }).model, defaultLayoutOptions, { title: 'Sabaoth' }, t));
    expect(pdf.length).toBe(302099);
    expect(createHash('sha256').update(pdf).digest('hex')).toBe('22a799aed0ce74b8d8e4b14be1c7226d003d8c96632d6a2a4356d0647423b6ef');
  });
});
