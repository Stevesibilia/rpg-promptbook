import { parseAdventure, type AppendixRow } from 'promptbook-format';
import type * as Y from 'yjs';
import { checkAt, checkText, isItem, mapOf, nowIso, oneOf, randomId, readDocument, readMeta, record, str } from './doc.js';
import { matchKey } from './match.js';
import { authors, CAPS, isIsoDateTime, LIMITS, type Author } from './model.js';
import { adventureTemplateOf } from './template.js';

// The images and music board (asset-board design decisions 1 and 2): the
// music prompts and choices per scene in the `board` map, the image prompts
// in four categories in the `imagePrompts` map (image-categories design
// decision 1), the images and tracks in the `files` array. Rows and statuses
// are derived, never stored.

type Item = Y.Map<unknown>;

const boardOf = (doc: Y.Doc) => doc.getMap<unknown>('board');
const promptsOf = (doc: Y.Doc) => doc.getMap<unknown>('imagePrompts');
const filesOf = (doc: Y.Doc) => doc.getArray<Item>('files');

export const fileKinds = ['image', 'audio'] as const;
export type FileKind = (typeof fileKinds)[number];

export const matchedBy = ['prompt', 'title', 'hand'] as const;
export type MatchedBy = (typeof matchedBy)[number];

export const imageCategories = ['scene', 'pc', 'npc', 'handout'] as const;
export type ImageCategory = (typeof imageCategories)[number];

// The categories whose prompts have a name and no scene.
export type NamedCategory = Exclude<ImageCategory, 'scene'>;
export const namedCategories = ['pc', 'npc', 'handout'] as const satisfies readonly NamedCategory[];

export interface ImagePromptEntry {
  id: string;
  category: ImageCategory;
  // Set for a scene prompt, null for the others.
  sceneId: string | null;
  // Set for a pc, npc or handout prompt, null for a scene prompt.
  name: string | null;
  // '' for a migrated prompt that had images and no text.
  prompt: string;
  by: Author;
  // ISO date-time; '' when unknown.
  at: string;
  order: number;
  // An image of this prompt; null when none is chosen.
  chosenFileId: string | null;
}

export interface MusicPrompt {
  title: string;
  style: string;
  lyrics: string;
  by: Author;
  // ISO date-time.
  at: string;
}

export interface BoardEntry {
  music: MusicPrompt | null;
  // A file id; null when none is chosen.
  chosenTrack: string | null;
}

export interface FileEntry {
  id: string;
  // Lower-case hex: the name of the bytes in the file stores.
  sha256: string;
  // The thumbnail's bytes; null for a track.
  thumbSha256: string | null;
  name: string;
  kind: FileKind;
  mime: string;
  // Bytes.
  size: number;
  // Pixels; null for a track.
  width: number | null;
  height: number | null;
  // Seconds; null for an image.
  duration: number | null;
  // A track's scene; always null for an image. Null: waiting in the
  // Unmatched tray.
  sceneId: string | null;
  // An image's prompt; always null for a track. Null: waiting in the
  // Unmatched tray.
  promptId: string | null;
  matchedBy: MatchedBy | null;
  // ISO date-time.
  addedAt: string;
  addedBy: Author;
}

export type NewFile = Omit<FileEntry, 'id' | 'addedAt'> & { addedAt?: string };

const SHA256 = /^[0-9a-f]{64}$/;

export const isSha256 = (value: unknown): value is string => typeof value === 'string' && SHA256.test(value);

const halves = ['music', 'chosenTrack'] as const;
type Half = (typeof halves)[number];

// `<sceneId>/image` and `<sceneId>/chosenImage` are the board's legacy keys,
// read only by the migration (board-migration.ts).
const KEY = /^(.+)\/(music|chosenTrack)$/;

const keyOf = (sceneId: string, half: Half) => `${sceneId}/${half}`;

const isId = (value: unknown): value is string => typeof value === 'string' && value !== '' && !value.includes('/');

function checkScene(sceneId: string): void {
  if (!isId(sceneId)) throw new Error(`sceneId: "${sceneId}" is not a scene id`);
}

function checkPromptId(promptId: string): void {
  if (!isId(promptId)) throw new Error(`promptId: "${promptId}" is not a prompt id`);
}

function checkName(name: string): void {
  checkText('name', name, LIMITS.name, { required: true });
  if (/[\r\n]/.test(name)) throw new Error('name: must be one line');
}

