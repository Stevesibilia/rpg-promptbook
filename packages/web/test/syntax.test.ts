import { templates } from 'promptbook-format';
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
      '> [!leggi] | Da leggere | no title · in scenes, Inizio forte · exactly 1 per place',
      '> [!documento] Title | Documento da consegnare | title expected · in scenes, Inizio forte · any number per place',
      '> [!riquadro] Title | Riquadro | title optional · in scenes, any section · any number per place',
      "> [!riquadro|laterale] Title | Riquadro laterale | title optional · in scenes, A colpo d'occhio · any number per place · side column",
    ]);
  });

  it('lists the reference marker, the reactions table, the sheet keys and the ids', () => {
    expect(group('References').rows.map((r) => r.syntax)).toEqual(['→ Schede: Name', '| Se i PG… | Allora… |']);
    expect(group('Sheet keys').rows.map((r) => r.name)).toEqual(template.sheets.keys.map((k) => k.key));
    expect(group('Ids').rows.map((r) => r.syntax)).toEqual([
      '### S1. Title',
      '- **R1.** … (I1, I2)',
      '- **I1.** … (R1)',
    ]);
  });
});
