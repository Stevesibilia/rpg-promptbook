import { generateKeyBetween } from 'fractional-indexing';
import * as Y from 'yjs';
import {
  authors,
  CAPS,
  inspirationKinds,
  isCategory,
  isIsoDateTime,
  isStatus,
  isWebUrl,
  LIMITS,
  SCHEMA,
  topicStates,
  type Author,
  type Category,
  type InspirationItem,
  type InspirationKind,
  type LogEntry,
  type ProjectMeta,
  type Rejected,
  type ResearchNote,
  type ResearchTopic,
  type SeedVersion,
  type Source,
  type Status,
  type TodoItem,
  type TopicState,
} from './model.js';

// The shape of a project's Y.Doc, schema 1 (design decision 2):
//   meta      Y.Map    schema, id, title, category, status, campaignId, system, createdAt
//   document  Y.Text   the prep document, Markdown
//   todo      Y.Array  of Y.Map: id, text, done, note, due, pos
//   seed      Y.Array  of Y.Map: text, at; append-only, the last one is current
//
// and, from the connector change (its design decision 2), each a Y.Array of
// Y.Map ordered by date, never by position:
//   inspiration     id, kind, text, url, why, by, at
//   researchTopics  id, name, state, at
//   researchNotes   id, topic, summary, facts, sources, by, at, editedAt
//   brainstorm      id, at, title, ideas, decisions, rejected, questions, by, todoAdded
// Lists inside an item (facts, sources, ideas…) are plain JSON values set as a
// whole. The schema stays 1: an older client leaves these types untouched,
// and an older document reads them as empty.
//
// To-do order lives in `pos`, never in the array's order: a move in a Y.Array
// is a delete plus an insert, which would lose a concurrent rename of the
// moved item. Changing one key merges like any other field.

type Item = Y.Map<unknown>;

const metaOf = (doc: Y.Doc) => doc.getMap<unknown>('meta');
const documentOf = (doc: Y.Doc) => doc.getText('document');
const todoOf = (doc: Y.Doc) => doc.getArray<Item>('todo');
const seedOf = (doc: Y.Doc) => doc.getArray<Item>('seed');
const inspirationOf = (doc: Y.Doc) => doc.getArray<Item>('inspiration');
const topicsOf = (doc: Y.Doc) => doc.getArray<Item>('researchTopics');
const notesOf = (doc: Y.Doc) => doc.getArray<Item>('researchNotes');
const logOf = (doc: Y.Doc) => doc.getArray<Item>('brainstorm');

// Available in browsers, Node and Electron alike; typed here because the
// package compiles without DOM or Node types.
const randomId = (): string => (globalThis as unknown as { crypto: { randomUUID(): string } }).crypto.randomUUID();

const DUE = /^\d{4}-\d{2}-\d{2}$/;

export interface ProjectInput {
  id: string;
  title: string;
  category: Category;
  status: Status;
  campaignId: string | null;
  system: string;
  seed?: string;
  // Item texts, in order.
  todo: string[];
  document: string;
  // ISO date-time; now when not given.
  createdAt?: string;
}

export function createProjectDoc(input: ProjectInput): Y.Doc {
  if (!isCategory(input.category)) throw new Error(`Unknown category "${String(input.category)}"`);
  if (!isStatus(input.status)) throw new Error(`Unknown status "${String(input.status)}"`);
  const doc = new Y.Doc();
  const createdAt = input.createdAt ?? new Date().toISOString();
  doc.transact(() => {
    const meta = metaOf(doc);
    meta.set('schema', SCHEMA);
    meta.set('id', input.id);
    meta.set('title', input.title);
    meta.set('category', input.category);
    meta.set('status', input.status);
    meta.set('campaignId', input.category === 'campaign' ? null : input.campaignId);
    meta.set('system', input.system);
    meta.set('createdAt', createdAt);
    documentOf(doc).insert(0, input.document);
    let pos: string | null = null;
    const items = input.todo.map((text) => {
      pos = generateKeyBetween(pos, null);
      return newItem({ id: randomId(), text, done: false, note: '', due: null, pos });
    });
    todoOf(doc).push(items);
    if (input.seed?.trim()) seedOf(doc).push([seedVersion(input.seed, createdAt)]);
  });
  return doc;
}

