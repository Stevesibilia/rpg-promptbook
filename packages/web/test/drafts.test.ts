import type { LogEntry, ResearchNote } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import { documentWords } from '../src/history/words.js';
import { checkEntry, entryDraftOf, newEntryDraft } from '../src/log/draft.js';
import { checkDraft, draftOf, emptyDraft } from '../src/research/draft.js';
import { inline, paragraphs } from '../src/ui/inline.js';

const note: ResearchNote = {
  id: 'n1',
  topic: 'Colapesce',
  summary: 'Nicola, detto Cola Pesce.',
  facts: ['Il re è Federico II.'],
  sources: [{ title: 'Colapesce', url: 'https://it.wikipedia.org/wiki/Colapesce', accessed: '2026-10-12' }],
  by: 'claude',
  at: '2026-10-12T10:00:00.000Z',
  editedAt: '2026-10-12T10:00:00.000Z',
};

describe('a research note by hand', () => {
  it('refuses an empty topic and a topic another note has', () => {
    expect(checkDraft({ ...emptyDraft(), topic: '  ' }, [note])).toEqual({
      ok: false,
      error: 'Give the note a topic.',
    });
    expect(checkDraft({ ...emptyDraft(), topic: 'colapésce' }, [note])).toEqual({
      ok: false,
      error: 'A note on «Colapesce» exists already.',
      other: note,
    });
  });

  it('lets a note keep its own topic', () => {
    expect(checkDraft(draftOf(note), [note])).toEqual({
      ok: true,
      note: { topic: 'Colapesce', summary: note.summary, facts: note.facts, sources: note.sources },
    });
  });

  it('refuses a source that is not http or https, and drops empty ones', () => {
    const draft = {
      ...emptyDraft(),
      topic: 'Torre Faro',
      sources: [{ title: 'x', url: 'javascript:alert(1)', accessed: '' }],
    };
    expect(checkDraft(draft, [])).toEqual({ ok: false, error: 'A source needs an http or https address: «x».' });
    const checked = checkDraft(
      {
        ...emptyDraft(),
        topic: ' Torre Faro ',
        facts: 'uno\n\n  due ',
        sources: [
          { title: '', url: '', accessed: '' },
          { title: '', url: 'https://example.org/a', accessed: 'ieri' },
        ],
      },
      [],
    );
    expect(checked).toEqual({
      ok: true,
      note: {
        topic: 'Torre Faro',
        summary: '',
        facts: ['uno', 'due'],
        sources: [{ title: 'https://example.org/a', url: 'https://example.org/a', accessed: '' }],
      },
    });
  });
});

describe('a brainstorm entry by hand', () => {
  const entry: LogEntry = {
    id: 'e1',
    at: '2026-10-15T21:40:00.000Z',
    title: 'Il finale a Capo Peloro',
    ideas: ['La canzone torna nel finale.'],
    decisions: [],
    rejected: [{ idea: 'Un quarto PG.', why: 'Troppo lungo.' }],
    questions: ["Come si distrugge l'Ancora?"],
    by: 'user',
    todoAdded: false,
  };

  it('refuses an entry without a title', () => {
    expect(checkEntry(newEntryDraft(new Date(2026, 9, 19)))).toEqual({ ok: false, error: 'Give the entry a title.' });
  });

  it('reads one item per line and drops rejected ideas left empty', () => {
    const draft = {
      ...entryDraftOf(entry),
      questions: 'Uno?\n\nDue?',
      rejected: [...entry.rejected, { idea: ' ', why: 'x' }],
    };
    expect(checkEntry(draft)).toEqual({
      ok: true,
      entry: {
        title: entry.title,
        ideas: entry.ideas,
        decisions: [],
        rejected: entry.rejected,
        questions: ['Uno?', 'Due?'],
      },
    });
  });
});

describe('words of a snapshot', () => {
  it('counts after the front matter, except in a campaign', () => {
    const text = '---\ntitolo: Il porto\nsistema: Kulthos\n---\n\n## Scene\n\nLa casa cede.';
    expect(documentWords(text, 'one-shot')).toBe(4);
    expect(documentWords(text, 'campaign')).toBe(9);
    expect(documentWords('Senza front matter qui', 'adventure')).toBe(4);
  });
});

describe('the seed’s Markdown', () => {
  it('reads bold, italic and code as pieces, never as markup', () => {
    expect(inline('Il **terremoto di Messina** e *Sabaoth* `x` <b>no</b>')).toEqual([
      { kind: 'text', text: 'Il ' },
      { kind: 'strong', children: [{ kind: 'text', text: 'terremoto di Messina' }] },
      { kind: 'text', text: ' e ' },
      { kind: 'em', children: [{ kind: 'text', text: 'Sabaoth' }] },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'x' },
      { kind: 'text', text: ' <b>no</b>' },
    ]);
  });

  it('splits paragraphs at blank lines and keeps line breaks', () => {
    expect(paragraphs('uno\ndue\n\n  \ntre')).toEqual([
      [{ kind: 'text', text: 'uno' }, { kind: 'break' }, { kind: 'text', text: 'due' }],
      [{ kind: 'text', text: 'tre' }],
    ]);
    expect(inline('2 * 3 * 4')).toEqual([{ kind: 'text', text: '2 * 3 * 4' }]);
  });
});
