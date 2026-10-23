import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  addSeedVersion,
  addTodo,
  currentSeed,
  moveTodo,
  readDocument,
  readMeta,
  readTodo,
  removeTodo,
  seedVersions,
  setCampaign,
  setGdrarchive,
  setStatus,
  setTitle,
  updateTodo,
} from '../src/index.js';
import { randomId } from '../src/doc.js';
import { project, replica, sync } from './helpers.js';

const texts = (doc: Y.Doc) => readTodo(doc).map((t) => t.text);
const idOf = (doc: Y.Doc, text: string) => readTodo(doc).find((t) => t.text === text)!.id;

describe('project document', () => {
  it('holds the metadata, the to-do template, the seed and the document', () => {
    const doc = project({ seed: 'Un terremoto che apre una prigione', document: '# Testo\n' });
    expect(readMeta(doc)).toEqual({
      schema: 1,
      id: '00000000-0000-4000-8000-000000000001',
      title: "L'Ancora di Sabaoth",
      category: 'one-shot',
      status: 'draft',
      campaignId: null,
      system: 'Kulthos',
      createdAt: '2026-10-19T08:00:00.000Z',
      gdrarchive: null,
    });
    expect(texts(doc)).toEqual(['Scrivere le scene', 'Prompt Suno', 'Rilettura']);
    expect(readTodo(doc).every((t) => !t.done && t.note === '' && t.due === null)).toBe(true);
    expect(currentSeed(doc)).toBe('Un terremoto che apre una prigione');
    expect(readDocument(doc)).toBe('# Testo\n');
  });

  it('survives an encode and decode as the server stores it', () => {
    const doc = project({ seed: 'Idea' });
    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
    expect(readMeta(copy)).toEqual(readMeta(doc));
    expect(readTodo(copy)).toEqual(readTodo(doc));
    expect(seedVersions(copy)).toEqual(seedVersions(doc));
  });

  it('reads unknown values as their fallbacks', () => {
    const doc = project();
    doc.getMap('meta').set('status', 'finished');
    doc.getMap('meta').set('title', 42);
    expect(readMeta(doc).status).toBe('draft');
    expect(readMeta(doc).title).toBe('');
  });

  it('reads a missing or invalid gdrarchive link as none', () => {
    const doc = project();
    expect(readMeta(doc).gdrarchive).toBeNull();
    const url = 'https://gdrarchive.siberio.eu/campaigns/12';
    for (const value of [
      url,
      { url: 'https://gdrarchive.example.eu/campaigns/12', label: 'Kulthos' },
      { url, label: 'x'.repeat(41) },
      { url, label: 40 },
      { url },
    ]) {
      doc.getMap('meta').set('gdrarchive', value);
      expect(readMeta(doc).gdrarchive, JSON.stringify(value)).toBeNull();
    }
  });

  it('changes title, status and campaign', () => {
    const doc = project({ category: 'adventure' });
    setTitle(doc, 'Il ballo dei Lorenzetti');
    setStatus(doc, 'in-progress');
    setCampaign(doc, 'c1');
    expect(readMeta(doc)).toMatchObject({ title: 'Il ballo dei Lorenzetti', status: 'in-progress', campaignId: 'c1' });
    setCampaign(doc, null);
    expect(readMeta(doc).campaignId).toBeNull();
    expect(() => setStatus(doc, 'done' as never)).toThrow();
  });

  it('sets, changes and clears the gdrarchive link', () => {
    const doc = project({ category: 'adventure' });
    setGdrarchive(doc, { url: 'https://gdrarchive.siberio.eu/campaigns/12', label: 'Kulthos' });
    expect(readMeta(doc).gdrarchive).toEqual({ url: 'https://gdrarchive.siberio.eu/campaigns/12', label: 'Kulthos' });
    setGdrarchive(doc, { url: 'https://gdrarchive.siberio.eu/campaigns/31', label: '' });
    expect(readMeta(doc).gdrarchive).toEqual({ url: 'https://gdrarchive.siberio.eu/campaigns/31', label: '' });
    expect(replica(doc).getMap('meta').get('gdrarchive')).toEqual(readMeta(doc).gdrarchive);
    setGdrarchive(doc, null);
    expect(readMeta(doc).gdrarchive).toBeNull();
  });

  it('refuses an unnormalised gdrarchive address or a long label', () => {
    const doc = project();
    const url = 'https://gdrarchive.siberio.eu/campaigns/12';
    expect(() => setGdrarchive(doc, { url: `${url}/`, label: '' })).toThrow();
    expect(() => setGdrarchive(doc, { url: ` ${url}`, label: '' })).toThrow();
    expect(() => setGdrarchive(doc, { url: 'https://gdrarchive.siberio.eu/sessions/48', label: '' })).toThrow();
    expect(() => setGdrarchive(doc, { url, label: 'x'.repeat(41) })).toThrow();
    expect(() => setGdrarchive(doc, { url, label: ' Kulthos ' })).toThrow();
    expect(readMeta(doc).gdrarchive).toBeNull();
    setGdrarchive(doc, { url, label: 'x'.repeat(40) });
    expect(readMeta(doc).gdrarchive?.label).toHaveLength(40);
  });

  it('never puts a campaign in a campaign', () => {
    const doc = project({ category: 'campaign', campaignId: 'c1' });
    expect(readMeta(doc).campaignId).toBeNull();
    expect(() => setCampaign(doc, 'c1')).toThrow();
  });

  it('lets a campaign hold a gdrarchive link', () => {
    const doc = project({ category: 'campaign' });
    setGdrarchive(doc, { url: 'https://gdrarchive.siberio.eu/campaigns/12', label: 'Kulthos' });
    expect(readMeta(doc).gdrarchive?.label).toBe('Kulthos');
  });

  it('leaves the status alone when every item is ticked', () => {
    const doc = project();
    for (const item of readTodo(doc)) updateTodo(doc, item.id, { done: true });
    expect(readMeta(doc).status).toBe('draft');
  });

  it('adds, renames, reorders, notes, dates and removes items', () => {
    const doc = project();
    const suno = idOf(doc, 'Prompt Suno');
    addTodo(doc, 'Stampare le schede');
    addTodo(doc, 'Mappa', { after: idOf(doc, 'Scrivere le scene') });
    expect(texts(doc)).toEqual(['Scrivere le scene', 'Mappa', 'Prompt Suno', 'Rilettura', 'Stampare le schede']);
    updateTodo(doc, suno, { text: 'Prompt Suno, tre brani', note: 'uno per scena', due: '2026-10-25' });
    expect(readTodo(doc).find((t) => t.id === suno)).toMatchObject({
      text: 'Prompt Suno, tre brani',
      note: 'uno per scena',
      due: '2026-10-25',
    });
    expect(() => updateTodo(doc, suno, { due: '25/10/2026' })).toThrow();
    moveTodo(doc, idOf(doc, 'Stampare le schede'), { before: idOf(doc, 'Scrivere le scene') });
    moveTodo(doc, idOf(doc, 'Mappa'), { after: idOf(doc, 'Rilettura') });
    expect(texts(doc)).toEqual(['Stampare le schede', 'Scrivere le scene', 'Prompt Suno, tre brani', 'Rilettura', 'Mappa']);
    removeTodo(doc, idOf(doc, 'Rilettura'));
    expect(texts(doc)).toEqual(['Stampare le schede', 'Scrivere le scene', 'Prompt Suno, tre brani', 'Mappa']);
  });

  it('keeps every seed version', () => {
    const doc = project({ seed: 'Prima idea' });
    addSeedVersion(doc, 'Seconda idea', '2026-10-20T09:00:00.000Z');
    addSeedVersion(doc, 'Seconda idea', '2026-10-21T09:00:00.000Z');
    expect(seedVersions(doc)).toEqual([
      { text: 'Prima idea', at: '2026-10-19T08:00:00.000Z' },
      { text: 'Seconda idea', at: '2026-10-20T09:00:00.000Z' },
    ]);
    expect(currentSeed(doc)).toBe('Seconda idea');
  });
});

