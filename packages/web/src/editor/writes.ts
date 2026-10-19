import { ChangeSet, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { TextEdit } from 'promptbook-format';
import { analyseNow } from './analysis/field.js';
import { undoBoundary } from './cm/problems.js';
import type { SceneMove } from './moveScene.js';

// One write from the panels (a move, an insert): one transaction, so one Yjs
// update and one undo step, and the text parsed again at once.
export function write(
  view: EditorView,
  edits: readonly TextEdit[],
  { selection, userEvent, scroll = false }: { selection?: EditorSelection; userEvent: string; scroll?: boolean },
): void {
  const boundaries = view.state.facet(undoBoundary);
  boundaries.forEach((stop) => stop());
  view.dispatch({
    changes: edits as TextEdit[],
    selection,
    effects: [
      analyseNow.of(null),
      ...(scroll && selection ? [EditorView.scrollIntoView(selection.main.head, { y: 'center' })] : []),
    ],
    userEvent,
  });
  boundaries.forEach((stop) => stop());
}

// Moves a scene; a cursor inside it moves with it.
export function applyMove(view: EditorView, move: SceneMove): void {
  const { state } = view;
  const changes = ChangeSet.of(move.edits, state.doc.length);
  const carry = (pos: number, assoc: -1 | 1) =>
    pos >= move.block.from && pos <= move.block.to ? move.at + (pos - move.block.from) : changes.mapPos(pos, assoc);
  const selection = EditorSelection.create(
    state.selection.ranges.map((r) => EditorSelection.range(carry(r.anchor, -1), carry(r.head, 1))),
    state.selection.mainIndex,
  );
  write(view, move.edits, { selection, userEvent: 'move.scene' });
}

// Puts the cursor at `pos`, scrolls it to the top and focuses the editor.
export function jumpTo(view: EditorView, pos: number): void {
  const at = Math.min(pos, view.state.doc.length);
  view.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'start', yMargin: 24 }) });
  view.focus();
}
