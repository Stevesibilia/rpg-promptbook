import { startCompletion } from '@codemirror/autocomplete';
import { ChangeSet, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { AdventureTemplate, TextEdit } from 'promptbook-format';
import { analyseNow, writableResult } from './analysis/field.js';
import { undoBoundary } from './cm/problems.js';
import { placeInsert, sceneAt, type Insert } from './inserts.js';
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

// Puts the cursor at `pos`, or selects `pos` to `to`, scrolls it into view
// (to the top by default) and focuses the editor.
export function jumpTo(view: EditorView, pos: number, y: 'start' | 'center' = 'start', to = pos): void {
  const length = view.state.doc.length;
  const anchor = Math.min(pos, length);
  const head = Math.min(Math.max(to, anchor), length);
  view.dispatch({
    selection: { anchor, head },
    effects: EditorView.scrollIntoView(EditorSelection.range(anchor, head), { y, yMargin: 24 }),
  });
  view.focus();
}

// Runs an insert at the cursor, from a result that is never stale. A field
// or read-aloud box the scene already has in the current text is not
// written twice: the cursor goes to it instead. False when nothing happened.
export function applyInsert(view: EditorView, what: Insert, template: AdventureTemplate): boolean {
  const { state } = view;
  const result = writableResult(state);
  if (!result) return false;
  const pos = state.selection.main.head;
  const scene = result.model.scenes[sceneAt(result.model, pos)];
  if (scene && (what.kind === 'field' || what.kind === 'readAloud')) {
    const field = what.kind === 'field' ? scene.fields.find((f) => f.known && f.label === what.label) : undefined;
    const box = what.kind === 'readAloud' ? scene.boxes.find((b) => b.id === scene.readAlouds[0]) : undefined;
    const existing = field?.range ?? box?.range;
    if (existing) {
      jumpTo(view, existing.start.offset, 'center');
      return true;
    }
  }
  const placed = placeInsert(what, { text: state.doc.toString(), model: result.model, template, pos });
  if (!placed) return false;
  write(view, [placed.edit], {
    selection: EditorSelection.single(placed.cursor),
    userEvent: 'input.insert',
    scroll: true,
  });
  view.focus();
  if (placed.complete) startCompletion(view);
  return true;
}