describe('concurrent edits on two documents', () => {
  it('keeps a tick in one and an add in the other', () => {
    const a = project();
    const b = replica(a);
    updateTodo(a, idOf(a, 'Prompt Suno'), { done: true });
    addTodo(b, 'Stampare le schede');
    sync(a, b);
    for (const doc of [a, b]) {
      expect(texts(doc)).toEqual(['Scrivere le scene', 'Prompt Suno', 'Rilettura', 'Stampare le schede']);
      expect(readTodo(doc).find((t) => t.text === 'Prompt Suno')!.done).toBe(true);
    }
  });

  it('keeps a rename in one and a move in the other', () => {
    const a = project();
    const b = replica(a);
    const suno = idOf(a, 'Prompt Suno');
    updateTodo(a, suno, { text: 'Prompt Suno, tre brani' });
    moveTodo(b, suno, { before: idOf(b, 'Scrivere le scene') });
    sync(a, b);
    for (const doc of [a, b]) {
      expect(texts(doc)).toEqual(['Prompt Suno, tre brani', 'Scrivere le scene', 'Rilettura']);
    }
  });

  it('keeps two fields of one item changed at once', () => {
    const a = project();
    const b = replica(a);
    const suno = idOf(a, 'Prompt Suno');
    updateTodo(a, suno, { note: 'uno per scena' });
    updateTodo(b, suno, { done: true, due: '2026-10-25' });
    sync(a, b);
    for (const doc of [a, b]) {
      expect(readTodo(doc).find((t) => t.id === suno)).toMatchObject({
        text: 'Prompt Suno',
        note: 'uno per scena',
        done: true,
        due: '2026-10-25',
      });
    }
  });

  it('orders two items added at the same place the same way on both sides', () => {
    const a = project();
    const b = replica(a);
    const first = idOf(a, 'Scrivere le scene');
    addTodo(a, 'Da A', { after: first });
    addTodo(b, 'Da B', { after: first });
    sync(a, b);
    expect(texts(a)).toEqual(texts(b));
    expect(texts(a).slice(1, 3).sort()).toEqual(['Da A', 'Da B']);
    // An insert next to the tie still finds a place.
    addTodo(a, 'Dopo', { after: readTodo(a)[1]!.id });
    expect(texts(a)).toHaveLength(6);
  });

  it('keeps both seed versions added at once', () => {
    const a = project({ seed: 'Prima' });
    const b = replica(a);
    addSeedVersion(a, 'Da A', '2026-10-20T09:00:00.000Z');
    addSeedVersion(b, 'Da B', '2026-10-20T09:00:01.000Z');
    sync(a, b);
    expect(seedVersions(a)).toEqual(seedVersions(b));
    expect(seedVersions(a).map((s) => s.text).sort()).toEqual(['Da A', 'Da B', 'Prima']);
  });
});

describe('randomId', () => {
  const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it('uses crypto.randomUUID when there is one', () => {
    expect(randomId()).toMatch(UUID4);
  });

  // A page served over plain HTTP has no crypto.randomUUID.
  it('builds a version 4 UUID from getRandomValues outside a secure context', () => {
    const real = globalThis.crypto;
    const getRandomValues = (array: Uint8Array<ArrayBuffer>) => real.getRandomValues(array);
    Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues }, configurable: true });
    try {
      const ids = new Set(Array.from({ length: 200 }, () => randomId()));
      expect(ids.size).toBe(200);
      for (const id of ids) expect(id).toMatch(UUID4);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true });
    }
  });
});
