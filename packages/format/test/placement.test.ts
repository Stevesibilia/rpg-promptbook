import { describe, expect, it } from 'vitest';
import {
  columnMark,
  columnOf,
  columnOfWord,
  DEFAULT_COLUMN,
  defineTemplate,
  NIGHT_PARTS,
  nightPartOf,
  SCENE_PARTS,
  scenePartOf,
  templateChanges,
  templateColumn,
  templates,
  TemplateError,
  withColumn,
  withPdf,
  type AdventureTemplate,
  type AdventureTemplateInput,
  type CampaignTemplateInput,
  type ColumnMark,
  type PlacedPart,
  type TemplateInput,
} from '../src/index.js';

function copy(): AdventureTemplateInput {
  return JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
}

function edit(change: (t: AdventureTemplateInput) => void): AdventureTemplate {
  const definition = copy();
  change(definition);
  return defineTemplate(definition);
}

function issues(definition: TemplateInput): string[] {
  try {
    defineTemplate(definition);
  } catch (error) {
    if (error instanceof TemplateError) return error.issues;
    throw error;
  }
  throw new Error('expected the definition to fail');
}

const at = (template: AdventureTemplate, name: string) => template.sections.findIndex((s) => s.name === name);
const fieldAt = (template: AdventureTemplate, label: string) => template.sceneFields.findIndex((f) => f.label === label);
const avventura = templates.avventura;

const mark = (word: string): ColumnMark => ({
  word,
  column: columnOfWord(word),
  range: { start: { offset: 0, line: 1, column: 1 }, end: { offset: 0, line: 1, column: 1 } },
});

describe('the column words', () => {
  it('name the two columns, trimmed and in any case', () => {
    expect(columnOfWord('laterale')).toBe('side');
    expect(columnOfWord(' Principale ')).toBe('main');
    expect(columnOfWord('LATERALE')).toBe('side');
    expect(columnOfWord('latterale')).toBeNull();
    expect(columnMark('side')).toBe('{laterale}');
    expect(columnMark('main')).toBe('{principale}');
  });

  it('give each part by its role', () => {
    expect(NIGHT_PARTS).toEqual(['revelations', 'reminders', 'clock', 'truths']);
    expect(SCENE_PARTS).toEqual(['mustHave', 'happens', 'cast', 'clues']);
    expect(nightPartOf('clock')).toBe('clock');
    expect(nightPartOf('overview')).toBeNull();
    expect(nightPartOf('clues')).toBeNull();
    expect(nightPartOf(null)).toBeNull();
    expect(nightPartOf(undefined)).toBeNull();
    expect(scenePartOf('cast')).toBe('cast');
    expect(scenePartOf('tests')).toBeNull();
    expect(scenePartOf(undefined)).toBeNull();
  });
});

describe('the built-in template', () => {
  it('validates unchanged and stores no column', () => {
    expect(defineTemplate(copy())).toEqual(avventura);
    expect(avventura.sections.some((s) => s.pdf?.column !== undefined)).toBe(false);
    expect(avventura.sceneFields.some((f) => f.column !== undefined)).toBe(false);
    expect('column' in avventura.overview).toBe(false);
  });

  it('reads the eight defaults, which are the places of today', () => {
    const columns = Object.fromEntries((Object.keys(DEFAULT_COLUMN) as PlacedPart[]).map((p) => [p, templateColumn(avventura, p)]));
    expect(columns).toEqual({
      reminders: 'side',
      revelations: 'side',
      clock: 'main',
      truths: 'main',
      mustHave: 'side',
      happens: 'main',
      cast: 'side',
      clues: 'main',
    });
  });
});

describe('column settings on a template', () => {
  it('are read where the template stores them', () => {
    const template = edit((t) => {
      t.sections[at(avventura, 'Orologio')]!.pdf = { column: 'side' };
      t.sceneFields[fieldAt(avventura, "Chi c'è")]!.column = 'main';
      t.overview.column = 'main';
    });
    expect(templateColumn(template, 'clock')).toBe('side');
    expect(templateColumn(template, 'cast')).toBe('main');
    expect(templateColumn(template, 'revelations')).toBe('main');
    expect(templateColumn(template, 'truths')).toBe('main');
  });

  it('refuse a column on a role section that is not a night part, with its path', () => {
    const definition = copy();
    definition.sections[at(avventura, 'Indizi')]!.pdf = { column: 'side' };
    expect(issues(definition)).toEqual([`sections[${at(avventura, 'Indizi')}].pdf.column: only the night page's parts take a column`]);
  });

  it('refuse a column on an own section, with its path', () => {
    const definition = copy();
    definition.sections.push({ name: 'Atmosfera', requirement: 'optional', pdf: { column: 'main' } });
    const index = definition.sections.length - 1;
    expect(issues(definition)).toEqual([`sections[${index}].pdf.column: only the night page's parts take a column`]);
  });

  it('refuse a column in a campaign template, with its path', () => {
    const definition = JSON.parse(JSON.stringify(templates.campagnaV2)) as CampaignTemplateInput;
    definition.sections[0]!.pdf = { column: 'side' };
    expect(issues(definition)).toEqual(['sections[0].pdf.column: campaigns have no columns']);
  });

  it('refuse a column on a field with another role or without one, with its path', () => {
    const other = copy();
    other.sceneFields[fieldAt(avventura, 'Prove e regole')]!.column = 'side';
    expect(issues(other)).toEqual([
      `sceneFields[${fieldAt(avventura, 'Prove e regole')}].column: only the fields the scene page lays out take a column`,
    ]);
    const own = copy();
    own.sceneFields.push({ label: 'Odori', form: 'block', requirement: 'optional', climax: false, column: 'main' });
    expect(issues(own)).toEqual([
      `sceneFields[${own.sceneFields.length - 1}].column: only the fields the scene page lays out take a column`,
    ]);
  });
});

