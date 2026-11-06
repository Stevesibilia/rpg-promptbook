import { readFileSync } from 'node:fs';
import { defineSystems, parseAdventure, templates } from 'promptbook-format';
import { beforeAll, describe, expect, it } from 'vitest';
import { createEngine, defaultLayoutOptions, toLayoutInput, type Engine, type LayoutInput } from '../src/index.js';
import { nodeAssets } from './helpers.js';

// The sample sheet of every built-in kind, from the agreed mockup, as the
// format tests read it.
interface KindSample {
  system: string;
  kind: string;
  name: string;
  values: Record<string, string | string[]>;
}
const samples = JSON.parse(
  readFileSync(new URL('../../format/fixtures/kind-samples.json', import.meta.url), 'utf8'),
) as KindSample[];

function sheetMarkdown(sample: KindSample): string {
  const lines = [`### ${sample.name}`, '', `- **Tipo:** ${sample.kind}`];
  for (const [key, value] of Object.entries(sample.values)) {
    if (Array.isArray(value)) lines.push(`- **${key}:**`, ...value.map((item) => `  - ${item}`));
    else lines.push(`- **${key}:** ${value}`);
  }
  return lines.join('\n');
}

const shortName = (sample: KindSample) => sample.name.split(',')[0]!.trim();

// One adventure per system: a scene whose «Chi c'è» cites every sample sheet
// of that system.
const systems = [...new Set(samples.map((s) => s.system))];
function adventure(system: string): string {
  const own = samples.filter((s) => s.system === system);
  const cast = own.map((s) => `- **${shortName(s)}**, in scena. → Schede: ${shortName(s)}`).join('\n');
  return [
    `---\ntitolo: Le schede di ${system}\nsistema: ${system}\n---`,
    '## Scene',
    `### S1. ${system}`,
    "**Luogo e momento:** ovunque, adesso.",
    `**Chi c'è**\n\n${cast}`,
    '## Schede',
    ...own.map(sheetMarkdown),
  ].join('\n\n') + '\n';
}

const project = { title: 'Prova' };

// One engine in this file: a second one keeps vitest from exiting.
let engine: Engine;
beforeAll(async () => {
  engine = await createEngine(await nodeAssets());
});
const inputOf = (system: string) => {
  const parsed = parseAdventure(adventure(system), { template: templates.avventura });
  return { parsed, input: toLayoutInput(parsed.model, defaultLayoutOptions, project, templates.avventura) };
};
const threatOf = (sample: KindSample) => {
  const { input } = inputOf(sample.system);
  return input.scenes[0]!.threats.find((t) => t.name === shortName(sample))!;
};

