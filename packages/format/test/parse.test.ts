import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defineTemplate, parseAdventure, templates, type AdventureTemplateInput, type Problem } from '../src/index.js';
import { parseOnly as parse, sample, topLevelBlocks, uncoveredBlocks } from './helpers.js';

const sabaoth = readFileSync(new URL('../fixtures/l-ancora-di-sabaoth.md', import.meta.url), 'utf8');

const codes = (problems: Problem[]) => problems.map((p) => p.code);

// A minimal document around one scene body.
function withScene(body: string, heading = '### S1. La porta'): string {
  return `---\ntitolo: Prova\n---\n\n## Scene\n\n${heading}\n\n${body}\n`;
}

describe('parseAdventure', () => {
  it('reads the sample with no parser problems', () => {
    const { problems } = parse(sample);
    expect(problems).toEqual([]);
  });

  it('returns the same result for the same input', () => {
    expect(parse(sabaoth)).toEqual(parse(sabaoth));
  });

  it('returns plain JSON', () => {
    const result = parse(sample);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('records the template it read the document with', () => {
    expect(parse(sample).model.template).toBe('avventura@1');
  });

  it('always returns a model, even for an empty text or broken YAML', () => {
    expect(parse('').model.sections).toEqual([]);
    const { model, problems } = parse('---\ntitolo: [\n---\n\n## Scene\n');
    expect(model.sections.map((s) => s.id)).toEqual(['Scene']);
    expect(codes(problems)).toContain('meta.yaml');
  });

  it('gives every problem 1-based line and column', () => {
    const { problems } = parse('# Titolo\n\n## Scene\n');
    const unplaced = problems.find((p) => p.code === 'content.unplaced');
    expect(unplaced?.range).toEqual({
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 8, line: 1, column: 9 },
    });
  });
});

describe('every block lands in the model or in a problem', () => {
  it('in the sample', () => {
    expect(uncoveredBlocks(sample, parse(sample))).toEqual([]);
  });

  it("in L'Ancora di Sabaoth, as written today", () => {
    const result = parse(sabaoth);
    expect(uncoveredBlocks(sabaoth, result)).toEqual([]);
    expect(topLevelBlocks(sabaoth)).toHaveLength(146);
    // The title line and the bold header lines, before the first section:
    // the converter moves them to the front matter.
    expect(result.model.unplaced.map((u) => u.range.start.line)).toEqual([1, 3, 5, 7]);
  });

  it('in a document of stray content', () => {
    const text = withScene(
      'Testo prima dei campi.\n\n**Luogo e momento:** qui.\n\n- un elenco senza campo\n\n#### Un titolo\n\n<!-- nota -->\n\n![web](https://example.com/a.png)',
    );
    const result = parse(text);
    expect(uncoveredBlocks(text, result)).toEqual([]);
    expect(result.model.unplaced.map((u) => u.text)).toEqual([
      'Testo prima dei campi.',
      '- un elenco senza campo',
      '#### Un titolo',
      '<!-- nota -->',
      '![web](https://example.com/a.png)',
    ]);
  });
});

describe('front matter', () => {
  it('reads the keys with their lines', () => {
    const { model } = parse(sample);
    expect(model.meta.values).toEqual({ titolo: 'La prova', sistema: 'Kulthos', licenza: 'CC-BY-NC-SA-4.0' });
    expect(model.meta.entries.map((e) => [e.key, e.keyRange.start.line, e.keyRange.start.column])).toEqual([
      ['titolo', 2, 1],
      ['sistema', 3, 1],
      ['licenza', 4, 1],
    ]);
  });

  it('holds an SPDX licence as such, with no problem', () => {
    const { model, problems } = parse(sample);
    expect(model.meta.licence).toEqual({ text: 'CC-BY-NC-SA-4.0', spdx: true });
    expect(problems).toEqual([]);
  });

  it('accepts free text as a licence', () => {
    const { model, problems } = parse('---\ntitolo: Prova\nlicenza: Tutti i diritti riservati\n---\n');
    expect(model.meta.licence).toEqual({ text: 'Tutti i diritti riservati', spdx: false });
    expect(problems).toEqual([]);
  });

  it('warns about an id that looks like SPDX but is not', () => {
    const { problems } = parse('---\ntitolo: Prova\nlicenza: CC-BY-FOO-9.0\n---\n');
    expect(problems.map((p) => [p.code, p.severity, p.range.start.line])).toEqual([
      ['meta.licence.unknown', 'warning', 3],
    ]);
  });

  it('reports a missing title', () => {
    const { problems } = parse('---\nsistema: Kulthos\n---\n');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: 'meta.required', severity: 'error' });
    expect(problems[0]?.message).toContain('"titolo"');
  });

  it('reports a missing title when there is no front matter', () => {
    expect(codes(parse('## Scene\n').problems)).toEqual(['meta.required']);
  });

  it("warns about an unknown key at the key's line", () => {
    const { model, problems } = parse('---\ntitolo: Prova\n\nediotre: Steve\n---\n');
    expect(model.meta.entries[1]?.known).toBe(false);
    expect(problems.map((p) => [p.code, p.severity, p.range.start.line, p.range.start.column])).toEqual([
      ['meta.unknown', 'warning', 4, 1],
    ]);
  });

  it('reports invalid YAML at its line', () => {
    const { problems } = parse('---\ntitolo: Prova\nsistema: [Kulthos\n---\n');
    const yaml = problems.find((p) => p.code === 'meta.yaml');
    expect(yaml?.severity).toBe('error');
    expect(yaml?.range.start.line).toBeGreaterThanOrEqual(3);
  });

  it('reports a duplicate key', () => {
    const { problems } = parse('---\ntitolo: Prova\ntitolo: Altra\n---\n');
    expect(problems.find((p) => p.code === 'meta.yaml')?.range.start.line).toBe(3);
  });

  it('reports a value of the wrong kind', () => {
    const { problems } = parse('---\ntitolo:\n  - una\n  - due\nfili: [T3, T5]\n---\n');
    expect(codes(problems)).toEqual(['meta.type']);
  });

  it('works with Windows line endings', () => {
    const { model, problems } = parse('---\r\ntitolo: Prova\r\nautore: Steve\r\n---\r\n\r\n## Scene\r\n');
    expect(problems).toEqual([]);
    expect(model.meta.entries[1]?.keyRange.start.line).toBe(3);
  });
});

