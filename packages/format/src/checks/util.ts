import type { Fix, Range, Severity, Problem } from '../model.js';
import type { Requirement } from '../template/schema.js';

export function problem(
  code: string,
  severity: Severity,
  message: string,
  range: Range,
  extra: { sceneId?: string | undefined; fixes?: Fix[] | undefined } = {},
): Problem {
  return {
    code,
    severity,
    message,
    range,
    ...(extra.sceneId ? { sceneId: extra.sceneId } : {}),
    ...(extra.fixes ? { fixes: extra.fixes } : {}),
  };
}

// The severity a missing item has at a requirement level, null for optional.
export function missingSeverity(requirement: Requirement): Severity | null {
  return requirement === 'required' ? 'error' : requirement === 'recommended' ? 'warning' : null;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

// Words as controlla.py counts them: runs of letters and digits, with an
// apostrophe between two of them kept inside the word ("l'altro" is one).
export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}
