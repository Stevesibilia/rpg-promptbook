import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  addInspirationItem,
  addLogEntry,
  addQuestionsToTodo,
  addTopic,
  isWebUrl,
  readInspiration,
  readLog,
  readNotes,
  readTodo,
  readTopics,
  removeInspirationItem,
  removeLogEntry,
  removeNote,
  removeTopic,
  sameName,
  saveNote,
  setTopicState,
  updateLogEntry,
  updateNote,
  type InspirationInput,
  type LogEntryInput,
  type NoteInput,
} from '../src/index.js';
import { project, replica, sync } from './helpers.js';

const quote = (overrides: Partial<InspirationInput> = {}): InspirationInput => ({
  kind: 'quote',
  text: 'Sotto la Sicilia ci sono tre colonne…',
  why: 'Colapesce regge l’isola',
  by: 'user',
  ...overrides,
});

const note = (overrides: Partial<NoteInput> = {}): NoteInput => ({
  topic: 'Colapesce',
  summary: 'Il pescatore che regge la Sicilia.',
  facts: ['Tre colonne'],
  sources: [{ title: 'Fiabe italiane', url: 'https://example.org/fiabe', accessed: '2026-10-19' }],
  by: 'claude',
  ...overrides,
});

const entry = (overrides: Partial<LogEntryInput> = {}): LogEntryInput => ({
  title: 'Il finale a Capo Peloro',
  ideas: ['La terza scossa'],
  decisions: ['Neri sopravvive'],
  rejected: [{ idea: 'Un drago', why: 'fuori tono' }],
  questions: ['Chi salva Neri?', 'Quando suona la sirena?'],
  by: 'claude',
  ...overrides,
});

const map = (fields: Record<string, unknown>) => {
  const item = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(fields)) item.set(key, value);
  return item;
};

describe('sameName', () => {
  it('ignores accents, case and runs of whitespace', () => {
    expect(sameName('Verità del mondo', 'verita  del MONDO ')).toBe(true);
    expect(sameName('Colapesce', 'colapesce')).toBe(true);
    expect(sameName('Torre Faro', 'Torre Faro e la canzone')).toBe(false);
  });
});

describe('isWebUrl', () => {
  it('takes http and https addresses only', () => {
    expect(isWebUrl('https://example.org/a')).toBe(true);
    expect(isWebUrl('http://example.org')).toBe(true);
    expect(isWebUrl('javascript:alert(1)')).toBe(false);
    expect(isWebUrl('ftp://example.org')).toBe(false);
    expect(isWebUrl('example.org')).toBe(false);
    expect(isWebUrl(`https://example.org/${'a'.repeat(2048)}`)).toBe(false);
  });
});

describe('an older document', () => {
  it('reads every new collection as empty and writes them without touching the rest', () => {
    const doc = project({ document: '# Testo\n' });
    const before = Y.encodeStateVector(doc);
    expect(readInspiration(doc)).toEqual([]);
    expect(readTopics(doc)).toEqual([]);
    expect(readNotes(doc)).toEqual([]);
    expect(readLog(doc)).toEqual([]);
    // Reading adds nothing to the document.
    expect(Y.encodeStateVector(doc)).toEqual(before);
  });
});

