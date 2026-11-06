import type { Problem, Sheet, SheetKindField } from '../model.js';
import { escapeRegExp } from '../parse/source.js';
import { findKind, findSystem, type SystemDefinition } from '../systems.js';
import type { Check } from './index.js';
import { plural, problem } from './util.js';

const fold = (s: string) => s.trim().toLowerCase();

// Two sheets with one name, the problems of a sheet read by its kind (a
// required field missing, a value its block cannot read, a count that
// disagrees with its table), and threats written inside another sheet.
export const checkSheets: Check = ({ model, template, systems }) => {
  const out: Problem[] = [];
  const systemKey = template.meta.find((m) => m.role === 'system')?.key;
  const system = findSystem(systems, systemKey === undefined ? undefined : model.meta.values[systemKey]);
  const typeKey = template.sheets.keys.find((k) => k.role === 'type')?.key;
  const word = threatWords(system);

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
    if (sheet.kind) {
      for (const key of sheet.kind.missing) {
        out.push(
          problem(
            'sheet.field.required',
            'warning',
            `Sheet "${sheet.name}" (${sheet.kind.kind}) has no "${key}", which ${sheet.kind.system} requires; it gets no threat box.`,
            sheet.headingRange,
          ),
        );
      }
      for (const field of sheet.kind.fields) {
        if (field.error && field.range) {
          out.push(problem('sheet.value.invalid', 'warning', `${field.error} It prints as written.`, field.range));
        }
      }
      if (system) out.push(...counts(system, sheet));
    }
    for (const block of sheet.blocks) {
      if (block.kind === 'heading' && block.depth >= 4) {
        out.push(nested(sheet, block.title, block.range));
      }
    }
    if (!word) continue;
    // The kind's own keys hold its values, grades included.
    const own = new Set(findKind(system, sheet.kind?.kind)?.fields.map((f) => fold(f.key)));
    for (const field of sheet.fields) {
      if (field.key === null || own.has(fold(field.key)) || (typeKey !== undefined && fold(field.key) === fold(typeKey))) {
        continue;
      }
      if (word.test(field.value)) out.push(nested(sheet, field.key, field.range));
    }
  }
  return out;
};

// The values of the tables a required choice field picks from, such as
// Kulthos's grades, which mark a threat written inside another sheet.
function threatWords(system: SystemDefinition | undefined): RegExp | null {
  const tables = new Set(
    system?.kinds.flatMap((k) => k.fields.flatMap((f) => (f.block === 'choice' && f.requirement === 'required' ? [f.table] : []))),
  );
  const words = system?.tables.filter((t) => tables.has(t.name)).flatMap((t) => t.rows.map((r) => r[0]!).filter(Boolean)) ?? [];
  return words.length ? new RegExp(`(?<![\\p{L}])(?:${words.map(escapeRegExp).join('|')})(?![\\p{L}])`, 'iu') : null;
}

function nested(sheet: Sheet, name: string, range: Problem['range']): Problem {
  return problem(
    'sheet.nested-threat',
    'warning',
    `Sheet "${sheet.name}" holds "${name}" inside it; give it a sheet of its own, or it gets no threat box.`,
    range,
  );
}

// A written count for boxes counted from a table, against the table. With a
// group, the first number is groups and a second the group size; without, the
// first number is boxes.
function counts(system: SystemDefinition, sheet: Sheet): Problem[] {
  const out: Problem[] = [];
  const kind = findKind(system, sheet.kind!.kind);
  for (const field of sheet.kind!.fields) {
    const { definition } = field;
    if (definition.block !== 'boxes' || definition.count.from !== 'table' || !field.range) continue;
    if (field.value?.block !== 'boxes') continue;
    const { table, column } = definition.count;
    const choice = kind?.fields.find((f) => f.block === 'choice' && f.table === table);
    const picked = choice && sheet.kind!.fields.find((f) => f.key === choice.key)?.value;
    if (picked?.block !== 'choice') continue;
    const { row } = picked;
    const want = field.value.count;
    const [first, second] = field.text.match(/\d+/g)?.map(Number) ?? [];
    if (first === undefined) continue;
    const group = definition.group;
    const message = (expected: string) =>
      `${row[0]} has ${expected} (table "${table}", column "${column}"); "${field.key}" says "${field.text}".`;
    if (group !== undefined) {
      const groups = Math.ceil(want / group);
      if (first !== groups || (second ?? group) !== group) {
        out.push(warn(field, message(`${want} ${column} in ${plural(groups, 'group')} of ${group}`)));
      }
    } else if (first !== want) {
      out.push(warn(field, message(`${want} ${column}`)));
    }
  }
  return out;
}

const warn = (field: SheetKindField, message: string) => problem('sheet.grade.counts', 'warning', message, field.range!);
