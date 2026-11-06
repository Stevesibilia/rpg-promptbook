import { z } from 'zod';
import { blades } from './systems/blades.js';
import { coc } from './systems/coc.js';
import { coriolis } from './systems/coriolis.js';
import { dnd5e, historia } from './systems/dnd5e.js';
import { fate } from './systems/fate.js';
import { kulthos } from './systems/kulthos.js';
import { mork } from './systems/mork.js';
import { nte } from './systems/nte.js';
import { outgunned } from './systems/outgunned.js';
import { pbta } from './systems/pbta.js';
import { vileborn } from './systems/vileborn.js';
import { avventura } from './template/avventura.js';
import { issuesOf, requirementSchema, TemplateError } from './template/schema.js';

// Game systems are a list beside the templates: any template can use any
// system, found by the name the front matter gives. A system describes its
// sheet kinds, picked by the sheet's type key («Tipo»), and the lookup tables
// its fields read. Systems hold no formulas: a table fills counts and labels,
// every other number is written by hand.

const label = z.string().trim().min(1, 'expected a non-empty label');
const labels = z.array(label).min(1, 'expected at least one label');

const countSchema = z.discriminatedUnion('from', [
  z.object({ from: z.literal('written') }),
  z.object({ from: z.literal('fixed'), n: z.int().positive() }),
  // The row is the one the kind's choice field on that table picks.
  z.object({ from: z.literal('table'), table: label, column: label }),
]);

const common = {
  key: label,
  // Where the field shows in the scene's threat box.
  show: z.enum(['row', 'sub', 'quote', 'none']),
  requirement: requirementSchema.default('optional'),
  // With show 'sub': written right after the kind's name, «Minaccia Straordinaria».
  afterType: z.boolean().optional(),
};

const fieldSchema = z.discriminatedUnion('block', [
  z.object({ ...common, block: z.literal('text') }),
  // line: a write-in line before the number, «PF ___ / 22».
  z.object({ ...common, block: z.literal('number'), line: z.boolean().optional() }),
  // also: the row's other columns in brackets after the value.
  z.object({ ...common, block: z.literal('choice'), table: label, also: z.boolean().optional() }),
  z.object({ ...common, block: z.literal('stats'), labels }),
  z.object({
    ...common,
    block: z.literal('boxes'),
    count: countSchema,
    group: z.int().positive().optional(),
    // marks: brackets after the count mark boxes, «6 (3)»; values: numbered boxes.
    marks: z.boolean().optional(),
    values: z.boolean().optional(),
  }),
  z.object({
    ...common,
    block: z.literal('clock'),
    count: z.discriminatedUnion('from', [
      z.object({ from: z.literal('written') }),
      z.object({ from: z.literal('fixed'), n: z.int().positive() }),
    ]),
  }),
  z.object({ ...common, block: z.literal('list'), style: z.enum(['line', 'paras', 'check']) }),
  z.object({
    ...common,
    block: z.literal('rows'),
    columns: z.array(z.object({ name: label, table: label.optional() })).min(1, 'expected at least one column'),
  }),
  z.object({ ...common, block: z.literal('lines'), labels }),
  // The word the subtitle adds when the flag is on, «branco».
  z.object({ ...common, block: z.literal('flag'), word: label }),
]);

const tableSchema = z.object({
  name: label,
  // The first column is the key a choice field writes.
  columns: z.array(label).min(1, 'expected at least one column'),
  rows: z.array(z.array(z.string().trim())),
});

const kindSchema = z.object({
  // The value the sheet's type key writes.
  name: label,
  fields: z.array(fieldSchema),
});

export const systemSchema = z.object({
  // For storage in a later change; systems are found by name.
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'expected a lower-case id'),
  name: label,
  kinds: z.array(kindSchema),
  tables: z.array(tableSchema),
});

const fold = (s: string) => s.trim().toLowerCase();

// The key a sheet names its kind with, which no field may take.
const typeKey = avventura.sheets.keys.find((k) => k.role === 'type')!.key;