describe('sections', () => {
  it('matches headings by name, the appendix by prefix', () => {
    const { model } = parse(sample);
    expect(model.sections.map((s) => [s.id, s.role])).toEqual([
      ['La vicenda in breve', 'synopsis'],
      ["A colpo d'occhio", 'overview'],
      ['Da non perdere stasera', 'reminders'],
      ['Orologio', 'clock'],
      ['Verità del mondo', 'truths'],
      ['Inizio forte', 'strongStart'],
      ['Mappa delle scene', 'sceneMap'],
      ['Scene', 'scenes'],
      ['Indizi', 'clues'],
      ['PNG', 'npcs'],
      ['Schede', 'sheets'],
      ['Prima della sessione', 'before'],
      ['Appendice', 'appendix'],
    ]);
    expect(model.sections.at(-1)?.heading).toBe('Appendice: immagini e musica');
  });

  it('keeps an unknown section where it stands, with a warning', () => {
    const text = '---\ntitolo: Prova\n---\n\n## Orologio\n\n## Note sparse\n\nUna nota.\n\n## Scene\n';
    const { model, problems } = parse(text);
    expect(model.sections.map((s) => [s.id, s.known])).toEqual([
      ['Orologio', true],
      ['Note sparse', false],
      ['Scene', true],
    ]);
    expect(model.sections[1]?.blocks.map((b) => b.text)).toEqual(['Una nota.']);
    expect(problems.map((p) => [p.code, p.severity, p.range.start.line])).toEqual([['section.unknown', 'warning', 7]]);
    expect(problems[0]?.message).toContain('"Note sparse"');
  });

  it('keeps the read-aloud and the fields of Inizio forte', () => {
    const section = parse(sample).model.sections.find((s) => s.role === 'strongStart');
    expect(section?.blocks.map((b) => b.kind)).toEqual(['callout', 'paragraph']);
    expect(section?.blocks[0]).toMatchObject({ type: 'leggi', id: 'Inizio forte.1', content: 'Il buio si muove.' });
  });
});

