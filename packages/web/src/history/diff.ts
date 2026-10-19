import { structuredPatch } from 'diff';

// A snapshot compared with the current text (connector design decision 15):
// jsdiff's unified hunks with three lines of context, turned into the rows
// History's Compare draws.

export type DiffRow =
  | { kind: 'context' | 'add' | 'del'; old: number | null; new: number | null; text: string }
  // Before each hunk: the heading the hunk falls under, as the mockup shows.
  | { kind: 'gap'; text: string };

export interface Diff {
  rows: DiffRow[];
  added: number;
  removed: number;
}

const HEADING = /^#{1,6}\s+(.*?)\s*#*\s*$/;

// The nearest Markdown heading at or above a line (0-based), without its
// marks; null when there is none.
function headingAt(lines: readonly string[], index: number): string | null {
  for (let i = Math.min(index, lines.length - 1); i >= 0; i--) {
    const match = HEADING.exec(lines[i]!);
    if (match) return match[1]!;
  }
  return null;
}

export function diffRows(before: string, after: string, context = 3): Diff {
  const patch = structuredPatch('snapshot', 'now', before, after, undefined, undefined, { context });
  const oldLines = before.split('\n');
  const rows: DiffRow[] = [];
  let added = 0;
  let removed = 0;
  for (const hunk of patch.hunks) {
    // jsdiff's starts are 1-based, an empty side's included.
    const heading = headingAt(oldLines, Math.max(0, hunk.oldStart - 1));
    rows.push({ kind: 'gap', text: heading ? `@@ ${heading} @@` : `@@ line ${hunk.oldStart} @@` });
    let o = hunk.oldStart;
    let n = hunk.newStart;
    for (const line of hunk.lines) {
      const mark = line[0];
      const text = line.slice(1);
      if (mark === '+') {
        rows.push({ kind: 'add', old: null, new: n++, text });
        added += 1;
      } else if (mark === '-') {
        rows.push({ kind: 'del', old: o++, new: null, text });
        removed += 1;
      } else if (mark === ' ') {
        rows.push({ kind: 'context', old: o++, new: n++, text });
      }
      // «\ No newline at end of file» is not a line of either text.
    }
  }
  return { rows, added, removed };
}
