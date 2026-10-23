import type { Text } from '@codemirror/state';
import type { TextEdit } from 'promptbook-format';
import { frontMatterOf, KEY, type FrontMatter } from './cm/preview.js';

// The front matter's `licenza`, read and written for the licence pane
// (licence-pane design decisions 6 and 13). Pure, so it is tested without a
// browser.

const INDENTED = /^[ \t]/;
const BLOCK = /^[|>][+-]?\d*$/;

interface Entry {
  // The key's line number, and the last line of its value.
  line: number;
  last: number;
}

// The last line of the value that starts on `line`: the indented lines after
// it, and blank lines between them, up to the closing fence.
function lastLine(doc: Text, fm: FrontMatter, line: number): number {
  let last = line;
  for (let n = line + 1; n < fm.close; n++) {
    const text = doc.line(n).text;
    if (INDENTED.test(text) && text.trim()) last = n;
    else if (text.trim()) break;
  }
  return last;
}

// The first top-level `key:` line between the fences.
function entryOf(doc: Text, fm: FrontMatter, key: string): Entry | null {
  for (let n = fm.open + 1; n < fm.close; n++) {
    if (KEY.exec(doc.line(n).text)?.[1] === key) return { line: n, last: lastLine(doc, fm, n) };
  }
  return null;
}

// The edits that make the front matter read `licenza: <value>`: the value
// of an existing line replaced, its other lines removed; else a line added
// after `copyright:`, else last; else a front matter of its own.
export function licenceEdits(doc: Text, value: string): TextEdit[] {
  const fm = frontMatterOf(doc);
  if (!fm) return [{ from: 0, to: 0, insert: `---\nlicenza: ${value}\n---\n` }];
  const entry = entryOf(doc, fm, 'licenza');
  if (entry) {
    const line = doc.line(entry.line);
    const from = line.from + KEY.exec(line.text)![0].length;
    const to = doc.line(entry.last).to;
    const insert = ` ${value}`;
    return doc.sliceString(from, to) === insert ? [] : [{ from, to, insert }];
  }
  const copyright = entryOf(doc, fm, 'copyright');
  if (copyright) {
    const at = doc.line(copyright.last).to;
    return [{ from: at, to: at, insert: `\nlicenza: ${value}` }];
  }
  const at = doc.line(fm.close).from;
  return [{ from: at, to: at, insert: `licenza: ${value}\n` }];
}

// The value of `licenza`, as the pane compares it: trimmed, without one pair
// of surrounding quotes; a value on several lines joined by spaces, without
// its block indicator. Empty when there is none.
export function currentLicence(doc: Text): string {
  const fm = frontMatterOf(doc);
  const entry = fm && entryOf(doc, fm, 'licenza');
  if (!entry) return '';
  const line = doc.line(entry.line);
  const first = line.text.slice(KEY.exec(line.text)![0].length).trim();
  const parts = BLOCK.test(first) ? [] : [first];
  for (let n = entry.line + 1; n <= entry.last; n++) parts.push(doc.line(n).text.trim());
  const text = parts.filter(Boolean).join(' ');
  const quoted = /^(["'])(.*)\1$/.exec(text);
  return quoted ? quoted[2]! : text;
}
