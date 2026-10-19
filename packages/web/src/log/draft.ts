import type { LogEntry, Rejected } from 'promptbook-project';

// A brainstorm entry being written by hand: its lists one item per line, a
// rejected idea with its why.

export interface EntryDraft {
  // Null for a new entry, a draft in the browser until Done.
  id: string | null;
  // When the entry was made, or now for a new one.
  at: string;
  title: string;
  ideas: string;
  decisions: string;
  rejected: Rejected[];
  questions: string;
  // The entry when the draft began, to tell a change made elsewhere.
  base: string | null;
}

export const newEntryDraft = (now: Date = new Date()): EntryDraft => ({
  id: null,
  at: now.toISOString(),
  title: '',
  ideas: '',
  decisions: '',
  rejected: [],
  questions: '',
  base: null,
});

export const entryDraftOf = (entry: LogEntry): EntryDraft => ({
  id: entry.id,
  at: entry.at,
  title: entry.title,
  ideas: entry.ideas.join('\n'),
  decisions: entry.decisions.join('\n'),
  rejected: entry.rejected.map((r) => ({ ...r })),
  questions: entry.questions.join('\n'),
  base: JSON.stringify(entry),
});

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

export interface CheckedEntry {
  title: string;
  ideas: string[];
  decisions: string[];
  rejected: Rejected[];
  questions: string[];
}

// The entry to write, or why it cannot be: an entry needs a title.
export function checkEntry(draft: EntryDraft): { ok: true; entry: CheckedEntry } | { ok: false; error: string } {
  const title = draft.title.trim();
  if (!title) return { ok: false, error: 'Give the entry a title.' };
  return {
    ok: true,
    entry: {
      title,
      ideas: lines(draft.ideas),
      decisions: lines(draft.decisions),
      rejected: draft.rejected.map((r) => ({ idea: r.idea.trim(), why: r.why.trim() })).filter((r) => r.idea !== ''),
      questions: lines(draft.questions),
    },
  };
}
