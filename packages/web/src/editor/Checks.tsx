import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Severity } from 'promptbook-format';
import { analysisField } from './analysis/field.js';
import { Section, useViewValue } from './InspectorSection.js';
import { outlineOf, type OutlineItem } from './outline.js';
import type { UpdateSource } from './StatusBar.js';
import { jumpTo } from './writes.js';

interface Row {
  message: string;
  severity: Severity;
  where: string;
  from: number;
  to: number;
}

// Where a problem is: its scene, else its section or the front matter (a
// sheet's problem is placed in its section, as in the mockup), and its line.
function whereOf(items: readonly OutlineItem[], pos: number, line: number): string {
  let owner: OutlineItem | null = null;
  for (const item of items) {
    if (item.kind === 'sheet') continue;
    if (item.from <= pos && pos <= item.to && (!owner || item.depth >= owner.depth)) owner = item;
  }
  const place = owner ? (owner.kind === 'scene' ? (owner.id ?? owner.name) : owner.place) : null;
  return place ? `${place} · line ${line}` : `Line ${line}`;
}

// Every problem of the latest analysis, in document order, at its position
// in the current text.
function rowsOf(state: EditorState): Row[] {
  const value = state.field(analysisField, false);
  if (!value?.result) return [];
  const items = outlineOf(state);
  const length = state.doc.length;
  return value.result.problems
    .map((problem, i) => {
      const spot = value.spots[i] ?? { from: problem.range.start.offset, to: problem.range.end.offset };
      const from = Math.min(spot.from, length);
      const to = Math.min(Math.max(spot.to, from), length);
      return {
        message: problem.message,
        severity: problem.severity,
        where: whereOf(items, from, state.doc.lineAt(from).number),
        from,
        to,
      };
    })
    .sort((a, b) => a.from - b.from);
}

const sameRows = (a: Row[], b: Row[]) =>
  a.length === b.length &&
  a.every((r, i) => {
    const s = b[i]!;
    return (
      r.message === s.message && r.severity === s.severity && r.where === s.where && r.from === s.from && r.to === s.to
    );
  });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Checks (design decision 8): every problem with its place; a click selects
// it in the editor. An empty range selects the rest of its line.
export function Checks({
  view,
  updates,
  open,
  onToggle,
}: {
  view: EditorView | null;
  updates: UpdateSource;
  open: boolean;
  onToggle(open: boolean): void;
}) {
  const rows = useViewValue(view, updates, rowsOf, sameRows) ?? [];
  const errors = rows.filter((r) => r.severity === 'error').length;
  const warnings = rows.length - errors;

  function select(row: Row) {
    if (!view) return;
    const to = row.to > row.from ? row.to : view.state.doc.lineAt(row.from).to;
    jumpTo(view, row.from, 'center', to);
  }

  return (
    <Section
      className="checks"
      open={open}
      onToggle={onToggle}
      summary={
        <>
          Checks{' '}
          <span className="cnt">
            {rows.length === 0 ? (
              'none'
            ) : (
              <>
                {errors > 0 && <span className="d">{plural(errors, 'error')}</span>}
                {errors > 0 && warnings > 0 && ' · '}
                {warnings > 0 && <span className="a">{plural(warnings, 'warning')}</span>}
              </>
            )}
          </span>
        </>
      }
    >
      {rows.length === 0 ? (
        <p className="hint">No problems found.</p>
      ) : (
        rows.map((row, i) => (
          <button key={i} className="prob" onClick={() => select(row)}>
            <span className={`dot${row.severity === 'error' ? ' err' : ''}`} />
            <span>
              {row.message}
              <span className="where">{row.where}</span>
            </span>
          </button>
        ))
      )}
    </Section>
  );
}
