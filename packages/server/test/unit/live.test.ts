import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { setDocumentText } from '../../src/live.js';

// The delta one setDocumentText makes, as a client receiving it sees it.
function deltaOf(old: string, next: string): unknown[] {
  const doc = new Y.Doc();
  const text = doc.getText('document');
  text.insert(0, old);
  let delta: unknown[] = [];
  text.observe((event) => (delta = event.delta));
  doc.transact(() => setDocumentText(doc, next));
  expect(text.toString()).toBe(next);
  return delta;
}

describe('setDocumentText', () => {
  it('keeps the common prefix and suffix and changes only what is between', () => {
    expect(deltaOf('## S1\n\nUn vecchio testo.\n\n## S2\n', '## S1\n\nUn nuovo testo.\n\n## S2\n')).toEqual([
      { retain: 10 },
      { delete: 6 },
      { insert: 'nuov' },
    ]);
  });

  it('inserts and deletes at either end', () => {
    expect(deltaOf('ab', 'abab')).toEqual([{ retain: 2 }, { insert: 'ab' }]);
    expect(deltaOf('aXb', 'ab')).toEqual([{ retain: 1 }, { delete: 1 }]);
    expect(deltaOf('testo', '')).toEqual([{ delete: 5 }]);
    expect(deltaOf('', 'testo')).toEqual([{ insert: 'testo' }]);
  });

  it('makes no change for the same text', () => {
    expect(deltaOf('uguale', 'uguale')).toEqual([]);
  });

  it('never splits a surrogate pair', () => {
    // 😀 and 😁 share their high surrogate.
    expect(deltaOf('a😀b', 'a😁b')).toEqual([{ retain: 1 }, { delete: 2 }, { insert: '😁' }]);
    // 😀 and 🙀 share their low surrogate.
    expect(deltaOf('a😀b', 'a🙀b')).toEqual([{ retain: 1 }, { delete: 2 }, { insert: '🙀' }]);
  });

  it('keeps a position held by another client after the edit', () => {
    const doc = new Y.Doc();
    const text = doc.getText('document');
    text.insert(0, 'Prima.\n\nSeconda.\n');
    const cursor = Y.createRelativePositionFromTypeIndex(text, 15);
    doc.transact(() => setDocumentText(doc, 'Prima, riscritta.\n\nSeconda.\n'));
    expect(Y.createAbsolutePositionFromRelativePosition(cursor, doc)?.index).toBe(26);
  });
});