const systemsSchema = z.array(systemSchema).superRefine((systems, ctx) => {
  const issue = (path: PropertyKey[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  // Items without a key (an empty first cell) are skipped.
  const unique = <T>(items: T[], key: (item: T) => string | undefined, path: PropertyKey[], what: string) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      const raw = key(item);
      if (!raw) return;
      const value = fold(raw);
      if (seen.has(value)) issue([...path, index], `duplicate ${what} "${raw}"`);
      seen.add(value);
    });
  };
  unique(systems, (s) => s.name, [], 'system');
  unique(systems, (s) => s.id, [], 'system id');

  systems.forEach((system, s) => {
    unique(system.tables, (t) => t.name, [s, 'tables'], 'table');
    unique(system.kinds, (k) => k.name, [s, 'kinds'], 'kind');
    const tableOf = (name: string) => system.tables.find((t) => t.name === name);

    system.tables.forEach((table, t) => {
      unique(table.columns, (c) => c, [s, 'tables', t, 'columns'], 'column');
      table.rows.forEach((row, r) => {
        if (row.length !== table.columns.length) {
          issue([s, 'tables', t, 'rows', r], `expected ${table.columns.length} cells, one per column, found ${row.length}`);
        } else if (!row[0]) {
          issue([s, 'tables', t, 'rows', r, 0], 'expected a key in the first column');
        }
      });
      unique(table.rows, (row) => row[0], [s, 'tables', t, 'rows'], `"${table.columns[0]}" value`);
    });

    system.kinds.forEach((kind, k) => {
      const at = (f: number, ...rest: PropertyKey[]) => [s, 'kinds', k, 'fields', f, ...rest];
      unique(kind.fields, (f) => f.key, [s, 'kinds', k, 'fields'], 'field key');
      kind.fields.forEach((field, f) => {
        const needTable = (name: string, path: PropertyKey[]) => {
          const table = tableOf(name);
          if (!table) issue(path, `"${field.key}" names the table "${name}", which ${system.name} has not`);
          return table;
        };
        if (fold(field.key) === fold(typeKey)) {
          issue(at(f, 'key'), `"${field.key}" is the sheet's type key; a field cannot take it`);
        }
        if (field.afterType && field.show !== 'sub') {
          issue(at(f, 'afterType'), `"${field.key}" can follow the kind's name only in the subtitle (show "sub")`);
        }
        if (field.block === 'choice') needTable(field.table, at(f, 'table'));
        if (field.block === 'rows') {
          field.columns.forEach((column, c) => {
            if (column.table !== undefined) needTable(column.table, at(f, 'columns', c, 'table'));
          });
        }
        if (field.block === 'boxes' && field.count.from === 'table') {
          const { table: name, column } = field.count;
          const table = needTable(name, at(f, 'count', 'table'));
          const index = table?.columns.indexOf(column) ?? -1;
          if (table && index === -1) {
            issue(at(f, 'count', 'column'), `"${field.key}" counts from the column "${column}", which the table "${name}" has not`);
          } else if (table) {
            table.rows.forEach((row, r) => {
              if (row.length === table.columns.length && !/^\d+$/.test(row[index]!)) {
                issue([s, 'tables', system.tables.indexOf(table), 'rows', r, index], `"${field.key}" counts from "${column}", so it must be a whole number`);
              }
            });
          }
          if (!kind.fields.some((other) => other.block === 'choice' && other.table === name)) {
            issue(at(f, 'count'), `"${field.key}" counts from the table "${name}", but the kind "${kind.name}" has no choice field on it to pick the row`);
          }
        }
      });
    });
  });
});

export type SystemInput = z.input<typeof systemSchema>;
export type SystemDefinition = z.output<typeof systemSchema>;
export type SheetKindDefinition = SystemDefinition['kinds'][number];
export type FieldDefinition = SheetKindDefinition['fields'][number];
export type FieldBlock = FieldDefinition['block'];
export type FieldShow = FieldDefinition['show'];
export type LookupTable = SystemDefinition['tables'][number];

// Validates a list of systems and returns it typed. Throws a TemplateError
// whose message names every bad entry by its path, as in
// "[0].kinds[0].fields[3].table".
export function defineSystems(definitions: SystemInput[]): SystemDefinition[] {
  const result = systemsSchema.safeParse(definitions);
  if (result.success) return result.data;
  throw new TemplateError('systems', issuesOf(result.error));
}

// The system a front matter value names, by name, ignoring case.
export function findSystem(systems: readonly SystemDefinition[], name: unknown): SystemDefinition | undefined {
  return typeof name === 'string' ? systems.find((s) => fold(s.name) === fold(name)) : undefined;
}

// The kind a sheet's type value names, ignoring case.
export function findKind(system: SystemDefinition | undefined, name: string | null | undefined): SheetKindDefinition | undefined {
  return name == null ? undefined : system?.kinds.find((k) => fold(k.name) === fold(name));
}

// A table's row by its first column, ignoring case, as the cells in column
// order.
export function tableRow(system: SystemDefinition, table: string, key: string): string[] | undefined {
  return system.tables.find((t) => t.name === table)?.rows.find((row) => fold(row[0] ?? '') === fold(key) && row[0] !== '');
}

// The built-ins, read-only, in the order the Settings page lists them.
export const builtinSystems: readonly SystemDefinition[] = defineSystems([
  kulthos,
  vileborn,
  nte,
  outgunned,
  dnd5e,
  historia,
  blades,
  pbta,
  fate,
  coc,
  mork,
  coriolis,
]);
