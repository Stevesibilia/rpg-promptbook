import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defineTemplate, parseAdventure, templates, type AdventureTemplateInput, type Sheet } from '../src/index.js';
import { splitList } from '../src/parse/kinds.js';
import { kindSamples, sheetMarkdown, sheetsDocument } from './kind-samples.js';
import { parse } from './helpers.js';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

// The problems of sheets and systems; a document of sheets alone has others.
const own = (text: string) =>
  parse(text).problems.filter((p) => /^(sheet|system|ref)\./.test(p.code)).map((p) => `${p.code}: ${p.message}`);

const sheetOf = (system: string, lines: string[], kind = 'Minaccia'): Sheet =>
  parse(sheetsDocument(system, [['### Prova', '', `- **Tipo:** ${kind}`, ...lines].join('\n')])).model.sheets[0]!;

const value = (sheet: Sheet, key: string) => sheet.kind?.fields.find((f) => f.key === key)?.value;
const error = (sheet: Sheet, key: string) => sheet.kind?.fields.find((f) => f.key === key)?.error;

describe("Sabaoth through the Kulthos kind", () => {
  const { model, problems } = parse(fixture('l-ancora-di-sabaoth.converted.md'));

  it('reads every sheet as a Minaccia, with grade, counts in groups of 3, and talents', () => {
    expect(
      model.sheets.map((s) => {
        const ferite = value(s, 'Ferite');
        const afflizioni = value(s, 'Afflizioni');
        return [
          s.name,
          s.kind?.kind,
          s.kind?.missing,
          s.kind?.fields.find((f) => f.key === 'Grado')?.text,
          ferite?.block === 'boxes' ? ferite.count : null,
          s.kind?.fields.find((f) => f.key === 'Ferite')?.definition,
          afflizioni?.block === 'boxes' ? afflizioni.count : null,
        ];
      }),
    ).toEqual(
      [
        ['Sabaoth', 'Leggendaria', 9, 3],
        ['Dottor Umberto Salvi', 'Ordinaria', 3, 1],
        ['Tenente Donato', 'Straordinaria', 6, 2],
        ['Pattuglia di Quieti', 'Ordinaria', 3, 1],
        ['Il Circolo dello Stretto', 'Ordinaria', 3, 1],
      ].map(([name, grade, wounds, afflictions]) => [
        name,
        'Minaccia',
        [],
        grade,
        wounds,
        expect.objectContaining({ group: 3, count: { from: 'table', table: 'Gradi', column: 'Ferite' } }),
        afflictions,
      ]),
    );
    const talenti = value(model.sheets[0]!, 'Talenti');
    expect(talenti).toEqual({
      block: 'list',
      style: 'paras',
      items: [
        { name: 'La Maestà', text: '«Fermi»: chi non si è Risvegliato può resistere con una prova' },
        { name: 'La Pace', text: 'Afflizione «Pacifista»' },
        { name: 'Il Pozzo', text: 'conosce segreto e legame di ogni Dormiente' },
      ],
    });
  });

  it('gives no sheet problem but the Avatar nested in Salvi', () => {
    expect(problems.filter((p) => p.code.startsWith('sheet.') || p.code.startsWith('system.')).map((p) => p.code)).toEqual([
      'sheet.nested-threat',
    ]);
  });

  it('reads Branco as on when written with free text, off when it says no', () => {
    const pack = (text: string) => value(sheetOf('Kulthos', ['- **Grado:** Ordinaria', `- **Branco:**${text}`]), 'Branco');
    expect(pack(' sì, tre cani')).toEqual({ block: 'flag', on: true });
    expect(pack(' cani randagi')).toEqual({ block: 'flag', on: true });
    expect(pack('')).toEqual({ block: 'flag', on: true });
    expect(pack(' no')).toEqual({ block: 'flag', on: false });
    expect(pack(' No, da soli')).toEqual({ block: 'flag', on: false });
    expect(pack(' false')).toEqual({ block: 'flag', on: false });
    expect(pack(' 0')).toEqual({ block: 'flag', on: false });
    expect(pack(' nonna')).toEqual({ block: 'flag', on: true });
  });
});

