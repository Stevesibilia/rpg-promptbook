import { countWords, type Category } from 'promptbook-project';

// The front matter of an adventure or a one-shot: a first line `---` up to
// the next `---` or `...` line. Null when the text has none.
function frontMatterEnd(text: string): number | null {
  const first = /^---[ \t]*\r?\n/.exec(text);
  if (!first) return null;
  const close = /^(?:---|\.\.\.)[ \t]*$/m;
  const rest = text.slice(first[0].length);
  const match = close.exec(rest);
  return match ? first[0].length + match.index + match[0].length : null;
}

// Words as the server counts a snapshot's (and the project summary does):
// after the front matter for an adventure or a one-shot, the whole text for
// a campaign.
export function documentWords(text: string, category: Category): number {
  if (category === 'campaign') return countWords(text);
  const end = frontMatterEnd(text);
  return countWords(end === null ? text : text.slice(end));
}
