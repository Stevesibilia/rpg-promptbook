import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAdventure, parseCampaign, templates, type ParseResult, type Problem } from '../src/index.js';
import { applyEdits, base, change, position } from './checks.helpers.js';
import { parse, sample } from './helpers.js';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

const columnProblems = (problems: Problem[]) => problems.filter((p) => p.code.startsWith('column.'));
const codes = (problems: Problem[]) => problems.map((p) => p.code);
const slice = (text: string, range: { start: { offset: number }; end: { offset: number } }) =>
  text.slice(range.start.offset, range.end.offset);

function section(result: ParseResult, name: string) {
  return result.model.sections.find((s) => s.name === name)!;
}

function field(result: ParseResult, label: string, scene = 0) {
  return result.model.scenes[scene]!.fields.find((f) => f.label === label)!;
}

describe('a mark on a ## heading', () => {
  it.each([
    ['## Orologio {laterale}', 'laterale', 'side', '{laterale}'],
    ['## Orologio{laterale}', 'laterale', 'side', '{laterale}'],
    ['## Orologio { Laterale }', 'Laterale', 'side', '{ Laterale }'],
    ['## Orologio {principale}', 'principale', 'main', '{principale}'],
    ['## Orologio {latterale}', 'latterale', null, '{latterale}'],
  ])('%s', (heading, word, column, braces) => {
    const doc = change('## Orologio\n', `${heading}\n`);
    const result = parse(doc);
    const clock = section(result, 'Orologio');
    expect(clock.role).toBe('clock');
    expect(clock.heading).toBe('Orologio');
    expect(clock.id).toBe('Orologio');
    expect(clock.mark).toMatchObject({ word, column });
    expect(slice(doc, clock.mark!.range)).toBe(braces);
    expect(clock.headingRange.start).toEqual(position(doc, heading));
    expect(slice(doc, clock.headingRange)).toBe(heading);
  });

  it('is read before a closing # run', () => {
    const doc = change('## Orologio\n', '## Orologio {laterale} ##\n');
    const clock = section(parse(doc), 'Orologio');
    expect(clock.heading).toBe('Orologio');
    expect(clock.mark?.column).toBe('side');
    expect(slice(doc, clock.mark!.range)).toBe('{laterale}');
  });

  it('leaves a heading with no braces as it was', () => {
    const appendix = section(parse(base), 'Appendice');
    expect(appendix.heading).toBe('Appendice: immagini e musica');
    expect(appendix.mark).toBeNull();
    expect(section(parse(base), 'Orologio').mark).toBeNull();
  });

  it('is off the id of an unknown section too', () => {
    const doc = change('## Indizi\n', '## Note {laterale}\n\nUna nota.\n\n## Indizi\n');
    const note = parse(doc).model.sections.find((s) => s.heading === 'Note')!;
    expect(note.id).toBe('Note');
    expect(note.known).toBe(false);
    expect(note.mark?.word).toBe('laterale');
  });

  it('is not read when the braces hold more than one word, no letters, or are escaped', () => {
    for (const heading of ['## Orologio {due parole}', '## Orologio {12}', '## Orologio \\{laterale}', '## Orologio {}']) {
      const clock = parse(change('## Orologio\n', `${heading}\n`)).model.sections.find((s) => s.heading.startsWith('Orologio'))!;
      expect(clock.mark, heading).toBeNull();
      expect(clock.heading, heading).not.toBe('Orologio');
    }
  });

  it('is not read when it is all the heading holds', () => {
    const doc = change('## Indizi\n', '## {laterale}\n\n## Indizi\n');
    const bare = parse(doc).model.sections.find((s) => s.heading === '{laterale}')!;
    expect(bare.mark).toBeNull();
  });
});

