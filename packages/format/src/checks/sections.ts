import type { Check } from './index.js';
import { missingSeverity, problem } from './util.js';

// Required sections present, in the template's order, the synopsis first.
export const checkSections: Check = ({ model, template, source }) => {
  const out = [];
  const newline = source.text.indexOf('\n');
  const firstLine = source.range(0, newline === -1 ? source.text.length : newline);

  for (const definition of template.sections) {
    const severity = missingSeverity(definition.requirement);
    if (severity && !model.sections.some((s) => s.name === definition.name)) {
      out.push(
        problem(
          'section.missing',
          severity,
          `Section "${definition.name}" is ${definition.requirement === 'required' ? 'required' : 'recommended'} and missing.`,
          firstLine,
        ),
      );
    }
  }

  // The known sections as found, with their place in the template.
  const names = template.sections.map((s) => s.name);
  const found = model.sections.filter((s) => s.name !== null);
  let highest = -1;
  let misplaced: (typeof found)[number] | null = null;
  for (const section of found) {
    const index = names.indexOf(section.name!);
    if (index < highest) {
      misplaced ??= section;
    } else {
      highest = index;
    }
  }
  if (misplaced) {
    const expected = [...found].sort((a, b) => names.indexOf(a.name!) - names.indexOf(b.name!));
    out.push(
      problem(
        'section.order',
        'error',
        `Section "${misplaced.heading}" is out of order. Found: ${found.map((s) => `"${s.name}"`).join(', ')}. Expected: ${expected.map((s) => `"${s.name}"`).join(', ')}.`,
        misplaced.headingRange,
      ),
    );
  }

  const synopsis = model.sections.find((s) => s.role === 'synopsis');
  if (synopsis && !misplaced && model.sections[0] !== synopsis) {
    out.push(
      problem(
        'section.synopsis.first',
        'error',
        `Section "${synopsis.heading}" must be the first section.`,
        synopsis.headingRange,
      ),
    );
  }
  return out;
};