// Readers. Values written by another client are not trusted to have the right
// type: each one falls back to its empty value, and an unknown status reads
// as draft.

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

export function readMeta(doc: Y.Doc): ProjectMeta {
  const meta = metaOf(doc);
  const category = meta.get('category');
  const status = meta.get('status');
  const campaignId = meta.get('campaignId');
  const schema = meta.get('schema');
  return {
    schema: typeof schema === 'number' ? schema : SCHEMA,
    id: str(meta.get('id')),
    title: str(meta.get('title')),
    // The UI never changes a category; a value from elsewhere reads as an
    // adventure rather than breaking every reader.
    category: isCategory(category) ? category : 'adventure',
    status: isStatus(status) ? status : 'draft',
    campaignId: typeof campaignId === 'string' && campaignId ? campaignId : null,
    system: str(meta.get('system')),
    createdAt: str(meta.get('createdAt')),
  };
}

export const readDocument = (doc: Y.Doc): string => documentOf(doc).toString();

const compareTodo = (a: { pos: string; id: string }, b: { pos: string; id: string }) =>
  a.pos < b.pos ? -1 : a.pos > b.pos ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

function toTodo(item: Item): TodoItem {
  const due = item.get('due');
  return {
    id: str(item.get('id')),
    text: str(item.get('text')),
    done: item.get('done') === true,
    note: str(item.get('note')),
    due: typeof due === 'string' && DUE.test(due) ? due : null,
    pos: str(item.get('pos')),
  };
}

export function readTodo(doc: Y.Doc): TodoItem[] {
  return todoOf(doc).toArray().map(toTodo).sort(compareTodo);
}

export function seedVersions(doc: Y.Doc): SeedVersion[] {
  return seedOf(doc)
    .toArray()
    .map((item) => ({ text: str(item.get('text')), at: str(item.get('at')) }));
}

export function currentSeed(doc: Y.Doc): string {
  return seedVersions(doc).at(-1)?.text ?? '';
}

// Writers, each one transaction.

export function setTitle(doc: Y.Doc, title: string): void {
  doc.transact(() => metaOf(doc).set('title', title));
}

export function setStatus(doc: Y.Doc, status: Status): void {
  if (!isStatus(status)) throw new Error(`Unknown status "${String(status)}"`);
  doc.transact(() => metaOf(doc).set('status', status));
}

// Null makes the project stand-alone. A campaign never belongs to one.
export function setCampaign(doc: Y.Doc, campaignId: string | null): void {
  if (campaignId !== null && readMeta(doc).category === 'campaign') {
    throw new Error('A campaign cannot belong to a campaign');
  }
  doc.transact(() => metaOf(doc).set('campaignId', campaignId));
}

function newItem(todo: TodoItem): Item {
  const item: Item = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(todo)) item.set(key, value);
  return item;
}

function findItem(doc: Y.Doc, id: string): { item: Item; index: number } | null {
  const items = todoOf(doc).toArray();
  const index = items.findIndex((item) => item.get('id') === id);
  return index === -1 ? null : { item: items[index]!, index };
}