describe('withColumn', () => {
  it('stores only what differs and removes the key when set back, for a section', () => {
    const moved = withColumn(avventura, 'clock', 'side');
    expect(moved.sections[at(avventura, 'Orologio')]!.pdf).toEqual({ column: 'side' });
    expect(templateColumn(moved, 'clock')).toBe('side');
    const back = withColumn(moved, 'clock', 'main');
    expect(back).toEqual(avventura);
    expect(JSON.stringify(back)).toBe(JSON.stringify(avventura));
    expect(withColumn(avventura, 'clock', 'main')).toEqual(avventura);
  });

  it('stores only what differs and removes the key when set back, for a field', () => {
    const moved = withColumn(avventura, 'cast', 'main');
    expect(moved.sceneFields[fieldAt(avventura, "Chi c'è")]!.column).toBe('main');
    expect(JSON.stringify(withColumn(moved, 'cast', 'side'))).toBe(JSON.stringify(avventura));
  });

  it('stores only what differs and removes the key when set back, for the revelations', () => {
    const moved = withColumn(avventura, 'revelations', 'main');
    expect(moved.overview).toEqual({ revelations: 'Rivelazioni', column: 'main' });
    expect(JSON.stringify(withColumn(moved, 'revelations', 'side'))).toBe(JSON.stringify(avventura));
  });

  it('keeps the other PDF options, and withPdf keeps the column', () => {
    const index = at(avventura, 'Orologio');
    const leftOut = { ...avventura, sections: avventura.sections.map((s, i) => (i === index ? withPdf(s, { print: false }, 'adventure') : s)) };
    const moved = withColumn(leftOut, 'clock', 'side');
    expect(moved.sections[index]!.pdf).toEqual({ print: false, column: 'side' });
    const printed = withPdf(moved.sections[index]!, { print: true }, 'adventure');
    expect(printed.pdf).toEqual({ column: 'side' });
    expect(withColumn({ ...moved, sections: moved.sections.map((s, i) => (i === index ? printed : s)) }, 'clock', 'main')).toEqual(avventura);
  });

  it('gives a template that validates', () => {
    const moved = withColumn(withColumn(withColumn(avventura, 'truths', 'side'), 'mustHave', 'main'), 'revelations', 'main');
    expect(defineTemplate(moved as AdventureTemplateInput)).toEqual(moved);
  });
});

describe('columnOf', () => {
  const sideClock = withColumn(avventura, 'clock', 'side');

  it('takes a mark with a known word', () => {
    expect(columnOf(sideClock, 'clock', mark('principale'))).toBe('main');
    expect(columnOf(avventura, 'clock', mark('Laterale'))).toBe('side');
  });

  it('takes the template for an unknown word', () => {
    expect(columnOf(sideClock, 'clock', mark('latterale'))).toBe('side');
    expect(columnOf(avventura, 'clock', mark('latterale'))).toBe('main');
  });

  it('takes the template without a mark', () => {
    expect(columnOf(sideClock, 'clock')).toBe('side');
    expect(columnOf(sideClock, 'clock', null)).toBe('side');
    expect(columnOf(avventura, 'mustHave', null)).toBe('side');
  });
});

describe('column changes', () => {
  it('list a section whose column changed, and no pdf change with it', () => {
    expect(templateChanges(avventura, withColumn(avventura, 'clock', 'side'))).toEqual([
      { kind: 'changed', what: 'section', label: 'Orologio', detail: 'column', before: 'main', after: 'side' },
    ]);
  });

  it('list a field whose column changed', () => {
    expect(templateChanges(avventura, withColumn(avventura, 'cast', 'main'))).toEqual([
      { kind: 'changed', what: 'field', label: "Chi c'è", detail: 'column', before: 'side', after: 'main' },
    ]);
  });

  it('list the revelations when their column changed', () => {
    expect(templateChanges(withColumn(avventura, 'revelations', 'main'), avventura)).toEqual([
      { kind: 'changed', what: 'revelations', label: 'Rivelazioni', detail: 'column', before: 'main', after: 'side' },
    ]);
  });

  it('list nothing for a column stored at its default', () => {
    const stored = edit((t) => {
      t.sections[at(avventura, 'Orologio')]!.pdf = { column: 'main' };
    });
    expect(templateChanges(avventura, stored)).toEqual([]);
  });

  it('list a print change and a column change of the same section apart', () => {
    const index = at(avventura, 'Orologio');
    const to = withColumn(
      { ...avventura, sections: avventura.sections.map((s, i) => (i === index ? withPdf(s, { print: false }, 'adventure') : s)) },
      'clock',
      'side',
    );
    expect(templateChanges(avventura, to)).toEqual([
      { kind: 'changed', what: 'section', label: 'Orologio', detail: 'pdf', before: 'printed', after: 'left out' },
      { kind: 'changed', what: 'section', label: 'Orologio', detail: 'column', before: 'main', after: 'side' },
    ]);
  });
});
