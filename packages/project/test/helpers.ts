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

// A file item as v0.6 wrote it: images and tracks alike name their scene, no
// promptId.
interface V06File {
  id: string;
  sha256: string;
  kind: 'image' | 'audio';
  sceneId: string | null;
  name?: string;
  addedAt?: string;
}

export function v06File(doc: Y.Doc, fields: V06File): void {
  const item = new Y.Map<unknown>();
  const image = fields.kind === 'image';
  const all = {
    thumbSha256: image ? fields.sha256.replace(/^./, 'f') : null,
    name: fields.name ?? `${fields.id}.${image ? 'png' : 'mp3'}`,
    mime: image ? 'image/png' : 'audio/mpeg',
    size: 1000,
    width: image ? 1456 : null,
    height: image ? 816 : null,
    duration: image ? null : 120,
    matchedBy: fields.sceneId === null ? null : 'prompt',
    addedAt: '2026-10-19T09:00:00.000Z',
    addedBy: 'user',
    ...fields,
  };
  for (const [k, v] of Object.entries(all)) item.set(k, v);
  doc.getArray<Y.Map<unknown>>('files').push([item]);
}
