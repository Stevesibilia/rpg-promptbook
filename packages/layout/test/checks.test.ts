import { describe, expect, it } from 'vitest';
import { layoutChecks, type Position } from '../src/index.js';
import { position } from './helpers.js';

const a4 = { width: 595.28, height: 841.89 };
const pages = Array.from({ length: 14 }, () => a4);

// A scene from `first` to `last` page, ending `y` points down its last page.
function scene(id: string, from: number, first: number, last: number, y: number): Position[] {
  return [position('scene', from, first, 34, id), position('scene-end', from + 50, last, y, id)];
}

describe('layoutChecks', () => {
  it('finds a scene that leaves half of its last page empty', () => {
    const checks = layoutChecks([...scene('S1', 0, 6, 6, 700), ...scene('S2', 100, 7, 7, 300), ...scene('S3', 200, 8, 8, 600)], pages);
    expect(checks).toEqual([
      { message: 'Half of page 7 is empty: S2 ends early', where: 'S2 · page 7', page: 7, sceneId: 'S2' },
    ]);
  });

  it('leaves alone a short scene followed on the same page', () => {
    const positions = [...scene('S1', 0, 6, 6, 300), ...scene('S2', 100, 6, 7, 700)];
    expect(layoutChecks(positions, pages)).toEqual([]);
  });

  it('leaves alone the last scene', () => {
    expect(layoutChecks(scene('S1', 0, 6, 6, 200), pages)).toEqual([]);
  });

  it('finds a scene running to three pages or more', () => {
    const positions = [
      ...scene('S1', 0, 3, 3, 700),
      ...scene('S2', 100, 4, 5, 700),
      ...scene('S5', 200, 10, 12, 700),
    ];
    expect(layoutChecks(positions, pages)).toEqual([
      {
        message: 'S5 runs to 3 pages (the others take 1–2)',
        where: 'S5 · pages 10–12',
        page: 10,
        sceneId: 'S5',
      },
    ]);
  });

  it('gives one number when the other scenes are as long', () => {
    const positions = [...scene('S1', 0, 3, 3, 700), ...scene('S2', 100, 4, 4, 700), ...scene('S3', 200, 5, 8, 700)];
    expect(layoutChecks(positions, pages)[0]?.message).toBe('S3 runs to 4 pages (the others take 1)');
  });
});