describe('sources of inspiration', () => {
  it('adds items, newest first, ties by id, and removes them', () => {
    const doc = project();
    const a = addInspirationItem(doc, quote({ at: '2026-10-19T09:00:00.000Z' }));
    const b = addInspirationItem(
      doc,
      quote({
        kind: 'link',
        text: 'Messina 1908',
        url: 'https://example.org/1908',
        by: 'claude',
        at: '2026-10-19T10:00:00.000Z',
      }),
    );
    const c = addInspirationItem(doc, quote({ kind: 'note', text: 'Una nota', at: '2026-10-19T10:00:00.000Z' }));
    const tied = [b, c].sort((x, y) => (x.id < y.id ? -1 : 1)).map((i) => i.id);
    expect(readInspiration(doc).map((i) => i.id)).toEqual([...tied, a.id]);
    expect(readInspiration(doc).find((i) => i.id === b.id)).toEqual({
      id: b.id,
      kind: 'link',
      text: 'Messina 1908',
      url: 'https://example.org/1908',
      why: 'Colapesce regge l’isola',
      by: 'claude',
      at: '2026-10-19T10:00:00.000Z',
    });
    removeInspirationItem(doc, b.id);
    removeInspirationItem(doc, 'gone');
    expect(readInspiration(doc).map((i) => i.id)).toEqual([c.id, a.id]);
  });

  it('keeps a URL only for a link or an image link', () => {
    const doc = project();
    expect(addInspirationItem(doc, quote({ url: 'https://example.org' })).url).toBe('');
    expect(addInspirationItem(doc, quote({ kind: 'image', url: 'https://example.org/a.png' })).url).toBe(
      'https://example.org/a.png',
    );
  });

  it('refuses an empty text, a long one, and a link that is not http or https', () => {
    const doc = project();
    expect(() => addInspirationItem(doc, quote({ text: '  ' }))).toThrow('text: is required');
    expect(() => addInspirationItem(doc, quote({ text: 'a'.repeat(2001) }))).toThrow('text: at most 2000');
    expect(() => addInspirationItem(doc, quote({ kind: 'link', url: 'javascript:alert(1)' }))).toThrow('url:');
    expect(() => addInspirationItem(doc, quote({ kind: 'image' }))).toThrow('url:');
    expect(readInspiration(doc)).toEqual([]);
  });

  it('reads mistyped values as their fallbacks and leaves out items with no id, no date or no map', () => {
    const doc = project();
    const array = new Y.Array<unknown>();
    doc
      .getArray('inspiration')
      .push([
        map({ id: 'x', kind: 'video', text: 42, by: 'robot', at: '2026-10-19T09:00:00.000Z' }),
        map({ kind: 'note', text: 'no id', at: '2026-10-19T09:00:00.000Z' }),
        map({ id: 'y', kind: 'note', text: 'no date', at: 'ieri' }),
        map({ id: 'z', kind: 'note', text: 'no date' }),
        'not a map' as unknown as Y.Map<unknown>,
        array as unknown as Y.Map<unknown>,
        new Y.XmlElement('p') as unknown as Y.Map<unknown>,
      ]);
    array.push(['id']);
    expect(readInspiration(doc)).toEqual([
      { id: 'x', kind: 'note', text: '', url: '', why: '', by: 'user', at: '2026-10-19T09:00:00.000Z' },
    ]);
  });

  it('reads a URL that is not http or https as none', () => {
    const doc = project();
    doc
      .getArray('inspiration')
      .push([
        map({ id: 'a', kind: 'link', text: 'A', url: 'javascript:alert(1)', at: '2026-10-19T09:00:00.000Z' }),
        map({ id: 'b', kind: 'link', text: 'B', url: 'https://example.org', at: '2026-10-19T09:00:00.000Z' }),
      ]);
    expect(readInspiration(doc).map((i) => i.url)).toEqual(['', 'https://example.org']);
  });

  it('refuses a date that is not ISO 8601', () => {
    const doc = project();
    expect(() => addInspirationItem(doc, quote({ at: '19/10/2026' }))).toThrow('at: "19/10/2026" is not an ISO 8601');
    expect(readInspiration(doc)).toEqual([]);
  });

  it('sorts by the instant, whatever the offset', () => {
    const doc = project();
    const utc = addInspirationItem(doc, quote({ at: '2026-10-19T09:30:00.000Z' }));
    const rome = addInspirationItem(doc, quote({ at: '2026-10-19T11:00:00+02:00' }));
    expect(readInspiration(doc).map((i) => i.id)).toEqual([utc.id, rome.id]);
  });

  it('takes at most 500 items, and reads only the first 500', () => {
    const doc = project();
    for (let i = 0; i < 500; i++) addInspirationItem(doc, quote({ text: `n. ${i}`, at: '2026-10-19T09:00:00.000Z' }));
    expect(() => addInspirationItem(doc, quote())).toThrow('inspiration: at most 500 items');
    doc.getArray('inspiration').push([map({ id: 'extra', kind: 'note', text: 'x', at: '2026-10-19T09:00:00.000Z' })]);
    const items = readInspiration(doc);
    expect(items).toHaveLength(500);
    expect(items.some((i) => i.id === 'extra')).toBe(false);
  });
});

