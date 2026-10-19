import { readFileSync } from 'node:fs';
import * as Y from 'yjs';
import { createProjectDoc, type ProjectInput } from '../src/index.js';

export const fixture = (name: string): string =>
  readFileSync(new URL(`../../format/fixtures/${name}`, import.meta.url), 'utf8');

export function project(overrides: Partial<ProjectInput> = {}): Y.Doc {
  return createProjectDoc({
    id: '00000000-0000-4000-8000-000000000001',
    title: "L'Ancora di Sabaoth",
    category: 'one-shot',
    status: 'draft',
    campaignId: null,
    system: 'Kulthos',
    todo: ['Scrivere le scene', 'Prompt Suno', 'Rilettura'],
    document: '',
    createdAt: '2026-10-19T08:00:00.000Z',
    ...overrides,
  });
}

// A second client holding the same document.
export function replica(doc: Y.Doc): Y.Doc {
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  return copy;
}

// Exchanges what each side is missing, as the sync server would.
export function sync(a: Y.Doc, b: Y.Doc): void {
  const toB = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
  const toA = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
  Y.applyUpdate(b, toB);
  Y.applyUpdate(a, toA);
}
