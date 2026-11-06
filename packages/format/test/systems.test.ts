import { describe, expect, it } from 'vitest';
import { kulthos as kulthosInput } from '../src/systems/kulthos.js';
import { builtinSystems, defineSystems, findKind, findSystem, TemplateError, type SystemInput } from '../src/index.js';

const copy = (): SystemInput[] => JSON.parse(JSON.stringify(builtinSystems)) as SystemInput[];
const kulthos = (): SystemInput => copy()[0]!;

function issues(systems: SystemInput[]): string[] {
  try {
    defineSystems(systems);
  } catch (error) {
    if (error instanceof TemplateError) return error.issues;
    throw error;
  }
  throw new Error('expected the systems to fail');
}

// One broken Kulthos and the issues it gives.
const broken = (change: (s: SystemInput) => void) => {
  const system = kulthos();
  change(system);
  return issues([system]);
};

const minaccia = (s: SystemInput) => s.kinds[0]!;
const field = (s: SystemInput, key: string) => minaccia(s).fields.find((f) => f.key === key)!;

describe('built-in systems', () => {
  it('lists the twelve systems in the mockup order', () => {
    expect(builtinSystems.map((s) => [s.id, s.name])).toEqual([
      ['kulthos', 'Kulthos'],
      ['vileborn', 'Vileborn'],
      ['nte', 'Not the End'],
      ['outgunned', 'Outgunned'],
      ['dnd5e', 'D&D 5e'],
      ['historia', 'Historia'],
      ['blades', 'Blades in the Dark'],
      ['pbta', 'PbtA'],
      ['fate', 'Fate'],
      ['coc', 'Call of Cthulhu'],
      ['mork', 'Mörk Borg'],
      ['coriolis', 'Coriolis'],
    ]);
  });

  it('has seventeen sheet kinds', () => {
    expect(builtinSystems.flatMap((s) => s.kinds.map((k) => `${s.name}: ${k.name}`))).toEqual([
      'Kulthos: Minaccia',
      'Vileborn: Sfida',
      'Not the End: Sfida',
      'Outgunned: Scagnozzi',
      'Outgunned: Cattivo',
      'Outgunned: Boss',
      'D&D 5e: Creatura',
      'Historia: Creatura',
      'Blades in the Dark: Fazione',
      'Blades in the Dark: PNG',
      'PbtA: Minaccia',
      'PbtA: Mostro',
      'Fate: PNG principale',
      'Fate: Comparsa',
      'Call of Cthulhu: Creatura',
      'Mörk Borg: Creatura',
      'Coriolis: PNG',
    ]);
  });

  it('validate again unchanged, as plain JSON', () => {
    expect(defineSystems(copy())).toEqual(builtinSystems);
  });

  it('gives Historia the D&D 5e sheet under its own name and id', () => {
    const dnd = builtinSystems.find((s) => s.id === 'dnd5e')!;
    const historia = builtinSystems.find((s) => s.id === 'historia')!;
    expect(historia.name).toBe('Historia');
    expect({ ...historia, id: dnd.id, name: dnd.name }).toEqual(dnd);
  });

  it('holds Kulthos as data (the spec example)', () => {
    const system = findSystem(builtinSystems, 'kulthos')!;
    expect(system.tables).toEqual([
      {
        name: 'Gradi',
        columns: ['Grado', 'Ferite', 'Afflizioni'],
        rows: [
          ['Ordinaria', '3', '1'],
          ['Straordinaria', '6', '2'],
          ['Leggendaria', '9', '3'],
        ],
      },
    ]);
    const kind = findKind(system, ' minaccia ')!;
    expect(kind.fields.find((f) => f.key === 'Grado')).toMatchObject({
      block: 'choice',
      table: 'Gradi',
      requirement: 'required',
      show: 'sub',
      afterType: true,
    });
    expect(kind.fields.find((f) => f.key === 'Ferite')).toMatchObject({
      block: 'boxes',
      count: { from: 'table', table: 'Gradi', column: 'Ferite' },
      group: 3,
    });
  });

  it("gives Outgunned's kinds Grinta as required boxes with marks (the spec example)", () => {
    const system = findSystem(builtinSystems, 'Outgunned')!;
    expect(system.kinds.map((k) => k.name)).toEqual(['Scagnozzi', 'Cattivo', 'Boss']);
    for (const kind of system.kinds) {
      expect(kind.fields[0]).toMatchObject({ key: 'Grinta', block: 'boxes', requirement: 'required', marks: true });
    }
  });

  it('reads an unset requirement as optional', () => {
    expect(kulthosInput.kinds[0]!.fields.find((f) => f.key === 'Natura')!.requirement).toBeUndefined();
    expect(builtinSystems[0]!.kinds[0]!.fields.find((f) => f.key === 'Natura')!.requirement).toBe('optional');
  });

  it('finds no system for a name it lacks or a value that is not text', () => {
    expect(findSystem(builtinSystems, 'Altro')).toBeUndefined();
    expect(findSystem(builtinSystems, ['Kulthos'])).toBeUndefined();
    expect(findKind(findSystem(builtinSystems, 'Kulthos'), 'PNG alleato')).toBeUndefined();
  });
});

