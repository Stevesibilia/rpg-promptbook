import type { BlockValue, JsonValue, SheetField, SheetKindData, SheetKindField } from '../model.js';
import {
  findKind,
  findSystem,
  tableRow,
  type FieldDefinition,
  type SheetKindDefinition,
  type SystemDefinition,
} from '../systems.js';
import type { ParseContext } from './blocks.js';

// Reading a sheet by the kind its type key names, in the system the front
// matter names. Each field is read by its block; a value the block cannot read
// keeps its text, with the reason in `error`.

type Read = { value: BlockValue | null; error: string | null };

const fold = (s: string) => s.trim().toLowerCase();
const ok = (value: BlockValue): Read => ({ value, error: null });
const invalid = (error: string): Read => ({ value: null, error });

export function readKind(ctx: ParseContext, fields: SheetField[], systemName: JsonValue | undefined): SheetKindData | null {
  const { template, systems } = ctx;
  const system = findSystem(systems, systemName);
  const typeKey = template.sheets.keys.find((k) => k.role === 'type')?.key;
  if (!system || typeKey === undefined) return null;
  const written = (key: string) => fields.find((f) => f.key !== null && fold(f.key) === fold(key));
  const kind = findKind(system, written(typeKey)?.value);
  if (!kind) return null;

  const reader = new Reader(system, kind, template.sheets.listSeparator, written);
  const out: SheetKindField[] = [];
  const missing: string[] = [];
  for (const definition of kind.fields) {
    const field = written(definition.key);
    const base = { key: definition.key, block: definition.block, show: definition.show, definition };
    // A flag is on when its key is written, even with nothing after it.
    if (!field || (definition.block !== 'flag' && field.value.trim() === '' && field.items.length === 0)) {
      const value = reader.unwritten(definition);
      if (value) out.push({ ...base, range: null, text: '', value, error: null });
      else if (definition.requirement === 'required') missing.push(definition.key);
      continue;
    }
    out.push({ ...base, range: field.range, text: field.value, ...reader.read(definition, field) });
  }
  return { system: system.name, kind: kind.name, fields: out, missing };
}

class Reader {
  constructor(
    private readonly system: SystemDefinition,
    private readonly kind: SheetKindDefinition,
    private readonly separator: string,
    private readonly written: (key: string) => SheetField | undefined,
  ) {}

  // What a field shows when it is not written: fixed boxes and clocks, boxes
  // counted from a table row the sheet picks, and lines to fill in.
  unwritten(definition: FieldDefinition): BlockValue | null {
    switch (definition.block) {
      case 'boxes': {
        const count = this.fixedCount(definition);
        return count === null ? null : { block: 'boxes', count, marked: [] };
      }
      case 'clock':
        return definition.count.from === 'fixed' ? { block: 'clock', clocks: [{ label: null, size: definition.count.n }] } : null;
      case 'lines':
        return { block: 'lines', labels: definition.labels };
      default:
        return null;
    }
  }

  read(definition: FieldDefinition, field: SheetField): Read {
    // A single value is the item's own line; text keeps its sub-bullets.
    const text = (field.items.length ? field.lead : field.value).trim();
    switch (definition.block) {
      case 'text':
        return ok({ block: 'text', text: field.value.trim() });
      case 'number':
        return ok({ block: 'number', text });
      case 'choice': {
        const row = tableRow(this.system, definition.table, text);
        if (!row) return invalid(`"${text}" is not in the table "${definition.table}".`);
        return ok({ block: 'choice', columns: this.table(definition.table)!.columns, row });
      }
      case 'stats':
        return this.stats(definition, this.items(field));
      case 'boxes':
        return this.boxes(definition, text);
      case 'clock':
        return this.clock(definition, this.items(field));
      case 'list': {
        const items = this.items(field);
        return definition.style === 'paras'
          ? ok({ block: 'list', style: 'paras', items: items.map(paragraph) })
          : ok({ block: 'list', style: definition.style, items });
      }
      case 'rows':
        // The separator splits a row's cells, so a row per sub-bullet; on one
        // line the field is one row.
        return this.rows(definition, [text, ...field.items].map(collapse).filter(Boolean));
      case 'lines':
        return ok({ block: 'lines', labels: definition.labels });
      case 'flag':
        return ok({ block: 'flag', on: !/^(?:no|false|0)(?![\p{L}\p{N}])/iu.test(text) });
    }
  }

