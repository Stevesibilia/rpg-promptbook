import { generateKeyBetween } from 'fractional-indexing';
import * as Y from 'yjs';
import {
  isCategory,
  isStatus,
  SCHEMA,
  type Category,
  type ProjectMeta,
  type SeedVersion,
  type Status,
  type TodoItem,
} from './model.js';

// The shape of a project's Y.Doc, schema 1 (design decision 2):
//   meta      Y.Map    schema, id, title, category, status, campaignId, system, createdAt
//   document  Y.Text   the prep document, Markdown
//   todo      Y.Array  of Y.Map: id, text, done, note, due, pos
//   seed      Y.Array  of Y.Map: text, at; append-only, the last one is current
//
// To-do order lives in `pos`, never in the array's order: a move in a Y.Array
// is a delete plus an insert, which would lose a concurrent rename of the
// moved item. Changing one key merges like any other field.

type Item = Y.Map<unknown>;

const metaOf = (doc: Y.Doc) => doc.getMap<unknown>('meta');
const documentOf = (doc: Y.Doc) => doc.getText('document');
const todoOf = (doc: Y.Doc) => doc.getArray<Item>('todo');
const seedOf = (doc: Y.Doc) => doc.getArray<Item>('seed');

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
