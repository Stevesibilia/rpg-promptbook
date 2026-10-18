import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from './helpers.js';
import { base, change, codes, expectCase, type Case } from './checks.helpers.js';

const padding = 'Il passato pesa su ogni stanza e nessuno lo nomina. ';
const s2Appendix = '### S2. La cantina\n\nvisual: a flooded cellar\n\nmood: damp, close\n';
const s2Clue = '- **I3.** Un graffio sul muro. (R1)';
const reminders = '- [x] Il seme.\n';

const cases: Case[] = [
  {
    name: 'wounds disagree with the grade (the spec example)',
    code: 'sheet.grade.counts',
    doc: change('- **Grado:** Straordinaria', '- **Grado:** Ordinaria').replace('2 contatori da 3', '3 contatori da 3'),
    severity: 'warning',
    at: '- **Ferite:** 3 contatori da 3',
  },
  {
    name: 'wounds are counted in counters of another size',
    code: 'sheet.grade.counts',
    doc: change('2 contatori da 3', '2 contatori da 4'),
    severity: 'warning',
    at: '- **Ferite:** 2 contatori da 4',
  },
  {
    name: 'afflictions disagree with the grade',
    code: 'sheet.grade.counts',
    doc: change('- **Talenti:**', '- **Afflizioni:** 3\n- **Talenti:**'),
    severity: 'warning',
    at: '- **Afflizioni:** 3',
  },
  {
    name: 'a #### heading inside a sheet',
    code: 'sheet.nested-threat',
    doc: change('### Pregenerati', '#### Il cane\n\nUn cane nero.\n\n### Pregenerati'),
    severity: 'warning',
    at: '#### Il cane',
  },
  {
    name: 'a field that names a grade of the system',
    code: 'sheet.nested-threat',
    doc: change('- **Talenti:**', '- **Avatar del Guardiano**, risvegliato: Minaccia Straordinaria, vigile.\n- **Talenti:**'),
    severity: 'warning',
    at: '- **Avatar del Guardiano**',
  },
  {
    name: 'two sheets with the same name (the spec example)',
    code: 'sheet.name.duplicate',
    doc: change('### Pregenerati', '### Guardiano, il vecchio\n\n- **Volontà:** nessuna.\n\n### Pregenerati'),
    severity: 'error',
    at: '### Guardiano, il vecchio',
  },
  {
    name: 'a revelation with fewer than three clues',
    code: 'clue.revelation.count',
    doc: change('- **R1.** La verità. (I1, I2, I3)', '- **R1.** La verità. (I1, I2, I3)\n- **R2.** Altro. (I1, I2)'),
    severity: 'error',
    at: '- **R2.**',
  },
  {
    name: 'all the clues of a revelation in one scene',
    code: 'clue.revelation.scenes',
    doc: change(s2Clue, '').replace(
      '- **I2.** Una voce dietro la porta. (R1)',
      `- **I2.** Una voce dietro la porta. (R1)\n${s2Clue}`,
    ),
    severity: 'warning',
    at: '- **R1.**',
  },
  {
    name: 'a clue in a scene points at a missing revelation',
    code: 'clue.revelation.missing',
    doc: change(s2Clue, '- **I3.** Un graffio sul muro. (R9)'),
    severity: 'error',
    at: '- **I3.** Un graffio sul muro. (R9)',
    sceneId: 'S2',
  },
  {
    name: 'a tracker row points at a missing revelation',
    code: 'clue.revelation.missing',
    doc: change('| I3  | Il graffio   | R1 ', '| I3  | Il graffio   | R9 '),
    severity: 'error',
    at: '| I3  | Il graffio   | R9',
  },
  {
    name: 'a tracker row points at a missing scene',
    code: 'clue.scene.missing',
    doc: change('| I3  | Il graffio   | R1          | S2 ', '| I3  | Il graffio   | R1          | S9 '),
    severity: 'error',
    at: '| I3  | Il graffio',
  },
  {
    name: 'a tracker clue written in no scene',
    code: 'clue.tracker.unwritten',
    doc: change('| I3  | Il graffio   | R1          | S2   |     |\n', '| I3  | Il graffio   | R1          | S2   |     |\n| I4  | Il nome      | R1          | S2   |     |\n'),
    severity: 'error',
    at: '| I4',
  },
  {
    name: 'the tracker gives another scene than the one the clue is written in',
    code: 'clue.tracker.scene',
    doc: change('| I3  | Il graffio   | R1          | S2 ', '| I3  | Il graffio   | R1          | S1 '),
    severity: 'warning',
    at: '| I3  | Il graffio',
  },
  {
    name: 'a clue with its number and no text',
    code: 'clue.text.missing',
    doc: change("- **I1.** Un'impronta sulla soglia. (R1)", '- **I1.** (R1)'),
    severity: 'error',
    at: '- **I1.** (R1)',
    sceneId: 'S1',
  },
  {
    name: 'clue numbers in an inline field',
    code: 'clue.text.missing',
    doc: change(`**Indizi qui**\n\n${s2Clue}`, '**Indizi qui:** I3'),
    severity: 'error',
    at: '**Indizi qui:** I3',
    sceneId: 'S2',
  },
  {
    name: 'a scene missing from the map',
    code: 'map.scene.missing',
    doc: change('| S2  | La cantina | I3 |\n', ''),
    severity: 'error',
    at: '### S2. La cantina',
    sceneId: 'S2',
  },
  {
    name: 'a map row without a scene',
    code: 'map.row.orphan',
    doc: change('| S2  | La cantina | I3 |\n', '| S2  | La cantina | I3 |\n| S7  | Altrove | I1 |\n'),
    severity: 'error',
    at: '| S7',
  },
  {
    name: 'a scene without an appendix row',
    code: 'appendix.row.missing',
    doc: change(s2Appendix, ''),
    severity: 'warning',
    at: '### S2. La cantina',
    sceneId: 'S2',
  },
  {
    name: 'an appendix row that matches no scene',
    code: 'appendix.row.orphan',
    doc: change('mood: damp, close\n', 'mood: damp, close\n\n### S8. Altro\n\nvisual: x\n\nmood: y\n'),
    severity: 'warning',
    at: '### S8. Altro',
  },
  {
    name: 'a renamed scene keeps its old appendix title (the spec example)',
    code: 'appendix.title.mismatch',
    doc: change('### S2. La cantina\n\nvisual', '### S2. La cripta\n\nvisual'),
    severity: 'warning',
    at: '### S2. La cripta',
    sceneId: 'S2',
  },
  {
    name: 'an appendix row without mood',
    code: 'appendix.key.missing',
    doc: change('\n\nmood: damp, close', ''),
    severity: 'warning',
    at: '### S2. La cantina\n\nvisual',
    sceneId: 'S2',
  },
  {
    name: 'visual outside the appendix',
    code: 'appendix.key.outside',
    doc: change('**Da preparare:** la lettera.', '**Da preparare:** la lettera.\n\nvisual: una porta'),
    severity: 'error',
    at: 'visual: una porta',
  },
  {
    name: 'a synopsis that is too short',
    code: 'limit.synopsis.words',
    doc: change(padding.repeat(34), ''),
    severity: 'warning',
    at: '## La vicenda in breve',
  },
  {
    name: 'a synopsis that is too long',
    code: 'limit.synopsis.words',
    doc: change(padding.repeat(34), padding.repeat(80)),
    severity: 'warning',
    at: '## La vicenda in breve',
  },
  {
    name: 'more than 700 words from the overview to the strong start',
    code: 'limit.preamble.words',
    doc: change('È vecchio.', `È vecchio. ${padding.repeat(80)}`),
    severity: 'warning',
    at: "## A colpo d'occhio",
  },
  {
    name: 'more than five reminders',
    code: 'limit.reminders.count',
    doc: change(reminders, `${reminders}- [ ] Terzo.\n- [ ] Quarto.\n- [ ] Quinto.\n- [ ] Sesto.\n`),
    severity: 'error',
    at: '- [ ] Sesto.',
  },
  {
    name: 'an en dash (the spec example)',
    code: 'style.dash',
    doc: change('Ordine: S1 apre.', 'Ordine: S1 – S4 apre.'),
    severity: 'error',
    at: '–',
  },
  {
    name: 'an em dash',
    code: 'style.dash',
    doc: change('Ordine: S1 apre.', 'Ordine: S1 apre — poi S2.'),
    severity: 'error',
    at: '—',
  },
];