describe('research topics', () => {
  it('adds topics oldest first, skipping a name already there', () => {
    const doc = project();
    const colapesce = addTopic(doc, 'Colapesce', '2026-10-19T09:00:00.000Z');
    const dialetto = addTopic(doc, ' Il dialetto messinese ', '2026-10-19T10:00:00.000Z');
    expect(addTopic(doc, 'colapésce')).toBeNull();
    expect(readTopics(doc)).toEqual([
      { id: colapesce!.id, name: 'Colapesce', state: 'open', at: '2026-10-19T09:00:00.000Z' },
      { id: dialetto!.id, name: 'Il dialetto messinese', state: 'open', at: '2026-10-19T10:00:00.000Z' },
    ]);
    expect(() => addTopic(doc, ' ')).toThrow('name: is required');
    expect(() => addTopic(doc, 'a'.repeat(201))).toThrow('name: at most 200');
    expect(() => addTopic(doc, 'Messina', 'oggi')).toThrow('at: "oggi"');
  });

  it('takes at most 200 topics', () => {
    const doc = project();
    for (let i = 0; i < 200; i++) addTopic(doc, `Tema ${i}`, '2026-10-19T09:00:00.000Z');
    expect(() => addTopic(doc, 'Uno di troppo')).toThrow('researchTopics: at most 200 items');
    // A name already there is still not an error.
    expect(addTopic(doc, 'tema 3')).toBeNull();
  });

  it('switches state and removes a topic, leaving its notes', () => {
    const doc = project();
    const topic = addTopic(doc, 'Colapesce')!;
    setTopicState(doc, topic.id, 'noted');
    expect(readTopics(doc)[0]!.state).toBe('noted');
    setTopicState(doc, topic.id, 'open');
    expect(readTopics(doc)[0]!.state).toBe('open');
    expect(() => setTopicState(doc, 'gone', 'noted')).toThrow('No research topic gone');
    saveNote(doc, note());
    removeTopic(doc, topic.id);
    expect(readTopics(doc)).toEqual([]);
    expect(readNotes(doc)).toHaveLength(1);
  });

  it('reads an unknown state as open', () => {
    const doc = project();
    doc.getArray('researchTopics').push([map({ id: 't', name: 'X', state: 'done', at: '2026-10-19T09:00:00.000Z' })]);
    expect(readTopics(doc)[0]!.state).toBe('open');
  });
});

