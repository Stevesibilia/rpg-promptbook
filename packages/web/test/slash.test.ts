import { EditorState } from '@codemirror/state';
import { templates } from 'promptbook-format';
import { describe, expect, it } from 'vitest';
import sabaoth from '../../format/fixtures/l-ancora-di-sabaoth.converted.md?raw';
import { sheetNames, sheetQuery, slashEntries, slashLine } from '../src/editor/cm/slash.js';
import { analysed, campaign } from './analysed.js';

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

  it('adds New scene in the scenes section, with the next number', () => {
    expect(menu(sabaoth, at(sabaoth, '## Scene', 3))).toMatchInlineSnapshot(`
      [
        "insert: Riquadro (> [!riquadro])",
        "insert: New scene (### S6.)",
      ]
    `);
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