// The prompt a migrated scene's images and choice belong to.
export const legacyPromptId = (sceneId: string) => `legacy-${sceneId}`;

// Readers. As in doc.ts, nothing another client wrote is trusted: a file
// without a string id, a valid sha256 or a known kind is left out, and every
// other value falls back to its empty value.

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

const nullableStr = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

function toMusic(value: unknown): MusicPrompt | null {
  const r = record(value);
  if (!r) return null;
  return {
    title: str(r.title),
    style: str(r.style),
    lyrics: str(r.lyrics),
    by: oneOf(authors, r.by, 'user'),
    at: isIsoDateTime(r.at) ? r.at : '',
  };
}

// The prompt an image belongs to: its own promptId, else, as v0.6 wrote it,
// the legacy prompt of its scene.
function promptIdOf(item: Item): string | null {
  const own = nullableStr(item.get('promptId'));
  if (own !== null) return own;
  const sceneId = nullableStr(item.get('sceneId'));
  return sceneId === null ? null : legacyPromptId(sceneId);
}

function toFile(item: Item): FileEntry {
  const kind = item.get('kind') as FileKind;
  const image = kind === 'image';
  const matched = item.get('matchedBy');
  return {
    id: item.get('id') as string,
    sha256: item.get('sha256') as string,
    thumbSha256: image && isSha256(item.get('thumbSha256')) ? (item.get('thumbSha256') as string) : null,
    name: str(item.get('name')),
    kind,
    mime: str(item.get('mime')),
    size: num(item.get('size')) ?? 0,
    width: image ? num(item.get('width')) : null,
    height: image ? num(item.get('height')) : null,
    duration: image ? null : num(item.get('duration')),
    sceneId: image ? null : nullableStr(item.get('sceneId')),
    promptId: image ? promptIdOf(item) : null,
    matchedBy: typeof matched === 'string' && (matchedBy as readonly string[]).includes(matched) ? (matched as MatchedBy) : null,
    addedAt: str(item.get('addedAt')),
    addedBy: oneOf(authors, item.get('addedBy'), 'user'),
  };
}

const isFile = (item: unknown): item is Item =>
  isItem(item) &&
  typeof item.get('id') === 'string' &&
  isSha256(item.get('sha256')) &&
  (fileKinds as readonly unknown[]).includes(item.get('kind'));

// The first CAPS.files valid items of the array.
const validFiles = (doc: Y.Doc): Item[] => filesOf(doc).toArray().filter(isFile).slice(0, CAPS.files);

