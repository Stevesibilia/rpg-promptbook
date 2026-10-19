import { expect } from 'vitest';
import type { Problem, Severity } from '../src/index.js';
import { parse, sample } from './helpers.js';

const scene2 = `### S2. La cantina

**Luogo e momento:** sotto la casa, di notte.

**In gioco:** chi scende.

**Da non perdere qui**

- [ ] La botola.

**Cosa succede da sé**

- L'acqua sale.

**Indizi qui**

- **I3.** Un graffio sul muro. (R1)

> [!leggi]
> Odore di muffa.

| Se i PG… | Allora…      |
| -------- | ------------ |
| scendono | il buio cala |

**Se deragliano:** la botola si chiude.

`;

const swaps: [string, string][] = [
  // 300 words of synopsis.
  ['**Il passato.** Qualcosa è successo.', `**Il passato.** Qualcosa è successo. ${'Il passato pesa su ogni stanza e nessuno lo nomina. '.repeat(34)}`],
  ['(I1, I2)\n', '(I1, I2, I3)\n'],
  ['| S1  | La porta | I1, I2 |\n', '| S1  | La porta | I1, I2 |\n| S2  | La cantina | I3 |\n'],
  ['| I2  | La voce      | R1          | S1   |     |\n', '| I2  | La voce      | R1          | S1   |     |\n| I3  | Il graffio   | R1          | S2   |     |\n'],
  ['## Indizi\n', `${scene2}## Indizi\n`],
  ['#### Il cane\n\nUn cane nero.\n\n', ''],
  ['mood: quiet, tense\n', 'mood: quiet, tense\n\n### S2. La cantina\n\nvisual: a flooded cellar\n\nmood: damp, close\n'],
];

// The sample made clean under the checks: a second scene to spread the
// clues over, a synopsis of the right length, no sheet nested in a sheet.
export const base = swaps.reduce((text, [from, to]) => {
  expect(text.includes(from), `"${from}" is in the sample`).toBe(true);
  return text.replace(from, to);
}, sample);

// The sample with its first `from` replaced; S1 comes before S2.
export function change(from: string, to: string, doc = base): string {
  expect(doc.includes(from), `"${from}" is in the document`).toBe(true);
  return doc.replace(from, to);
}

export interface Case {
  name: string;
  code: string;
  doc: string;
  severity: Severity;
  // The text the problem starts at (its first occurrence in the document).
  at: string;
  sceneId?: string;
  // How many problems with this code the document has; one by default.
  count?: number;
}

// Where `needle` starts, as the problem range would say it.
export function position(doc: string, needle: string) {
  const offset = doc.indexOf(needle);
  expect(offset, `"${needle}" is in the document`).toBeGreaterThanOrEqual(0);
  const before = doc.slice(0, offset);
  const line = before.split('\n').length;
  return { offset, line, column: offset - (before.lastIndexOf('\n') + 1) + 1 };
}

export function expectCase(c: Case): Problem[] {
  const { problems } = parse(c.doc);
  const found = problems.filter((p) => p.code === c.code);
  expect(found).toHaveLength(c.count ?? 1);
  const first = found[0]!;
  expect(first.severity).toBe(c.severity);
  expect(first.range.start).toEqual(position(c.doc, c.at));
  expect(first.range.end.offset).toBeGreaterThan(first.range.start.offset - 1);
  if (c.sceneId) expect(first.sceneId).toBe(c.sceneId);
  return problems;
}

export function codes(problems: Problem[]): string[] {
  return problems.map((p) => p.code);
}

export function applyEdits(text: string, edits: { from: number; to: number; insert: string }[]): string {
  return [...edits]
    .sort((a, b) => b.from - a.from)
    .reduce((out, e) => out.slice(0, e.from) + e.insert + out.slice(e.to), text);
}
