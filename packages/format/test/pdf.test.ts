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
      expect(sectionPdf(s, 'adventure'), s.name).toEqual({ print: s.role !== 'appendix', newPage: false, sideColumn: false });
    }
  });

  it('read as printed on a new page without a side column for an own section', () => {
    expect(sectionPdf(atmosfera, 'adventure')).toEqual({ print: true, newPage: true, sideColumn: false });
  });

  it('read what the template sets', () => {
    const template = edit((t) => {
      t.sections.splice(8, 0, { ...atmosfera, pdf: { newPage: false, sideColumn: true } });
      t.sections.find((s) => s.role === 'before')!.pdf = { print: false };
    });
    expect(sectionPdf(section(template, 'Atmosfera'), 'adventure')).toEqual({ print: true, newPage: false, sideColumn: true });
    expect(sectionPdf(section(template, 'Prima della sessione'), 'adventure')).toEqual({ print: false, newPage: false, sideColumn: false });
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


  it('accept print on a role section', () => {
    const template = edit((t) => {
      t.sections.find((s) => s.role === 'sheets')!.pdf = { print: false };
    });
    expect(sectionPdf(section(template, 'Schede'), 'adventure').print).toBe(false);
  });
});

const campaignCopy = () => JSON.parse(JSON.stringify(templates.campagnaV2)) as CampaignTemplateInput;

describe('campaign section PDF options', () => {
  it('accept print and newPage on a section', () => {
    const campaign = campaignCopy();
    campaign.sections[0]!.pdf = { print: false };
    campaign.sections[1]!.pdf = { newPage: true };
    campaign.sections[2]!.pdf = { print: true, newPage: false };
    expect(() => defineTemplate(campaign)).not.toThrow();
  });

  it('refuse a side column, with its path', () => {
    const campaign = campaignCopy();
    campaign.sections[0]!.pdf = { sideColumn: false };
    expect(issues(campaign)).toEqual(['sections[0].pdf.sideColumn: campaigns have no side column']);
  });

  it('refuse any option on the appendix', () => {
    const campaign = campaignCopy();
    campaign.sections.at(-1)!.pdf = { print: false };
    expect(issues(campaign)).toEqual(['sections[12].pdf: the appendix is never printed']);
  });

  it('refuse a role other than the appendix', () => {
    const campaign = campaignCopy();
    campaign.sections[1]!.role = 'truths';
    expect(issues(campaign)).toEqual(['sections[1].role: a campaign section takes no role but the appendix']);
  });

  it('read as printed and flowing by default, the appendix never printed', () => {
    const plain = { name: 'Premessa', requirement: 'optional' as const };
    expect(sectionPdf(plain, 'campaign')).toEqual({ print: true, newPage: false, sideColumn: false });
    expect(sectionPdf({ ...plain, pdf: { print: false } }, 'campaign')).toEqual({ print: false, newPage: false, sideColumn: false });
    expect(sectionPdf({ ...plain, pdf: { newPage: true } }, 'campaign')).toEqual({ print: true, newPage: true, sideColumn: false });
    const appendix = templates.campagnaV2.sections.at(-1)!;
    expect(sectionPdf(appendix, 'campaign')).toEqual({ print: false, newPage: false, sideColumn: false });
  });

  it('never read a side column', () => {
    // A definition built by hand, past the schema: still no side column.
    const odd = { name: 'Premessa', requirement: 'optional' as const, pdf: { sideColumn: true } };
    expect(sectionPdf(odd, 'campaign').sideColumn).toBe(false);
  });

  it('store only what differs from the campaign defaults', () => {
    const plain = { name: 'Premessa', requirement: 'optional' as const, uid: 'u2' };
    expect(withPdf(plain, { newPage: true }, 'campaign')).toEqual({ ...plain, pdf: { newPage: true } });
    expect(withPdf(plain, { print: true, newPage: false }, 'campaign')).toEqual(plain);
    const on = withPdf(plain, { newPage: true, print: false }, 'campaign');
    expect(JSON.stringify(withPdf(on, { newPage: false, print: true }, 'campaign'))).toBe(JSON.stringify(plain));
  });

  it('are worded printed, printed with a new page, or left out', () => {
    const from = templates.campagnaV2;
    const to = campaignCopy();
    to.sections[0]!.pdf = { newPage: true };
    to.sections[2]!.pdf = { print: false };
    to.sections[4] = { ...to.sections[4]!, pdf: {} };
    expect(templateChanges(from, defineTemplate(to))).toEqual([
      { kind: 'changed', what: 'section', label: 'Premessa', detail: 'pdf', before: 'printed', after: 'printed, new page' },
      { kind: 'changed', what: 'section', label: 'Fronti', detail: 'pdf', before: 'printed, new page', after: 'left out' },
      { kind: 'changed', what: 'section', label: 'PNG ricorrenti', detail: 'pdf', before: 'printed, new page', after: 'printed' },
    ]);
  });
});

describe('withPdf', () => {
  it('stores only what differs from the defaults', () => {
    expect(withPdf(atmosfera, { newPage: false }, 'adventure')).toEqual({ ...atmosfera, pdf: { newPage: false } });
    expect(withPdf(atmosfera, { print: true, newPage: true, sideColumn: false }, 'adventure')).toEqual(atmosfera);
    const before = section(templates.avventura, 'Prima della sessione');
    expect(withPdf(before, { print: false }, 'adventure')).toEqual({ ...before, pdf: { print: false } });
  });

  it('drops pdf when an option goes back to its default', () => {
    const off = withPdf(atmosfera, { newPage: false, sideColumn: true }, 'adventure');
    expect(withPdf(withPdf(off, { newPage: true }, 'adventure'), { sideColumn: false }, 'adventure')).toEqual(atmosfera);
    expect(JSON.stringify(withPdf(off, { newPage: true, sideColumn: false }, 'adventure'))).toBe(JSON.stringify(atmosfera));
  });

  it('keeps the other options', () => {
    expect(withPdf({ ...atmosfera, pdf: { sideColumn: true } }, { print: false }, 'adventure')).toEqual({
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
