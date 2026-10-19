import { EditorState } from '@codemirror/state';
import { skeletonDocument } from 'promptbook-project';
import { describe, expect, it, vi } from 'vitest';
import sabaoth from '../../format/fixtures/l-ancora-di-sabaoth.converted.md?raw';
import { moveScene, sceneMove } from '../src/editor/moveScene.js';
import { analysed, parse } from './analysed.js';

const apply = (text: string, edits: { from: number; to: number; insert: string }[]) =>
  EditorState.create({ doc: text }).update({ changes: edits }).state.doc.toString();

const ids = (text: string) => parse(text).model.scenes.map((s) => s.id);

// Moves the scene at `from` to `to` and returns the new text.
function moved(text: string, from: number, to: number): string {
  const move = moveScene(text, parse(text).model, from, to)!;
  expect(move).not.toBeNull();
  return apply(text, move.edits);
}

const problems = (text: string) =>
  parse(text)
    .problems.map((p) => `${p.code} ${p.message}`)
    .sort();

describe('moveScene', () => {
  it('moves S2 below S3 and back to the same bytes', () => {
    const once = moved(sabaoth, 1, 2);
    expect(ids(once)).toEqual(['S1', 'S3', 'S2', 'S4', 'S5']);
    expect(moved(once, 2, 1)).toBe(sabaoth);
  });

  it('reads back with the same scenes and no new problems', () => {
    for (const [from, to] of [
      [1, 2],
      [0, 4],
      [4, 0],
      [3, 1],
    ] as const) {
      const text = moved(sabaoth, from, to);
      const before = parse(sabaoth).model.scenes;
      const after = parse(text).model.scenes;
      expect(after.map((s) => s.heading).sort()).toEqual(before.map((s) => s.heading).sort());
      expect(problems(text)).toEqual(problems(sabaoth));
      expect(text.length).toBe(sabaoth.length);
    }
  });

  it('keeps the next section intact when the last scene moves, or a scene becomes the last', () => {
    const indizi = sabaoth.indexOf('\n\n## Indizi');
    const tail = sabaoth.slice(indizi);
    const head = sabaoth.slice(0, sabaoth.indexOf('### S1.'));

    const up = moved(sabaoth, 4, 1);
    expect(ids(up)).toEqual(['S1', 'S5', 'S2', 'S3', 'S4']);
    expect(up.endsWith(tail)).toBe(true);
    expect(up.startsWith(head)).toBe(true);
    // S4, now last, ends right before the next section's blank line.
    expect(up.slice(0, up.length - tail.length).endsWith('nasconde (I13).')).toBe(true);

    const down = moved(sabaoth, 1, 4);
    expect(ids(down)).toEqual(['S1', 'S3', 'S4', 'S5', 'S2']);
    expect(down.endsWith(tail)).toBe(true);
    expect(down.slice(0, down.length - tail.length).endsWith('o lo ha con sé.')).toBe(true);
    expect(moved(down, 4, 1)).toBe(sabaoth);
  });

  it('leaves exactly one blank line after the moved scene', () => {
    const text = '## Scene\n\n### S1. Uno\n\nTesto uno.\n\n\n\n### S2. Due\n\nTesto due.\n\n## Indizi\n';
    const once = moved(text, 0, 1);
    expect(once).toBe('## Scene\n\n### S2. Due\n\nTesto due.\n\n### S1. Uno\n\nTesto uno.\n\n## Indizi\n');
  });

  it('reports where the moved heading starts', () => {
    const move = moveScene(sabaoth, parse(sabaoth).model, 1, 3)!;
    const text = apply(sabaoth, move.edits);
    expect(text.slice(move.head, move.head + 7)).toBe('### S2.');
    expect(text.slice(move.at, move.at + move.block.to - move.block.from)).toBe(
      sabaoth.slice(move.block.from, move.block.to),
    );
  });

  it('moves nothing to the same place, out of range, or without a scenes section', () => {
    const { model } = parse(sabaoth);
    expect(moveScene(sabaoth, model, 2, 2)).toBeNull();
    expect(moveScene(sabaoth, model, 0, 5)).toBeNull();
    expect(moveScene(sabaoth, model, -1, 0)).toBeNull();
    const skeleton = skeletonDocument('adventure', {
      title: 'X',
      system: '',
      campaignTitle: null,
      author: '',
      copyright: '',
      licence: '',
    });
    expect(moveScene(skeleton, parse(skeleton).model, 0, 0)).toBeNull();
  });
});

describe('sceneMove', () => {
  const head = (text: string, id: string) => text.indexOf(`### ${id}.`);

  it('moves a scene by one place, from the fresh analysis without parsing', () => {
    const { state } = analysed(sabaoth);
    const spy = vi.fn(parse);
    const move = sceneMove(state, head(sabaoth, 'S2'), { by: 1 }, spy)!;
    expect(spy).not.toHaveBeenCalled();
    expect(ids(apply(sabaoth, move.edits))).toEqual(['S1', 'S3', 'S2', 'S4', 'S5']);
    expect(sceneMove(state, head(sabaoth, 'S1'), { by: -1 })).toBeNull();
    expect(sceneMove(state, head(sabaoth, 'S5'), { by: 1 })).toBeNull();
  });

  it('drops a scene before or after another one', () => {
    const { state } = analysed(sabaoth);
    const to = (id: string, target: string, after: boolean) =>
      ids(apply(sabaoth, sceneMove(state, head(sabaoth, id), { head: head(sabaoth, target), after })!.edits));
    expect(to('S2', 'S3', true)).toEqual(['S1', 'S3', 'S2', 'S4', 'S5']);
    expect(to('S2', 'S5', false)).toEqual(['S1', 'S3', 'S4', 'S2', 'S5']);
    expect(to('S5', 'S1', false)).toEqual(['S5', 'S1', 'S2', 'S3', 'S4']);
    expect(to('S4', 'S2', true)).toEqual(['S1', 'S2', 'S4', 'S3', 'S5']);
    expect(sceneMove(state, head(sabaoth, 'S2'), { head: head(sabaoth, 'S3'), after: false })).toBeNull();
  });

  it('parses the current text when the analysis is stale', () => {
    const { state } = analysed(sabaoth);
    const extra = '### S9. Nuova\n\nTesto.\n\n';
    const at = head(sabaoth, 'S3');
    const typed = state.update({ changes: { from: at, insert: extra } }).state;
    const text = typed.doc.toString();
    const spy = vi.fn(parse);
    const move = sceneMove(typed, head(text, 'S9'), { by: 1 }, spy)!;
    expect(spy).toHaveBeenCalledTimes(1);
    expect(ids(apply(text, move.edits))).toEqual(['S1', 'S2', 'S3', 'S9', 'S4', 'S5']);
  });

  it('moves nothing when no scene heading starts there any more', () => {
    const { state } = analysed(sabaoth);
    const at = head(sabaoth, 'S2');
    // Someone else removed S2's heading while it was being dragged.
    const gone = state.update({ changes: { from: at, to: at + 4 } }).state;
    expect(sceneMove(gone, at, { by: 1 })).toBeNull();
  });
});