describe('research notes', () => {
  it('creates a note and notes its topic', () => {
    const doc = project();
    addTopic(doc, 'Colapesce', '2026-10-19T09:00:00.000Z');
    addTopic(doc, 'Torre Faro', '2026-10-19T09:01:00.000Z');
    const { note: saved, created } = saveNote(doc, note({ topic: 'colapesce', at: '2026-10-19T11:00:00.000Z' }));
    expect(created).toBe(true);
    expect(readNotes(doc)).toEqual([
      {
        id: saved.id,
        topic: 'colapesce',
        summary: 'Il pescatore che regge la Sicilia.',
        facts: ['Tre colonne'],
        sources: [{ title: 'Fiabe italiane', url: 'https://example.org/fiabe', accessed: '2026-10-19' }],
        by: 'claude',
        at: '2026-10-19T11:00:00.000Z',
        editedAt: '2026-10-19T11:00:00.000Z',
      },
    ]);
    expect(readTopics(doc).map((t) => [t.name, t.state])).toEqual([
      ['Colapesce', 'noted'],
      ['Torre Faro', 'open'],
    ]);
  });

  it('updates the note whose topic has the same name, and its writer becomes its author', () => {
    const doc = project();
    const first = saveNote(doc, note({ by: 'user', at: '2026-10-19T11:00:00.000Z' })).note;
    const second = saveNote(
      doc,
      note({ topic: 'COLAPÈSCE', summary: 'Nuovo', facts: [], sources: [], at: '2026-10-19T12:00:00.000Z' }),
    );
    expect(second.created).toBe(false);
    expect(readNotes(doc)).toEqual([
      {
        ...first,
        summary: 'Nuovo',
        facts: [],
        sources: [],
        by: 'claude',
        editedAt: '2026-10-19T12:00:00.000Z',
      },
    ]);
  });

  it('never matches an empty topic', () => {
    const doc = project();
    saveNote(doc, note({ topic: '' }));
    expect(saveNote(doc, note({ topic: '' })).created).toBe(true);
    expect(readNotes(doc)).toHaveLength(2);
  });

  it('lists notes newest edit first', () => {
    const doc = project();
    const old = saveNote(doc, note({ topic: 'A', at: '2026-10-19T09:00:00.000Z' })).note;
    const recent = saveNote(doc, note({ topic: 'B', at: '2026-10-19T10:00:00.000Z' })).note;
    expect(readNotes(doc).map((n) => n.id)).toEqual([recent.id, old.id]);
    updateNote(doc, old.id, { summary: 'Rivisto' }, '2026-10-19T11:00:00.000Z');
    expect(readNotes(doc).map((n) => n.id)).toEqual([old.id, recent.id]);
  });

  it('edits the fields given, keeps the author, and notes a topic of the new name', () => {
    const doc = project();
    addTopic(doc, 'Torre Faro');
    const saved = saveNote(doc, note({ at: '2026-10-19T09:00:00.000Z' })).note;
    updateNote(doc, saved.id, { topic: 'Torre faro', facts: ['Il faro', 'La canzone'] }, '2026-10-19T10:00:00.000Z');
    expect(readNotes(doc)[0]).toEqual({
      ...saved,
      topic: 'Torre faro',
      facts: ['Il faro', 'La canzone'],
      editedAt: '2026-10-19T10:00:00.000Z',
    });
    expect(readTopics(doc)[0]!.state).toBe('noted');
    expect(() => updateNote(doc, 'gone', { summary: '' })).toThrow('No research note gone');
    removeNote(doc, saved.id);
    expect(readNotes(doc)).toEqual([]);
  });

  it('merges two clients editing different fields of one note', () => {
    const doc = project();
    const saved = saveNote(doc, note()).note;
    const other = replica(doc);
    updateNote(doc, saved.id, { summary: 'Dal primo' });
    updateNote(other, saved.id, { facts: ['Dal secondo'] });
    sync(doc, other);
    expect(readNotes(doc)[0]).toMatchObject({ summary: 'Dal primo', facts: ['Dal secondo'] });
    expect(readNotes(other)[0]).toMatchObject({ summary: 'Dal primo', facts: ['Dal secondo'] });
  });

  it('checks the limits and the sources', () => {
    const doc = project();
    const source = { title: 'S', url: 'https://example.org', accessed: '' };
    expect(() => saveNote(doc, note({ summary: 'a'.repeat(10_001) }))).toThrow('summary: at most 10000');
    expect(() => saveNote(doc, note({ topic: 'a'.repeat(201) }))).toThrow('topic: at most 200');
    expect(() => saveNote(doc, note({ facts: Array(51).fill('f') }))).toThrow('facts: at most 50 items');
    expect(() => saveNote(doc, note({ facts: ['a'.repeat(2001)] }))).toThrow('facts[0]: at most 2000');
    expect(() => saveNote(doc, note({ sources: Array(31).fill(source) }))).toThrow('sources: at most 30 items');
    expect(() => saveNote(doc, note({ sources: [{ ...source, url: 'javascript:x' }] }))).toThrow('sources[0].url');
    expect(() => saveNote(doc, note({ sources: [{ ...source, accessed: '19/10/2026' }] }))).toThrow(
      'sources[0].accessed',
    );
    expect(saveNote(doc, note({ sources: Array(30).fill(source) })).note.sources).toHaveLength(30);
    expect(() => updateNote(doc, readNotes(doc)[0]!.id, { sources: [{ ...source, url: 'x' }] })).toThrow();
  });

  it('reads a source URL that is not http or https as none', () => {
    const doc = project();
    doc
      .getArray('researchNotes')
      .push([
        map({
          id: 'n',
          topic: 'X',
          sources: [{ title: 'T', url: 'data:text/html,x' }],
          at: '2026-10-19T09:00:00.000Z',
        }),
      ]);
    expect(readNotes(doc)[0]!.sources).toEqual([{ title: 'T', url: '', accessed: '' }]);
  });

  it('takes at most 500 notes, and still updates one by its topic', () => {
    const doc = project();
    for (let i = 0; i < 500; i++) saveNote(doc, note({ topic: `Tema ${i}`, at: '2026-10-19T09:00:00.000Z' }));
    expect(() => saveNote(doc, note({ topic: 'Uno di troppo' }))).toThrow('researchNotes: at most 500 items');
    expect(saveNote(doc, note({ topic: 'tema 7' })).created).toBe(false);
    expect(() => saveNote(doc, note({ topic: 'tema 7', at: 'ora' }))).toThrow('at: "ora"');
    expect(() => updateNote(doc, readNotes(doc)[0]!.id, { summary: 'x' }, 'ora')).toThrow('at: "ora"');
  });

  it('reads mistyped lists as their fallbacks', () => {
    const doc = project();
    doc.getArray('researchNotes').push([
      map({
        id: 'n',
        topic: 'X',
        facts: ['ok', 3, null],
        sources: [{ title: 'T', url: 'https://example.org' }, 'bad', null],
        by: 'claude',
        at: '2026-10-19T09:00:00.000Z',
        editedAt: 5,
      }),
      map({ id: 'm', topic: 'senza data', at: 5 }),
    ]);
    expect(readNotes(doc)).toEqual([
      {
        id: 'n',
        topic: 'X',
        summary: '',
        facts: ['ok'],
        sources: [{ title: 'T', url: 'https://example.org', accessed: '' }],
        by: 'claude',
        at: '2026-10-19T09:00:00.000Z',
        editedAt: '2026-10-19T09:00:00.000Z',
      },
    ]);
  });
});

