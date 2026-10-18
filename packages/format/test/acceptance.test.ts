import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convertNote } from '../src/index.js';
import { parse } from './helpers.js';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

const summary = (problems: { code: string; severity: string; sceneId?: string }[]) =>
  problems.map((p) => `${p.severity} ${p.code}${p.sceneId ? ` ${p.sceneId}` : ''}`);

describe('the template example, esempio.md', () => {
  const result = convertNote(fixture('esempio.md'));

  it('converts and parses with no errors', () => {
    expect(result.report.counts).toEqual({ frontMatter: 1, callout: 6, threat: 5, comment: 1 });
    expect(result.report.notices).toEqual([]);
    expect(result.report.problems.filter((p) => p.severity === 'error')).toEqual([]);
    // What the example itself still carries: Sabaoth cited in S5 outside
    // «Chi c'è», and the Avatar written inside Salvi's sheet.
    expect(summary(result.report.problems)).toEqual(['warning ref.threat.outside S5', 'warning sheet.nested-threat']);
  });
});

describe('L\'Ancora di Sabaoth', () => {
  const original = fixture('l-ancora-di-sabaoth.md');
  const converted = fixture('l-ancora-di-sabaoth.converted.md');
  const result = convertNote(original);

  it('converts to the golden file, which converts to itself', () => {
    expect(result.text).toBe(converted);
    expect(convertNote(converted).edits).toEqual([]);
  });

  it('reports the field unknown in S5 and the threat nested in Salvi\'s sheet', () => {
    expect(result.report.counts).toEqual({ frontMatter: 1, callout: 6, threat: 5, comment: 0 });
    expect(result.report.notices).toEqual([]);
    expect(summary(result.report.problems)).toEqual([
      'error section.missing',
      'warning limit.preamble.words',
      'warning ref.threat.outside S5',
      'error scene.field.unknown S5',
      'warning sheet.nested-threat',
    ]);
    const unknown = result.report.problems.find((p) => p.code === 'scene.field.unknown')!;
    expect(unknown.message).toContain('"Se il tempo stringe"');
    const nested = result.report.problems.find((p) => p.code === 'sheet.nested-threat')!;
    expect(nested.message).toContain('"Dottor Umberto Salvi" holds "Avatar di Sabaoth"');
  });

  it('parses the converted text in under 50 ms', () => {
    const time = () => {
      const start = performance.now();
      parse(converted);
      return performance.now() - start;
    };
    const cold = time();
    const runs = Array.from({ length: 20 }, time).sort((a, b) => a - b);
    const median = runs[runs.length >> 1]!;
    const max = runs.at(-1)!;
    console.log(
      `Parsing the converted Sabaoth: first run ${cold.toFixed(1)} ms, then median ${median.toFixed(1)} ms, slowest ${max.toFixed(1)} ms over ${runs.length} runs.`,
    );
    expect(median).toBeLessThan(50);
  });
});
