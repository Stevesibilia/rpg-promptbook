import type * as Y from 'yjs';

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

// Makes the prep document read `next` with the smallest edit, as the
// server's live.ts does for a restore: the common prefix and suffix stay, and
// one delete and one insert change what is between, so concurrent typing
// elsewhere survives. Never splits a surrogate pair. Call it inside a
// transaction.
export function setDocumentText(doc: Y.Doc, next: string): void {
  const text = doc.getText('document');
  const old = text.toString();
  if (old === next) return;
  const max = Math.min(old.length, next.length);
  let start = 0;
  while (start < max && old.charCodeAt(start) === next.charCodeAt(start)) start++;
  if (start > 0 && isHighSurrogate(old.charCodeAt(start - 1))) start--;
  let end = 0;
  while (end < max - start && old.charCodeAt(old.length - 1 - end) === next.charCodeAt(next.length - 1 - end)) end++;
  if (end > 0 && isLowSurrogate(old.charCodeAt(old.length - end))) end--;
  const removed = old.length - start - end;
  if (removed > 0) text.delete(start, removed);
  const inserted = next.slice(start, next.length - end);
  if (inserted) text.insert(start, inserted);
}
