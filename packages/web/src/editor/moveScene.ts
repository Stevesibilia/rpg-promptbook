import type { EditorState } from '@codemirror/state';
import type { Model, ParseResult, TextEdit } from 'promptbook-format';
import { writableResult } from './analysis/field.js';

export interface SceneMove {
  // In the text the model was read from, sorted, not overlapping.
  edits: TextEdit[];
  // The moved scene's text before the move, without the blank lines after it.
  block: { from: number; to: number };
  // Where that text starts once the edits are applied.
  at: number;
  // Where the moved scene's heading starts once the edits are applied.
  head: number;
}

// Moves one scene among the scenes of the `scenes` section (design decision
// 7): `from` is its index in `model.scenes`, `to` its index once moved. The
// model must have been read from `text`. A scene runs from its heading line
// to the next scene's heading, or to the end of its content for the last
// one; the moved scene ends with exactly one blank line before the scene
// after it, and the rest of the text is unchanged. Ids are not renumbered.
// Null when there is nothing to move.
export function moveScene(text: string, model: Model, from: number, to: number): SceneMove | null {
  const scenes = model.scenes;
  const n = scenes.length;
  const section = model.sections.find((s) => s.role === 'scenes');
  if (!section || from === to || from < 0 || to < 0 || from >= n || to >= n) return null;

  const lineStart = (offset: number) => text.lastIndexOf('\n', offset - 1) + 1;
  const starts = scenes.map((scene) => lineStart(scene.headingRange.start.offset));
  const sectionEnd = section.range.end.offset;
  for (let i = 0; i < n; i++) {
    if (starts[i]! < section.range.start.offset || starts[i]! >= sectionEnd) return null;
    if (i > 0 && starts[i]! <= starts[i - 1]!) return null;
  }

  // Where a scene's text ends, without the blank lines after it.
  const contentEnd = (i: number) => {
    const end = i < n - 1 ? starts[i + 1]! : sectionEnd;
    return starts[i]! + text.slice(starts[i], end).replace(/(?:\r?\n[ \t]*)+$/, '').length;
  };
  const block = text.slice(starts[from], contentEnd(from));

  // Out: with the blank lines after it, or for the last scene with the
  // blank lines before it, so its neighbours keep theirs.
  const cut: TextEdit =
    from < n - 1
      ? { from: starts[from]!, to: starts[from + 1]!, insert: '' }
      : { from: contentEnd(n - 2), to: contentEnd(n - 1), insert: '' };

  // In: before the scene that will follow it, or after the last one.
  const rest = scenes.map((_, i) => i).filter((i) => i !== from);
  const put: TextEdit =
    to < n - 1
      ? { from: starts[rest[to]!]!, to: starts[rest[to]!]!, insert: `${block}\n\n` }
      : { from: contentEnd(n - 1), to: contentEnd(n - 1), insert: `\n\n${block}` };

  const removed = cut.to - cut.from;
  const at = (put.from > cut.from ? put.from - removed : put.from) + (to < n - 1 ? 0 : 2);
  return {
    edits: put.from < cut.from ? [put, cut] : [cut, put],
    block: { from: starts[from]!, to: contentEnd(from) },
    at,
    head: at + (scenes[from]!.headingRange.start.offset - starts[from]!),
  };
}

// Where a scene goes: one place up or down, or before or after the scene
// whose heading starts at `head`.
export type MoveTarget = { by: -1 | 1 } | { head: number; after: boolean };

// The move of the scene whose heading starts at `head` in the current text,
// computed from a result that is never stale (design decision 3). Null when
// no scene starts there any more, or the target is gone or is the same place.
export function sceneMove(
  state: EditorState,
  head: number,
  target: MoveTarget,
  parse?: (text: string) => ParseResult,
): SceneMove | null {
  const result = writableResult(state, parse);
  if (!result) return null;
  const scenes = result.model.scenes;
  const index = (at: number) => scenes.findIndex((scene) => scene.headingRange.start.offset === at);
  const from = index(head);
  if (from < 0) return null;
  let to: number;
  if ('by' in target) {
    to = from + target.by;
  } else {
    const other = index(target.head);
    if (other < 0) return null;
    const slot = target.after ? other + 1 : other;
    to = slot > from ? slot - 1 : slot;
  }
  return moveScene(state.doc.toString(), result.model, from, to);
}