describe('the mockup sample of every kind', () => {
  it('covers the seventeen kinds', () => {
    expect(kindSamples).toHaveLength(17);
  });

  it.each(kindSamples.map((s) => [`${s.system}: ${s.kind}`, s] as const))('%s parses with no problem', (_, sample) => {
    const text = sheetsDocument(sample.system, [sheetMarkdown(sample)]);
    expect(own(text)).toEqual([]);
    const sheet = parse(text).model.sheets[0]!;
    expect([sheet.kind?.system, sheet.kind?.kind, sheet.kind?.missing]).toEqual([sample.system, sample.kind, []]);
    // Every written field of the kind is read.
    for (const key of Object.keys(sample.values)) {
      const field = sheet.kind!.fields.find((f) => f.key === key)!;
      expect(field, key).toBeDefined();
      expect([key, field.value === null, field.error]).toEqual([key, false, null]);
    }
  });
});

describe('field blocks', () => {
  it('reads text and numbers as written', () => {
    const sheet = sheetOf('D&D 5e', ['- **CA:** 12 (armatura naturale)', '- **PF:** 22 (4d8+4)'], 'Creatura');
    expect(value(sheet, 'CA')).toEqual({ block: 'text', text: '12 (armatura naturale)' });
    expect(value(sheet, 'PF')).toEqual({ block: 'number', text: '22 (4d8+4)' });
  });

  it('reads a choice by the first column, ignoring case, with its row', () => {
    const sheet = sheetOf('D&D 5e', ['- **Sfida:** 1/2'], 'Creatura');
    expect(value(sheet, 'Sfida')).toEqual({ block: 'choice', columns: ['GS', 'PE', 'BC'], row: ['1/2', '100', '+2'] });
    expect(value(sheetOf('Kulthos', ['- **Grado:** leggendaria']), 'Grado')).toMatchObject({ row: ['Leggendaria', '9', '3'] });
  });

  it('reads stats in the kind order, by label, ignoring case and a colon', () => {
    const sheet = sheetOf('Coriolis', ['- **Attributi:** EMP 2 · for: 4 · AGI 3'], 'PNG');
    expect(value(sheet, 'Attributi')).toEqual({
      block: 'stats',
      stats: [
        { label: 'FOR', value: '4' },
        { label: 'AGI', value: '3' },
        { label: 'ACU', value: null },
        { label: 'EMP', value: '2' },
      ],
    });
  });

  it('reads stats written as sub-bullets', () => {
    const sheet = sheetOf('Coriolis', ['- **Attributi:**', '  - FOR 4', '  - AGI 3', '  - ACU 2', '  - EMP 2'], 'PNG');
    expect(value(sheet, 'Attributi')).toMatchObject({ stats: [{ value: '4' }, { value: '3' }, { value: '2' }, { value: '2' }] });
  });

  it('reads written boxes, their marks, and fixed or table counts', () => {
    const boss = sheetOf('Outgunned', ['- **Grinta:** 10 (8, 10)'], 'Boss');
    expect(value(boss, 'Grinta')).toEqual({ block: 'boxes', count: 10, marked: [8, 10] });
    expect(value(sheetOf('Outgunned', ['- **Grinta:** 6 (una nota)'], 'Boss'), 'Grinta')).toEqual({ block: 'boxes', count: 6, marked: [] });
    // Brackets mark boxes only for a field with marks.
    const ghoul = sheetOf('D&D 5e', ['- **Azioni leggendarie:** 3 (1)'], 'Creatura');
    expect(value(ghoul, 'Azioni leggendarie')).toEqual({ block: 'boxes', count: 3, marked: [] });
    // Table counts are present even when not written.
    const ordinaria = sheetOf('Kulthos', ['- **Grado:** Ordinaria']);
    expect(value(ordinaria, 'Ferite')).toEqual({ block: 'boxes', count: 3, marked: [] });
    expect(value(ordinaria, 'Afflizioni')).toEqual({ block: 'boxes', count: 1, marked: [] });
    expect(ordinaria.kind?.fields.find((f) => f.key === 'Ferite')).toMatchObject({ range: null, text: '' });
  });

  it('reads a fixed clock unwritten, and written clocks one per item', () => {
    expect(value(sheetOf('PbtA', [], 'Minaccia'), 'Ferite')).toEqual({ block: 'clock', clocks: [{ label: null, size: 6 }] });
    const lampionai = sheetOf('Blades in the Dark', ['- **Livello:** II', '- **Obiettivi:** Il molo: 6 · Un ispettore: 4'], 'Fazione');
    expect(value(lampionai, 'Obiettivi')).toEqual({
      block: 'clock',
      clocks: [
        { label: 'Il molo', size: 6 },
        { label: 'Un ispettore', size: 4 },
      ],
    });
  });

  it('reads lists on one line or as sub-bullets, and paragraphs as name and text', () => {
    const one = sheetOf('Not the End', ['- **Prove:** Aprirlo: media', '- **Sventure:** Mani ferite · Rumore'], 'Sfida');
    const sub = sheetOf('Not the End', ['- **Prove:** Aprirlo: media', '- **Sventure:**', '  - Mani ferite', '  - Rumore'], 'Sfida');
    expect(value(one, 'Sventure')).toEqual({ block: 'list', style: 'line', items: ['Mani ferite', 'Rumore'] });
    expect(value(sub, 'Sventure')).toEqual(value(one, 'Sventure'));
    const boss = sheetOf('Outgunned', ['- **Grinta:** 10', '- **Talenti:** Scudo umano (un picchiatore) · Ultima parola'], 'Boss');
    expect(value(boss, 'Talenti')).toEqual({
      block: 'list',
      style: 'paras',
      items: [
        { name: 'Scudo umano', text: 'un picchiatore' },
        { name: 'Ultima parola', text: '' },
      ],
    });
  });

  it('keeps text after the key before sub-bullets as first items', () => {
    const sheet = sheetOf('Not the End', ['- **Prove:** Aprirlo: media', '- **Sventure:** Mani ferite', '  - Rumore'], 'Sfida');
    expect(value(sheet, 'Sventure')).toMatchObject({ items: ['Mani ferite', 'Rumore'] });
  });

  it('reads rows with tokens from their tables (the spec example)', () => {
    const sheet = sheetOf('Not the End', ['- **Prove:**', '  - Sfondarlo: difficilissima · molto pericolosa', '  - Scassinare: media', '  - Volare: impossibile'], 'Sfida');
    expect(value(sheet, 'Prove')).toEqual({
      block: 'rows',
      rows: [
        { cells: [{ text: 'Sfondarlo', tokens: null }, { text: 'difficilissima', tokens: 5 }, { text: 'molto pericolosa', tokens: 2 }] },
        { cells: [{ text: 'Scassinare', tokens: null }, { text: 'media', tokens: 3 }, { text: '', tokens: null }] },
        { cells: [{ text: 'Volare', tokens: null }, { text: 'impossibile', tokens: null }, { text: '', tokens: null }] },
      ],
    });
  });

  it('reads a rows field written on one line as one row', () => {
    const sheet = sheetOf('Coriolis', ['- **Attributi:** FOR 1', '- **Armi:** Pugno: 1 · 2 · corta'], 'PNG');
    expect(value(sheet, 'Armi')).toEqual({
      block: 'rows',
      rows: [{ cells: ['Pugno', '1', '2', 'corta'].map((text) => ({ text, tokens: null })) }],
    });
  });

  it('gives lines their labels from the kind, written or not', () => {
    const sheet = sheetOf('Fate', ['- **Concetto:** Contrabbandiera'], 'PNG principale');
    expect(value(sheet, 'Conseguenze')).toEqual({ block: 'lines', labels: ['Lieve −2', 'Moderata −4', 'Grave −6'] });
  });

  it('leaves out unwritten fields that need writing, and an empty value', () => {
    const sheet = sheetOf('Outgunned', ['- **Grinta:** 6', '- **Attacco:**'], 'Boss');
    expect(sheet.kind?.fields.map((f) => f.key)).toEqual(['Grinta']);
  });

  it('matches the type and the keys ignoring case and spaces', () => {
    const sheet = parse(sheetsDocument('outgunned', ['### Don\n\n- **tipo:**  boss \n- **grinta:** 4'])).model.sheets[0]!;
    expect([sheet.kind?.system, sheet.kind?.kind, value(sheet, 'Grinta')]).toEqual([
      'Outgunned',
      'Boss',
      { block: 'boxes', count: 4, marked: [] },
    ]);
  });
});

