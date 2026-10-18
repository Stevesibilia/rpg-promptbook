import { expect } from 'vitest';
import type { Problem, Severity } from '../src/index.js';
import { parse, sample } from './helpers.js';

// The sample with one change: `from` must occur in it exactly once.
export function change(from: string, to: string, base = sample): string {
  expect(base.split(from).length - 1, `"${from}" occurs once in the base`).toBe(1);
  return base.replace(from, to);
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