describe('a mark on a block field', () => {
  it('keeps the field a block field with its list, and no content.unplaced', () => {
    const doc = change('**Da non perdere qui**\n', '**Da non perdere qui** {principale}\n');
    const result = parse(doc);
    const must = field(result, 'Da non perdere qui');
    expect(must).toMatchObject({ form: 'block', text: '', known: true, mark: { word: 'principale', column: 'main' } });
    expect(must.blocks.map((b) => b.kind)).toEqual(['list']);
    expect(slice(doc, must.labelRange)).toBe('**Da non perdere qui**');
    expect(slice(doc, must.mark!.range)).toBe('{principale}');
    expect(codes(result.problems)).not.toContain('content.unplaced');
    expect(codes(result.problems)).toEqual(codes(parse(base).problems));
  });

  it('takes the mark with no space before it', () => {
    const doc = change('**Chi c\'è**\n', "**Chi c'è**{laterale}\n");
    expect(field(parse(doc), "Chi c'è")).toMatchObject({ form: 'block', mark: { column: 'side' } });
  });

  it('keeps a table after a marked label', () => {
    const doc = change('**Cosa succede da sé**\n\n- La porta cigola.\n', '**Cosa succede da sé** {laterale}\n\n| Quando | Cosa |\n| --- | --- |\n| ora | cigola |\n');
    const happens = field(parse(doc), 'Cosa succede da sé');
    expect(happens.form).toBe('block');
    expect(happens.blocks.map((b) => b.kind)).toEqual(['table']);
    expect(happens.mark?.column).toBe('side');
  });

  it('is not read in an inline field', () => {
    const inline = field(parse(change('**In gioco:** chi entra.', '**In gioco:** {laterale}')), 'In gioco');
    expect(inline).toMatchObject({ form: 'inline', text: '{laterale}', mark: null });
    const after = field(parse(change('**Da non perdere qui**\n', '**Da non perdere qui** {laterale} poi testo\n')), 'Da non perdere qui');
    expect(after).toMatchObject({ form: 'inline', text: '{laterale} poi testo', mark: null });
  });

  it('is not read in a list item', () => {
    const doc = change('- **I1.** Un\'impronta sulla soglia. (R1)', '- **I1.** {laterale}');
    const clues = field(parse(doc), 'Indizi qui');
    expect(clues.mark).toBeNull();
    const list = clues.blocks[0];
    expect(list?.kind === 'list' && list.items[0]?.value).toBe('{laterale}');
  });

  it('is not read on a ### scene heading', () => {
    const doc = change('### S1. La porta\n', '### S1. La porta {laterale}\n');
    const scene = parse(doc).model.scenes[0]!;
    expect(scene.title).toBe('La porta {laterale}');
    expect(scene.heading).toBe('S1. La porta {laterale}');
  });
});

describe('the revelations label', () => {
  it('takes a mark and still gives the revelations', () => {
    const doc = change('**Rivelazioni**\n', '**Rivelazioni** {principale}\n');
    const { model } = parse(doc);
    expect(model.revelations.map((r) => r.id)).toEqual(['R1']);
    expect(model.revelationsLabel?.mark).toMatchObject({ word: 'principale', column: 'main' });
    expect(slice(doc, model.revelationsLabel!.labelRange)).toBe('**Rivelazioni**');
    expect(slice(doc, model.revelationsLabel!.mark!.range)).toBe('{principale}');
  });

  it('is found without a mark', () => {
    const doc = base;
    const { model } = parse(doc);
    expect(model.revelationsLabel?.mark).toBeNull();
    expect(slice(doc, model.revelationsLabel!.labelRange)).toBe('**Rivelazioni**');
  });

  it('alone, with no list under it, gives the label and no revelations', () => {
    const doc = change('**Rivelazioni**\n\n- **R1.** La verità. (I1, I2, I3)\n', '**Rivelazioni** {laterale}\n');
    const result = parse(doc);
    expect(result.model.revelations).toEqual([]);
    expect(result.model.revelationsLabel?.mark?.column).toBe('side');
    expect(columnProblems(result.problems)).toEqual([]);
  });

  it('with a colon and no list gives no label', () => {
    const doc = change('**Rivelazioni**\n\n- **R1.** La verità. (I1, I2, I3)\n', '**Rivelazioni:**\n');
    expect(parse(doc).model.revelationsLabel).toBeNull();
  });

  it('with a list wins over a lone label before it', () => {
    const doc = change('**Rivelazioni**\n', '**Rivelazioni** {laterale}\n\nTesto.\n\n**Rivelazioni** {principale}\n');
    const { model } = parse(doc);
    expect(model.revelationsLabel?.mark?.word).toBe('principale');
    expect(model.revelations.map((r) => r.id)).toEqual(['R1']);
  });

  it('keeps braces in a revelation as text', () => {
    const doc = change('- **R1.** La verità. (I1, I2, I3)', '- **R1.** {x}');
    const { model } = parse(doc);
    expect(model.revelations[0]?.text).toBe('{x}');
    expect(model.revelationsLabel?.mark).toBeNull();
  });

  it('followed by other text and no list gives no label', () => {
    const doc = change('**Rivelazioni**\n\n- **R1.** La verità. (I1, I2, I3)\n', '**Rivelazioni** poi testo\n');
    expect(parse(doc).model.revelationsLabel).toBeNull();
  });
});