describe('edge cases', () => {
  it('reads a single value from the item line, not its sub-bullets', () => {
    const sheet = sheetOf('Kulthos', ['- **Grado:** Ordinaria', '  - una nota', '- **Branco:** no', '  - mai', '- **Natura:** antica', '  - e stanca']);
    expect(value(sheet, 'Grado')).toMatchObject({ row: ['Ordinaria', '3', '1'] });
    expect(value(sheet, 'Branco')).toEqual({ block: 'flag', on: false });
    expect(value(sheet, 'Ferite')).toMatchObject({ count: 3 });
    // Text keeps everything written, as the full sheet prints it.
    expect(value(sheet, 'Natura')).toEqual({ block: 'text', text: 'antica\n  - e stanca' });
  });

  it('keeps the line before rows sub-bullets as one row', () => {
    const sheet = sheetOf('Coriolis', ['- **Attributi:** FOR 1', '- **Armi:** Spada: 2 · 3', '  - Ascia: 3 · 4'], 'PNG');
    expect(value(sheet, 'Armi')).toMatchObject({
      rows: [{ cells: [{ text: 'Spada' }, { text: '2' }, { text: '3' }, { text: '' }] }, { cells: [{ text: 'Ascia' }, { text: '3' }, { text: '4' }, { text: '' }] }],
    });
  });

  it('keeps an empty middle cell in its column', () => {
    const sheet = sheetOf('Coriolis', ['- **Attributi:** FOR 1', '- **Armi:** Pugno: 1 ·  · corta ·'], 'PNG');
    expect(value(sheet, 'Armi')).toMatchObject({ rows: [{ cells: [{ text: 'Pugno' }, { text: '1' }, { text: '' }, { text: 'corta' }] }] });
  });

  it('reads marks separated by spaces', () => {
    expect(value(sheetOf('Outgunned', ['- **Grinta:** 6 (1 3)'], 'Boss'), 'Grinta')).toEqual({ block: 'boxes', count: 6, marked: [1, 3] });
  });

  it('joins a soft-wrapped item on one line', () => {
    const sheet = sheetOf('Coriolis', ['- **Attributi:** FOR 4 · AGI', '  3 · ACU 2'], 'PNG');
    expect(value(sheet, 'Attributi')).toMatchObject({ stats: [{ value: '4' }, { value: '3' }, { value: '2' }, { value: null }] });
  });

  it('matches a stat label written in bold', () => {
    const sheet = sheetOf('Coriolis', ['- **Attributi:**', '  - **FOR** 4'], 'PNG');
    const stats = value(sheet, 'Attributi');
    expect(stats?.block === 'stats' && stats.stats[0]).toEqual({ label: 'FOR', value: '4' });
  });
});