// A key for a place in the sorted list. Two clients adding at the same place
// at once can give two items the same pos; the id then orders them, and a
// later insert next to them looks past the tie instead of failing.
function keyAt(sorted: TodoItem[], place: { before?: string; after?: string }): string {
  if (place.after !== undefined) {
    const index = sorted.findIndex((t) => t.id === place.after);
    if (index === -1) throw new Error(`No to-do item ${place.after}`);
    const lower = sorted[index]!.pos;
    const upper = sorted.slice(index + 1).find((t) => t.pos > lower)?.pos ?? null;
    return generateKeyBetween(lower, upper);
  }
  if (place.before !== undefined) {
    const index = sorted.findIndex((t) => t.id === place.before);
    if (index === -1) throw new Error(`No to-do item ${place.before}`);
    const upper = sorted[index]!.pos;
    const lower = sorted.slice(0, index).findLast((t) => t.pos < upper)?.pos ?? null;
    return generateKeyBetween(lower, upper);
  }
  return generateKeyBetween(sorted.at(-1)?.pos ?? null, null);
}

// Adds an item at the end, or right after another one. Returns its id.
export function addTodo(doc: Y.Doc, text: string, options: { after?: string } = {}): string {
  const id = randomId();
  doc.transact(() => {
    const pos = keyAt(readTodo(doc), options.after !== undefined ? { after: options.after } : {});
    todoOf(doc).push([newItem({ id, text, done: false, note: '', due: null, pos })]);
  });
  return id;
}

export type TodoPatch = Partial<Pick<TodoItem, 'text' | 'done' | 'note' | 'due'>>;

// Sets only the fields given, so a concurrent change to another field of the
// same item survives.
export function updateTodo(doc: Y.Doc, id: string, patch: TodoPatch): void {
  if (patch.due != null && !DUE.test(patch.due)) throw new Error(`Due date "${patch.due}" is not YYYY-MM-DD`);
  doc.transact(() => {
    const found = findItem(doc, id);
    if (!found) throw new Error(`No to-do item ${id}`);
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined && found.item.get(key) !== value) found.item.set(key, value);
    }
  });
}

// Moves an item right before or right after another one, by changing its pos.
export function moveTodo(doc: Y.Doc, id: string, place: { before?: string; after?: string }): void {
  if (place.before === undefined && place.after === undefined) throw new Error('moveTodo needs before or after');
  if (place.before === id || place.after === id) return;
  doc.transact(() => {
    const found = findItem(doc, id);
    if (!found) throw new Error(`No to-do item ${id}`);
    const others = readTodo(doc).filter((t) => t.id !== id);
    found.item.set('pos', keyAt(others, place));
  });
}

export function removeTodo(doc: Y.Doc, id: string): void {
  doc.transact(() => {
    const found = findItem(doc, id);
    if (found) todoOf(doc).delete(found.index, 1);
  });
}

function seedVersion(text: string, at: string): Item {
  const item: Item = new Y.Map<unknown>();
  item.set('text', text);
  item.set('at', at);
  return item;
}

// Adds a version; earlier ones are never rewritten. A text equal to the
// current seed adds nothing.
export function addSeedVersion(doc: Y.Doc, text: string, at: string = new Date().toISOString()): void {
  if (text === currentSeed(doc) && seedOf(doc).length > 0) return;
  doc.transact(() => seedOf(doc).push([seedVersion(text, at)]));
}

// Inspiration, research and the brainstorm log (connector design decision 2).

const nowIso = () => new Date().toISOString();

// The comparison for topic names and section targets: accents, case and
// runs of whitespace do not count.
export function sameName(a: string, b: string): boolean {
  return normalName(a) === normalName(b);
}

const normalName = (name: string) =>
  name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  typeof value === 'string' && (values as readonly string[]).includes(value) ? (value as T) : fallback;

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

// A URL that is not http or https reads as none, whoever wrote it.
const webUrl = (value: unknown): string => (typeof value === 'string' && isWebUrl(value) ? value : '');

const sourcesOf = (value: unknown): Source[] =>
  Array.isArray(value)
    ? value.flatMap((v) => {
        const r = record(v);
        return r ? [{ title: str(r.title), url: webUrl(r.url), accessed: str(r.accessed) }] : [];
      })
    : [];

const rejectedOf = (value: unknown): Rejected[] =>
  Array.isArray(value)
    ? value.flatMap((v) => {
        const r = record(v);
        return r ? [{ idea: str(r.idea), why: str(r.why) }] : [];
      })
    : [];