describe('callouts', () => {
  it('reads [!type], [!type] Title and [!type|meta] Title', () => {
    const text = withScene(
      '> [!leggi]\n> Uno.\n\n> [!documento] La lettera\n> Due.\n\n> [!riquadro|laterale] Se il tempo stringe\n> Tre.\n\n> Una citazione.',
    );
    const { model, problems } = parse(text);
    expect(problems).toEqual([]);
    expect(model.scenes[0]?.boxes.map((b) => (b.kind === 'callout' ? [b.id, b.type, b.meta, b.title, b.content] : [b.id, b.content]))).toEqual([
      ['S1.1', 'leggi', null, null, 'Uno.'],
      ['S1.2', 'documento', null, 'La lettera', 'Due.'],
      ['S1.3', 'riquadro', 'laterale', 'Se il tempo stringe', 'Tre.'],
      ['S1.4', 'Una citazione.'],
    ]);
  });

  it('keeps an unknown type for the checks', () => {
    const { model, problems } = parse(withScene('> [!nota]\n> Uno.'));
    expect(problems).toEqual([]);
    expect(model.scenes[0]?.boxes[0]).toMatchObject({ kind: 'callout', type: 'nota' });
  });

  it('reports a malformed first line and keeps the quote', () => {
    const { model, problems } = parse(withScene('> [!leggi\n> Uno.'));
    expect(problems.map((p) => [p.code, p.severity, p.sceneId, p.range.start.line])).toEqual([
      ['callout.malformed', 'error', 'S1', 9],
    ]);
    expect(model.scenes[0]?.boxes[0]).toMatchObject({ kind: 'quote', content: '[!leggi\nUno.' });
  });

  it('takes the read-aloud from its type, not its position', () => {
    const scene = parse(sample).model.scenes[0];
    expect(scene?.boxes.map((b) => b.kind === 'callout' && b.type)).toEqual(['documento', 'leggi']);
    expect(scene?.readAlouds).toEqual(['S1.2']);
  });
});

