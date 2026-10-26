import type { SectionDefinition } from './schema.js';

// How a section prints, with every option resolved.
export interface SectionPdf {
  // False leaves the section out of the PDF; the appendix never prints.
  print: boolean;
  // A section without a role starts a new page; a role section's place is the
  // layout's.
  newPage: boolean;
  // A section without a role prints its side boxes beside its text.
  sideColumn: boolean;
}

export type SectionPdfPatch = Partial<SectionPdf>;

function defaults(section: SectionDefinition): SectionPdf {
  return { print: section.role !== 'appendix', newPage: !section.role, sideColumn: false };
}

export function sectionPdf(section: SectionDefinition): SectionPdf {
  if (section.role === 'appendix') return defaults(section);
  const pdf = section.pdf ?? {};
  const own = !section.role;
  return {
    print: pdf.print ?? true,
    newPage: own ? (pdf.newPage ?? true) : false,
    sideColumn: own ? (pdf.sideColumn ?? false) : false,
  };
}

// The section with the patch applied, keeping only the options that differ
// from their defaults, and no `pdf` at all when none does: an option set back
// to its default leaves the section as it was.
export function withPdf<T extends SectionDefinition>(section: T, patch: SectionPdfPatch): T {
  const base = defaults(section);
  const next = { ...section.pdf, ...patch };
  const pdf: NonNullable<SectionDefinition['pdf']> = {};
  for (const key of ['print', 'newPage', 'sideColumn'] as const) {
    const value = next[key];
    if (value !== undefined && value !== base[key]) pdf[key] = value;
  }
  const { pdf: _old, ...rest } = section;
  return (Object.keys(pdf).length > 0 ? { ...rest, pdf } : rest) as T;
}