describe('sheet, clue, appendix, limit and style checks', () => {
  it.each(cases)('$code: $name', (c) => {
    expectCase(c);
  });

  it('accepts a grade whose counts agree, and a sheet without a known system', () => {
    expect(parse(base).problems).toEqual([]);
    const other = change('sistema: Kulthos', 'sistema: Altro').replace('2 contatori da 3', '9 contatori da 3');
    expect(codes(parse(other).problems)).not.toContain('sheet.grade.counts');
  });

  it('does not take the grade key itself for a nested threat', () => {
    expect(codes(parse(base).problems)).not.toContain('sheet.nested-threat');
  });

  it('counts a revelation clue once across overview, scenes and tracker', () => {
    expect(codes(parse(base).problems)).not.toContain('clue.revelation.count');
    const message = parse(
      change('- **R1.** La verità. (I1, I2, I3)', '- **R1.** La verità. (I1, I2, I3)\n- **R2.** Altro. (I1, I2)'),
    ).problems.find((p) => p.code === 'clue.revelation.count')!.message;
    expect(message).toBe('R2 has 2 clues (minimum 3).');
  });

  it('reports every dash, not the first only', () => {
    const doc = change('Ordine: S1 apre.', 'Ordine: S1 – S2 – S3 apre.');
    expect(parse(doc).problems.filter((p) => p.code === 'style.dash')).toHaveLength(2);
  });

  it('keeps the appendix row of a renamed scene with its scene', () => {
    const { problems } = parse(change('### S2. La cantina\n\nvisual', '### S2. La cripta\n\nvisual'));
    expect(codes(problems).filter((c) => c.startsWith('appendix.'))).toEqual(['appendix.title.mismatch']);
  });
});