describe('defineSystems', () => {
  it('names a choice on a table the system lacks (the spec example)', () => {
    expect(
      broken((s) => {
        s.tables = [];
        minaccia(s).fields = minaccia(s).fields.filter((f) => f.block !== 'boxes');
      }),
    ).toEqual(['[0].kinds[0].fields[0].table: "Grado" names the table "Gradi", which Kulthos has not']);
  });

  it('names a count from a table with no choice field on it (the spec example)', () => {
    expect(broken((s) => (minaccia(s).fields = minaccia(s).fields.filter((f) => f.key !== 'Grado')))).toEqual([
      '[0].kinds[0].fields[2].count: "Ferite" counts from the table "Gradi", but the kind "Minaccia" has no choice field on it to pick the row',
      '[0].kinds[0].fields[3].count: "Afflizioni" counts from the table "Gradi", but the kind "Minaccia" has no choice field on it to pick the row',
    ]);
  });

  it('names a count from a column the table lacks, or one that is not a whole number', () => {
    expect(
      broken((s) => {
        const ferite = field(s, 'Ferite');
        if (ferite.block === 'boxes' && ferite.count.from === 'table') ferite.count.column = 'Danni';
        s.tables[0]!.rows[1]![2] = 'due';
      }),
    ).toEqual([
      '[0].kinds[0].fields[3].count.column: "Ferite" counts from the column "Danni", which the table "Gradi" has not',
      '[0].tables[0].rows[1][2]: "Afflizioni" counts from "Afflizioni", so it must be a whole number',
    ]);
  });

  it('names a rows column on a table the system lacks', () => {
    const system = copy().find((s) => s.id === 'nte')!;
    system.tables.pop();
    expect(issues([system])).toEqual([
      '[0].kinds[0].fields[1].columns[2].table: "Prove" names the table "Pericolo", which Not the End has not',
    ]);
  });

  it('names two systems with one name or one id, ignoring case', () => {
    const second = { ...kulthos(), name: 'KULTHOS' };
    const third = { ...kulthos(), name: 'Kulthos (casa)' };
    expect(issues([kulthos(), second, third])).toEqual([
      '[1]: duplicate system "KULTHOS"',
      '[1]: duplicate system id "kulthos"',
      '[2]: duplicate system id "kulthos"',
    ]);
  });

  it('names an id that is not a lower-case slug', () => {
    expect(broken((s) => (s.id = 'Kulthos Casa'))).toEqual(['[0].id: expected a lower-case id']);
  });

  it('names two kinds with one name, ignoring case', () => {
    expect(broken((s) => s.kinds.push({ ...minaccia(s), name: 'minaccia' }))).toEqual([
      '[0].kinds[1]: duplicate kind "minaccia"',
    ]);
  });

  it("names a field key given twice, or the template's type key", () => {
    expect(
      broken((s) => {
        minaccia(s).fields.push({ key: 'natura', block: 'text', show: 'none' });
        minaccia(s).fields.push({ key: 'Tipo', block: 'text', show: 'none' });
      }),
    ).toEqual([
      '[0].kinds[0].fields[8]: duplicate field key "natura"',
      `[0].kinds[0].fields[9].key: "Tipo" is the sheet's type key; a field cannot take it`,
    ]);
  });

  it('names two tables with one name, and a column given twice', () => {
    expect(
      broken((s) => {
        s.tables.push({ name: 'gradi', columns: ['Grado', 'Grado'], rows: [] });
      }),
    ).toEqual(['[0].tables[1]: duplicate table "gradi"', '[0].tables[1].columns[1]: duplicate column "Grado"']);
  });

  it('names a row of the wrong length, an empty key, and a key given twice', () => {
    expect(
      broken((s) => {
        s.tables[0]!.rows.push(['Mitica', '12'], ['', '1', '1'], ['ordinaria', '3', '1']);
      }),
    ).toEqual([
      '[0].tables[0].rows[3]: expected 3 cells, one per column, found 2',
      '[0].tables[0].rows[4][0]: expected a key in the first column',
      '[0].tables[0].rows[5]: duplicate "Grado" value "ordinaria"',
    ]);
  });

  it('names afterType outside the subtitle', () => {
    expect(broken((s) => (field(s, 'Natura').afterType = true))).toEqual([
      '[0].kinds[0].fields[1].afterType: "Natura" can follow the kind\'s name only in the subtitle (show "sub")',
    ]);
  });

  it('names a field with an unknown block, an empty label list, or a bad place', () => {
    const result = broken((s) => {
      minaccia(s).fields.push({ key: 'Sigillo', block: 'seal', show: 'row' } as never);
      minaccia(s).fields.push({ key: 'Condotte', block: 'stats', labels: [], show: 'row' });
      minaccia(s).fields.push({ key: 'Allarme', block: 'clock', count: { from: 'fixed', n: 0 }, show: 'side' } as never);
    });
    expect(result.map((issue) => issue.split(':')[0])).toEqual([
      '[0].kinds[0].fields[8].block',
      '[0].kinds[0].fields[9].labels',
      '[0].kinds[0].fields[10].show',
      '[0].kinds[0].fields[10].count.n',
    ]);
  });
});
