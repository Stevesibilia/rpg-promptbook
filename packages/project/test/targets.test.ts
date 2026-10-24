import { templates } from 'promptbook-format';
import { describe, expect, it } from 'vitest';
import { findTarget, skeletonDocument, targetsOf, type Target } from '../src/index.js';
import { fixture } from './helpers.js';

const sabaoth = fixture('l-ancora-di-sabaoth.converted.md');
const textOf = (text: string, t: Target) => text.slice(t.from, t.to);
const found = (text: string, name: string, category: 'one-shot' | 'campaign' = 'one-shot') => {
  const result = findTarget(text, category === 'campaign' ? templates.campagna : templates.avventura, name);
  if (!result.ok) throw new Error(`${name}: ${result.error}`);
  return result.target;
};

describe('targetsOf an adventure', () => {
  const targets = targetsOf(sabaoth, templates.avventura);

  it('lists every section, scene and sheet in text order, never the front matter', () => {
    expect(targets.map((t) => `${t.kind}:${t.target}:${t.level}`)).toEqual([
      "section:A colpo d'occhio:2",
      'section:Da non perdere stasera:2',
      'section:Orologio:2',
      'section:Verità del mondo:2',
      'section:Inizio forte:2',
      'section:Mappa delle scene:2',
      'section:Scene:2',
      'scene:S1:3',
      'scene:S2:3',
      'scene:S3:3',
      'scene:S4:3',
      'scene:S5:3',
      'section:Indizi:2',
      'section:PNG:2',
      'section:Schede:2',
      'sheet:Sabaoth:3',
      'sheet:Dottor Umberto Salvi:3',
      'sheet:Tenente Donato:3',
      'sheet:Pattuglia di Quieti:3',
      'sheet:Il Circolo dello Stretto:3',
      'section:Prima della sessione:2',
      'section:Appendice:2',
    ]);
    expect(targets.every((t) => t.from > sabaoth.indexOf('\n---\n'))).toBe(true);
  });

  it('spans a scene from its heading line to the next scene, without the blank lines', () => {
    const s3 = targets.find((t) => t.target === 'S3')!;
    expect(s3.title).toBe('Il cordone di Donato');
    const text = textOf(sabaoth, s3);
    expect(text.startsWith('### S3. Il cordone di Donato\n')).toBe(true);
    expect(text.endsWith('\n')).toBe(false);
    expect(sabaoth.slice(s3.to, s3.to + 9)).toBe('\n\n### S4.');
  });

  it('spans the last scene to the end of its section, and a section over its scenes', () => {
    const s5 = targets.find((t) => t.target === 'S5')!;
    const scene = targets.find((t) => t.target === 'Scene')!;
    expect(s5.to).toBe(scene.to);
    expect(sabaoth.slice(scene.to, scene.to + 11)).toBe('\n\n## Indizi');
    expect(textOf(sabaoth, scene).startsWith('## Scene\n\n### S1.')).toBe(true);
  });

  it('spans a sheet to its end, and names a section by the template', () => {
    const donato = targets.find((t) => t.target === 'Tenente Donato')!;
    expect(donato.title).toBe('Tenente Donato, il Primo dei Quieti');
    expect(textOf(sabaoth, donato).startsWith('### Tenente Donato, il Primo dei Quieti\n')).toBe(true);
    expect(sabaoth.slice(donato.to, donato.to + 6)).toBe('\n\n### ');
    const appendix = targets.find((t) => t.target === 'Appendice')!;
    expect(appendix.title).toBe('Appendice: immagini e musica');
    expect(appendix.to).toBe(sabaoth.trimEnd().length);
  });

  it('leaves the blank lines after a section out of its span', () => {
    const text = '## Orologio\n\nPrima scossa.\n\n\n  \n## Verità del mondo\n\nIl Sigillo.\n\n';
    const [clock, truths] = targetsOf(text, templates.avventura);
    expect(textOf(text, clock!)).toBe('## Orologio\n\nPrima scossa.');
    expect(textOf(text, truths!)).toBe('## Verità del mondo\n\nIl Sigillo.');
  });
});

describe('targetsOf a campaign', () => {
  it('lists the skeleton headings', () => {
    const text = skeletonDocument('campaign', {
      title: 'Cronaca del Gabbiano',
      system: 'Kulthos',
      campaignTitle: null,
      author: '',
      copyright: '',
      licence: '',
    });
    const targets = targetsOf(text, templates.campagna);
    expect(targets.map((t) => t.target)).toEqual(['Premessa', 'Fronti', 'PNG ricorrenti', 'Fili aperti', 'Sessioni']);
    expect(targets.every((t) => t.kind === 'heading' && t.level === 2)).toBe(true);
    expect(textOf(text, targets[0]!)).toBe('## Premessa');
  });

  it('runs a heading to the next of the same or a higher level, outside code and front matter', () => {
    const text = [
      '---',
      '## not a heading: yaml',
      '---',
      '# Cronaca',
      '',
      '## Fronti',
      '',
      '### Il Circolo',
      '',
      'Testo.',
      '',
      '```md',
      '## dentro il codice',
      '```',
      '',
      '### La Pattuglia ##',
      '',
      '## Sessioni',
      '',
      '# Fine',
      '',
    ].join('\n');
    const targets = targetsOf(text, templates.campagna);
    expect(targets.map((t) => `${t.target}:${t.level}`)).toEqual([
      'Fronti:2',
      'Il Circolo:3',
      'La Pattuglia:3',
      'Sessioni:2',
    ]);
    const [fronti, circolo, pattuglia, sessioni] = targets;
    expect(textOf(text, fronti!)).toBe(text.slice(text.indexOf('## Fronti'), text.indexOf('\n\n## Sessioni')));
    expect(textOf(text, circolo!)).toContain('## dentro il codice\n```');
    expect(textOf(text, pattuglia!)).toBe('### La Pattuglia ##');
    expect(textOf(text, sessioni!)).toBe('## Sessioni');
  });
});

