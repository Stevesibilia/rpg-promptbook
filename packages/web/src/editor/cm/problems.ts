import { lintGutter, setDiagnostics, type Action, type Diagnostic } from '@codemirror/lint';
import { Facet, type EditorState, type Extension, type StateEffect } from '@codemirror/state';
import { closeHoverTooltips, type EditorView } from '@codemirror/view';
import type { ParseResult, Problem } from 'promptbook-format';
import { analysisField, isFresh, type OnResult } from '../analysis/field.js';
import { fixEdits } from '../fixes.js';
import { hiddenOf, partitionOf, setHidden, type HiddenState } from './hidden.js';

// Marks the edges of one undo step: a fix is undone on its own, never with
// the typing around it.
export const undoBoundary = Facet.define<() => void>();

// How a problem is hidden: snoozed for a day or a week, or dismissed.
export type HideAs = 'day' | 'week' | 'dismiss';

// Hides a problem of the text it was computed for (hide-problems design
// decision 14): the page's, so the tooltip, Checks and the toast share one
// Undo.
export const hideHandler = Facet.define<(problem: Problem, text: string, as: HideAs) => void>();

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

// The tooltip's hide row, after the quick fixes (design decision 8): quiet
// buttons drawn on a line of their own by editor.css, with the code after
// them as the diagnostic's source.
function hideAction(problem: Problem, text: string, name: string, as: HideAs, markClass: string): Action {
  return {
    name,
    markClass: `cm-hideAction ${markClass}`,
    apply(view: EditorView) {
      view.dispatch({ effects: closeHoverTooltips });
      view.state.facet(hideHandler).forEach((hide) => hide(problem, text, as));
    },
  };
}

// One diagnostic per problem, at its range; an empty range is widened to the
// end of its line so it can be seen and hovered. `text` is the text the
// problems were computed for, which a hide is keyed against.
export function toDiagnostics(problems: readonly Problem[], state: EditorState, text: string): Diagnostic[] {
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
      source: problem.code,
      renderMessage() {
        const element = document.createElement('span');
        element.textContent = problem.message;
        if (note.failed) element.dataset.stale = STALE;
        note.element = element;
        return element;
      },
      actions: [
        ...(problem.fixes ?? []).map((fix) => fixAction(problem, fix.title, note)),
        hideAction(problem, text, 'Snooze a week', 'week', 'cm-hideAction-snooze'),
        hideAction(problem, text, 'Dismiss', 'dismiss', 'cm-hideAction-dismiss'),
      ],
    };
  });
}

// The diagnostics of a fresh result: its shown problems only.
function diagnosticsOf(state: EditorState, result: ParseResult, hidden: HiddenState): StateEffect<unknown>[] {
  const { text, shown } = partitionOf(result, state.doc, hidden);
  const problems = shown.map((s) => s.problem);
  const spec = setDiagnostics(state, toDiagnostics(problems, state, text));
  return spec.effects === undefined ? [] : ([] as StateEffect<unknown>[]).concat(spec.effects);
}

// Diagnostics are replaced only by a fresh result; between results the lint
// state maps the ones it has through the edits (design decision 3).
export const pushDiagnostics: OnResult = (state, result, fresh) =>
  fresh ? diagnosticsOf(state, result, hiddenOf(state)) : [];

// A new hidden state, and the diagnostics rebuilt from the same result when
// it is fresh and what is shown changed; a stale one leaves the hide to the
// next result (hide-problems design decision 12). Rebuilding closes an open
// tooltip, so a change elsewhere in the map does not.
export function hiddenEffects(state: EditorState, hidden: HiddenState): StateEffect<unknown>[] {
  const effects: StateEffect<unknown>[] = [setHidden.of(hidden)];
  const result = state.field(analysisField, false)?.result;
  if (!result || !isFresh(state)) return effects;
  const before = partitionOf(result, state.doc, hiddenOf(state)).shown;
  const after = partitionOf(result, state.doc, hidden).shown;
  if (before.length === after.length && before.every((s, i) => s.index === after[i]!.index)) return effects;
  return effects.concat(diagnosticsOf(state, result, hidden));
}

export const problems: Extension = [lintGutter()];