// What each sample's box prints, as the mockup's threatBox() draws it: the
// subtitle, the quotes, and each row's block and key.
const boxes: Record<string, { subtitle: string; quotes?: string[]; rows: string[] }> = {
  'Kulthos Minaccia': { subtitle: 'Minaccia Straordinaria', rows: ['boxes Ferite', 'boxes Afflizioni', 'paras Talenti'] },
  'Vileborn Sfida': {
    subtitle: 'Sfida · Caduto',
    quotes: ['«Il tuo debito è mio.»'],
    rows: [
      'stats Approcci',
      'line Resistenze',
      'line Debolezze',
      'boxes Colpi',
      'text Eventi',
      'text Regole uniche',
      'check Complicazioni',
      'rows Dado dell’oscurità',
    ],
  },
  'Not the End Sfida': { subtitle: 'Sfida', rows: ['rows Prove', 'line Sventure', 'line Complicazioni'] },
  'Outgunned Scagnozzi': { subtitle: 'Scagnozzi · in gruppo', rows: ['boxes Grinta', 'text Difesa', 'text Attacco'] },
  'Outgunned Cattivo': { subtitle: 'Cattivo', rows: ['boxes Grinta', 'text Difesa', 'text Attacco', 'paras Talenti'] },
  'Outgunned Boss': { subtitle: 'Boss', rows: ['boxes Grinta', 'text Difesa', 'text Attacco', 'paras Talenti'] },
  'D&D 5e Creatura': {
    subtitle: 'Creatura · Non morto Medio, caotico malvagio',
    rows: [
      'text CA',
      'number PF',
      'text Velocità',
      'stats Caratteristiche',
      'text Abilità',
      'text Immunità',
      'text Sfida',
      'paras Tratti',
      'paras Azioni',
    ],
  },
  'Historia Creatura': {
    subtitle: 'Creatura · Familia del Tasso, Medio, legale neutrale',
    rows: ['text CA', 'number PF', 'text Velocità', 'stats Caratteristiche', 'text Sfida', 'paras Tratti', 'paras Azioni'],
  },
  'Blades in the Dark Fazione': {
    subtitle: 'Fazione · II · forte · contrabbandieri',
    rows: ['line Territorio', 'line Risorse', 'clocks Obiettivi', 'line Alleati', 'line Nemici'],
  },
  'Blades in the Dark PNG': { subtitle: 'PNG · capo dei Lampionai', rows: ['number Qualità', 'line Tratti', 'text Vuole'] },
  'PbtA Minaccia': {
    subtitle: 'Minaccia · Signore della guerra (schiavista)',
    quotes: ['possedere l’acqua'],
    rows: ['text Danno', 'number Armatura', 'clocks Ferite', 'line Mosse'],
  },
  'PbtA Mostro': {
    subtitle: 'Mostro · spettro',
    quotes: ['trascinare i vivi sotto'],
    rows: ['line Attacchi', 'boxes Capacità di danno', 'number Armatura', 'text Debolezza', 'line Poteri'],
  },
  'Fate PNG principale': {
    subtitle: 'PNG principale · Ufficiale di marina caduta in disgrazia, ora contrabbandiera',
    rows: [
      'text Problema',
      'line Aspetti',
      'line Abilità',
      'paras Stunt',
      'boxes Stress fisico',
      'boxes Stress mentale',
      'lines Conseguenze',
    ],
  },
  'Fate Comparsa': { subtitle: 'Comparsa · Tanti e rumorosi', rows: ['line Abilità', 'boxes Stress'] },
  'Call of Cthulhu Creatura': {
    subtitle: 'Creatura',
    rows: [
      'stats Caratteristiche',
      'boxes PF',
      'number PM',
      'text Movimento',
      'text Bonus al danno',
      'number Corporatura',
      'paras Attacchi',
      'text Schivare',
      'text Armatura',
      'text Perdita di Sanità',
    ],
  },
  'Mörk Borg Creatura': { subtitle: 'Creatura', rows: ['boxes PF', 'number Morale', 'text Armatura', 'text Attacco', 'text Speciale'] },
  'Coriolis PNG': {
    subtitle: 'PNG · sicurezza del Coriolis',
    rows: ['stats Attributi', 'line Abilità', 'boxes PF', 'boxes PM', 'number Armatura', 'rows Armi', 'line Talenti'],
  },
};

