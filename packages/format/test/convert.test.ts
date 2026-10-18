import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { convertNote, type ConvertResult } from '../src/index.js';
import { parse, sample } from './helpers.js';

const replace = (text: string, swaps: [string, string][]) =>
  swaps.reduce((out, [from, to]) => {
    expect(out.includes(from), `"${from}" is in the text`).toBe(true);
    return out.replace(from, to);
  }, text);

// The sample written in today's conventions: a title line and bold header
// lines, plain quotes for the read-alouds, one Tipo line.
const legacy = replace(sample, [
  [
    '---\ntitolo: La prova\nsistema: Kulthos\nlicenza: CC-BY-NC-SA-4.0\n---',
    '# La prova\n\n**Sistema:** Kulthos · **Licenza:** CC-BY-NC-SA-4.0',
  ],
  ['> [!leggi]\n> Il buio si muove.', '> Il buio si muove.'],
  ['> [!leggi]\n> Una porta socchiusa.', '> Una porta socchiusa.'],
  [
    '- **Tipo:** Minaccia\n- **Grado:** Straordinaria\n- **Natura:** non risvegliata\n- **Ferite:** 2 contatori da 3',
    '- **Tipo:** Minaccia Straordinaria, non risvegliata · Ferite: 2 contatori da 3',
  ],
]);

const sabaoth = readFileSync(new URL('../fixtures/l-ancora-di-sabaoth.md', import.meta.url), 'utf8');

const kinds = (result: ConvertResult) => result.edits.map((e) => e.kind);
const notices = (result: ConvertResult) => result.report.notices.map((n) => n.code);

// A note with the given header, and one section so the rest has a place.
const note = (head: string) => `${head}\n\n## La vicenda in breve\n\nTesto.\n`;

describe('convertNote', () => {
  it('brings the sample written in today\'s conventions back to the sample', () => {
    const result = convertNote(legacy);
    expect(result.text).toBe(sample);
    expect(result.report.counts).toEqual({ frontMatter: 1, callout: 2, threat: 1, comment: 0 });
    expect(result.report.notices).toEqual([]);
    expect(result.report.problems).toEqual(parse(sample).problems);
  });

  it('lists edits sorted, not overlapping, against the original text', () => {
    const { edits } = convertNote(legacy);
    edits.forEach((edit, i) => {
      expect(edit.to).toBeGreaterThanOrEqual(edit.from);
      if (i > 0) expect(edit.from).toBeGreaterThanOrEqual(edits[i - 1]!.to);
      expect(edit.message).toMatch(/\.$/);
    });
    expect(legacy.slice(edits[0]!.from, edits[0]!.to)).toBe(
      '# La prova\n\n**Sistema:** Kulthos · **Licenza:** CC-BY-NC-SA-4.0',
    );
  });
});

describe('header to front matter', () => {
  it('takes the title from the caller when the note has no title line (the spec example)', () => {
    const { text } = convertNote(note('**Sistema:** Kulthos'), { title: "L'Ancora di Sabaoth" });
    expect(text.startsWith("---\ntitolo: L'Ancora di Sabaoth\nsistema: Kulthos\n---\n")).toBe(true);
  });

  it('prefers the title line to the caller\'s title', () => {
    const { text } = convertNote(note('# Dalla nota'), { title: 'Da Joplin' });
    expect(text).toBe(note('---\ntitolo: Dalla nota\n---'));
  });

  it.each([
    ['in parentheses', '# La prova (una notte a Messina)'],
    ['after a colon', '# La prova: una notte a Messina'],
  ])('reads a subtitle %s', (_, head) => {
    const { text } = convertNote(note(head));
    expect(text).toBe(note('---\ntitolo: La prova\nsottotitolo: una notte a Messina\n---'));
  });

  it('writes the keys in the template\'s order, as YAML strings quoted where YAML needs it', () => {
    const head = [
      '# Prova',
      "**Tempi:** S1: 30' · S2 1 ora · **Giocatori:** 4",
      '**Sistema:** Kulthos · **Formato:** one-shot',
      '**Ambientazione:** "Messina", 1908 # alba',
    ].join('\n\n');
    const { text, report } = convertNote(note(head));
    const yaml = text.slice(4, text.indexOf('\n---\n'));
    expect(yaml.split('\n').map((line) => line.split(':')[0])).toEqual([
      'titolo',
      'sistema',
      'formato',
      'giocatori',
      'ambientazione',
      'tempi',
    ]);
    expect(parseYaml(yaml)).toEqual({
      titolo: 'Prova',
      sistema: 'Kulthos',
      formato: 'one-shot',
      giocatori: '4',
      ambientazione: '"Messina", 1908 # alba',
      tempi: "S1: 30' · S2 1 ora",
    });
    expect(report.problems.filter((p) => p.code.startsWith('meta.'))).toEqual([]);
  });

  it('keeps a label with no key under its own name, and reports it', () => {
    const result = convertNote(note('# Prova\n\n**Sistema:** Kulthos · **Note:** da rivedere'));
    expect(result.text.startsWith('---\ntitolo: Prova\nsistema: Kulthos\nnote: da rivedere\n---\n')).toBe(true);
    expect(notices(result)).toEqual(['convert.header.unknown']);
    expect(result.report.problems.map((p) => p.code)).toContain('meta.unknown');
  });

  it('drops a comment from a header line, and counts it', () => {
    const head = '# Prova\n\n**Campagna:** Il Velo · **Arco:** A2. Lo Stretto <!-- solo per un episodio di campagna -->';
    const { text, edits } = convertNote(note(head));
    expect(text).toBe(note('---\ntitolo: Prova\ncampagna: Il Velo\narco: A2. Lo Stretto\n---'));
    expect(edits.map((e) => e.message)).toEqual([
      'Moved the title and 2 header labels to the front matter, with 1 comment among them.',
    ]);
  });

  it('opens the document with the front matter when template comments come first', () => {
    const { text, edits } = convertNote(note('<!-- Esempio di calibrazione.\n     Su due righe. -->\n\n# Prova'));
    expect(text).toBe(note('---\ntitolo: Prova\n---'));
    expect(kinds({ edits } as ConvertResult)).toEqual(['comment', 'frontMatter']);
  });

  it('leaves a header that does not open the note, and reports it', () => {
    const doc = note('Una riga prima.\n\n# Prova\n\n**Sistema:** Kulthos');
    const result = convertNote(doc);
    expect(result.text).toBe(doc);
    expect(notices(result)).toEqual(['convert.header.position']);
  });

  it('leaves front matter alone', () => {
    expect(convertNote(sample).edits).toEqual([]);
  });
});

