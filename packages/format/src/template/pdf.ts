import type { SectionDefinition, Template } from './schema.js';

// How a section prints, with every option resolved.
export interface SectionPdf {
  // False leaves the section out of the PDF; the appendix never prints.
  print: boolean;
  // In an adventure, a section without a role starts a new page and a role
  // section's place is the layout's; in a campaign, a section flows unless the
  // template says it starts a page.
  newPage: boolean;
  // An adventure's section without a role prints its side boxes beside its
  // text; campaigns have no side column.
  sideColumn: boolean;
}

export type SectionPdfPatch = Partial<SectionPdf>;

type Kind = Template['kind'];

function defaults(section: SectionDefinition, kind: Kind): SectionPdf {
  const print = section.role !== 'appendix';
  if (kind === 'campaign') return { print, newPage: false, sideColumn: false };
  return { print, newPage: !section.role, sideColumn: false };
}

export function sectionPdf(section: SectionDefinition, kind: Kind): SectionPdf {
  if (section.role === 'appendix') return defaults(section, kind);
  const pdf = section.pdf ?? {};
  if (kind === 'campaign') return { print: pdf.print ?? true, newPage: pdf.newPage ?? false, sideColumn: false };
  const own = !section.role;
  return {
    print: pdf.print ?? true,
    newPage: own ? (pdf.newPage ?? true) : false,
    sideColumn: own ? (pdf.sideColumn ?? false) : false,
  };
}

// The section with the patch applied, keeping only the options that differ
// from their defaults for the template's kind, and no `pdf` at all when none
// does: an option set back to its default leaves the section as it was.
export function withPdf<T extends SectionDefinition>(section: T, patch: SectionPdfPatch, kind: Kind): T {
  const base = defaults(section, kind);
  const next = { ...section.pdf, ...patch };
  const pdf: NonNullable<SectionDefinition['pdf']> = {};
  for (const key of ['print', 'newPage', 'sideColumn'] as const) {
    const value = next[key];
    if (value !== undefined && value !== base[key]) pdf[key] = value;
  }
  const { pdf: _old, ...rest } = section;
  return (Object.keys(pdf).length > 0 ? { ...rest, pdf } : rest) as T;
}