const byAdded = (a: FileEntry, b: FileEntry): number => {
  const da = Date.parse(a.addedAt) || 0;
  const db = Date.parse(b.addedAt) || 0;
  if (da !== db) return da < db ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

// Every file and thumbnail hash the document names, whatever the item's
// kind and past CAPS.files: what the file stores must keep for it, read so
// that a newer client's kinds keep their bytes too.
export function fileHashes(doc: Y.Doc): Set<string> {
  const hashes = new Set<string>();
  for (const item of filesOf(doc).toArray()) {
    if (!isItem(item)) continue;
    for (const key of ['sha256', 'thumbSha256']) {
      const value = item.get(key);
      if (isSha256(value)) hashes.add(value);
    }
  }
  return hashes;
}

// Oldest first, ties by id.
export function readFiles(doc: Y.Doc): FileEntry[] {
  return validFiles(doc).map(toFile).sort(byAdded);
}

// Every scene the board has a music key for. A chosen id that names no track
// of that scene reads as null.
export function readBoard(doc: Y.Doc): Map<string, BoardEntry> {
  const files = readFiles(doc);
  const owns = (sceneId: string, id: unknown): string | null =>
    typeof id === 'string' && files.some((f) => f.id === id && f.sceneId === sceneId && f.kind === 'audio') ? id : null;
  const board = new Map<string, BoardEntry>();
  for (const [key, value] of boardOf(doc).entries()) {
    const match = KEY.exec(key);
    if (!match) continue;
    const sceneId = match[1]!;
    const entry = board.get(sceneId) ?? { music: null, chosenTrack: null };
    if (match[2] === 'music') entry.music = toMusic(value);
    else entry.chosenTrack = owns(sceneId, value);
    board.set(sceneId, entry);
  }
  return board;
}

// Image prompts (image-categories design decision 1). Each prompt's fields
// sit under flat keys "<id>/<part>", so a migration and an edit never write
// the same key and two edits of different fields merge.

const PROMPT_KEY = /^([^/]+)\/(def|prompt|name|order|chosen|legacy|removed)$/;
type PromptPart = 'def' | 'prompt' | 'name' | 'order' | 'chosen' | 'legacy' | 'removed';

const partKey = (id: string, part: PromptPart) => `${id}/${part}`;

interface PromptDef {
  category: ImageCategory;
  sceneId: string | null;
}

// A def with an unknown category, or a scene prompt without a scene id,
// reads as no prompt.
export function toPromptDef(value: unknown): PromptDef | null {
  const r = record(value);
  if (!r || !(imageCategories as readonly unknown[]).includes(r.category)) return null;
  const category = r.category as ImageCategory;
  if (category !== 'scene') return { category, sceneId: null };
  return isId(r.sceneId) ? { category, sceneId: r.sceneId } : null;
}

interface PromptText {
  prompt: string;
  by: Author;
  at: string;
}

function toText(value: unknown): PromptText | null {
  const r = record(value);
  if (!r) return null;
  return { prompt: str(r.prompt), by: oneOf(authors, r.by, 'user'), at: isIsoDateTime(r.at) ? r.at : '' };
}

// `prompt` or `legacy`, whichever has the later date; `prompt` on a tie or
// when either date is unknown.
function textOf(prompt: PromptText | null, legacy: PromptText | null): PromptText | null {
  if (!legacy) return prompt;
  if (!prompt) return legacy;
  const later = legacy.at !== '' && prompt.at !== '' && Date.parse(legacy.at) > Date.parse(prompt.at);
  return later ? legacy : prompt;
}

// The choice as stored: `chosen` when the key is present, else the one the
// migration carried over from v0.6.
function storedChoice(map: Y.Map<unknown>, id: string): string | null {
  const value = map.has(partKey(id, 'chosen')) ? map.get(partKey(id, 'chosen')) : record(map.get(partKey(id, 'legacy')))?.chosen;
  return typeof value === 'string' && value !== '' ? value : null;
}

const byOrder = (a: ImagePromptEntry, b: ImagePromptEntry): number =>
  a.order !== b.order ? a.order - b.order : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

// Every valid prompt, past the cap too, ordered by order then id. Keys of an
// id with no valid def, or removed, are left alone and never shown.
function allPrompts(doc: Y.Doc, files: readonly FileEntry[]): ImagePromptEntry[] {
  const map = promptsOf(doc);
  const parts = new Map<string, Partial<Record<PromptPart, unknown>>>();
  for (const [key, value] of map.entries()) {
    const match = PROMPT_KEY.exec(key);
    if (!match) continue;
    const entry = parts.get(match[1]!) ?? {};
    entry[match[2] as PromptPart] = value;
    parts.set(match[1]!, entry);
  }
  const prompts: ImagePromptEntry[] = [];
  for (const [id, p] of parts) {
    const def = toPromptDef(p.def);
    if (!def || 'removed' in p) continue;
    const text = textOf(toText(p.prompt), toText(p.legacy));
    const chosen = storedChoice(map, id);
    prompts.push({
      id,
      category: def.category,
      sceneId: def.sceneId,
      name: def.category === 'scene' ? null : str(p.name),
      prompt: text?.prompt ?? '',
      by: text?.by ?? 'user',
      at: text?.at ?? '',
      order: typeof p.order === 'number' && Number.isFinite(p.order) ? p.order : 0,
      chosenFileId: files.some((f) => f.id === chosen && f.kind === 'image' && f.promptId === id) ? chosen : null,
    });
  }
  return prompts.sort(byOrder);
}

// The first CAPS.imagePrompts prompts, ordered by order then id.
export function readImagePrompts(doc: Y.Doc): ImagePromptEntry[] {
  return allPrompts(doc, readFiles(doc)).slice(0, CAPS.imagePrompts);
}

// A prompt's def, while the prompt exists: not removed.
const validDef = (doc: Y.Doc, id: string): PromptDef | null =>
  isId(id) && !promptsOf(doc).has(partKey(id, 'removed')) ? toPromptDef(promptsOf(doc).get(partKey(id, 'def'))) : null;

// The date a writer gives an edited text: never earlier than the migrated
// text's, which may come from a clock running ahead, so that the edit always
// reads as the text (a tie reads as `prompt`).
function editedAt(doc: Y.Doc, id: string, at: string): string {
  const legacy = toText(promptsOf(doc).get(partKey(id, 'legacy')));
  return legacy && legacy.at !== '' && Date.parse(legacy.at) > Date.parse(at) ? legacy.at : at;
}

// Writers, each one transaction. They check the limits of LIMITS and throw;
// the callers check first.

export interface ImagePromptInput {
  category: ImageCategory;
  // A scene prompt's scene; left out for the others.
  sceneId?: string | null;
  // A pc, npc or handout prompt's name; left out for a scene prompt.
  name?: string | null;
  prompt: string;
}

// Appends a prompt to its scene or category: 1 + the largest order there, so
// a migrated prompt 1, which has none, stays first.
function createPrompt(doc: Y.Doc, input: ImagePromptInput, by: Author, at: string): ImagePromptEntry {
  const prompts = allPrompts(doc, readFiles(doc));
  if (prompts.length >= CAPS.imagePrompts) throw new Error(`imagePrompts: at most ${CAPS.imagePrompts} items`);
  const sceneId = input.category === 'scene' ? input.sceneId! : null;
  const siblings = prompts.filter((p) => p.category === input.category && p.sceneId === sceneId);
  const order = 1 + Math.max(0, ...siblings.map((p) => p.order));
  const id = randomId();
  const name = input.category === 'scene' ? null : input.name!;
  const author = oneOf(authors, by, 'user');
  const map = promptsOf(doc);
  map.set(partKey(id, 'def'), { category: input.category, sceneId });
  map.set(partKey(id, 'prompt'), { prompt: input.prompt, by: author, at });
  if (name !== null) map.set(partKey(id, 'name'), name);
  map.set(partKey(id, 'order'), order);
  return { id, category: input.category, sceneId, name, prompt: input.prompt, by: author, at, order, chosenFileId: null };
}

export function addImagePrompt(doc: Y.Doc, input: ImagePromptInput, by: Author, at: string = nowIso()): ImagePromptEntry {
  if (!(imageCategories as readonly string[]).includes(input.category)) {
    throw new Error(`category: unknown category "${String(input.category)}"`);
  }
  if (input.category === 'scene') {
    if (input.sceneId === undefined || input.sceneId === null) throw new Error('sceneId: is required for a scene prompt');
    checkScene(input.sceneId);
    if (input.name !== undefined && input.name !== null) throw new Error('name: only a pc, npc or handout prompt has one');
  } else {
    if (input.sceneId !== undefined && input.sceneId !== null) throw new Error('sceneId: only a scene prompt has one');
    if (input.name === undefined || input.name === null) throw new Error('name: is required');
    checkName(input.name);
  }
  checkText('prompt', input.prompt, LIMITS.imagePrompt);
  checkAt(at);
  let entry!: ImagePromptEntry;
  doc.transact(() => {
    entry = createPrompt(doc, input, by, at);
  });
  return entry;
}

export interface ImagePromptPatch {
  prompt?: string;
  // Only for a pc, npc or handout prompt.
  name?: string;
}

export function updateImagePrompt(
  doc: Y.Doc,
  id: string,
  patch: ImagePromptPatch,
  by: Author,
  at: string = nowIso(),
): void {
  if (patch.prompt === undefined && patch.name === undefined) throw new Error('Send prompt, name or both');
  if (patch.prompt !== undefined) checkText('prompt', patch.prompt, LIMITS.imagePrompt);
  if (patch.name !== undefined) checkName(patch.name);
  checkAt(at);
  doc.transact(() => {
    const def = validDef(doc, id);
    if (!def) throw new Error(`No image prompt ${id}`);
    if (patch.name !== undefined && def.category === 'scene') throw new Error('name: a scene prompt has none');
    const map = promptsOf(doc);
    if (patch.prompt !== undefined) {
      map.set(partKey(id, 'prompt'), { prompt: patch.prompt, by: oneOf(authors, by, 'user'), at: editedAt(doc, id, at) });
    }
    if (patch.name !== undefined && map.get(partKey(id, 'name')) !== patch.name) map.set(partKey(id, 'name'), patch.name);
  });
}

// Takes a prompt off the board (O6): its id gets `removed`, a key only this
// writer writes and nothing clears, and its other keys go. Deleting the def
// alone would not do: another replica migrating the same v0.6 board writes
// its own def, which could win. Its images, v0.6 ones naming its scene too,
// wait in the Unmatched tray as a removed prompt's; no file is written or
// removed. Removed ids do not count toward CAPS.imagePrompts.
export function removeImagePrompt(doc: Y.Doc, id: string): { images: number } {
  let images = 0;
  doc.transact(() => {
    if (!validDef(doc, id)) throw new Error(`No image prompt ${id}`);
    images = readFiles(doc).filter((f) => f.kind === 'image' && f.promptId === id).length;
    const map = promptsOf(doc);
    map.set(partKey(id, 'removed'), true);
    for (const key of [...map.keys()]) if (key.startsWith(`${id}/`) && key !== partKey(id, 'removed')) map.delete(key);
  });
  return { images };
}

// Writes the text of the scene's first prompt (lowest order, then id),
// creating one when the scene has none. It replaces v0.6's single prompt.
export function setFirstScenePrompt(
  doc: Y.Doc,
  sceneId: string,
  prompt: string,
  by: Author,
  at: string = nowIso(),
): ImagePromptEntry {
  checkScene(sceneId);
  checkText('prompt', prompt, LIMITS.imagePrompt);
  checkAt(at);
  let entry!: ImagePromptEntry;
  doc.transact(() => {
    const first = allPrompts(doc, readFiles(doc)).find((p) => p.category === 'scene' && p.sceneId === sceneId);
    if (!first) {
      entry = createPrompt(doc, { category: 'scene', sceneId, prompt }, by, at);
      return;
    }
    const author = oneOf(authors, by, 'user');
    const dated = editedAt(doc, first.id, at);
    promptsOf(doc).set(partKey(first.id, 'prompt'), { prompt, by: author, at: dated });
    entry = { ...first, prompt, by: author, at: dated };
  });
  return entry;
}

export interface MusicInput {
  title: string;
  style: string;
  lyrics: string;
}

// Three empty fields clear the music half's prompt.
export function setMusicPrompt(doc: Y.Doc, sceneId: string, music: MusicInput, by: Author, at: string = nowIso()): void {
  checkScene(sceneId);
  checkText('music.title', music.title, LIMITS.trackTitle);
  checkText('music.style', music.style, LIMITS.style);
  checkText('music.lyrics', music.lyrics, LIMITS.lyrics);
  checkAt(at);
  const { title, style, lyrics } = music;
  doc.transact(() => {
    const board = boardOf(doc);
    if (title === '' && style === '' && lyrics === '') board.delete(keyOf(sceneId, 'music'));
    else board.set(keyOf(sceneId, 'music'), { title, style, lyrics, by: oneOf(authors, by, 'user'), at });
  });
}

function checkNewFile(file: NewFile, i: number): void {
  const field = `files[${i}]`;
  if (!isSha256(file.sha256)) throw new Error(`${field}.sha256: must be 64 lower-case hex digits`);
  if (file.thumbSha256 !== null && !isSha256(file.thumbSha256)) {
    throw new Error(`${field}.thumbSha256: must be 64 lower-case hex digits or null`);
  }
  if (!(fileKinds as readonly string[]).includes(file.kind)) throw new Error(`${field}.kind: unknown kind "${file.kind}"`);
  checkText(`${field}.name`, file.name, LIMITS.fileName, { required: true });
  if (!Number.isSafeInteger(file.size) || file.size < 0) throw new Error(`${field}.size: must be a whole number of bytes`);
  if (file.kind === 'image') {
    if (file.sceneId !== null) throw new Error(`${field}.sceneId: an image belongs to a prompt, not a scene`);
    if (file.promptId !== null) checkPromptId(file.promptId);
  } else {
    if (file.promptId !== null) throw new Error(`${field}.promptId: a track belongs to a scene, not a prompt`);
    if (file.sceneId !== null) checkScene(file.sceneId);
  }
  if (file.addedAt !== undefined) checkAt(file.addedAt);
}

// Adds files at the end of the list. A sha256 the project already lists, or
// listed earlier in the same call, is skipped. Past CAPS.files nothing is
// added.
export function addFiles(doc: Y.Doc, files: readonly NewFile[]): { added: FileEntry[]; skipped: NewFile[] } {
  files.forEach(checkNewFile);
  const added: FileEntry[] = [];
  const skipped: NewFile[] = [];
  doc.transact(() => {
    const listed = validFiles(doc);
    const known = new Set(listed.map((item) => item.get('sha256') as string));
    const fresh = files.filter((file) => {
      if (known.has(file.sha256)) {
        skipped.push(file);
        return false;
      }
      known.add(file.sha256);
      return true;
    });
    if (listed.length + fresh.length > CAPS.files) throw new Error(`files: at most ${CAPS.files} items`);
    const now = nowIso();
    const items = fresh.map((file) => {
      const image = file.kind === 'image';
      const target = image ? file.promptId : file.sceneId;
      const entry: FileEntry = {
        id: randomId(),
        sha256: file.sha256,
        thumbSha256: image ? file.thumbSha256 : null,
        name: file.name,
        kind: file.kind,
        mime: file.mime,
        size: file.size,
        width: image ? file.width : null,
        height: image ? file.height : null,
        duration: image ? null : file.duration,
        sceneId: image ? null : file.sceneId,
        promptId: image ? file.promptId : null,
        matchedBy: target === null ? null : file.matchedBy,
        addedAt: file.addedAt ?? now,
        addedBy: oneOf(authors, file.addedBy, 'user'),
      };
      added.push(entry);
      return mapOf({ ...entry });
    });
    if (items.length > 0) filesOf(doc).push(items);
  });
  return { added, skipped };
}

function findFile(doc: Y.Doc, fileId: string): { item: Item; index: number } | null {
  const items = filesOf(doc).toArray();
  const index = items.findIndex((item) => isItem(item) && item.get('id') === fileId);
  return index === -1 ? null : { item: items[index]!, index };
}

// Clears the choice the file holds in its prompt or scene, if any. A prompt
// that is gone is not written: its keys stay gone.
function unchoose(doc: Y.Doc, item: Item): void {
  const fileId = item.get('id');
  if (item.get('kind') === 'audio') {
    const sceneId = item.get('sceneId');
    if (!isId(sceneId)) return;
    const key = keyOf(sceneId, 'chosenTrack');
    if (boardOf(doc).get(key) === fileId) boardOf(doc).set(key, null);
    return;
  }
  const promptId = promptIdOf(item);
  if (promptId === null || !validDef(doc, promptId)) return;
  if (storedChoice(promptsOf(doc), promptId) === fileId) promptsOf(doc).set(partKey(promptId, 'chosen'), null);
}

function findKind(doc: Y.Doc, fileId: string, kind: FileKind): { item: Item; index: number } {
  const found = findFile(doc, fileId);
  if (!found || !isFile(found.item)) throw new Error(`No file ${fileId}`);
  if (found.item.get('kind') !== kind) throw new Error(`File ${fileId} is not ${kind === 'image' ? 'an image' : 'a track'}`);
  return found;
}

// Moves an image to a prompt, or to the Unmatched tray with null. An image
// chosen in its old prompt is unchosen there.
export function assignImage(doc: Y.Doc, fileId: string, promptId: string | null, matched: MatchedBy = 'hand'): void {
  if (promptId !== null) checkPromptId(promptId);
  doc.transact(() => {
    const { item } = findKind(doc, fileId, 'image');
    if (promptId !== null && !validDef(doc, promptId)) throw new Error(`No image prompt ${promptId}`);
    if (promptIdOf(item) !== promptId) {
      unchoose(doc, item);
      item.set('promptId', promptId);
      if (item.get('sceneId') !== null && item.get('sceneId') !== undefined) item.set('sceneId', null);
    }
    const by = promptId === null ? null : matched;
    if (item.get('matchedBy') !== by) item.set('matchedBy', by);
  });
}

// Moves a track to a scene, or to the Unmatched tray with null. A track
// chosen in its old scene is unchosen there.
export function assignTrack(doc: Y.Doc, fileId: string, sceneId: string | null, matched: MatchedBy = 'hand'): void {
  if (sceneId !== null) checkScene(sceneId);
  doc.transact(() => {
    const { item } = findKind(doc, fileId, 'audio');
    if (item.get('sceneId') !== sceneId) {
      unchoose(doc, item);
      item.set('sceneId', sceneId);
    }
    const by = sceneId === null ? null : matched;
    if (item.get('matchedBy') !== by) item.set('matchedBy', by);
  });
}

// Takes a file off the project; a chosen one leaves its prompt or scene
// unchosen. The bytes stay in the file stores until the sweeps.
export function removeFile(doc: Y.Doc, fileId: string): void {
  doc.transact(() => {
    const found = findFile(doc, fileId);
    if (!found) return;
    unchoose(doc, found.item);
    filesOf(doc).delete(found.index, 1);
  });
}

// Chooses an image of the prompt, or none with null.
export function chooseImage(doc: Y.Doc, promptId: string, fileId: string | null): void {
  checkPromptId(promptId);
  doc.transact(() => {
    if (!validDef(doc, promptId)) throw new Error(`No image prompt ${promptId}`);
    if (fileId !== null) {
      const file = readFiles(doc).find((f) => f.id === fileId);
      if (!file || file.kind !== 'image' || file.promptId !== promptId) throw new Error(`No image ${fileId} in ${promptId}`);
    }
    promptsOf(doc).set(partKey(promptId, 'chosen'), fileId);
  });
}

// Chooses a track of the scene, or none with null.
export function chooseTrack(doc: Y.Doc, sceneId: string, fileId: string | null): void {
  checkScene(sceneId);
  doc.transact(() => {
    if (fileId !== null) {
      const file = readFiles(doc).find((f) => f.id === fileId);
      if (!file || file.kind !== 'audio' || file.sceneId !== sceneId) throw new Error(`No track ${fileId} in ${sceneId}`);
    }
    boardOf(doc).set(keyOf(sceneId, 'chosenTrack'), fileId);
  });
}

// Rows and statuses (asset-board design decision 2, image-categories design
// decision 9).

export const halfStatuses = ['wanted', 'received', 'chosen'] as const;
export type HalfStatus = (typeof halfStatuses)[number];

export interface PromptRow {
  prompt: ImagePromptEntry;
  // Its position in its scene or category, from 1.
  number: number;
  // Its images, oldest first.
  images: FileEntry[];
  chosen: string | null;
  status: HalfStatus;
}

export interface BoardRow {
  sceneId: string;
  title: string;
  // The appendix row's lines; null when it has none.
  visual: string | null;
  mood: string | null;
  // The scene's image prompts, in order.
  prompts: PromptRow[];
  music: MusicPrompt | null;
  // The scene's tracks, oldest first.
  tracks: FileEntry[];
  chosenTrack: string | null;
  musicStatus: HalfStatus;
  // Another row's music title has the same match key, so tracks cannot match.
  duplicateTitle: boolean;
}

const statusOf = (files: FileEntry[], chosen: string | null): HalfStatus =>
  files.length === 0 ? 'wanted' : chosen !== null ? 'chosen' : 'received';

// Prompts of one scene or one category, already in order.
function promptRows(prompts: readonly ImagePromptEntry[], files: readonly FileEntry[]): PromptRow[] {
  return prompts.map((prompt, i) => {
    const images = files.filter((f) => f.kind === 'image' && f.promptId === prompt.id);
    return { prompt, number: i + 1, images, chosen: prompt.chosenFileId, status: statusOf(images, prompt.chosenFileId) };
  });
}

const scenePrompts = (prompts: readonly ImagePromptEntry[], sceneId: string) =>
  prompts.filter((p) => p.category === 'scene' && p.sceneId === sceneId);

// One row per appendix row with a scene id, in document order; a scene id
// written twice keeps its first row.
export function boardRows(
  appendix: readonly AppendixRow[],
  board: ReadonlyMap<string, BoardEntry>,
  prompts: readonly ImagePromptEntry[],
  files: readonly FileEntry[],
): BoardRow[] {
  const seen = new Set<string>();
  const rows: BoardRow[] = [];
  for (const row of appendix) {
    if (row.sceneId === null || seen.has(row.sceneId)) continue;
    seen.add(row.sceneId);
    const entry = board.get(row.sceneId);
    const tracks = files.filter((f) => f.sceneId === row.sceneId && f.kind === 'audio');
    const chosenTrack = tracks.some((f) => f.id === entry?.chosenTrack) ? entry!.chosenTrack : null;
    rows.push({
      sceneId: row.sceneId,
      title: row.title,
      visual: row.visual?.text ?? null,
      mood: row.mood?.text ?? null,
      prompts: promptRows(scenePrompts(prompts, row.sceneId), files),
      music: entry?.music ?? null,
      tracks,
      chosenTrack,
      musicStatus: statusOf(tracks, chosenTrack),
      duplicateTitle: false,
    });
  }
  const shared = new Set(duplicateTitles(rows).map(matchKey));
  for (const row of rows) row.duplicateTitle = row.music !== null && shared.has(matchKey(row.music.title));
  return rows;
}

// The PCs, the NPCs and the handouts, each in order.
export function namedPrompts(
  prompts: readonly ImagePromptEntry[],
  files: readonly FileEntry[],
): Record<NamedCategory, PromptRow[]> {
  const of = (category: NamedCategory) =>
    promptRows(
      prompts.filter((p) => p.category === category),
      files,
    );
  return { pc: of('pc'), npc: of('npc'), handout: of('handout') };
}

// The music titles whose match key two rows or more share, each once, as the
// first of those rows writes it.
export function duplicateTitles(rows: readonly Pick<BoardRow, 'music'>[]): string[] {
  const byKey = new Map<string, { title: string; count: number }>();
  for (const row of rows) {
    if (!row.music) continue;
    const key = matchKey(row.music.title);
    if (key === '') continue;
    const found = byKey.get(key);
    if (found) found.count++;
    else byKey.set(key, { title: row.music.title, count: 1 });
  }
  return [...byKey.values()].filter((t) => t.count > 1).map((t) => t.title);
}

export interface UnmatchedFile {
  file: FileEntry;
  // Why a file that has a prompt or a scene still waits here: its prompt is
  // gone, or its scene has no row in the appendix. Null for a file with no
  // prompt or scene, whose reason matchFile gives again.
  reason: string | null;
}

// The Unmatched tray, so that no file is ever hidden, oldest first: tracks
// with no scene or a scene not in the appendix; images with no prompt, whose
// prompt was removed, or whose scene prompt's scene is not in the appendix.
export function unmatchedFiles(
  appendix: readonly AppendixRow[],
  prompts: readonly ImagePromptEntry[],
  files: readonly FileEntry[],
): UnmatchedFile[] {
  const scenes = new Set(appendix.flatMap((row) => (row.sceneId === null ? [] : [row.sceneId])));
  const byId = new Map(prompts.map((p) => [p.id, p]));
  const outside = (sceneId: string): UnmatchedFile['reason'] => `Scene ${sceneId} is not in the appendix.`;
  return files.flatMap((file): UnmatchedFile[] => {
    if (file.kind === 'audio') {
      if (file.sceneId === null) return [{ file, reason: null }];
      return scenes.has(file.sceneId) ? [] : [{ file, reason: outside(file.sceneId) }];
    }
    if (file.promptId === null) return [{ file, reason: null }];
    const prompt = byId.get(file.promptId);
    if (!prompt) return [{ file, reason: 'Its prompt was removed.' }];
    if (prompt.sceneId !== null && !scenes.has(prompt.sceneId)) return [{ file, reason: outside(prompt.sceneId) }];
    return [];
  });
}

export interface DocumentBoard {
  rows: BoardRow[];
  named: Record<NamedCategory, PromptRow[]>;
  // Scene prompts whose scene has no row in the appendix: kept, not shown.
  outsideAppendix: PromptRow[];
  // The files of the Unmatched tray.
  unmatched: UnmatchedFile[];
}

// The board as the stored document gives it: the appendix parsed from the
// prep document and joined to the prompts and files. A campaign is never
// parsed and has no rows. Read a document that may predate image categories
// through migratedView (board-migration.ts).
export function readDocumentBoard(doc: Y.Doc): DocumentBoard {
  const files = readFiles(doc);
  const prompts = readImagePrompts(doc);
  const meta = readMeta(doc);
  const appendix =
    meta.category === 'campaign'
      ? []
      : parseAdventure(readDocument(doc), { template: adventureTemplateOf(meta) }).model.appendix;
  const rows = boardRows(appendix, readBoard(doc), prompts, files);
  const shown = new Set(rows.map((r) => r.sceneId));
  const hidden = [...new Set(prompts.flatMap((p) => (p.sceneId !== null && !shown.has(p.sceneId) ? [p.sceneId] : [])))];
  return {
    rows,
    named: namedPrompts(prompts, files),
    outsideAppendix: hidden.flatMap((sceneId) => promptRows(scenePrompts(prompts, sceneId), files)),
    unmatched: unmatchedFiles(appendix, prompts, files),
  };
}