// Newest first, or oldest first, by the instant (dates may carry an offset);
// ties by id.
const byDate =
  <T extends { id: string }>(date: (item: T) => string, newest: boolean) =>
  (a: T, b: T): number => {
    const da = Date.parse(date(a));
    const db = Date.parse(date(b));
    if (da !== db) return (da < db ? -1 : 1) * (newest ? -1 : 1);
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };

// Another client may have put anything in an array; a map is told by its get
// and set, not by instanceof, which a second copy of yjs in a bundle would
// defeat. A Y.Array or a Y.XmlElement has a get but no set.
const isItem = (value: unknown): value is Item =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Item).get === 'function' &&
  typeof (value as Item).set === 'function';

// The items a reader shows: maps with a string id and an ISO date, the first
// `cap` of them in the array. Anything else was not written by a Promptbook
// client and is left out; every other value falls back to its empty value.
function validItems(array: Y.Array<Item>, cap: number): Item[] {
  return array
    .toArray()
    .filter((item) => isItem(item) && typeof item.get('id') === 'string' && isIsoDateTime(item.get('at')))
    .slice(0, cap);
}

function readItems<T>(array: Y.Array<Item>, cap: number, read: (item: Item) => T): T[] {
  return validItems(array, cap).map(read);
}

function findIn(array: Y.Array<Item>, id: string): { item: Item; index: number } | null {
  const items = array.toArray();
  const index = items.findIndex((item) => isItem(item) && item.get('id') === id);
  return index === -1 ? null : { item: items[index]!, index };
}

function removeFrom(doc: Y.Doc, array: Y.Array<Item>, id: string): void {
  doc.transact(() => {
    const found = findIn(array, id);
    if (found) array.delete(found.index, 1);
  });
}

function mapOf(fields: Record<string, unknown>): Item {
  const item: Item = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(fields)) item.set(key, value);
  return item;
}

// Sets only the fields that changed, so a concurrent edit of another field of
// the same item survives. Lists are compared by value.
function patchItem(item: Item, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const old = item.get(key);
    const same = typeof value === 'object' ? JSON.stringify(old) === JSON.stringify(value) : old === value;
    if (!same) item.set(key, value);
  }
}

// The checks every writer runs (design decision 2). They throw: the callers,
// the server's tool schemas and the web's forms, check first.

function checkText(field: string, value: string, max: number, { required = false } = {}): void {
  if (required && value.trim() === '') throw new Error(`${field}: is required`);
  if (value.length > max) throw new Error(`${field}: at most ${max} characters`);
}

function checkList(field: string, values: readonly string[], max = LIMITS.text): void {
  if (values.length > LIMITS.list) throw new Error(`${field}: at most ${LIMITS.list} items`);
  values.forEach((value, i) => checkText(`${field}[${i}]`, value, max));
}

function checkUrl(field: string, value: string): void {
  if (!isWebUrl(value))
    throw new Error(`${field}: must be an http or https address of at most ${LIMITS.url} characters`);
}

function checkSources(sources: readonly Source[]): void {
  if (sources.length > LIMITS.sources) throw new Error(`sources: at most ${LIMITS.sources} items`);
  sources.forEach((source, i) => {
    checkText(`sources[${i}].title`, source.title, LIMITS.name);
    checkUrl(`sources[${i}].url`, source.url);
    if (source.accessed !== '' && !DUE.test(source.accessed)) {
      throw new Error(`sources[${i}].accessed: must be YYYY-MM-DD`);
    }
  });
}

function checkAt(at: string): void {
  if (!isIsoDateTime(at)) throw new Error(`at: "${at}" is not an ISO 8601 date-time`);
}

function checkCap(array: Y.Array<Item>, cap: number, name: string): void {
  if (validItems(array, Infinity).length >= cap) throw new Error(`${name}: at most ${cap} items`);
}

