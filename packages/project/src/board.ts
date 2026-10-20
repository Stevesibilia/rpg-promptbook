import { parseAdventure, templates, type AppendixRow } from 'promptbook-format';
import type * as Y from 'yjs';
import { checkAt, checkText, isItem, mapOf, nowIso, oneOf, randomId, readDocument, readMeta, record, str } from './doc.js';
import { matchKey } from './match.js';
import { authors, CAPS, isIsoDateTime, LIMITS, type Author } from './model.js';

// The images and music board (asset-board design decisions 1 and 2): the
// prompts and choices per scene in the `board` map, the images and tracks in
// the `files` array. Rows and statuses are derived, never stored.

type Item = Y.Map<unknown>;

const boardOf = (doc: Y.Doc) => doc.getMap<unknown>('board');
const filesOf = (doc: Y.Doc) => doc.getArray<Item>('files');

export const fileKinds = ['image', 'audio'] as const;
export type FileKind = (typeof fileKinds)[number];

export const matchedBy = ['prompt', 'title', 'hand'] as const;
export type MatchedBy = (typeof matchedBy)[number];

export interface ImagePrompt {
  prompt: string;
  by: Author;
  // ISO date-time.
  at: string;
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
  image: ImagePrompt | null;
  music: MusicPrompt | null;
  // File ids; null when none is chosen.
  chosenImage: string | null;
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
  // Null: waiting in the Unmatched tray.
  sceneId: string | null;
  matchedBy: MatchedBy | null;
  // ISO date-time.
  addedAt: string;
  addedBy: Author;
}

export type NewFile = Omit<FileEntry, 'id' | 'addedAt'> & { addedAt?: string };

const SHA256 = /^[0-9a-f]{64}$/;

export const isSha256 = (value: unknown): value is string => typeof value === 'string' && SHA256.test(value);

const halves = ['image', 'music', 'chosenImage', 'chosenTrack'] as const;
type Half = (typeof halves)[number];

const KEY = /^(.+)\/(image|music|chosenImage|chosenTrack)$/;

const keyOf = (sceneId: string, half: Half) => `${sceneId}/${half}`;

function checkScene(sceneId: string): void {
  if (sceneId === '' || sceneId.includes('/')) throw new Error(`sceneId: "${sceneId}" is not a scene id`);
}

// Readers. As in doc.ts, nothing another client wrote is trusted: a file
// without a string id, a valid sha256 or a known kind is left out, and every
// other value falls back to its empty value.

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

const nullableStr = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

function toImage(value: unknown): ImagePrompt | null {
  const r = record(value);
  if (!r) return null;
  return { prompt: str(r.prompt), by: oneOf(authors, r.by, 'user'), at: isIsoDateTime(r.at) ? r.at : '' };
}

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
    sceneId: nullableStr(item.get('sceneId')),
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

// Every scene the board has a key for. A chosen id that names no file of that
// scene and kind reads as null.
export function readBoard(doc: Y.Doc): Map<string, BoardEntry> {
  const files = readFiles(doc);
  const owns = (sceneId: string, kind: FileKind, id: unknown): string | null =>
    typeof id === 'string' && files.some((f) => f.id === id && f.sceneId === sceneId && f.kind === kind) ? id : null;
  const board = new Map<string, BoardEntry>();
  for (const [key, value] of boardOf(doc).entries()) {
    const match = KEY.exec(key);
    if (!match) continue;
    const sceneId = match[1]!;
    const half = match[2] as Half;
    const entry = board.get(sceneId) ?? { image: null, music: null, chosenImage: null, chosenTrack: null };
    if (half === 'image') entry.image = toImage(value);
    else if (half === 'music') entry.music = toMusic(value);
    else if (half === 'chosenImage') entry.chosenImage = owns(sceneId, 'image', value);
    else entry.chosenTrack = owns(sceneId, 'audio', value);
    board.set(sceneId, entry);
  }
  return board;
}

// Writers, each one transaction. They check the limits of LIMITS and throw;
// the callers check first.

