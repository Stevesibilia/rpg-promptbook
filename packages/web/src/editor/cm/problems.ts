import { lintGutter, setDiagnostics, type Action, type Diagnostic } from '@codemirror/lint';
import { Facet, type EditorState, type Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Problem } from 'promptbook-format';
import type { OnResult } from '../analysis/field.js';
import { fixEdits } from '../fixes.js';

// Marks the edges of one undo step: a fix is undone on its own, never with
// the typing around it.
export const undoBoundary = Facet.define<() => void>();

const STALE = 'The text changed: check the problem again';

function fixAction(problem: Problem, title: string, note: { failed: boolean; element: HTMLElement | null }): Action {
  return {
    name: title,
    apply(view: EditorView, from: number) {
      const edits = fixEdits(view.state, { code: problem.code, from, title });
      if (!edits) {
        note.failed = true;
        if (note.element) note.element.dataset.stale = STALE;
        return;
      }
      const boundaries = view.state.facet(undoBoundary);
      boundaries.forEach((stop) => stop());
      view.dispatch({ changes: edits, userEvent: 'input.fix' });
      boundaries.forEach((stop) => stop());
    },
  };
}

// One diagnostic per problem, at its range; an empty range is widened to the
// end of its line so it can be seen and hovered.
export function toDiagnostics(problems: readonly Problem[], state: EditorState): Diagnostic[] {
  const length = state.doc.length;
  return problems.map((problem) => {
    const from = Math.min(problem.range.start.offset, length);
    let to = Math.min(Math.max(problem.range.end.offset, from), length);
    if (to === from) to = state.doc.lineAt(from).to;
    const note = { failed: false, element: null as HTMLElement | null };
    return {
      from,
      to,
      severity: problem.severity,
      message: problem.message,
      renderMessage() {
        const element = document.createElement('span');
        element.textContent = problem.message;
        if (note.failed) element.dataset.stale = STALE;
        note.element = element;
        return element;
      },
      actions: (problem.fixes ?? []).map((fix) => fixAction(problem, fix.title, note)),
    };
  });
}

// Diagnostics are replaced only by a fresh result; between results the lint
// state maps the ones it has through the edits (design decision 3).
export const pushDiagnostics: OnResult = (state, result, fresh) => {
  if (!fresh) return [];
  const spec = setDiagnostics(state, toDiagnostics(result.problems, state));
  const effects = spec.effects;
  return effects === undefined ? [] : Array.isArray(effects) ? effects : [effects];
};

export const problems: Extension = [lintGutter()];