function checkRejected(rejected: readonly Rejected[]): void {
  if (rejected.length > LIMITS.list) throw new Error(`rejected: at most ${LIMITS.list} items`);
  rejected.forEach((r, i) => {
    checkText(`rejected[${i}].idea`, r.idea, LIMITS.text);
    checkText(`rejected[${i}].why`, r.why, LIMITS.text);
  });
}

const copySources = (sources: readonly Source[]): Source[] =>
  sources.map(({ title, url, accessed }) => ({ title, url, accessed }));
const copyRejected = (rejected: readonly Rejected[]): Rejected[] => rejected.map(({ idea, why }) => ({ idea, why }));

// Sources of inspiration, newest first.

function toInspiration(item: Item): InspirationItem {
  return {
    id: str(item.get('id')),
    kind: oneOf(inspirationKinds, item.get('kind'), 'note'),
    text: str(item.get('text')),
    url: webUrl(item.get('url')),
    why: str(item.get('why')),
    by: oneOf(authors, item.get('by'), 'user'),
    at: str(item.get('at')),
  };
}

export function readInspiration(doc: Y.Doc): InspirationItem[] {
  return readItems(inspirationOf(doc), CAPS.inspiration, toInspiration).sort(byDate((i) => i.at, true));
}

export interface InspirationInput {
  kind: InspirationKind;
  text: string;
  // Required for a link or an image, ignored for the other kinds.
  url?: string;
  why: string;
  by: Author;
  at?: string;
}

export function addInspirationItem(doc: Y.Doc, input: InspirationInput): InspirationItem {
  if (!(inspirationKinds as readonly string[]).includes(input.kind)) throw new Error(`Unknown kind "${input.kind}"`);
  checkText('text', input.text, LIMITS.text, { required: true });
  checkText('why', input.why, LIMITS.text);
  const linked = input.kind === 'link' || input.kind === 'image';
  if (linked) checkUrl('url', input.url ?? '');
  const item: InspirationItem = {
    id: randomId(),
    kind: input.kind,
    text: input.text,
    url: linked ? input.url! : '',
    why: input.why,
    by: oneOf(authors, input.by, 'user'),
    at: input.at ?? nowIso(),
  };
  checkAt(item.at);
  doc.transact(() => {
    checkCap(inspirationOf(doc), CAPS.inspiration, 'inspiration');
    inspirationOf(doc).push([mapOf({ ...item })]);
  });
  return item;
}

export function removeInspirationItem(doc: Y.Doc, id: string): void {
  removeFrom(doc, inspirationOf(doc), id);
}

// Research topics, oldest first.

function toTopic(item: Item): ResearchTopic {
  return {
    id: str(item.get('id')),
    name: str(item.get('name')),
    state: oneOf(topicStates, item.get('state'), 'open'),
    at: str(item.get('at')),
  };
}

export function readTopics(doc: Y.Doc): ResearchTopic[] {
  return readItems(topicsOf(doc), CAPS.topics, toTopic).sort(byDate((t) => t.at, false));
}

// A new topic to research; null when a topic of the same name is there.
export function addTopic(doc: Y.Doc, name: string, at: string = nowIso()): ResearchTopic | null {
  checkText('name', name, LIMITS.name, { required: true });
  checkAt(at);
  let topic: ResearchTopic | null = null;
  doc.transact(() => {
    if (readTopics(doc).some((t) => sameName(t.name, name))) return;
    checkCap(topicsOf(doc), CAPS.topics, 'researchTopics');
    const added: ResearchTopic = { id: randomId(), name: name.trim(), state: 'open', at };
    topicsOf(doc).push([mapOf({ ...added })]);
    topic = added;
  });
  return topic as ResearchTopic | null;
}

export function setTopicState(doc: Y.Doc, id: string, state: TopicState): void {
  if (!(topicStates as readonly string[]).includes(state)) throw new Error(`Unknown topic state "${String(state)}"`);
  doc.transact(() => {
    const found = findIn(topicsOf(doc), id);
    if (!found) throw new Error(`No research topic ${id}`);
    patchItem(found.item, { state });
  });
}