describe('the threat box of every built-in kind', () => {
  it('has a sample for each of the 17 kinds', () => {
    expect(samples.map((s) => `${s.system} ${s.kind}`)).toEqual(Object.keys(boxes));
  });

  it.each(samples.map((s) => [`${s.system} ${s.kind}`, s] as const))('%s prints as the mockup draws it', (name, sample) => {
    const box = threatOf(sample);
    const expected = boxes[name]!;
    expect(box.subtitle).toBe(expected.subtitle);
    expect(box.quotes).toEqual(expected.quotes ?? []);
    expect(box.rows.map((r) => `${r.block === 'list' && r.style !== 'line' ? r.style : r.block === 'list' ? 'line' : r.block} ${r.key}`)).toEqual(
      expected.rows,
    );
  });

  it('reads the values each block draws', () => {
    const at = (system: string, kind: string, key: string) =>
      threatOf(samples.find((s) => s.system === system && s.kind === kind)!).rows.find((r) => r.key === key);
    expect(at('Outgunned', 'Boss', 'Grinta')).toEqual({ block: 'boxes', key: 'Grinta', count: 10, group: 10, marked: [8, 10], values: false });
    expect(at('Fate', 'PNG principale', 'Stress fisico')).toMatchObject({ block: 'boxes', count: 3, values: true });
    expect(at('Call of Cthulhu', 'Creatura', 'PF')).toMatchObject({ block: 'boxes', count: 14, group: 5 });
    expect(at('D&D 5e', 'Creatura', 'PF')).toEqual({ block: 'number', key: 'PF', text: '22 (4d8+4)', line: true });
    expect(at('D&D 5e', 'Creatura', 'Sfida')).toMatchObject({ block: 'text', text: expect.stringMatching(/^1 \(.+\)$/) });
    expect(at('PbtA', 'Minaccia', 'Ferite')).toEqual({ block: 'clocks', key: 'Ferite', fixed: true, clocks: [{ label: 'Ferite', size: 6 }] });
    expect(at('Blades in the Dark', 'Fazione', 'Obiettivi')).toEqual({
      block: 'clocks',
      key: 'Obiettivi',
      fixed: false,
      clocks: [
        { label: 'Prendere il magazzino dei Portuali', size: 6 },
        { label: 'Comprare un ispettore', size: 4 },
      ],
    });
    expect(at('Not the End', 'Sfida', 'Prove')).toMatchObject({
      block: 'rows',
      columns: ['Azione', 'Difficoltà', 'Pericolo'],
      rows: [
        [{ text: 'Affrontarlo', tokens: null }, { text: 'difficile', tokens: 4 }, { text: 'poco pericolosa', tokens: 4 }],
        [{ text: 'Scassinare la serratura', tokens: null }, { text: 'media', tokens: 3 }, { text: '', tokens: null }],
        [{ text: 'Sfondarlo', tokens: null }, { text: 'difficilissima', tokens: 5 }, { text: 'molto pericolosa', tokens: 2 }],
      ],
    });
    expect(at('Fate', 'PNG principale', 'Conseguenze')).toEqual({
      block: 'lines',
      key: 'Conseguenze',
      labels: ['Lieve −2', 'Moderata −4', 'Grave −6'],
    });
    const stats = at('D&D 5e', 'Creatura', 'Caratteristiche');
    expect(stats?.block === 'stats' && stats.stats.map((s) => `${s.label} ${s.value}`)).toEqual([
      'FOR 13 (+1)',
      'DES 15 (+2)',
      'COS 10 (+0)',
      'INT 7 (−2)',
      'SAG 10 (+0)',
      'CAR 6 (−2)',
    ]);
  });

  it('keeps a field\'s sub-bullets as a nested list in the full sheet', () => {
    const { input } = inputOf('Vileborn');
    const markdown = input.references.sheets[0]!.blocks.map((b) => b.markdown).join('\n');
    expect(markdown).toContain(
      '- **Complicazioni:**\n  - Le catene ti sferzano; segna una ferita.\n  - Pronuncia il tuo nome; segna paura.\n',
    );
  });

  it('prints a field its block cannot read as written', () => {
    const sample = samples.find((s) => s.system === 'Outgunned' && s.kind === 'Boss')!;
    const broken = { ...sample, values: { ...sample.values, Difesa: 'Leggero' } };
    const { input } = (() => {
      const text = adventure('Outgunned').replace('- **Difesa:** Critico\n- **Attacco:** 2 Critico', '- **Difesa:** Leggero\n- **Attacco:** 2 Critico');
      const parsed = parseAdventure(text, { template: templates.avventura });
      return { input: toLayoutInput(parsed.model, defaultLayoutOptions, project, templates.avventura) };
    })();
    const box = input.scenes[0]!.threats.find((t) => t.name === broken.name)!;
    expect(box.rows.find((r) => r.key === 'Difesa')).toEqual({ block: 'text', key: 'Difesa', text: 'Leggero' });
  });
});

describe('the threat box at its edges', () => {
  // A system of the test's own, with keys and counts the built-ins lack.
  const systems = defineSystems([
    {
      id: 'bordi',
      name: 'Bordi',
      tables: [],
      kinds: [
        {
          name: 'Prova',
          fields: [
            { key: 'Trasformazioneimprovvisa', block: 'text', show: 'row' },
            { key: 'Tante caselle', block: 'boxes', count: { from: 'written' }, show: 'row' },
            { key: 'Gruppi', block: 'boxes', count: { from: 'written' }, group: 4, marks: true, show: 'row' },
            { key: 'Nessuna', block: 'boxes', count: { from: 'written' }, show: 'row' },
            { key: 'Orologi', block: 'clock', count: { from: 'written' }, show: 'row' },
          ],
        },
      ],
    },
  ]);
  const text = [
    '---\ntitolo: Prova\nsistema: Bordi\n---',
    '## Scene',
    '### S1. Il molo',
    "**Chi c'è**\n\n- **Il bruto**, aspetta. → Schede: Il bruto",
    '## Schede',
    '### Il bruto\n\n- **Tipo:** Prova\n- **Trasformazioneimprovvisa:** di notte diventa un lupo.\n- **Tante caselle:** 30\n- **Gruppi:** 22 (4, 21)\n- **Nessuna:** 0\n- **Orologi:** Scappare: 1',
  ].join('\n\n');
  const input = toLayoutInput(parseAdventure(text, { template: templates.avventura, systems }).model, defaultLayoutOptions, project, templates.avventura);

  it('reads the edge values', () => {
    const rows = input.scenes[0]!.threats[0]!.rows;
    expect(rows.map((r) => r.key)).toEqual(['Trasformazioneimprovvisa', 'Tante caselle', 'Gruppi', 'Nessuna', 'Orologi']);
    expect(rows[3]).toMatchObject({ block: 'boxes', count: 0 });
  });

  it('builds: a long key, boxes that wrap, no boxes, a clock of one', async () => {
    const result = await engine.build(input);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const out = process.env['PROMPTBOOK_KINDS_PDF'];
    if (out) {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(out.replace(/\.pdf$/, '-edges.pdf'), await engine.pdf(input));
    }
  });
});