describe('the unconverted Sabaoth', () => {
  it('runs every check without throwing, and every problem has a position', () => {
    const text = readFileSync(new URL('../fixtures/l-ancora-di-sabaoth.md', import.meta.url), 'utf8');
    const { problems } = parse(text);
    expect(problems.length).toBeGreaterThan(0);
    for (const p of problems) {
      expect(p.range.start.line).toBeGreaterThanOrEqual(1);
      expect(p.range.start.column).toBeGreaterThanOrEqual(1);
      expect(p.range.end.offset).toBeGreaterThanOrEqual(p.range.start.offset);
    }
  });
});

describe('every problem code of the checks', () => {
  it('has a table-driven test', () => {
    const dir = new URL('../src/checks/', import.meta.url);
    const emitted = new Set<string>();
    for (const file of ['sections', 'scenes', 'callouts', 'references', 'sheets', 'clues', 'appendix', 'limits', 'style']) {
      const text = readFileSync(new URL(`${file}.ts`, dir), 'utf8');
      for (const match of text.matchAll(/problem\(\s*'([a-z.-]+)'/g)) emitted.add(match[1]!);
    }
    const tested = ['structure', 'references', 'rest']
      .map((name) => readFileSync(new URL(`checks.${name}.test.ts`, import.meta.url), 'utf8'))
      .join('\n');
    const covered = new Set([...tested.matchAll(/code: '([a-z.-]+)'/g)].map((m) => m[1]!));
    expect([...emitted].filter((code) => !covered.has(code))).toEqual([]);
    expect(emitted.size).toBeGreaterThan(30);
  });
});
