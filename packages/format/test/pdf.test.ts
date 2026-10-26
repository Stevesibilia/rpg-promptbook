import { describe, expect, it } from 'vitest';
import {
  defineTemplate,
  parseAdventure,
  sectionPdf,
  templateChanges,
  templates,
  TemplateError,
  withPdf,
  type AdventureTemplate,
  type AdventureTemplateInput,
  type CampaignTemplateInput,
  type TemplateInput,
} from '../src/index.js';
import { base, change, codes } from './checks.helpers.js';

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

const section = (template: AdventureTemplate, name: string) => template.sections.find((s) => s.name === name)!;
const atmosfera = { name: 'Atmosfera', requirement: 'optional' as const, uid: 'u1' };

describe('section PDF options', () => {
  it('read as printed for every role but the appendix, with the place the layout gives', () => {
    for (const s of templates.avventura.sections) {
      expect(sectionPdf(s), s.name).toEqual({ print: s.role !== 'appendix', newPage: false, sideColumn: false });
    }
  });

  it('read as printed on a new page without a side column for an own section', () => {
    expect(sectionPdf(atmosfera)).toEqual({ print: true, newPage: true, sideColumn: false });
  });

  it('read what the template sets', () => {
    const template = edit((t) => {
      t.sections.splice(8, 0, { ...atmosfera, pdf: { newPage: false, sideColumn: true } });
      t.sections.find((s) => s.role === 'before')!.pdf = { print: false };
    });
    expect(sectionPdf(section(template, 'Atmosfera'))).toEqual({ print: true, newPage: false, sideColumn: true });
    expect(sectionPdf(section(template, 'Prima della sessione'))).toEqual({ print: false, newPage: false, sideColumn: false });
  });

  it('refuse a layout option on a role section, with its path', () => {
    const definition = copy();
    definition.sections.find((s) => s.role === 'strongStart')!.pdf = { newPage: true, sideColumn: false };
    expect(issues(definition)).toEqual([
      'sections[6].pdf.newPage: only your own sections take this option',
      'sections[6].pdf.sideColumn: only your own sections take this option',
    ]);
  });

  it('refuse any option on the appendix', () => {
    const definition = copy();
    definition.sections.at(-1)!.pdf = { print: true };
    expect(issues(definition)).toEqual(['sections[14].pdf: the appendix is never printed']);
  });

  it('refuse any option in a campaign template', () => {
    const campaign = JSON.parse(JSON.stringify(templates.campagna)) as CampaignTemplateInput;
    campaign.sections[0]!.pdf = { print: false };
    expect(issues(campaign)).toEqual(['sections[0].pdf: campaigns have no PDF']);
  });

  it('accept print on a role section', () => {
    const template = edit((t) => {
      t.sections.find((s) => s.role === 'sheets')!.pdf = { print: false };
    });
    expect(sectionPdf(section(template, 'Schede')).print).toBe(false);
  });
});

describe('withPdf', () => {
  it('stores only what differs from the defaults', () => {
    expect(withPdf(atmosfera, { newPage: false })).toEqual({ ...atmosfera, pdf: { newPage: false } });
    expect(withPdf(atmosfera, { print: true, newPage: true, sideColumn: false })).toEqual(atmosfera);
    const before = section(templates.avventura, 'Prima della sessione');
    expect(withPdf(before, { print: false })).toEqual({ ...before, pdf: { print: false } });
  });

  it('drops pdf when an option goes back to its default', () => {
    const off = withPdf(atmosfera, { newPage: false, sideColumn: true });
    expect(withPdf(withPdf(off, { newPage: true }), { sideColumn: false })).toEqual(atmosfera);
    expect(JSON.stringify(withPdf(off, { newPage: true, sideColumn: false }))).toBe(JSON.stringify(atmosfera));
  });

  it('keeps the other options', () => {
    expect(withPdf({ ...atmosfera, pdf: { sideColumn: true } }, { print: false })).toEqual({
      ...atmosfera,
      pdf: { print: false, sideColumn: true },
    });
  });
});

describe('the pdf change', () => {
  const withAtmosfera = edit((t) => {
    t.sections.splice(8, 0, atmosfera);
  });

  it('is listed when a section is left out', () => {
    const to = edit((t) => {
      t.sections.splice(8, 0, atmosfera);
      t.sections.find((s) => s.role === 'before')!.pdf = { print: false };
    });
    expect(templateChanges(withAtmosfera, to)).toEqual([
      { kind: 'changed', what: 'section', label: 'Prima della sessione', detail: 'pdf', before: 'printed', after: 'left out' },
    ]);
  });

  it('is listed when an own section changes its options', () => {
    const to = edit((t) => {
      t.sections.splice(8, 0, { ...atmosfera, pdf: { newPage: false, sideColumn: true } });
    });
    expect(templateChanges(withAtmosfera, to)).toEqual([
      {
        kind: 'changed',
        what: 'section',
        label: 'Atmosfera',
        detail: 'pdf',
        before: 'printed, new page',
        after: 'printed, side column',
      },
    ]);
  });

  it('is not listed for options that read the same', () => {
    const to = edit((t) => {
      t.sections.splice(8, 0, { ...atmosfera, pdf: { newPage: true } });
    });
    expect(templateChanges(withAtmosfera, to)).toEqual([]);
  });
});

describe('side boxes in an own section', () => {
  const doc = change(
    '## Verità del mondo',
    '## Atmosfera\n\nIl vento.\n\n> [!riquadro|laterale] Suoni\n> Campane.\n\n## Verità del mondo',
  );
  const template = (sideColumn: boolean) =>
    edit((t) => {
      t.sections.splice(5, 0, { ...atmosfera, ...(sideColumn ? { pdf: { sideColumn } } : {}) });
    });
  const problems = (sideColumn: boolean) =>
    codes(parseAdventure(doc, { template: template(sideColumn) }).problems);

  it('are not a callout.place warning with a side column', () => {
    expect(problems(true)).not.toContain('callout.place');
  });

  it('are one without it', () => {
    expect(problems(false)).toContain('callout.place');
  });

  it('are still one in a section the template does not know', () => {
    expect(codes(parseAdventure(doc, { template: templates.avventura }).problems)).toContain('callout.place');
    expect(base.includes('## Atmosfera')).toBe(false);
  });
});