describe('column warnings', () => {
  it('report an unknown word on a part that takes a column, with two fixes', () => {
    const doc = change('## Verità del mondo\n', '## Verità del mondo {latterale}\n');
    const [found, ...more] = columnProblems(parse(doc).problems);
    expect(more).toEqual([]);
    expect(found).toMatchObject({
      code: 'column.unknown',
      severity: 'warning',
      message: 'Unknown column «latterale»: write principale or laterale. Until then this part prints where the template says.',
    });
    expect(found!.range.start).toEqual(position(doc, '{latterale}'));
    expect(slice(doc, found!.range)).toBe('{latterale}');
    expect(found!.fixes?.map((f) => f.title)).toEqual(['Write {principale}', 'Write {laterale}']);
    expect(applyEdits(doc, found!.fixes![0]!.edits)).toBe(change('## Verità del mondo\n', '## Verità del mondo {principale}\n'));
    expect(applyEdits(doc, found!.fixes![1]!.edits)).toBe(change('## Verità del mondo\n', '## Verità del mondo {laterale}\n'));
  });

  it('report an unknown word on a field and on the revelations label, with the scene', () => {
    const doc = change('**Rivelazioni**\n', '**Rivelazioni** {sinistra}\n', change('**Indizi qui**\n', '**Indizi qui** {destra}\n'));
    const found = columnProblems(parse(doc).problems);
    expect(found.map((p) => [p.code, slice(doc, p.range), p.sceneId])).toEqual([
      ['column.unknown', '{sinistra}', undefined],
      ['column.unknown', '{destra}', 'S1'],
    ]);
  });

  it('report a mark on a section that takes no column, which stays itself', () => {
    const doc = change('## Indizi\n', '## Indizi {laterale}\n');
    const result = parse(doc);
    const [found, ...more] = columnProblems(result.problems);
    expect(more).toEqual([]);
    expect(found).toMatchObject({
      code: 'column.ignored',
      severity: 'warning',
      message: '"Indizi" takes no column: the mark {laterale} does nothing here.',
    });
    expect(found!.range.start).toEqual(position(doc, '{laterale}'));
    expect(found!.fixes?.map((f) => f.title)).toEqual(['Remove the mark']);
    expect(applyEdits(doc, found!.fixes![0]!.edits)).toBe(base);
    expect(section(result, 'Indizi').role).toBe('clues');
    expect(section(result, 'Indizi').heading).toBe('Indizi');
  });

  it('report any word on an own section and on a field that takes no column', () => {
    const own = change('## Indizi\n', '## Note {latterale}\n\nUna nota.\n\n## Indizi\n');
    expect(columnProblems(parse(own).problems).map((p) => [p.code, p.message])).toEqual([
      ['column.ignored', '"Note" takes no column: the mark {latterale} does nothing here.'],
    ]);
    const situation = change('**Se deragliano:**', "**Regole della situazione** {principale}\n\n- Una regola.\n\n**Se deragliano:**");
    const [found] = columnProblems(parse(situation).problems);
    expect(found).toMatchObject({ code: 'column.ignored', sceneId: 'S1' });
    expect(found!.message).toBe('"Regole della situazione" takes no column: the mark {principale} does nothing here.');
    expect(applyEdits(situation, found!.fixes![0]!.edits)).toBe(
      change('**Se deragliano:**', '**Regole della situazione**\n\n- Una regola.\n\n**Se deragliano:**'),
    );
    const unknownField = change('**Se deragliano:**', '**Odori** {laterale}\n\n- Muffa.\n\n**Se deragliano:**');
    expect(codes(columnProblems(parse(unknownField).problems))).toEqual(['column.ignored']);
  });

  it('report a known word at the end of a scene heading, without a fix', () => {
    const doc = change('### S1. La porta\n', '### S1. La porta {laterale}\n');
    const [found, ...more] = columnProblems(parse(doc).problems);
    expect(more).toEqual([]);
    expect(found).toMatchObject({
      code: 'column.ignored',
      message: 'A scene heading takes no column: {laterale} is printed as part of the title.',
      sceneId: 'S1',
    });
    expect(found!.range.start).toEqual(position(doc, '### S1. La porta {laterale}'));
    expect(found!.fixes).toBeUndefined();
    const other = change('### S1. La porta\n', '### S1. La porta {aperta}\n');
    expect(columnProblems(parse(other).problems)).toEqual([]);
  });

  it('report nothing for the two known words on parts that take a column', () => {
    let doc = change('## Orologio\n', '## Orologio {laterale}\n');
    doc = change("**Chi c'è**\n", "**Chi c'è** {principale}\n", doc);
    doc = change('**Rivelazioni**\n', '**Rivelazioni** {principale}\n', doc);
    doc = change('## Da non perdere stasera\n', '## Da non perdere stasera {PRINCIPALE}\n', doc);
    expect(columnProblems(parse(doc).problems)).toEqual([]);
    expect(parse(doc).problems.map((p) => p.code)).toEqual(parse(base).problems.map((p) => p.code));
  });
});

