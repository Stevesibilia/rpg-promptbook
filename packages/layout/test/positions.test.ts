import { describe, expect, it } from 'vitest';
import { blockAt, pageOf, sortPositions } from '../src/index.js';
import { position } from './helpers.js';

const positions = sortPositions([
  position('scene', 100, 2, 30, 'S1'),
  position('block', 150, 2, 200),
  // A side-column block printed higher up than the main column's.
  position('block', 300, 2, 80),
  position('block', 400, 3, 40),
  position('scene-end', 500, 3, 300, 'S1'),
  position('part', 0, 1, 30),
]);

describe('sortPositions', () => {
  it('orders by page, then from the top', () => {
    expect(positions.map((p) => p.from)).toEqual([0, 100, 300, 150, 400, 500]);
  });

  it('keeps the printed order for the same place', () => {
    const same = sortPositions([position('scene', 10, 1, 5), position('block', 20, 1, 5)]);
    expect(same.map((p) => p.kind)).toEqual(['scene', 'block']);
  });
});

describe('pageOf', () => {
  it('gives the page of the last position starting at or before the offset', () => {
    expect(pageOf(positions, 0)).toBe(1);
    expect(pageOf(positions, 120)).toBe(2);
    expect(pageOf(positions, 450)).toBe(3);
    expect(pageOf(positions, 10_000)).toBe(3);
  });

  it('gives page 1 when nothing comes before the offset', () => {
    expect(pageOf(sortPositions([position('block', 50, 2, 10)]), 10)).toBe(1);
    expect(pageOf([], 10)).toBe(1);
  });
});

describe('blockAt', () => {
  it('gives the last position on the page at or above the point', () => {
    expect(blockAt(positions, 2, 100)?.from).toBe(300);
    expect(blockAt(positions, 2, 250)?.from).toBe(150);
    expect(blockAt(positions, 3, 40)?.from).toBe(400);
  });

  it('falls back to the last position before the page', () => {
    expect(blockAt(positions, 2, 10)?.from).toBe(0);
    expect(blockAt(positions, 4, 10)?.from).toBe(500);
  });

  it('gives nothing before the first position', () => {
    expect(blockAt(positions, 1, 10)).toBeNull();
  });
});