describe('values the block cannot read', () => {
  it.each([
    ['a choice outside its table (the spec example)', 'Kulthos', 'Minaccia', ['- **Grado:** Mitica'], 'Grado', '"Mitica" is not in the table "Gradi".'],
    ['boxes with no number', 'Outgunned', 'Boss', ['- **Grinta:** tanta'], 'Grinta', '"Grinta" needs a number of boxes, as in "6", not "tanta".'],
    ['a mark beyond the boxes', 'Outgunned', 'Boss', ['- **Grinta:** 6 (7)'], 'Grinta', '"Grinta" marks box 7 of 6.'],
    ['a stat the kind lacks', 'Coriolis', 'PNG', ['- **Attributi:** FOR 4 · Forza 3'], 'Attributi', '"Forza 3" names none of the stats of "Attributi" (FOR, AGI, ACU, EMP).'],
    ['a clock item with no size', 'Blades in the Dark', 'Fazione', ['- **Livello:** I', '- **Obiettivi:** Il molo'], 'Obiettivi', '"Il molo" needs a name and a clock size after a colon, as in "Prendere il molo: 6".'],
    ['a row cell outside its table', 'Not the End', 'Sfida', ['- **Prove:** Aprirlo: semplice'], 'Prove', '"semplice" is not in the table "Difficoltà".'],
    ['a row with too many cells', 'Coriolis', 'PNG', ['- **Attributi:** FOR 1', '- **Armi:** Pugno: 1 · 2 · corta · rapida'], 'Armi', '"Pugno: 1 · 2 · corta · rapida" has 5 cells; "Armi" has 4 columns (Arma, Danno, Critico, Gittata).'],
  ])('%s', (_, system, kind, lines, key, message) => {
    const sheet = sheetOf(system, lines, kind);
    const field = sheet.kind!.fields.find((f) => f.key === key)!;
    expect([field.value, field.error]).toEqual([null, message]);
    expect(field.text).toBe(lines.find((l) => l.includes(`**${key}:**`))!.replace(/^- \*\*[^*]+:\*\*\s*/, ''));
    const text = sheetsDocument(system, [['### Prova', '', `- **Tipo:** ${kind}`, ...lines].join('\n')]);
    expect(own(text)).toContain(`sheet.value.invalid: ${message} It prints as written.`);
  });

  it('gives a table count no value when its choice is not in the table, with no second warning', () => {
    const sheet = sheetOf('Kulthos', ['- **Grado:** Mitica', '- **Ferite:** 2 contatori da 3']);
    expect([value(sheet, 'Ferite'), error(sheet, 'Ferite')]).toEqual([null, null]);
    expect(sheet.kind?.fields.map((f) => f.key)).toEqual(['Grado', 'Ferite']);
  });
});