describe('trackers shown only in the full sheet', () => {
  const systems = defineSystems([
    {
      id: 'prova',
      name: 'Prova',
      tables: [],
      kinds: [
        {
          name: 'Nemico',
          fields: [
            { key: 'Ferite', block: 'boxes', count: { from: 'written' }, group: 2, show: 'none' },
            { key: 'Allarme', block: 'clock', count: { from: 'fixed', n: 4 }, show: 'none' },
            { key: 'Note', block: 'text', show: 'none' },
            { key: 'Attacco', block: 'text', show: 'row' },
          ],
        },
      ],
    },
  ]);
  const text = [
    '---\ntitolo: Prova\nsistema: Prova\n---',
    '## Scene',
    '### S1. Il molo',
    "**Chi c'è**\n\n- **Il bruto**, aspetta. → Schede: Il bruto",
    '## Schede',
    '### Il bruto\n\n- **Tipo:** Nemico\n- **Ferite:** 4 (1)\n- **Note:** grosso.\n- **Attacco:** pugno',
  ].join('\n\n');
  const input = toLayoutInput(parseAdventure(text, { template: templates.avventura, systems }).model, defaultLayoutOptions, project, templates.avventura);

  it('draws them after the sheet\'s text, not in the scene box', () => {
    expect(input.scenes[0]!.threats[0]!.rows).toEqual([{ block: 'text', key: 'Attacco', text: 'pugno' }]);
    expect(input.references.sheets[0]!.trackers).toEqual([
      { block: 'boxes', key: 'Ferite', count: 4, group: 2, marked: [], values: false },
      { block: 'clocks', key: 'Allarme', fixed: true, clocks: [{ label: 'Allarme', size: 4 }] },
    ]);
  });

  it('builds', async () => {
    const result = await engine.build(input);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});

describe('the PDF of every built-in kind', () => {

  it.each(systems)('builds the adventure of %s with one box per sheet', async (system) => {
    const { parsed, input } = inputOf(system);
    // The adventure has only a scene and the sheets: the template's other
    // problems are expected, none from the sheets or the system.
    expect(parsed.problems.filter((p) => /^(sheet|ref|system)\./.test(p.code))).toEqual([]);
    expect(input.scenes[0]!.threats).toHaveLength(samples.filter((s) => s.system === system).length);
    const result = await engine.build(input);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  // The proof the owner looks at: the twelve adventures' scenes and sheets in
  // one PDF, a scene page per system with its kinds' boxes. Set
  // PROMPTBOOK_KINDS_PDF to a path to keep it.
  it('builds one PDF of all 17 kinds', async () => {
    const inputs = systems.map((s) => inputOf(s).input);
    const merged: LayoutInput = {
      ...inputs[0]!,
      title: 'Le schede di tutti i sistemi',
      tabs: ['Notte', ...systems.map((_, i) => `S${i + 1}`), 'Schede'],
      scenes: inputs.map((input, i) => ({ ...input.scenes[0]!, id: `S${i + 1}` })),
      references: {
        ...inputs[0]!.references,
        sheets: inputs.flatMap((input) => input.references.sheets),
      },
    };
    expect(merged.scenes.flatMap((s) => s.threats)).toHaveLength(17);
    const result = await engine.build(merged);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const out = process.env['PROMPTBOOK_KINDS_PDF'];
    if (out) {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(out, await engine.pdf(merged));
    }
  });
});
