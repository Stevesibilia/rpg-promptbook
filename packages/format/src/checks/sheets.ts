import type { Problem, Sheet } from '../model.js';
import { escapeRegExp } from '../parse/source.js';
import type { Template } from '../template/schema.js';
import type { Check } from './index.js';
import { plural, problem } from './util.js';

const keyOf = (template: Template, role: Template['sheets']['keys'][number]['role']) =>
  template.sheets.keys.find((k) => k.role === role)?.key;

// A grade against the counts written for it, threats written inside another
// sheet, and two sheets with one name.
export const checkSheets: Check = ({ model, template }) => {
  const out: Problem[] = [];
  const systemKey = template.meta.find((m) => m.role === 'system')?.key;
  const systemName = systemKey === undefined ? undefined : model.meta.values[systemKey];
  const system = template.systems.find(
    (s) => typeof systemName === 'string' && s.name.toLowerCase() === systemName.trim().toLowerCase(),
  );
  const gradeNames = system?.grades.map((g) => g.name) ?? [];
  const gradeWord = gradeNames.length
    ? new RegExp(`(?<![\\p{L}])(?:${gradeNames.map(escapeRegExp).join('|')})(?![\\p{L}])`, 'iu')
    : null;
  const threatKeys = new Set(template.sheets.keys.map((k) => k.key));

  // Sheet ids come from the name, so a second sheet with the same name would
  // share the first one's id.
  const seen = new Map<string, Sheet>();
  for (const sheet of model.sheets) {
    const first = seen.get(sheet.id);
    if (first) {
      out.push(
        problem(
          'sheet.name.duplicate',
          'error',
          `Sheet "${sheet.title}" has the same name as "${first.title}"; sheet names (the part before the comma) must be unique.`,
          sheet.headingRange,
        ),
      );
    } else {
      seen.set(sheet.id, sheet);
    }
    out.push(...counts(template, sheet));
    for (const block of sheet.blocks) {
      if (block.kind === 'heading' && block.depth >= 4) {
        out.push(nested(sheet, block.title, block.range));
      }
    }
    for (const field of sheet.fields) {
      if (gradeWord && field.key !== null && !threatKeys.has(field.key) && gradeWord.test(field.value)) {
        out.push(nested(sheet, field.key, field.range));
      }
    }
  }
  return out;
};

function nested(sheet: Sheet, name: string, range: Problem['range']): Problem {
  return problem(
    'sheet.nested-threat',
    'warning',
    `Sheet "${sheet.name}" holds "${name}" inside it; give it a sheet of its own, or it gets no threat box.`,
    range,
  );
}

function counts(template: Template, sheet: Sheet): Problem[] {
  const expected = sheet.threat?.counts;
  if (!sheet.threat || !expected) return [];
  const out: Problem[] = [];
  const grade = sheet.threat.grade!;
  const field = (role: 'wounds' | 'afflictions') => {
    const key = keyOf(template, role);
    return key === undefined ? undefined : sheet.fields.find((f) => f.key === key);
  };
  const first = (text: string | null) => text?.match(/\d+/g)?.map(Number) ?? [];

  const wounds = field('wounds');
  const [counters, size] = first(sheet.threat.wounds);
  if (wounds && counters !== undefined) {
    const perCounter = expected.woundsPerCounter;
    const want = expected.wounds / perCounter;
    if (counters !== want || (size ?? perCounter) !== perCounter) {
      out.push(
        problem(
          'sheet.grade.counts',
          'warning',
          `${grade} has ${plural(expected.wounds, 'wound')} in ${plural(want, 'counter')} of ${perCounter}; "${wounds.key}" says "${wounds.value}".`,
          wounds.range,
        ),
      );
    }
  }

  const afflictions = field('afflictions');
  const [written] = first(sheet.threat.afflictions);
  if (afflictions && written !== undefined && written !== expected.afflictions) {
    out.push(
      problem(
        'sheet.grade.counts',
        'warning',
        `${grade} has ${plural(expected.afflictions, 'affliction')}; "${afflictions.key}" says "${afflictions.value}".`,
        afflictions.range,
      ),
    );
  }
  return out;
}
