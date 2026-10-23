import { parseAdventure, templates } from 'promptbook-format';
import { describe, expect, it } from 'vitest';
import { LICENCE_MARKS, LICENCES } from '../src/licence/licences.js';

const parsed = (value: string) =>
  parseAdventure(`---\ntitolo: La casa\nlicenza: ${value}\n---\n`, { template: templates.avventura });

// Share, Change, Sell, Credit, Same licence; null does not apply.
const table: [string, (boolean | null)[]][] = [
  ['CC0-1.0', [true, true, true, false, false]],
  ['CC-BY-4.0', [true, true, true, true, false]],
  ['CC-BY-SA-4.0', [true, true, true, true, true]],
  ['CC-BY-NC-4.0', [true, true, false, true, false]],
  ['CC-BY-NC-SA-4.0', [true, true, false, true, true]],
  ['CC-BY-ND-4.0', [true, false, true, true, null]],
  ['CC-BY-NC-ND-4.0', [true, false, false, true, null]],
  ['Tutti i diritti riservati', [false, false, false, null, null]],
];

describe('the licence list', () => {
  it('has the eight entries in order, each value once', () => {
    expect(LICENCES.map((l) => l.value)).toEqual(table.map(([value]) => value));
    expect(new Set(LICENCES.map((l) => l.value)).size).toBe(8);
  });

  it('writes SPDX ids for the CC licences and free text for All rights reserved', () => {
    for (const licence of LICENCES) {
      const result = parsed(licence.value);
      expect(result.model.meta.licence).toEqual({
        text: licence.value,
        spdx: licence.value !== 'Tutti i diritti riservati',
      });
      expect(result.problems.filter((p) => p.code === 'meta.licence.unknown')).toEqual([]);
    }
  });

  it('marks each licence as the table says', () => {
    for (const [value, marks] of table) {
      const licence = LICENCES.find((l) => l.value === value)!;
      expect(LICENCE_MARKS.map((m) => licence.marks[m.key])).toEqual(marks);
    }
  });

  it('links the CC licences to their deeds, and All rights reserved to nothing', () => {
    for (const licence of LICENCES) {
      if (licence.value === 'Tutti i diritti riservati') expect(licence.url).toBeNull();
      else expect(licence.url).toMatch(/^https:\/\/creativecommons\.org\/.+\/$/);
    }
  });

  it('names the five marks in order', () => {
    expect(LICENCE_MARKS.map((m) => [m.key, m.label])).toEqual([
      ['share', 'Share'],
      ['change', 'Change'],
      ['sell', 'Sell'],
      ['credit', 'Credit'],
      ['sameLicence', 'Same licence'],
    ]);
  });
});