  private table(name: string) {
    return this.system.tables.find((t) => t.name === name);
  }

  // The count a fixed or table count gives, null when the table's row is not
  // picked or a written count is needed.
  private fixedCount(definition: Extract<FieldDefinition, { block: 'boxes' }>): number | null {
    const { count } = definition;
    if (count.from === 'fixed') return count.n;
    if (count.from === 'written') return null;
    const row = this.pickedRow(count.table);
    const index = this.table(count.table)!.columns.indexOf(count.column);
    return row ? Number(row[index]) : null;
  }

  // The row of a table that the kind's choice field on it picks.
  pickedRow(table: string): string[] | undefined {
    const choice = this.kind.fields.find((f) => f.block === 'choice' && f.table === table);
    const field = choice && this.written(choice.key);
    const value = field && (field.items.length ? field.lead : field.value);
    return value ? tableRow(this.system, table, value) : undefined;
  }

  // A field's items: its sub-bullets, after anything on its own line, or the
  // line split on the template's list separator.
  private items(field: SheetField): string[] {
    const items = field.items.length ? [...splitList(field.lead, this.separator), ...field.items] : splitList(field.value, this.separator);
    return items.map(collapse).filter(Boolean);
  }

  private stats(definition: Extract<FieldDefinition, { block: 'stats' }>, items: string[]): Read {
    // Longer labels first, so "Forza" never takes "Forza di volontà".
    const labels = [...definition.labels].sort((a, b) => b.length - a.length);
    const values = new Map<string, string>();
    for (const written of items) {
      const item = written.replace(/\*\*|__/gu, '').trim();
      const label = labels.find((l) => {
        const head = item.slice(0, l.length);
        return fold(head) === fold(l) && /^(?:$|[\s:])/u.test(item.slice(l.length));
      });
      if (label === undefined) {
        return invalid(`"${written}" names none of the stats of "${definition.key}" (${definition.labels.join(', ')}).`);
      }
      if (!values.has(label)) values.set(label, item.slice(label.length).replace(/^[\s:]+/u, '').trim());
    }
    return ok({ block: 'stats', stats: definition.labels.map((label) => ({ label, value: values.get(label) ?? null })) });
  }

  private boxes(definition: Extract<FieldDefinition, { block: 'boxes' }>, text: string): Read {
    if (definition.count.from !== 'written') {
      const count = this.fixedCount(definition);
      // A table count without its row: the choice field says why.
      return count === null ? { value: null, error: null } : ok({ block: 'boxes', count, marked: [] });
    }
    const match = /^(\d+)(?:\s*\(([\d,\s]*)\))?/u.exec(text);
    if (!match) return invalid(`"${definition.key}" needs a number of boxes, as in "6", not "${text}".`);
    const count = Number(match[1]);
    const marked = definition.marks && match[2] !== undefined ? match[2].split(/[,\s]+/u).filter(Boolean).map(Number) : [];
    const outside = marked.find((m) => m < 1 || m > count);
    if (outside !== undefined) return invalid(`"${definition.key}" marks box ${outside} of ${count}.`);
    return ok({ block: 'boxes', count, marked: [...new Set(marked)].sort((a, b) => a - b) });
  }

  private clock(definition: Extract<FieldDefinition, { block: 'clock' }>, items: string[]): Read {
    if (definition.count.from === 'fixed') return ok({ block: 'clock', clocks: [{ label: null, size: definition.count.n }] });
    const clocks: { label: string; size: number }[] = [];
    for (const item of items) {
      const match = /^(.*?):\s*(\d+)\s*$/u.exec(item);
      if (!match || Number(match[2]) < 1 || !match[1]!.trim()) {
        return invalid(`"${item}" needs a name and a clock size after a colon, as in "Prendere il molo: 6".`);
      }
      clocks.push({ label: match[1]!.trim(), size: Number(match[2]) });
    }
    return ok({ block: 'clock', clocks });
  }

