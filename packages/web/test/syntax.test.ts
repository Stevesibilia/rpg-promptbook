import { builtinSystems, templates } from 'promptbook-format';
import { describe, expect, it } from 'vitest';
import { syntaxOf } from '../src/editor/syntax.js';

const template = templates.avventura;
const groups = syntaxOf(template);
const group = (title: string) => groups.find((g) => g.title.startsWith(title))!;

describe('the syntax sheet', () => {
  it('lists every front matter key with its requirement', () => {
    expect(group('Front matter').rows.map((r) => [r.name, r.requirement])).toEqual(
      template.meta.map((m) => [m.key, m.requirement]),
    );
  });

  it('lists every section in order with its requirement', () => {
    expect(group('Sections').rows.map((r) => [r.name, r.requirement])).toEqual(
      template.sections.map((s) => [s.name, s.requirement]),
    );
    expect(group('Sections').rows.at(-1)!.syntax).toBe('## Appendice: immagini e musica');
  });

  it('lists every scene field in order, by its form', () => {
    const rows = group('Scene fields').rows;
    expect(rows.map((r) => [r.name, r.requirement])).toEqual(template.sceneFields.map((f) => [f.label, f.requirement]));
    expect(rows[0]!.syntax).toBe('**Luogo e momento:** …');
    expect(rows[2]!.syntax).toBe('**Da non perdere qui**, then a list or a table');
  });

  it('lists every callout with its syntax, label, places and limit', () => {
    expect(group('Callouts').rows.map((r) => `${r.syntax} | ${r.name} | ${r.note}`)).toEqual([
      '> [!leggi] | Da leggere | no title · in scenes, Inizio forte · at least 1 per place',
      '> [!documento] Title | Documento da consegnare | title expected · in scenes, Inizio forte · any number per place',
      '> [!riquadro] Title | Riquadro | title optional · in scenes, any section · any number per place',
      "> [!riquadro|laterale] Title | Riquadro laterale | title optional · in scenes, A colpo d'occhio, Regole della notte · any number per place · side column",
    ]);
  });

  it('lists the reference marker, the reactions table, the sheet keys and the ids', () => {
    expect(group('References').rows.map((r) => r.syntax)).toEqual(['→ Schede: Name', '| Se i PG… | Allora… |']);
    expect(group('Sheet keys').rows.map((r) => r.name)).toEqual(['Tipo']);
    expect(group('Ids').rows.map((r) => r.syntax)).toEqual([
      '### S1. Title',
      '- **R1.** … (I1, I2)',
      '- **I1.** … (R1)',
    ]);
  });

  it('lists the kinds of the project\'s system with their fields', () => {
    const kulthos = syntaxOf(template, builtinSystems.find((s) => s.name === 'Kulthos'));
    const tipo = kulthos.find((g) => g.title.startsWith('Sheet keys'))!.rows[0]!;
    expect(tipo.note).toBe("the sheet's kind in Kulthos: Minaccia");
    const minaccia = kulthos.find((g) => g.title === 'Sheet kind «Minaccia» (Kulthos)')!;
    expect(minaccia.rows.map((r) => `${r.syntax} | ${r.requirement} | ${r.note}`)).toEqual([
      '- **Grado:** … | required | choice from «Gradi» · in the subtitle',
      '- **Natura:** … | optional | text · full sheet only',
      '- **Branco:** … | optional | yes or no, «branco» when yes · in the subtitle',
      '- **Ferite:** … | optional | boxes from «Gradi», column Ferite, in groups of 3',
      '- **Afflizioni:** … | optional | boxes from «Gradi», column Afflizioni',
      '- **Volontà:** … | optional | text · full sheet only',
      '- **Condotta:** … | optional | text · full sheet only',
      '- **Talenti:** … | optional | items «Name (text)», separated by «·» or as sub-bullets',
    ]);
    // A group per kind, in the system's order.
    const outgunned = syntaxOf(template, builtinSystems.find((s) => s.name === 'Outgunned'));
    expect(outgunned.filter((g) => g.title.startsWith('Sheet kind')).map((g) => g.title)).toEqual([
      'Sheet kind «Scagnozzi» (Outgunned)',
      'Sheet kind «Cattivo» (Outgunned)',
      'Sheet kind «Boss» (Outgunned)',
    ]);
    const prove = syntaxOf(template, builtinSystems.find((s) => s.name === 'Not the End'))
      .find((g) => g.title.startsWith('Sheet kind «Sfida»'))!
      .rows.find((r) => r.name === 'Prove')!;
    expect(prove.note).toBe('a row per sub-bullet, «Azione: Difficoltà from «Difficoltà» · Pericolo from «Pericolo»»');
  });

  it('lists only the type key without a system', () => {
    expect(groups.some((g) => g.title.startsWith('Sheet kind'))).toBe(false);
    expect(group('Sheet keys').rows[0]!.note).toBe("the sheet's kind, from the game system the front matter names");
  });
});
