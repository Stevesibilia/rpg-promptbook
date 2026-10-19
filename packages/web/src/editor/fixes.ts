import type { EditorState } from '@codemirror/state';
import type { ParseResult, TextEdit } from 'promptbook-format';
import { writableResult } from './analysis/field.js';

// The fix a user chose in a problem's tooltip: the problem's code, where it
// starts now, and the fix's title.
export interface FixTarget {
  code: string;
  from: number;
  title: string;
}

// The edits to apply for a fix (design decision 5), from a result that is
// never stale: the fresh analysis, or a new parse when the text changed since
// (`parse`). Null when the problem or its fix is no longer there.
export function fixEdits(
  state: EditorState,
  { code, from, title }: FixTarget,
  parse?: (text: string) => ParseResult,
): TextEdit[] | null {
  const result = writableResult(state, parse);
  if (!result) return null;
  for (const problem of result.problems) {
    if (problem.code !== code || problem.range.start.offset !== from) continue;
    const fix = problem.fixes?.find((f) => f.title === title);
    if (fix) return fix.edits;
  }
  return null;
}