describe('quotes to callouts', () => {
  const scene = (body: string) => sample.replace('> [!leggi]\n> Una porta socchiusa.\n\n', '').replace(
    '**Cosa succede da sé**\n\n- La porta cigola.',
    `**Cosa succede da sé**\n\n- La porta cigola.\n\n${body}`,
  );

  it('makes the first plain quote the read-aloud and the second an untitled handout (the spec example)', () => {
    const doc = scene('> Una porta socchiusa.\n\n> Caro Neri, non aprite.').replace(
      '> [!documento] La lettera\n> Non aprite.\n\n',
      '',
    );
    const result = convertNote(doc);
    expect(result.text).toContain('> [!leggi]\n> Una porta socchiusa.\n\n> [!documento]\n> Caro Neri, non aprite.');
    expect(notices(result)).toEqual(['convert.handout.title']);
    expect(result.report.problems.map((p) => p.code)).toContain('callout.title.missing');
  });

  it('makes a plain quote a handout when the scene has its read-aloud', () => {
    const doc = scene('> [!leggi]\n> Una porta socchiusa.\n\n> Un biglietto.');
    const result = convertNote(doc);
    expect(result.text).toContain('> [!leggi]\n> Una porta socchiusa.\n\n> [!documento]\n> Un biglietto.');
    expect(result.edits).toHaveLength(1);
  });

  it('marks the strong start, and leaves callouts and quotes outside scenes alone', () => {
    const doc = sample
      .replace('> [!leggi]\n> Il buio si muove.', '> Il buio si muove.')
      .replace('**Nomi di riserva:** Turi.', '**Nomi di riserva:** Turi.\n\n> Una citazione.');
    const result = convertNote(doc);
    expect(result.text).toBe(sample.replace('**Nomi di riserva:** Turi.', '**Nomi di riserva:** Turi.\n\n> Una citazione.'));
    expect(kinds(result)).toEqual(['callout']);
  });
});

describe('the Tipo line', () => {
  const sheet = (line: string) => sample.replace(
    '- **Tipo:** Minaccia\n- **Grado:** Straordinaria\n- **Natura:** non risvegliata\n- **Ferite:** 2 contatori da 3',
    line,
  );

  it('splits an extraordinary threat (the spec example)', () => {
    const { text } = convertNote(sheet('- **Tipo:** Minaccia Straordinaria, non risvegliata'));
    expect(text).toContain('- **Tipo:** Minaccia\n- **Grado:** Straordinaria\n- **Natura:** non risvegliata\n- **Talenti:**');
  });

  it('splits Salvi\'s line into one item per key, at the same indentation', () => {
    const line = '  * **Tipo:** Minaccia Ordinaria, Dormiente · Ferite: 1 contatore da 3 · Afflizioni: 1';
    const { text } = convertNote(sheet(line));
    expect(text).toContain(
      [
        '  * **Tipo:** Minaccia',
        '  * **Grado:** Ordinaria',
        '  * **Natura:** Dormiente',
        '  * **Ferite:** 1 contatore da 3',
        '  * **Afflizioni:** 1',
      ].join('\n'),
    );
  });

  it.each([
    ['in the nature', '- **Tipo:** Minaccia Ordinaria, branco, non risvegliate', 'non risvegliate'],
    ['as a part of its own', '- **Tipo:** Minaccia Ordinaria, cani randagi · branco', 'cani randagi'],
    ['inside the nature', '- **Tipo:** Minaccia Ordinaria, branco di cani', 'branco di cani'],
  ])('turns a pack mentioned %s into Branco', (_, line, nature) => {
    const { text } = convertNote(sheet(line));
    expect(text).toContain(`- **Grado:** Ordinaria\n- **Natura:** ${nature}\n- **Branco:** sì\n- **Talenti:**`);
  });

  it.each([
    ['another word than the threat', '- **Tipo:** PNG alleato'],
    ['a grade no system has', '- **Tipo:** Minaccia Epica, antica'],
    ['a part that is not a threat key', '- **Tipo:** Minaccia Ordinaria · Forza: 3'],
  ])('leaves a line with %s, and reports it', (_, line) => {
    const doc = sheet(line);
    const result = convertNote(doc);
    expect(result.text).toBe(doc);
    expect(notices(result)).toEqual(['convert.threat']);
  });

  it('leaves the line when the sheet already has one of its keys', () => {
    const doc = sheet('- **Tipo:** Minaccia Straordinaria · Ferite: 2 contatori da 3\n- **Grado:** Straordinaria');
    const result = convertNote(doc);
    expect(result.text).toBe(doc);
    expect(result.report.notices[0]!.message).toContain('"Grado"');
  });
});