describe('sheets without a kind', () => {
  it('are plain text for a Tipo the system lacks (the spec example)', () => {
    const text = sheetsDocument('Kulthos', ['### Rosalia\n\n- **Tipo:** PNG alleato\n- **Ruolo:** la vedova']);
    expect(parse(text).model.sheets[0]?.kind).toBeNull();
    expect(own(text)).toEqual([]);
  });

  it('are plain text with no Tipo, or in an unknown system (the spec example)', () => {
    expect(parse(sheetsDocument('Kulthos', ['### Ombra\n\n- **Grado:** Ordinaria'])).model.sheets[0]?.kind).toBeNull();
    const text = sheetsDocument('Altro', ['### Ombra\n\n- **Tipo:** Minaccia\n- **Grado:** Ordinaria']);
    expect(parse(text).model.sheets[0]?.kind).toBeNull();
    expect(own(text)).toEqual([
      'system.unknown: No game system is called "Altro", so its sheets have no threat box. Known systems: Kulthos, Vileborn, Not the End, Outgunned, D&D 5e, Historia, Blades in the Dark, PbtA, Fate, Call of Cthulhu, Mörk Borg, Coriolis.',
    ]);
  });

  it('give no system problem when the front matter names none', () => {
    expect(own('## Schede\n\n### Ombra\n\n- **Tipo:** Minaccia\n')).toEqual([]);
  });
});