describe('brainstorm log', () => {
  it('adds entries newest first, edits and removes them', () => {
    const doc = project();
    const first = addLogEntry(doc, entry({ at: '2026-10-18T20:00:00.000Z' }));
    const second = addLogEntry(doc, entry({ title: 'La sirena', by: 'user', at: '2026-10-19T20:00:00.000Z' }));
    expect(readLog(doc).map((e) => e.id)).toEqual([second.id, first.id]);
    expect(readLog(doc)[1]).toEqual({ ...first, todoAdded: false });
    updateLogEntry(doc, first.id, { title: 'Il finale', rejected: [] });
    expect(readLog(doc)[1]).toMatchObject({ title: 'Il finale', rejected: [], ideas: ['La terza scossa'] });
    expect(() => updateLogEntry(doc, 'gone', { title: 'x' })).toThrow('No brainstorm entry gone');
    removeLogEntry(doc, second.id);
    expect(readLog(doc).map((e) => e.id)).toEqual([first.id]);
  });

  it('takes at most 1000 entries', () => {
    const doc = project();
    for (let i = 0; i < 1000; i++) addLogEntry(doc, entry({ at: '2026-10-19T09:00:00.000Z' }));
    expect(() => addLogEntry(doc, entry())).toThrow('brainstorm: at most 1000 items');
    expect(readLog(doc)).toHaveLength(1000);
  });

  it('checks the limits', () => {
    const doc = project();
    expect(() => addLogEntry(doc, entry({ at: '2026-10-19' }))).toThrow('at: "2026-10-19"');
    expect(() => addLogEntry(doc, entry({ title: 'a'.repeat(201) }))).toThrow('title: at most 200');
    expect(() => addLogEntry(doc, entry({ questions: Array(51).fill('q') }))).toThrow('questions: at most 50');
    expect(() => addLogEntry(doc, entry({ rejected: [{ idea: 'x', why: 'a'.repeat(2001) }] }))).toThrow(
      'rejected[0].why',
    );
    expect(readLog(doc)).toEqual([]);
  });

  it('adds the open questions to the to-do list once, in one transaction', () => {
    const doc = project();
    const added = addLogEntry(doc, entry());
    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);
    const ids = addQuestionsToTodo(doc, added.id);
    expect(transactions).toBe(1);
    expect(ids).toHaveLength(2);
    expect(readTodo(doc).map((t) => t.text)).toEqual([
      'Scrivere le scene',
      'Prompt Suno',
      'Rilettura',
      'Chi salva Neri?',
      'Quando suona la sirena?',
    ]);
    expect(readLog(doc)[0]!.todoAdded).toBe(true);
    expect(addQuestionsToTodo(doc, added.id)).toEqual([]);
    expect(readTodo(doc)).toHaveLength(5);
  });

  it('adds nothing for an entry without open questions', () => {
    const doc = project();
    const added = addLogEntry(doc, entry({ questions: [] }));
    expect(addQuestionsToTodo(doc, added.id)).toEqual([]);
    expect(readLog(doc)[0]!.todoAdded).toBe(false);
    expect(() => addQuestionsToTodo(doc, 'gone')).toThrow('No brainstorm entry gone');
  });

  it('marks the entry on every client', () => {
    const doc = project();
    const added = addLogEntry(doc, entry());
    const other = replica(doc);
    addQuestionsToTodo(doc, added.id);
    sync(doc, other);
    expect(readLog(other)[0]!.todoAdded).toBe(true);
    expect(addQuestionsToTodo(other, added.id)).toEqual([]);
  });

  it('reads mistyped values as their fallbacks', () => {
    const doc = project();
    doc.getArray('brainstorm').push([
      map({
        id: 'e',
        at: '2026-10-19T09:00:00.000Z',
        title: 'T',
        ideas: 'one',
        rejected: [{ idea: 'x' }, 7],
        todoAdded: 'yes',
        by: 'claude',
      }),
    ]);
    expect(readLog(doc)).toEqual([
      {
        id: 'e',
        at: '2026-10-19T09:00:00.000Z',
        title: 'T',
        ideas: [],
        decisions: [],
        rejected: [{ idea: 'x', why: '' }],
        questions: [],
        by: 'claude',
        todoAdded: false,
      },
    ]);
  });
});

describe('the new collections on the wire', () => {
  it('survive an encode and decode as the server stores it', () => {
    const doc = project();
    addInspirationItem(doc, quote());
    addTopic(doc, 'Colapesce');
    saveNote(doc, note());
    addLogEntry(doc, entry());
    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
    expect(readInspiration(copy)).toEqual(readInspiration(doc));
    expect(readTopics(copy)).toEqual(readTopics(doc));
    expect(readNotes(copy)).toEqual(readNotes(doc));
    expect(readLog(copy)).toEqual(readLog(doc));
  });
});