  private rows(definition: Extract<FieldDefinition, { block: 'rows' }>, items: string[]): Read {
    const { columns } = definition;
    const rows: { cells: { text: string; tokens: number | null }[] }[] = [];
    for (const item of items) {
      const colon = item.indexOf(':');
      const texts = colon === -1 ? [item] : [item.slice(0, colon).trim(), ...splitCells(item.slice(colon + 1), this.separator)];
      if (texts.length > columns.length) {
        return invalid(`"${item}" has ${texts.length} cells; "${definition.key}" has ${columns.length} columns (${columns.map((c) => c.name).join(', ')}).`);
      }
      const cells: { text: string; tokens: number | null }[] = [];
      for (const [index, column] of columns.entries()) {
        const text = texts[index] ?? '';
        if (!column.table || !text) {
          cells.push({ text, tokens: null });
          continue;
        }
        const row = tableRow(this.system, column.table, text);
        if (!row) return invalid(`"${text}" is not in the table "${column.table}".`);
        const tokens = /^\d+$/.test(row[1] ?? '') ? Number(row[1]) : null;
        cells.push({ text, tokens });
      }
      rows.push({ cells });
    }
    return ok({ block: 'rows', rows });
  }
}

// "La Maestà («Fermi»: chi non…)" gives the name and what is in brackets.
// A paragraph item: the name, then its text in the bracket group that ends
// the item, matched from the end: "Artigli 45% (22/9) (1D6 + BD)" is
// «Artigli 45% (22/9)» and «1D6 + BD». Without a balanced group at the end
// the item is all name.
function paragraph(item: string): { name: string; text: string } {
  const trimmed = item.trim();
  if (!trimmed.endsWith(')')) return { name: trimmed, text: '' };
  let depth = 0;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    const c = trimmed[i];
    if (c === ')') depth++;
    else if (c === '(' && --depth === 0) {
      const name = trimmed.slice(0, i).trim();
      return name ? { name, text: trimmed.slice(i + 1, -1).trim() } : { name: trimmed, text: '' };
    }
  }
  return { name: trimmed, text: '' };
}

// Splits on the separator outside brackets, so "Prudenza (fa seguire · non
// insegue)" stays one item; with unbalanced brackets, on every separator.
// Empty items, as from a stray separator at either end, are dropped.
export function splitList(text: string, separator: string): string[] {
  return splitOutside(text, separator)
    .map((part) => part.trim())
    .filter(Boolean);
}

// A row's cells after its first: empty cells keep their column, trailing
// empty ones are dropped.
function splitCells(text: string, separator: string): string[] {
  const cells = splitOutside(text, separator).map((cell) => cell.trim());
  while (cells.length && !cells.at(-1)) cells.pop();
  return cells;
}

// A separator written with spaces around it, as " · ", matches its mark between
// any spaces or at either end, so "a ·  · b" and "a ·" split too; one without
// spaces matches as written.
function splitOutside(text: string, separator: string): string[] {
  const core = separator.trim();
  const spaced = core !== '' && core !== separator;
  const at = (i: number): number => {
    if (!spaced) return text.startsWith(separator, i) ? separator.length : 0;
    if (!text.startsWith(core, i)) return 0;
    const before = i === 0 || /\s/u.test(text[i - 1]!);
    const after = i + core.length === text.length || /\s/u.test(text[i + core.length]!);
    return before && after ? core.length : 0;
  };
  const split = (brackets: boolean) => {
    const parts: string[] = [];
    let depth = 0;
    let from = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (brackets && c === '(') depth += 1;
      else if (brackets && c === ')') depth = Math.max(0, depth - 1);
      else if (depth === 0) {
        const length = at(i);
        if (length) {
          parts.push(text.slice(from, i));
          from = i + length;
          i = from - 1;
        }
      }
    }
    parts.push(text.slice(from));
    return { parts, balanced: depth === 0 };
  };
  const outside = split(true);
  return outside.balanced ? outside.parts : split(false).parts;
}

// A soft-wrapped item on one line.
function collapse(item: string): string {
  return item.replace(/\s+/gu, ' ').trim();
}