describe('scenes', () => {
  it('reads id, title, inline and block fields', () => {
    const scene = parse(sample).model.scenes[0];
    expect([scene?.id, scene?.title]).toEqual(['S1', 'La porta']);
    expect(scene?.fields.map((f) => [f.label, f.known, f.form, f.text, f.blocks.length])).toEqual([
      ['Luogo e momento', true, 'inline', "la soglia, all'alba.", 0],
      ['In gioco', true, 'inline', 'chi entra.', 0],
      ['Da non perdere qui', true, 'block', '', 1],
      ['Cosa succede da sé', true, 'block', '', 1],
      ["Chi c'è", true, 'block', '', 1],
      ['Indizi qui', true, 'block', '', 1],
      ['Prove e regole', true, 'inline', 'aprire la porta [da manuale].', 0],
      ['Se deragliano', true, 'inline', 'la porta si apre da sola.', 0],
    ]);
  });

  it('keeps the reactions table and another table separately, with no problem', () => {
    const { model, problems } = parse(sample);
    const scene = model.scenes[0];
    expect(scene?.reactions?.header).toEqual(['Se i PG…', 'Allora…']);
    expect(scene?.reactions?.rows.map((r) => r.cells)).toEqual([['bussano', 'nessuno apre']]);
    expect(scene?.tables.map((t) => t.header)).toEqual([['Chiave', 'Porta']]);
    expect(problems).toEqual([]);
  });

  it('reads references with the field they stand in', () => {
    const scene = parse(sample).model.scenes[0];
    expect(scene?.references.map((r) => [r.target, r.field, r.range.start.line])).toEqual([
      ['Guardiano', 'Da non perdere qui', 62],
      ['Guardiano', "Chi c'è", 76],
    ]);
  });

  it('reads asset images', () => {
    const scene = parse(sample).model.scenes[0];
    expect(scene?.images.map((i) => [i.assetId, i.alt])).toEqual([['s1-porta', "La porta all'alba"]]);
  });

  it('reads the clues written in the scene', () => {
    expect(parse(sample).model.clues).toMatchObject([
      { id: 'I1', text: "Un'impronta sulla soglia.", revelations: ['R1'], sceneId: 'S1' },
      { id: 'I2', text: 'Una voce dietro la porta.', revelations: ['R1'], sceneId: 'S1' },
    ]);
  });

  it('keeps text before the first field as unplaced content of the scene, with an error', () => {
    const { model, problems } = parse(withScene('Prima dei campi.\n\n**Luogo e momento:** qui.'));
    expect(model.unplaced).toMatchObject([{ text: 'Prima dei campi.', sceneId: 'S1', section: 'Scene' }]);
    expect(problems.map((p) => [p.code, p.severity, p.sceneId, p.range.start.line])).toEqual([
      ['content.unplaced', 'error', 'S1', 9],
    ]);
  });

  it('reports a scene heading without an id, and keeps the scene', () => {
    const { model, problems } = parse(withScene('**Luogo e momento:** qui.', '### La casa che cede'));
    expect(problems.map((p) => [p.code, p.severity, p.range.start.line])).toEqual([['scene.id.missing', 'error', 7]]);
    expect(model.scenes[0]).toMatchObject({ id: null, title: 'La casa che cede' });
    expect(model.scenes[0]?.fields.map((f) => f.label)).toEqual(['Luogo e momento']);
  });

  it('places an unknown field as a field the template does not know, for the checks', () => {
    const { model, problems } = parse(withScene('**Se il tempo stringe:** Donato resta sulla strada.'));
    expect(problems).toEqual([]);
    expect(model.scenes[0]?.fields).toMatchObject([{ label: 'Se il tempo stringe', known: false, form: 'inline' }]);
  });

  it('knows a field once it is added to the template', () => {
    const definition = JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
    definition.sceneFields.push({ label: 'Se il tempo stringe', form: 'inline', requirement: 'optional', climax: true });
    const template = defineTemplate(definition);
    const { model } = parseAdventure(withScene('**Se il tempo stringe:** Donato resta sulla strada.'), { template });
    expect(model.scenes[0]?.fields[0]?.known).toBe(true);
  });

  it('reads a label written as **Label**: text as an inline field', () => {
    const { model } = parse(withScene('**In gioco**: chi entra.'));
    expect(model.scenes[0]?.fields[0]).toMatchObject({ label: 'In gioco', form: 'inline', text: 'chi entra.' });
  });
});

describe('overview', () => {
  it('reads revelations, reminders and the scene map', () => {
    const { model } = parse(sample);
    expect(model.revelations).toMatchObject([{ id: 'R1', text: 'La verità.', clues: ['I1', 'I2'] }]);
    expect(model.reminders.map((r) => [r.text, r.checked])).toEqual([
      ['Il ritmo.', false],
      ['Il seme.', true],
    ]);
    expect(model.sceneMap).toMatchObject([{ sceneId: 'S1', cells: { '#': 'S1', Scena: 'La porta', Indizi: 'I1, I2' } }]);
  });

  it('keeps the side box of the overview in its section', () => {
    const section = parse(sample).model.sections.find((s) => s.role === 'overview');
    expect(section?.blocks.find((b) => b.kind === 'callout')).toMatchObject({ type: 'riquadro', meta: 'laterale' });
  });
});

