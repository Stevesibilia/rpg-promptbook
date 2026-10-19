import { isWebUrl, sameName, type ResearchNote, type Source } from 'promptbook-project';

// A research note being written by hand, as the Research view's Edit holds
// it, and the checks Done runs before the writers' own.

export interface SourceDraft {
  title: string;
  url: string;
  // YYYY-MM-DD or ''.
  accessed: string;
}

export interface NoteDraft {
  // Null for a new note, a draft in the browser until Done.
  id: string | null;
  topic: string;
  summary: string;
  // One fact per line.
  facts: string;
  sources: SourceDraft[];
  // The note's edit date when the draft began, to tell a change made
  // elsewhere meanwhile.
  base: string | null;
}

export const emptyDraft = (): NoteDraft => ({ id: null, topic: '', summary: '', facts: '', sources: [], base: null });

export const draftOf = (note: ResearchNote): NoteDraft => ({
  id: note.id,
  topic: note.topic,
  summary: note.summary,
  facts: note.facts.join('\n'),
  sources: note.sources.map((s) => ({ ...s })),
  base: note.editedAt,
});

export interface CheckedNote {
  topic: string;
  summary: string;
  facts: string[];
  sources: Source[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// The note to write, or why it cannot be: an empty topic, a topic another
// note has (one note per topic, so a hand edit never overwrites another
// note through the topic match), a source without an http or https address.
export function checkDraft(
  draft: NoteDraft,
  notes: readonly ResearchNote[],
): { ok: true; note: CheckedNote } | { ok: false; error: string; other?: ResearchNote } {
  const topic = draft.topic.trim();
  if (!topic) return { ok: false, error: 'Give the note a topic.' };
  const other = notes.find((n) => n.id !== draft.id && sameName(n.topic, topic));
  if (other) return { ok: false, error: `A note on «${other.topic}» exists already.`, other };
  const sources: Source[] = [];
  for (const s of draft.sources) {
    const url = s.url.trim();
    const title = s.title.trim();
    if (!url && !title) continue;
    if (!isWebUrl(url)) return { ok: false, error: `A source needs an http or https address: «${title || url}».` };
    sources.push({ title: title || url, url, accessed: DAY.test(s.accessed) ? s.accessed : '' });
  }
  const facts = draft.facts
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
  return { ok: true, note: { topic, summary: draft.summary.trim(), facts, sources } };
}
