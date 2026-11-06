import { EditorState } from '@codemirror/state';
import { templates } from 'promptbook-format';
import { describe, expect, it } from 'vitest';
import sabaoth from '../../format/fixtures/l-ancora-di-sabaoth.converted.md?raw';
import { sheetNames, sheetQuery, slashEntries, slashLine } from '../src/editor/cm/slash.js';
import { analysed, campaign } from './analysed.js';
import { characters, withBlock } from './pregenerated.js';

const template = templates.avventura;

const at = (text: string, needle: string, offset = 0) => {
  const index = text.indexOf(needle);
  if (index < 0) throw new Error(`not found: ${needle}`);
  return index + offset;
};

const menu = (text: string, pos: number) =>
  slashEntries(analysed(text, pos).state, pos, template).map((e) => `${e.group}: ${e.label} (${e.detail})`);

describe('the / menu', () => {
  it('opens on a / alone at the start of a line, with what follows as its filter', () => {
    const state = EditorState.create({ doc: 'Testo.\n/\n/pro\n a/\n/a/b' });
    const line = (n: number) => slashLine(state, state.doc.line(n).to);
    expect(line(2)).toEqual({ from: 7, to: 8, query: '' });
    expect(line(3)?.query).toBe('pro');
    expect(line(4)).toBeNull();
    expect(line(5)).toBeNull();
    // Not with the cursor before the end of the line.
    expect(slashLine(state, state.doc.line(3).from + 1)).toBeNull();
  });

  it('lists the missing fields of a scene first, then the inserts allowed there', () => {
    const text = '## Scene\n\n### S1. Uno\n\n**Luogo e momento:** qui.\n\n> [!leggi]\n> Testo.\n';
    expect(menu(text, at(text, 'qui.'))).toMatchInlineSnapshot(`
      [
        "missing: In gioco (required)",
        "missing: Da non perdere qui (required)",
        "missing: Cosa succede da sé (required)",
        "missing: Chi c'è (optional)",
        "missing: Indizi qui (recommended)",
        "missing: Prove e regole (optional)",
        "missing: Se deragliano (required)",
        "missing: Regole della situazione (optional)",
        "missing: Cosa decide la notte (optional)",
        "insert: Da leggere (> [!leggi])",
        "insert: Documento da consegnare (> [!documento])",
        "insert: Riquadro (> [!riquadro])",
        "insert: Riquadro laterale (> [!riquadro|laterale])",
        "insert: Sheet reference (→ Schede:)",
        "insert: Reactions table (| Se i PG… |)",
        "insert: New scene (### S2.)",
      ]
    `);
  });

  it('leaves out the reactions table of a scene that has one', () => {
    const s5 = menu(sabaoth, at(sabaoth, '### S5.', 10));
    expect(s5.some((e) => e.includes('Reactions'))).toBe(false);
    expect(s5.at(-1)).toBe('insert: New scene (### S6.)');
  });

  it('lists the callouts allowed in a section', () => {
    expect(menu(sabaoth, at(sabaoth, "## A colpo d'occhio", 5))).toMatchInlineSnapshot(`
      [
        "insert: Riquadro (> [!riquadro])",
        "insert: Riquadro laterale (> [!riquadro|laterale])",
      ]
    `);
    expect(menu(sabaoth, at(sabaoth, '## Inizio forte', 5))).toMatchInlineSnapshot(`
      [
        "insert: Da leggere (> [!leggi])",
        "insert: Documento da consegnare (> [!documento])",
        "insert: Riquadro (> [!riquadro])",
      ]
    `);
  });

  it('offers the sheet\'s callouts in the Pregenerati block and in a character', () => {
    const doc = withBlock(characters);
    // A sheet also offers the system's kinds; the pregenerated do not.
    const sheet = menu(doc, at(doc, '### Tenente Donato', 22)).filter((e) => !e.startsWith('sheets:'));
    expect(sheet.length).toBeGreaterThan(0);
    expect(menu(doc, at(doc, 'Tre personaggi'))).toEqual(sheet);
    expect(menu(doc, at(doc, 'il fratello di Ada'))).toEqual(sheet);
  });

  it('adds New scene in the scenes section, with the next number', () => {
    expect(menu(sabaoth, at(sabaoth, '## Scene', 3))).toMatchInlineSnapshot(`
      [
        "insert: Riquadro (> [!riquadro])",
        "insert: New scene (### S6.)",
      ]
    `);
  });

  it('offers a sheet of each kind of the project\'s system under «Schede»', () => {
    const outgunned = '---\ntitolo: Prova\nsistema: Outgunned\n---\n\n## Schede\n\n/\n';
    expect(menu(outgunned, at(outgunned, '/'))).toEqual([
      'sheets: Sheet: Scagnozzi (Grinta)',
      'sheets: Sheet: Cattivo (Grinta)',
      'sheets: Sheet: Boss (Grinta)',
      'insert: Riquadro (> [!riquadro])',
    ]);
    // Kulthos, in a sheet as on the section's line.
    expect(menu(sabaoth, at(sabaoth, '### Tenente Donato', 22)).filter((e) => e.startsWith('sheets:'))).toEqual([
      'sheets: Sheet: Minaccia (Grado)',
    ]);
    expect(menu(sabaoth, at(sabaoth, '## Schede', 3))[0]).toBe('sheets: Sheet: Minaccia (Grado)');
    // The keys the insert writes; the type key when there are none.
    const blades = '---\ntitolo: Prova\nsistema: Blades in the Dark\n---\n\n## Schede\n\n/\n';
    expect(menu(blades, at(blades, '/')).slice(0, 2)).toEqual(['sheets: Sheet: Fazione (Livello)', 'sheets: Sheet: PNG (Tipo)']);
  });

  it('offers the kinds on a / typed after the analysis, on a blank line under «Schede»', () => {
    // The analysis does not hold the / yet: the line is in no item until the
    // next parse, which puts it in the item before it.
    const typed = (doc: string) => {
      const { state } = analysed(doc, doc.length);
      const next = state.update({ changes: { from: doc.length, insert: '/' } }).state;
      return slashEntries(next, doc.length, template).map((e) => e.label);
    };
    const front = '---\ntitolo: Prova\nsistema: Outgunned\n---\n\n## Scene\n\n### S1. Uno\n\n## Schede\n\n';
    expect(typed(front).slice(0, 3)).toEqual(['Sheet: Scagnozzi', 'Sheet: Cattivo', 'Sheet: Boss']);
    expect(typed(`${front}### Lefty\n\n- **Tipo:** Cattivo\n\n`).slice(0, 3)).toEqual([
      'Sheet: Scagnozzi',
      'Sheet: Cattivo',
      'Sheet: Boss',
    ]);
  });

  it('offers no sheet kinds without a known system, nor among the pregenerated', () => {
    const none = '---\ntitolo: Prova\n---\n\n## Schede\n\n/\n';
    expect(menu(none, at(none, '/')).some((e) => e.startsWith('sheets:'))).toBe(false);
    const other = '---\ntitolo: Prova\nsistema: Altro\n---\n\n## Schede\n\n/\n';
    expect(menu(other, at(other, '/')).some((e) => e.startsWith('sheets:'))).toBe(false);
    const doc = withBlock(characters);
    expect(menu(doc, at(doc, 'Tre personaggi')).some((e) => e.startsWith('sheets:'))).toBe(false);
  });

  it('offers nothing in the front matter', () => {
    expect(menu(sabaoth, 5)).toEqual([]);
  });

  it('offers headings only in a campaign', () => {
    const state = campaign('## Uno\n\n/\n');
    expect(slashEntries(state, 8, template).map((e) => e.detail)).toEqual(['##', '###']);
    const fm = campaign('---\ntitolo: Uno\n/\n---\n\n/\n');
    expect(slashEntries(fm, 16, template)).toEqual([]);
    expect(slashEntries(fm, 22, template)).toHaveLength(2);
  });
});

describe('the sheet names', () => {
  it('complete after the references marker, up to a comma or a bracket', () => {
    const state = EditorState.create({ doc: 'Vedi → Schede: Tenente Do\n→ Schede: Sabaoth, «Cosa' });
    expect(sheetQuery(state, state.doc.line(1).to, '→ Schede:')).toEqual({ from: 15, query: 'Tenente Do' });
    expect(sheetQuery(state, state.doc.line(2).to, '→ Schede:')).toBeNull();
    expect(sheetQuery(state, 3, '→ Schede:')).toBeNull();
  });

  it('come from the document', () => {
    expect(sheetNames(analysed(sabaoth).state)).toEqual([
      'Sabaoth',
      'Dottor Umberto Salvi',
      'Tenente Donato',
      'Pattuglia di Quieti',
      'Il Circolo dello Stretto',
    ]);
  });
});