describe('template comments', () => {
  it('removes a comment in a section and lists it (the spec example)', () => {
    const doc = sample.replace(
      '## Orologio\n\n',
      '## Orologio\n\n<!-- 4-6 passi. Ognuno: quando o cosa lo fa scattare.\n     L\'ultimo passo. -->\n\n',
    );
    const result = convertNote(doc);
    expect(result.text).toBe(sample);
    expect(result.edits.map((e) => [e.kind, e.message])).toEqual([['comment', 'Removed a template comment.']]);
  });

  it('removes a comment inside a paragraph with the spaces before it', () => {
    const doc = sample.replace('Ordine: S1 apre.', 'Ordine: S1 apre. <!-- solo dove è obbligato -->');
    expect(convertNote(doc).text).toBe(sample);
  });
});

// The 0-based lines of the original text an edit replaces or deletes (an
// insertion touches none), the lines left, and the output lines that are
// neither a line left, in order, nor a line an edit inserted.
function untouchedLines(before: string, result: ConvertResult) {
  const starts = [0];
  for (let i = 0; i < before.length; i++) if (before[i] === '\n') starts.push(i + 1);
  const touched = new Set<number>();
  for (const edit of result.edits) {
    if (edit.from === edit.to) continue;
    starts.forEach((start, line) => {
      const end = (starts[line + 1] ?? before.length + 1) - 1;
      if (edit.from <= end && edit.to > start) touched.add(line);
    });
  }
  const kept = before.split('\n').filter((_, line) => !touched.has(line));
  const inserted = new Set(result.edits.flatMap((e) => e.insert.split('\n')));
  const after = result.text.split('\n');
  const missing: string[] = [];
  const extra: string[] = [];
  let at = 0;
  for (const line of kept) {
    const found = after.indexOf(line, at);
    if (found === -1) {
      missing.push(line);
      continue;
    }
    extra.push(...after.slice(at, found).filter((l) => !inserted.has(l)));
    at = found + 1;
  }
  extra.push(...after.slice(at).filter((l) => !inserted.has(l)));
  return { touched: [...touched].sort((a, b) => a - b), missing, extra };
}

describe('L\'Ancora di Sabaoth', () => {
  const result = convertNote(sabaoth);

  it('leaves every line outside the converted parts byte-identical', () => {
    const { touched, missing, extra } = untouchedLines(sabaoth, result);
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    // The header (lines 1 to 7) and the five Tipo lines; the quotes only gain
    // a line each.
    const tipo = sabaoth.split('\n').flatMap((line, i) => (line.startsWith('- **Tipo:**') ? [i] : []));
    expect(touched).toEqual([0, 1, 2, 3, 4, 5, 6, ...tipo]);
    expect(tipo).toHaveLength(5);
    expect(result.text.split('\n').length - sabaoth.split('\n').length).toBe(9 - 7 + 5 * 4 + 6);
  });

  it('makes no edits the second time (the spec example)', () => {
    const again = convertNote(result.text);
    expect(again.edits).toEqual([]);
    expect(again.text).toBe(result.text);
  });

  it('reports the problems left (the spec example)', () => {
    const left = result.report.problems.map((p) => [p.code, p.sceneId ?? null]);
    expect(left).toContainEqual(['scene.field.unknown', 'S5']);
    expect(result.report.problems.find((p) => p.code === 'scene.field.unknown')!.message).toContain(
      '"Se il tempo stringe"',
    );
    expect(left).toContainEqual(['sheet.nested-threat', null]);
    expect(result.report.problems.find((p) => p.code === 'sheet.nested-threat')!.message).toContain(
      '"Dottor Umberto Salvi" holds "Avatar di Sabaoth"',
    );
  });
});

describe('every sample conversion', () => {
  it.each([
    ['the legacy sample', legacy],
    ['Sabaoth', sabaoth],
  ])('is idempotent: %s', (_, text) => {
    const once = convertNote(text);
    expect(convertNote(once.text).edits).toEqual([]);
  });
});