describe('sheet problems', () => {
  it('names a required field missing, on the heading (the spec example)', () => {
    const text = sheetsDocument('Kulthos', ['### Ombra\n\n- **Tipo:** Minaccia\n- **Natura:** antica']);
    const sheet = parse(text).model.sheets[0]!;
    expect(sheet.kind?.missing).toEqual(['Grado']);
    expect(own(text)).toEqual([
      'sheet.field.required: Sheet "Ombra" (Minaccia) has no "Grado", which Kulthos requires; it gets no threat box.',
    ]);
    const problem = parse(text).problems.find((p) => p.code === 'sheet.field.required')!;
    expect(problem.range).toEqual(sheet.headingRange);
    expect(problem.severity).toBe('warning');
  });

  it('names an empty required field as missing', () => {
    expect(sheetOf('Kulthos', ['- **Grado:**']).kind?.missing).toEqual(['Grado']);
  });

  it('gives no problem for a missing recommended field', () => {
    const text = sheetsDocument('Mörk Borg', ['### Topo\n\n- **Tipo:** Creatura\n- **PF:** 3']);
    expect(own(text)).toEqual([]);
  });

  it('says how a table count disagrees (the spec example)', () => {
    const text = sheetsDocument('Kulthos', ['### Ombra\n\n- **Tipo:** Minaccia\n- **Grado:** Ordinaria\n- **Ferite:** 3 contatori da 3\n- **Afflizioni:** 2']);
    expect(own(text)).toEqual([
      'sheet.grade.counts: Ordinaria has 3 Ferite in 1 group of 3 (table "Gradi", column "Ferite"); "Ferite" says "3 contatori da 3".',
      'sheet.grade.counts: Ordinaria has 1 Afflizioni (table "Gradi", column "Afflizioni"); "Afflizioni" says "2".',
    ]);
  });

  it('takes no grade word inside the kind\'s own fields for a nested threat', () => {
    const text = sheetsDocument('Kulthos', ['### Ombra\n\n- **Tipo:** Minaccia\n- **Grado:** Ordinaria\n- **Natura:** non Straordinaria']);
    expect(own(text)).toEqual([]);
  });

  it('takes grade words only from required choices: Outgunned levels mark nothing', () => {
    const text = sheetsDocument('Outgunned', ['### Lefty\n\n- **Tipo:** Cattivo\n- **Grinta:** 8\n- **Nota:** Critico in tutto']);
    expect(own(text)).toEqual([]);
  });
});

describe('templates with the old sheet keys', () => {
  it('still load, and their sheets are read by kind (the spec example)', () => {
    const definition = JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
    definition.sheets.keys = [
      { key: 'Tipo', role: 'type' },
      { key: 'Grado', role: 'grade' },
      { key: 'Natura', role: 'nature' },
      { key: 'Ferite', role: 'wounds' },
      { key: 'Afflizioni', role: 'afflictions' },
      { key: 'Branco', role: 'pack' },
      { key: 'Talenti', role: 'talents' },
    ];
    const template = defineTemplate(definition);
    const text = sheetsDocument('Kulthos', ['### Ombra\n\n- **Tipo:** Minaccia\n- **Grado:** Ordinaria']);
    expect(parseAdventure(text, { template }).model.sheets[0]?.kind).toMatchObject({ kind: 'Minaccia', missing: [] });
  });
});

describe('splitList', () => {
  it.each([
    ['a · b', ['a', 'b']],
    ['a ·  · b', ['a', 'b']],
    ['a ·', ['a']],
    ['· a', ['a']],
    ['', []],
    ['  ', []],
    ['Prudenza (fa seguire · non insegue) · Acume', ['Prudenza (fa seguire · non insegue)', 'Acume']],
    ['a (b · c', ['a (b', 'c']],
    ['a) · b', ['a)', 'b']],
    ['a·b · c', ['a·b', 'c']],
    ['a ·· b', ['a ·· b']],
    ['a\t·\tb', ['a', 'b']],
  ])('splits "%s"', (text, items) => {
    expect(splitList(text, ' · ')).toEqual(items);
  });
});
