import { describe, expect, it } from 'vitest';
import { parse } from './helpers.js';
import { applyEdits, base, change, codes, expectCase, type Case } from './checks.helpers.js';

const castRef = '- **Il guardiano**, vuole silenzio. → Schede: Guardiano';
const leggi = '> [!leggi]\n> Una porta socchiusa.\n\n';

const cases: Case[] = [
  {
    name: 'a scene has no read-aloud',
    code: 'callout.count',
    doc: change(leggi, ''),
    severity: 'error',
    at: '### S1. La porta',
    sceneId: 'S1',
  },
  {
    name: 'a scene has two read-alouds',
    code: 'callout.count',
    doc: change(leggi, leggi + '> [!leggi]\n> Un altro buio.\n\n'),
    severity: 'error',
    at: '> [!leggi]\n> Un altro buio.',
    sceneId: 'S1',
  },
  {
    name: 'the strong start has no read-aloud',
    code: 'callout.count',
    doc: change('> [!leggi]\n> Il buio si muove.\n\n', ''),
    severity: 'error',
    at: '## Inizio forte',
  },
  {
    name: 'a handout has no title',
    code: 'callout.title.missing',
    doc: change('> [!documento] La lettera', '> [!documento]'),
    severity: 'warning',
    at: '> [!documento]',
    sceneId: 'S1',
  },
  {
    name: 'a callout of a type the template does not have',
    code: 'callout.type.unknown',
    doc: change('> [!documento] La lettera', '> [!nota] La lettera'),
    severity: 'error',
    at: '> [!nota] La lettera',
    sceneId: 'S1',
  },
  {
    name: 'a plain quote in a scene',
    code: 'callout.quote.plain',
    doc: change('**Se deragliano:**', '> Una frase.\n\n**Se deragliano:**'),
    severity: 'warning',
    at: '> Una frase.',
    sceneId: 'S1',
  },
  {
    name: 'a side box in «Orologio» (the spec example)',
    code: 'callout.place',
    doc: change('## Verità del mondo', '> [!riquadro|laterale] Nota\n> A lato.\n\n## Verità del mondo'),
    severity: 'warning',
    at: '> [!riquadro|laterale] Nota',
  },
  {
    name: 'a read-aloud in a sheet',
    code: 'callout.place',
    doc: change('- **Volontà:** che nessuno entri.\n', '- **Volontà:** che nessuno entri.\n\n> [!leggi]\n> Ringhia.\n'),
    severity: 'warning',
    at: '> [!leggi]\n> Ringhia.',
  },
  {
    name: 'a reference to a sheet that does not exist',
    code: 'ref.unresolved',
    doc: change(castRef, '- **Il guardiano**, vuole silenzio. → Schede: Fantasma'),
    severity: 'error',
    at: '→ Schede: Fantasma',
    sceneId: 'S1',
  },
  {
    name: 'a name that two sheets share',
    code: 'ref.ambiguous',
    doc: change('### Pregenerati', '### Guardiano, il vecchio\n\n- **Volontà:** nessuna.\n\n### Pregenerati'),
    severity: 'error',
    at: '→ Schede: Guardiano',
    sceneId: 'S1',
    count: 2,
  },
  {
    name: 'a graded sheet cited outside the cast',
    code: 'ref.threat.outside',
    doc: change(castRef, '- **Il guardiano**, vuole silenzio.'),
    severity: 'warning',
    at: '→ Schede: Guardiano',
    sceneId: 'S1',
  },
];

describe('callout and reference checks', () => {
  it.each(cases)('$code: $name', (c) => {
    expectCase(c);
  });

  it('resolves a reference by its short name, and by its full title', () => {
    const short = parse(base).model.scenes[0]!.references;
    expect(short.map((r) => r.sheet)).toEqual(['guardiano', 'guardiano']);
    const full = parse(change(castRef, `${castRef}, il custode della porta`));
    expect(full.model.scenes[0]!.references.at(-1)!.sheet).toBe('guardiano');
    expect(codes(full.problems)).toEqual([]);
  });

  it('prefers the full title when two sheets share the name', () => {
    const doc = change('### Pregenerati', '### Guardiano, il vecchio\n\n- **Volontà:** nessuna.\n\n### Pregenerati').replace(
      castRef,
      `${castRef}, il vecchio`,
    );
    const { model, problems } = parse(doc);
    expect(model.scenes[0]!.references.at(-1)!.sheet).toBe('guardiano');
    // Only the bare "Guardiano" in the other field stays ambiguous.
    expect(problems.filter((p) => p.code === 'ref.ambiguous')).toHaveLength(1);
  });

  it('leaves the id off an unresolved reference', () => {
    const ref = parse(change(castRef, '- **Il guardiano**. → Schede: Fantasma')).model.scenes[0]!.references.at(-1)!;
    expect(ref.sheet).toBeUndefined();
  });

  it('does not warn about a graded sheet that is also in the cast', () => {
    expect(codes(parse(base).problems)).not.toContain('ref.threat.outside');
  });

  it('warns once per scene and sheet', () => {
    const doc = change(castRef, '- **Il guardiano**.').replace(
      '**Se deragliano:** la porta si apre da sola.',
      '**Se deragliano:** la porta si apre da sola (→ Schede: Guardiano).',
    );
    expect(parse(doc).problems.filter((p) => p.code === 'ref.threat.outside')).toHaveLength(1);
  });

  it('names the places a callout belongs in, and accepts it where the template allows it', () => {
    const doc = change('## Verità del mondo', '> [!riquadro|laterale] Nota\n> A lato.\n\n## Verità del mondo');
    expect(parse(doc).problems.find((p) => p.code === 'callout.place')!.message).toBe(
      'A "Riquadro laterale" box [!riquadro|laterale] is not expected here; it belongs in scenes, "A colpo d\'occhio".',
    );
    expect(codes(parse(base).problems)).not.toContain('callout.place');
    const box = change('## Verità del mondo', '> [!riquadro] Nota\n> Ovunque.\n\n## Verità del mondo');
    expect(codes(parse(box).problems)).not.toContain('callout.place');
  });

  it('turns a plain quote into a read-aloud or a handout with a fix', () => {
    const doc = change('**Se deragliano:**', '> Una frase.\n\n**Se deragliano:**');
    const { fixes } = parse(doc).problems.find((p) => p.code === 'callout.quote.plain')!;
    expect(fixes).toHaveLength(2);
    expect(applyEdits(doc, fixes![0]!.edits)).toContain('> [!leggi]\n> Una frase.');
    expect(applyEdits(doc, fixes![1]!.edits)).toContain('> [!documento]\n> Una frase.');
  });
});