describe('clue tracker and NPC table', () => {
  it('reads the tracker by its columns', () => {
    expect(parse(sample).model.tracker.map((t) => [t.clueId, t.text, t.revelations, t.scenes, t.done])).toEqual([
      ['I1', "L'impronta", ['R1'], ['S1'], true],
      ['I2', 'La voce', ['R1'], ['S1'], false],
    ]);
  });

  it('keeps extra tracker columns', () => {
    expect(parse(sabaoth).model.tracker[0]?.cells['Richiede']).toBe('niente: arrivano comunque');
  });

  it('reads the NPC table', () => {
    expect(parse(sample).model.npcs).toMatchObject([{ name: 'Guardiano', cells: { Ruolo: 'custode', Dove: 'S1' } }]);
  });
});

describe('sheets', () => {
  it('reads fields and threat data, with counts from the grade table', () => {
    const sheet = parse(sample).model.sheets[0];
    expect([sheet?.id, sheet?.name, sheet?.title]).toEqual([
      'guardiano',
      'Guardiano',
      'Guardiano, il custode della porta',
    ]);
    expect(sheet?.fields.map((f) => f.key)).toEqual(['Tipo', 'Grado', 'Natura', 'Ferite', 'Talenti', 'Volontà']);
    expect(sheet?.threat).toEqual({
      type: 'Minaccia',
      grade: 'Straordinaria',
      nature: 'non risvegliata',
      wounds: '2 contatori da 3',
      afflictions: null,
      pack: null,
      talents: ['La Presenza', 'Il Nulla'],
      counts: { wounds: 6, afflictions: 2, woundsPerCounter: 3 },
    });
  });

  it('keeps a #### heading inside a sheet in its blocks, for the checks', () => {
    const sheet = parse(sample).model.sheets[0];
    expect(sheet?.blocks.map((b) => [b.kind, b.text])).toEqual([
      ['heading', '#### Il cane'],
      ['paragraph', 'Un cane nero.'],
    ]);
  });

  it('reads pregenerated characters under their own heading', () => {
    const { model } = parse(sample);
    expect(model.sheets.map((s) => s.name)).toEqual(['Guardiano']);
    expect(model.pregenerated?.blocks.map((b) => b.text)).toEqual(['Tre personaggi.']);
    expect(model.pregenerated?.characters.map((c) => [c.name, c.blocks.length])).toEqual([['Elena', 1]]);
  });

  it('has no counts when the document names no system', () => {
    const text = '## Schede\n\n### Ombra\n\n- **Grado:** Ordinaria\n';
    expect(parse(text).model.sheets[0]?.threat?.counts).toBeNull();
  });

  it("keeps Sabaoth's threats written inside other sheets as fields", () => {
    const salvi = parse(sabaoth).model.sheets.find((s) => s.id === 'dottor-umberto-salvi');
    expect(salvi?.fields.at(-1)?.key).toBe('Avatar di Sabaoth');
  });
});

describe('appendix', () => {
  it('reads rows by scene id, with visual and mood', () => {
    expect(parse(sample).model.appendix).toMatchObject([
      {
        sceneId: 'S1',
        title: 'La porta',
        visual: { text: 'an old door at dawn' },
        mood: { text: 'quiet, tense' },
      },
    ]);
  });

  it('keeps anything else in a row as unplaced content', () => {
    const text = '---\ntitolo: Prova\n---\n\n## Appendice\n\n### S1. La porta\n\nvisual: a door\n\nUna nota.\n';
    const { model, problems } = parse(text);
    expect(model.appendix[0]?.mood).toBeNull();
    expect(model.unplaced.map((u) => [u.text, u.section])).toEqual([['Una nota.', 'Appendice']]);
    expect(codes(problems)).toEqual(['content.unplaced']);
  });
});
