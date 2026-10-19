import { ChangeSet } from '@codemirror/state';
import type { Position } from 'promptbook-layout';
import { describe, expect, it } from 'vitest';
import { OffsetTracker } from '../src/editor/pdf/offsets.js';

const at = (from: number, page: number, y: number): Position => ({ kind: 'block', from, page, y });
const insert = (length: number, from: number, text: string) => ChangeSet.of({ from, insert: text }, length);

describe('the offsets of the build on screen', () => {
  // A text of 100 characters: S1 from 10, S2 from 50.
  const positions = [at(10, 3, 40), at(50, 4, 40)];

  it('move with the text typed since the build read it', () => {
    const tracker = new OffsetTracker();
    tracker.read(1, 100);
    tracker.change(insert(100, 20, 'x'.repeat(30)));
    expect(tracker.map(1, 50)).toBe(80);
    expect(tracker.map(1, 10)).toBe(10);
    expect(tracker.positions(1, positions).map((p) => p.from)).toEqual([10, 80]);
  });

  it('follow each request from the moment it read the text', () => {
    const tracker = new OffsetTracker();
    tracker.read(1, 100);
    tracker.change(insert(100, 0, 'aaaaa'));
    tracker.read(2, 105);
    tracker.change(insert(105, 0, 'bb'));
    expect(tracker.map(1, 50)).toBe(57);
    expect(tracker.map(2, 55)).toBe(57);
    tracker.shown(2);
    // The older request is let go.
    expect(tracker.map(1, 50)).toBe(50);
    expect(tracker.map(2, 55)).toBe(57);
  });

  it('leave offsets alone with nothing to map', () => {
    const tracker = new OffsetTracker();
    expect(tracker.map(null, 42)).toBe(42);
    tracker.read(3, 100);
    expect(tracker.positions(3, positions)).toBe(positions);
  });

  it('keep a deleted block at the place of the deletion', () => {
    const tracker = new OffsetTracker();
    tracker.read(1, 100);
    tracker.change(ChangeSet.of({ from: 40, to: 60 }, 100));
    expect(tracker.map(1, 50)).toBe(40);
  });
});
