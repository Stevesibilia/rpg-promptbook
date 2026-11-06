import { tableRow, type SystemDefinition } from './systems.js';

// The grade view the template's threat keys still read, taken from a system's
// kind with a required choice field. Replaced by reading sheets by kind.
export function legacyGrades(system: SystemDefinition | undefined) {
  const kind = system?.kinds.find((k) => k.fields.some((f) => f.block === 'choice' && f.requirement === 'required'));
  const choice = kind?.fields.find((f) => f.block === 'choice' && f.requirement === 'required');
  const fromTable = (grouped: boolean) =>
    kind?.fields.find(
      (f) => f.block === 'boxes' && f.count.from === 'table' && (f.group !== undefined) === grouped,
    ) as Extract<SystemDefinition['kinds'][number]['fields'][number], { block: 'boxes' }> | undefined;
  const wounds = fromTable(true);
  const afflictions = fromTable(false);
  const table = choice?.block === 'choice' ? system!.tables.find((t) => t.name === choice.table) : undefined;
  return {
    names: table?.rows.map((r) => r[0]!) ?? [],
    counts(grade: string | null): { wounds: number; afflictions: number; woundsPerCounter: number } | null {
      if (!system || !table || !wounds || !afflictions || grade === null) return null;
      const row = tableRow(system, table.name, grade);
      if (!row || wounds.count.from !== 'table' || afflictions.count.from !== 'table') return null;
      return {
        wounds: Number(row[table.columns.indexOf(wounds.count.column)]),
        afflictions: Number(row[table.columns.indexOf(afflictions.count.column)]),
        woundsPerCounter: wounds.group!,
      };
    },
  };
}