// An empty prompt clears the image half's prompt.
export function setImagePrompt(doc: Y.Doc, sceneId: string, prompt: string, by: Author, at: string = nowIso()): void {
  checkScene(sceneId);
  checkText('image.prompt', prompt, LIMITS.imagePrompt);
  checkAt(at);
  doc.transact(() => {
    const board = boardOf(doc);
    if (prompt === '') board.delete(keyOf(sceneId, 'image'));
    else board.set(keyOf(sceneId, 'image'), { prompt, by: oneOf(authors, by, 'user'), at });
  });
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
  if (file.sceneId !== null) checkScene(file.sceneId);
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
        sceneId: file.sceneId,
        matchedBy: file.sceneId === null ? null : file.matchedBy,
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

// Clears the choice the file holds in its scene, if any.
function unchoose(doc: Y.Doc, item: Item): void {
  const sceneId = item.get('sceneId');
  if (typeof sceneId !== 'string' || sceneId === '') return;
  const key = keyOf(sceneId, item.get('kind') === 'audio' ? 'chosenTrack' : 'chosenImage');
  if (boardOf(doc).get(key) === item.get('id')) boardOf(doc).set(key, null);
}

// Moves a file to a scene, or to the Unmatched tray with null. A file chosen
// in its old scene is unchosen there.
export function assignFile(doc: Y.Doc, fileId: string, sceneId: string | null, matched: MatchedBy = 'hand'): void {
  if (sceneId !== null) checkScene(sceneId);
  doc.transact(() => {
    const found = findFile(doc, fileId);
    if (!found) throw new Error(`No file ${fileId}`);
    if (found.item.get('sceneId') !== sceneId) {
      unchoose(doc, found.item);
      found.item.set('sceneId', sceneId);
    }
    const by = sceneId === null ? null : matched;
    if (found.item.get('matchedBy') !== by) found.item.set('matchedBy', by);
  });
}

// Takes a file off the project; a chosen one leaves its scene unchosen. The
// bytes stay in the file stores until the sweeps.
export function removeFile(doc: Y.Doc, fileId: string): void {
  doc.transact(() => {
    const found = findFile(doc, fileId);
    if (!found) return;
    unchoose(doc, found.item);
    filesOf(doc).delete(found.index, 1);
  });
}

// Chooses a file of the scene for its half, or none with null.
export function chooseFile(doc: Y.Doc, sceneId: string, kind: FileKind, fileId: string | null): void {
  checkScene(sceneId);
  if (!(fileKinds as readonly string[]).includes(kind)) throw new Error(`Unknown kind "${String(kind)}"`);
  doc.transact(() => {
    if (fileId !== null) {
      const file = readFiles(doc).find((f) => f.id === fileId);
      if (!file || file.sceneId !== sceneId || file.kind !== kind) {
        throw new Error(`No ${kind === 'image' ? 'image' : 'track'} ${fileId} in ${sceneId}`);
      }
    }
    boardOf(doc).set(keyOf(sceneId, kind === 'image' ? 'chosenImage' : 'chosenTrack'), fileId);
  });
}

// Rows and statuses (design decision 2).

export const halfStatuses = ['wanted', 'received', 'chosen'] as const;
export type HalfStatus = (typeof halfStatuses)[number];

export interface BoardRow {
  sceneId: string;
  title: string;
  // The appendix row's lines; null when it has none.
  visual: string | null;
  mood: string | null;
  image: ImagePrompt | null;
  music: MusicPrompt | null;
  // The scene's files, oldest first.
  images: FileEntry[];
  tracks: FileEntry[];
  chosenImage: string | null;
  chosenTrack: string | null;
  imageStatus: HalfStatus;
  musicStatus: HalfStatus;
  // Another row's music title has the same match key, so tracks cannot match.
  duplicateTitle: boolean;
}

const statusOf = (files: FileEntry[], chosen: string | null): HalfStatus =>
  files.length === 0 ? 'wanted' : chosen !== null ? 'chosen' : 'received';

// One row per appendix row with a scene id, in document order; a scene id
// written twice keeps its first row.
export function boardRows(
  appendix: readonly AppendixRow[],
  board: ReadonlyMap<string, BoardEntry>,
  files: readonly FileEntry[],
): BoardRow[] {
  const seen = new Set<string>();
  const rows: BoardRow[] = [];
  for (const row of appendix) {
    if (row.sceneId === null || seen.has(row.sceneId)) continue;
    seen.add(row.sceneId);
    const entry = board.get(row.sceneId);
    const images = files.filter((f) => f.sceneId === row.sceneId && f.kind === 'image');
    const tracks = files.filter((f) => f.sceneId === row.sceneId && f.kind === 'audio');
    const chosenImage = images.some((f) => f.id === entry?.chosenImage) ? entry!.chosenImage : null;
    const chosenTrack = tracks.some((f) => f.id === entry?.chosenTrack) ? entry!.chosenTrack : null;
    rows.push({
      sceneId: row.sceneId,
      title: row.title,
      visual: row.visual?.text ?? null,
      mood: row.mood?.text ?? null,
      image: entry?.image ?? null,
      music: entry?.music ?? null,
      images,
      tracks,
      chosenImage,
      chosenTrack,
      imageStatus: statusOf(images, chosenImage),
      musicStatus: statusOf(tracks, chosenTrack),
      duplicateTitle: false,
    });
  }
  const shared = new Set(duplicateTitles(rows).map(matchKey));
  for (const row of rows) row.duplicateTitle = row.music !== null && shared.has(matchKey(row.music.title));
  return rows;
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
  // Set when the file names a scene the appendix has no row for; null for a
  // file left unmatched at intake, whose reason matchFile gives again.
  reason: string | null;
}

// The Unmatched tray: files with no scene, and files whose scene has no row
// in the appendix, so that no file is ever hidden. Oldest first.
export function unmatchedFiles(appendix: readonly AppendixRow[], files: readonly FileEntry[]): UnmatchedFile[] {
  const scenes = new Set(appendix.flatMap((row) => (row.sceneId === null ? [] : [row.sceneId])));
  return files.flatMap((file): UnmatchedFile[] => {
    if (file.sceneId === null) return [{ file, reason: null }];
    if (scenes.has(file.sceneId)) return [];
    return [{ file, reason: `Scene ${file.sceneId} is not in the appendix.` }];
  });
}

export interface DocumentBoard {
  rows: BoardRow[];
  // The files of the Unmatched tray.
  unmatched: UnmatchedFile[];
}

// The board as the stored document gives it: the appendix parsed from the
// prep document and joined to the prompts and files. A campaign is never
// parsed and has no rows; its files, if any, are all unmatched.
export function readDocumentBoard(doc: Y.Doc): DocumentBoard {
  const files = readFiles(doc);
  const appendix =
    readMeta(doc).category === 'campaign'
      ? []
      : parseAdventure(readDocument(doc), { template: templates.avventura }).model.appendix;
  return { rows: boardRows(appendix, readBoard(doc), files), unmatched: unmatchedFiles(appendix, files) };
}
