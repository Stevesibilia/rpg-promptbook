// The little Markdown a seed holds: paragraphs, line breaks, **bold**,
// *italic* or _italic_, `code`. Read into plain pieces that the page draws
// as React text, so nothing in the seed is ever read as HTML.

export type Inline =
  { kind: 'text' | 'code'; text: string } | { kind: 'strong' | 'em'; children: Inline[] } | { kind: 'break' };

const TOKEN = /(`[^`\n]+`)|(\*\*(?=\S)[\s\S]*?\S\*\*)|(\*(?=\S)[^*\n]*?\S\*|\*\S\*)|(_(?=\S)[^_\n]*?\S_|_\S_)/;

export function inline(text: string): Inline[] {
  const out: Inline[] = [];
  const push = (piece: string) => {
    if (piece) out.push({ kind: 'text', text: piece });
  };
  let rest = text;
  for (;;) {
    const match = TOKEN.exec(rest);
    if (!match) break;
    const [token] = match;
    push(rest.slice(0, match.index));
    if (match[1]) out.push({ kind: 'code', text: token.slice(1, -1) });
    else if (match[2]) out.push({ kind: 'strong', children: inline(token.slice(2, -2)) });
    else out.push({ kind: 'em', children: inline(token.slice(1, -1)) });
    rest = rest.slice(match.index + token.length);
  }
  push(rest);
  return out;
}

// Paragraphs at blank lines; a single line break stays a break.
export function paragraphs(text: string): Inline[][] {
  return text
    .split(/\n[ \t]*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) =>
      p.split('\n').flatMap((line, i): Inline[] => (i === 0 ? inline(line) : [{ kind: 'break' }, ...inline(line)])),
    );
}