// Removes the topic only; its notes stay.
export function removeTopic(doc: Y.Doc, id: string): void {
  removeFrom(doc, topicsOf(doc), id);
}

// Every topic of that name is noted once a note on it is saved.
function noteTopic(doc: Y.Doc, topic: string): void {
  if (topic.trim() === '') return;
  for (const item of topicsOf(doc).toArray()) {
    if (isItem(item) && sameName(str(item.get('name')), topic)) patchItem(item, { state: 'noted' });
  }
}

// Research notes, newest edit first.

function toNote(item: Item): ResearchNote {
  const at = str(item.get('at'));
  const editedAt = item.get('editedAt');
  return {
    id: str(item.get('id')),
    topic: str(item.get('topic')),
    summary: str(item.get('summary')),
    facts: strings(item.get('facts')),
    sources: sourcesOf(item.get('sources')),
    by: oneOf(authors, item.get('by'), 'user'),
    at,
    // A note never edited, or edited by a client that wrote no date, reads as
    // edited when it was made.
    editedAt: isIsoDateTime(editedAt) ? editedAt : at,
  };
}

export function readNotes(doc: Y.Doc): ResearchNote[] {
  return readItems(notesOf(doc), CAPS.notes, toNote).sort(byDate((n) => n.editedAt, true));
}

export interface NoteInput {
  topic: string;
  summary: string;
  facts: string[];
  sources: Source[];
  by: Author;
  at?: string;
}

function checkNote(note: Partial<Omit<NoteInput, 'by' | 'at'>>): void {
  if (note.topic !== undefined) checkText('topic', note.topic, LIMITS.name);
  if (note.summary !== undefined) checkText('summary', note.summary, LIMITS.summary);
  if (note.facts !== undefined) checkList('facts', note.facts);
  if (note.sources !== undefined) checkSources(note.sources);
}

// Creates a note, or replaces the summary, facts and sources of the note whose
// topic has the same name; the writer becomes its author. Either way the
// topics of that name are noted. An empty topic never matches.
export function saveNote(doc: Y.Doc, input: NoteInput): { note: ResearchNote; created: boolean } {
  checkNote(input);
  const at = input.at ?? nowIso();
  checkAt(at);
  const by = oneOf(authors, input.by, 'user');
  const fields = { summary: input.summary, facts: [...input.facts], sources: copySources(input.sources), by };
  let result!: { note: ResearchNote; created: boolean };
  doc.transact(() => {
    const match = input.topic.trim() === '' ? undefined : readNotes(doc).find((n) => sameName(n.topic, input.topic));
    const found = match && findIn(notesOf(doc), match.id);
    if (found) {
      patchItem(found.item, { ...fields, editedAt: at });
      result = { note: toNote(found.item), created: false };
    } else {
      checkCap(notesOf(doc), CAPS.notes, 'researchNotes');
      const item = mapOf({ id: randomId(), topic: input.topic, ...fields, at, editedAt: at });
      notesOf(doc).push([item]);
      result = { note: toNote(item), created: true };
    }
    noteTopic(doc, input.topic);
  });
  return result;
}

export type NotePatch = Partial<Pick<ResearchNote, 'topic' | 'summary' | 'facts' | 'sources'>>;

// Sets the fields given and the edit date; the author stays. A topic of the
// note's name is noted.
export function updateNote(doc: Y.Doc, id: string, patch: NotePatch, at: string = nowIso()): void {
  checkNote(patch);
  checkAt(at);
  doc.transact(() => {
    const found = findIn(notesOf(doc), id);
    if (!found) throw new Error(`No research note ${id}`);
    patchItem(found.item, {
      topic: patch.topic,
      summary: patch.summary,
      facts: patch.facts && [...patch.facts],
      sources: patch.sources && copySources(patch.sources),
    });
    found.item.set('editedAt', at);
    noteTopic(doc, str(found.item.get('topic')));
  });
}

