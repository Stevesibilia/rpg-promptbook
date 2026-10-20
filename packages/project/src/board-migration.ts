import * as Y from 'yjs';
import { legacyPromptId, toPromptDef } from './board.js';
import { isItem, oneOf, record } from './doc.js';
import { authors, isIsoDateTime } from './model.js';

// The migration of v0.6 boards (image-categories design decision 2): each
// scene's single image prompt, its chosen image and its images become the
// scene's prompt `legacy-<sceneId>`. Pure, idempotent, one transaction, and
// safe on every replica at once: every key it writes is one no edit writes
// (`<id>/def`, written with the same value everywhere, and `<id>/legacy`),
// so two replicas can migrate, edit before they meet, and keep every edit.
// A removed legacy prompt (its `<id>/removed`, written only by removal)
// stays removed: its legacy keys are still cleared, and the images naming
// its scene wait in the tray.
// Image files are not written: they reach `legacy-<sceneId>` by their
// sceneId. Music is not touched.

type Item = Y.Map<unknown>;

const boardOf = (doc: Y.Doc) => doc.getMap<unknown>('board');
const promptsOf = (doc: Y.Doc) => doc.getMap<unknown>('imagePrompts');
const filesOf = (doc: Y.Doc) => doc.getArray<Item>('files');

const LEGACY_KEY = /^(.+)\/(image|chosenImage)$/;

const isId = (value: unknown): value is string => typeof value === 'string' && value !== '' && !value.includes('/');

const legacyKey = (sceneId: string, half: 'image' | 'chosenImage') => `${sceneId}/${half}`;

// a is a later instant than b; false when a is not a date.
const later = (a: unknown, b: unknown): boolean =>
  isIsoDateTime(a) && (!isIsoDateTime(b) || Date.parse(a) > Date.parse(b));

// The scenes whose legacy keys are still there, and the scenes images still
// name without a prompt of their own.
function legacyScenes(doc: Y.Doc): { keys: Set<string>; images: Set<string> } {
  const keys = new Set<string>();
  for (const key of boardOf(doc).keys()) {
    const match = LEGACY_KEY.exec(key);
    if (match && isId(match[1])) keys.add(match[1]);
  }
  const images = new Set<string>();
  for (const item of filesOf(doc).toArray()) {
    if (!isItem(item) || item.get('kind') !== 'image') continue;
    const sceneId = item.get('sceneId');
    const promptId = item.get('promptId');
    if (isId(sceneId) && !(typeof promptId === 'string' && promptId !== '')) images.add(sceneId);
  }
  return { keys, images };
}

interface Legacy {
  prompt?: string;
  by?: string;
  at?: string;
  chosen?: string | null;
}

// The fields of a `legacy` value another replica wrote, typed: anything else
// in it is dropped, so a hostile value can neither throw nor be copied on.
function toLegacy(value: unknown): Legacy {
  const r = record(value);
  if (!r) return {};
  return {
    ...(typeof r.prompt === 'string'
      ? { prompt: r.prompt, by: oneOf(authors, r.by, 'user'), at: isIsoDateTime(r.at) ? r.at : '' }
      : {}),
    ...('chosen' in r ? { chosen: typeof r.chosen === 'string' && r.chosen !== '' ? r.chosen : null } : {}),
  };
}

const sameLegacy = (a: Legacy, b: Legacy) =>
  a.prompt === b.prompt && a.by === b.by && a.at === b.at && a.chosen === b.chosen && 'chosen' in a === 'chosen' in b;

const hasDef = (doc: Y.Doc, sceneId: string) =>
  toPromptDef(promptsOf(doc).get(`${legacyPromptId(sceneId)}/def`)) !== null;

const isRemoved = (doc: Y.Doc, sceneId: string) => promptsOf(doc).has(`${legacyPromptId(sceneId)}/removed`);

// A legacy key, or an image naming a scene whose legacy prompt has no def
// and was never removed.
export function needsImageMigration(doc: Y.Doc): boolean {
  const { keys, images } = legacyScenes(doc);
  return keys.size > 0 || [...images].some((sceneId) => !hasDef(doc, sceneId) && !isRemoved(doc, sceneId));
}

// True when it changed something.
export function migrateImagePrompts(doc: Y.Doc): boolean {
  if (!needsImageMigration(doc)) return false;
  let changed = false;
  doc.transact(() => {
    const board = boardOf(doc);
    const prompts = promptsOf(doc);
    const { keys, images } = legacyScenes(doc);
    for (const sceneId of new Set([...keys, ...images])) {
      const id = legacyPromptId(sceneId);
      const removed = isRemoved(doc, sceneId);
      // 1. The prompt exists, with the same def on every replica, unless it
      // was removed.
      if (!removed && !hasDef(doc, sceneId)) {
        prompts.set(`${id}/def`, { category: 'scene', sceneId });
        changed = true;
      }
      if (!keys.has(sceneId)) continue;
      if (removed) {
        for (const half of ['image', 'chosenImage'] as const) board.delete(legacyKey(sceneId, half));
        changed = true;
        continue;
      }
      const old = toLegacy(prompts.get(`${id}/legacy`));
      const next: Legacy = { ...old };
      // 2. The old text, unless the one already carried over is later.
      const image = record(board.get(legacyKey(sceneId, 'image')));
      if (image && typeof image.prompt === 'string' && !later(old.at, image.at)) {
        next.prompt = image.prompt;
        next.by = oneOf(authors, image.by, 'user');
        next.at = isIsoDateTime(image.at) ? image.at : '';
      }
      // 3. The old choice, over one made here before it: a choice another
      // replica made meanwhile survives the delete, which removes only the
      // value seen here.
      if (board.has(legacyKey(sceneId, 'chosenImage'))) {
        const chosen = board.get(legacyKey(sceneId, 'chosenImage'));
        next.chosen = typeof chosen === 'string' && chosen !== '' ? chosen : null;
        if (prompts.has(`${id}/chosen`)) prompts.delete(`${id}/chosen`);
      }
      if (!sameLegacy(next, old)) prompts.set(`${id}/legacy`, next);
      // 4. The legacy keys go.
      for (const half of ['image', 'chosenImage'] as const) board.delete(legacyKey(sceneId, half));
      changed = true;
    }
  });
  return changed;
}

// The document itself when it needs nothing, else a migrated copy in memory:
// for readers that must not write, such as a read-only connector grant or
// the export. Should the migration fail, the document is read as it is.
export function migratedView(doc: Y.Doc): Y.Doc {
  try {
    if (!needsImageMigration(doc)) return doc;
    const copy = new Y.Doc();
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
    migrateImagePrompts(copy);
    return copy;
  } catch {
    return doc;
  }
}