describe('targetsOf, edge cases', () => {
  it('finds the end of a span over 50,000 blank lines fast', () => {
    const blanks = '\n  '.repeat(50_000);
    // Inside a span, then at its end.
    const campaign = `## Fronti\n${blanks}\nTesto.${blanks}\n## Sessioni\n`;
    const adventure = `## Orologio\n${blanks}\nPrima scossa.${blanks}\n## Scene\n`;
    const started = performance.now();
    const [fronti] = targetsOf(campaign, templates.campagna);
    const [clock] = targetsOf(adventure, templates.avventura);
    expect(performance.now() - started).toBeLessThan(3_000);
    expect(textOf(campaign, fronti!)).toBe(`## Fronti\n${blanks}\nTesto.`);
    expect(textOf(adventure, clock!)).toBe(`## Orologio\n${blanks}\nPrima scossa.`);
  });

  it('keeps the spaces at the end of the last line, and a CRLF document', () => {
    const text = '## Fronti\r\n\r\nTesto  \r\n\r\n## Sessioni\r\n';
    const [fronti, sessioni] = targetsOf(text, templates.campagna);
    expect(textOf(text, fronti!)).toBe('## Fronti\r\n\r\nTesto  ');
    expect(textOf(text, sessioni!)).toBe('## Sessioni');
  });

  it('reads a first line of --- as front matter only when it is closed', () => {
    const open = '---\n\n## Fronti\n\nTesto.\n';
    expect(targetsOf(open, templates.campagna).map((t) => t.target)).toEqual(['Fronti']);
    const closed = '---\ntitolo: x\n...\n## Fronti\n';
    expect(targetsOf(closed, templates.campagna).map((t) => t.target)).toEqual(['Fronti']);
  });

  it('ends a span at a setext heading, which is not a target', () => {
    const text = [
      '## Fronti',
      '',
      'Il Circolo.',
      '',
      'Le Sessioni',
      'del Gabbiano',
      '------------',
      '',
      'Prima sessione.',
      '',
      '- una voce',
      '---',
      '',
      '### Note',
      '',
      'Testo.',
      '===',
      '',
    ].join('\n');
    const targets = targetsOf(text, templates.campagna);
    expect(targets.map((t) => t.target)).toEqual(['Fronti', 'Note']);
    expect(textOf(text, targets[0]!)).toBe('## Fronti\n\nIl Circolo.');
    // A line of - under a list item is a break, not a heading; === under text
    // is a level 1 heading.
    expect(textOf(text, targets[1]!)).toBe('### Note');
  });
});

describe('findTarget', () => {
  it('finds a scene by id, case insensitive', () => {
    expect(found(sabaoth, 's3').target).toBe('S3');
    expect(found(sabaoth, ' S5 ').target).toBe('S5');
  });

  it('finds sections and sheets by name, accent and case insensitive', () => {
    expect(found(sabaoth, 'verita del mondo')).toMatchObject({ kind: 'section', target: 'Verità del mondo' });
    expect(found(sabaoth, 'TENENTE  DONATO')).toMatchObject({ kind: 'sheet', target: 'Tenente Donato' });
    expect(found(sabaoth, 'appendice')).toMatchObject({ kind: 'section', target: 'Appendice' });
  });

  it('answers the valid targets when nothing matches', () => {
    const result = findTarget(sabaoth, templates.avventura, 'Il cordone di Donato');
    expect(result).toMatchObject({ ok: false, error: 'unknown_target' });
    expect(result.ok ? [] : result.targets.map((t) => t.target)).toContain('S3');
  });

  it('answers both when a section and a sheet share a name', () => {
    const text = sabaoth.replace(
      '### Pregenerati',
      '### Orologio, quello del campanile\n\n- **Tipo:** Oggetto\n\n### Pregenerati',
    );
    const result = findTarget(text, templates.avventura, 'orologio');
    expect(result).toMatchObject({ ok: false, error: 'ambiguous_target' });
    expect(result.ok ? [] : result.targets.map((t) => t.kind)).toEqual(['section', 'sheet']);
  });

  it('finds a campaign heading', () => {
    const text = '## Fronti\n\n### Il Circolo\n\nTesto.\n';
    expect(found(text, 'il circolo', 'campaign')).toMatchObject({ kind: 'heading', level: 3, from: 11 });
  });
});