export function removeNote(doc: Y.Doc, id: string): void {
  removeFrom(doc, notesOf(doc), id);
}

// The brainstorm log, newest first.

function toLogEntry(item: Item): LogEntry {
  return {
    id: str(item.get('id')),
    at: str(item.get('at')),
    title: str(item.get('title')),
    ideas: strings(item.get('ideas')),
    decisions: strings(item.get('decisions')),
    rejected: rejectedOf(item.get('rejected')),
    questions: strings(item.get('questions')),
    by: oneOf(authors, item.get('by'), 'user'),
    todoAdded: item.get('todoAdded') === true,
  };
}

export function readLog(doc: Y.Doc): LogEntry[] {
  return readItems(logOf(doc), CAPS.brainstorm, toLogEntry).sort(byDate((e) => e.at, true));
}

export interface LogEntryInput {
  title: string;
  ideas: string[];
  decisions: string[];
  rejected: Rejected[];
  questions: string[];
  by: Author;
  at?: string;
}

function checkLogEntry(entry: Partial<Omit<LogEntryInput, 'by' | 'at'>>): void {
  if (entry.title !== undefined) checkText('title', entry.title, LIMITS.name);
  if (entry.ideas !== undefined) checkList('ideas', entry.ideas);
  if (entry.decisions !== undefined) checkList('decisions', entry.decisions);
  if (entry.rejected !== undefined) checkRejected(entry.rejected);
  if (entry.questions !== undefined) checkList('questions', entry.questions);
}

export function addLogEntry(doc: Y.Doc, input: LogEntryInput): LogEntry {
  checkLogEntry(input);
  const entry: LogEntry = {
    id: randomId(),
    at: input.at ?? nowIso(),
    title: input.title,
    ideas: [...input.ideas],
    decisions: [...input.decisions],
    rejected: copyRejected(input.rejected),
    questions: [...input.questions],
    by: oneOf(authors, input.by, 'user'),
    todoAdded: false,
  };
  checkAt(entry.at);
  doc.transact(() => {
    checkCap(logOf(doc), CAPS.brainstorm, 'brainstorm');
    logOf(doc).push([mapOf({ ...entry })]);
  });
  return entry;
}

export type LogEntryPatch = Partial<Pick<LogEntry, 'title' | 'ideas' | 'decisions' | 'rejected' | 'questions'>>;

export function updateLogEntry(doc: Y.Doc, id: string, patch: LogEntryPatch): void {
  checkLogEntry(patch);
  doc.transact(() => {
    const found = findIn(logOf(doc), id);
    if (!found) throw new Error(`No brainstorm entry ${id}`);
    patchItem(found.item, {
      title: patch.title,
      ideas: patch.ideas && [...patch.ideas],
      decisions: patch.decisions && [...patch.decisions],
      rejected: patch.rejected && copyRejected(patch.rejected),
      questions: patch.questions && [...patch.questions],
    });
  });
}

export function removeLogEntry(doc: Y.Doc, id: string): void {
  removeFrom(doc, logOf(doc), id);
}

// One to-do item per open question of the entry, at the end of the list, and
// the entry marked, in one transaction. Answers the new items' ids; nothing
// when the entry is already marked or has no open questions.
export function addQuestionsToTodo(doc: Y.Doc, entryId: string): string[] {
  const ids: string[] = [];
  doc.transact(() => {
    const found = findIn(logOf(doc), entryId);
    if (!found) throw new Error(`No brainstorm entry ${entryId}`);
    const entry = toLogEntry(found.item);
    if (entry.todoAdded) return;
    const questions = entry.questions.filter((q) => q.trim() !== '');
    if (questions.length === 0) return;
    for (const text of questions) ids.push(addTodo(doc, text));
    found.item.set('todoAdded', true);
  });
  return ids;
}