describe('documents without marks', () => {
  it.each(['l-ancora-di-sabaoth.md', 'l-ancora-di-sabaoth.converted.md', 'esempio.md'])('%s has no mark', (name) => {
    const text = fixture(name);
    const result = parseAdventure(text, { template: templates.avventura });
    expect(result.model.sections.every((s) => s.mark === null)).toBe(true);
    expect(result.model.scenes.flatMap((s) => s.fields).every((f) => f.mark === null)).toBe(true);
    expect(result.model.revelationsLabel?.mark ?? null).toBeNull();
    expect(columnProblems(result.problems)).toEqual([]);
  });

  // The problems as main reported them before column marks.
  it.each([
    [
      'l-ancora-di-sabaoth.md',
      'meta.required content.unplaced section.missing content.unplaced content.unplaced content.unplaced limit.preamble.words callout.count callout.count callout.quote.plain callout.count callout.quote.plain callout.count callout.quote.plain callout.count callout.quote.plain callout.count callout.quote.plain scene.field.unknown',
    ],
    ['l-ancora-di-sabaoth.converted.md', 'section.missing limit.preamble.words ref.threat.outside scene.field.unknown sheet.nested-threat'],
  ])('%s keeps its problems', (name, expected) => {
    const result = parseAdventure(fixture(name), { template: templates.avventura });
    expect(codes(result.problems)).toEqual(expected.split(' '));
  });

  it('the sample has no mark and its revelations label', () => {
    const result = parse(sample);
    expect(result.model.revelationsLabel).not.toBeNull();
    expect(columnProblems(result.problems)).toEqual([]);
  });

  it('a campaign keeps its braces as text', () => {
    const text = fixture('campagna-di-prova.md');
    const marked = text.replace(/^## (.+)$/m, '## $1 {laterale}');
    expect(marked).not.toBe(text);
    const result = parseCampaign(marked, { template: templates.campagnaV2 });
    expect(JSON.stringify(result)).toContain('{laterale}');
    expect(JSON.stringify(result)).not.toContain('"mark"');
  });
});
