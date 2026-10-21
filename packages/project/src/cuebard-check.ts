import { inflateSync, strFromU8 } from 'fflate';

// CueBard's rules for a pack, as its extractor and its loader at f55135e
// apply them (cuebard-export design decision 19), for the tests of every
// caller: the problems found, none for a pack CueBard opens as it is. It
// reads the zip's headers itself, so a flag or a name the zip library would
// hide is seen as CueBard's yauzl sees it.

interface ZipEntry {
  name: string;
  // The UTF-8 flag in the central and the local header.
  utf8: boolean;
  localUtf8: boolean;
  localName: string;
  ascii: boolean;
  method: number;
  compressedSize: number;
  size: number;
  dataStart: number;
}

const u16 = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const u32 = (b: Uint8Array, at: number) => (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;

const decode = (bytes: Uint8Array) => strFromU8(bytes);

function readZip(zip: Uint8Array): ZipEntry[] {
  let end = -1;
  for (let at = zip.length - 22; at >= Math.max(0, zip.length - 22 - 0xffff); at--) {
    if (u32(zip, at) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end === -1) throw new Error('no end of central directory: not a whole zip');
  const count = u16(zip, end + 10);
  let at = u32(zip, end + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (at + 46 > zip.length || u32(zip, at) !== 0x02014b50) throw new Error(`central header ${i} is broken`);
    const flags = u16(zip, at + 8);
    const nameLength = u16(zip, at + 28);
    const nameBytes = zip.subarray(at + 46, at + 46 + nameLength);
    const local = u32(zip, at + 42);
    if (local + 30 > zip.length || u32(zip, local) !== 0x04034b50) throw new Error(`local header ${i} is broken`);
    const localNameLength = u16(zip, local + 26);
    entries.push({
      name: decode(nameBytes),
      utf8: (flags & 0x800) !== 0,
      localUtf8: (u16(zip, local + 6) & 0x800) !== 0,
      localName: decode(zip.subarray(local + 30, local + 30 + localNameLength)),
      ascii: nameBytes.every((b) => b < 0x80),
      method: u16(zip, at + 10),
      compressedSize: u32(zip, at + 20),
      size: u32(zip, at + 24),
      dataStart: local + 30 + localNameLength + u16(zip, local + 28),
    });
    at += 46 + nameLength + u16(zip, at + 30) + u16(zip, at + 32);
  }
  return entries;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const UUID = /^[0-9a-f-]{8,36}$/i;

// The fields CueBard reads at schemaVersion 5 without a default, with their
// type.
const PROJECT: Record<string, (v: unknown) => boolean> = {
  name: (v) => typeof v === 'string' && v !== '',
  version: (v) => typeof v === 'string',
  schemaVersion: (v) => v === 5,
  folderPath: (v) => typeof v === 'string',
  items: Array.isArray,
  cartItems: Array.isArray,
  cartOnlyItems: Array.isArray,
  visualMedia: Array.isArray,
  visualFolders: (v) => Array.isArray(v) && v.every((f) => typeof f === 'string'),
  visualDisplayEnabled: (v) => typeof v === 'boolean',
  theme: (v) => isObject(v) && typeof v.mode === 'string',
  createdAt: (v) => typeof v === 'string',
  lastModified: (v) => typeof v === 'string',
};

const action = (v: unknown) => isObject(v) && typeof v.action === 'string';

const ITEM: Record<string, (v: unknown) => boolean> = {
  uuid: (v) => typeof v === 'string' && UUID.test(v),
  index: (v) => Array.isArray(v) && v.every((n) => Number.isInteger(n)),
  displayName: (v) => typeof v === 'string',
  color: (v) => typeof v === 'string',
  type: (v) => v === 'audio' || v === 'group',
};

const GROUP: Record<string, (v: unknown) => boolean> = {
  children: Array.isArray,
  isExpanded: (v) => typeof v === 'boolean',
  startBehavior: (v) => isObject(v) && (v.action === 'play-first' || v.action === 'play-all'),
  endBehavior: action,
};

const AUDIO: Record<string, (v: unknown) => boolean> = {
  mediaFileName: (v) => typeof v === 'string' && v !== '',
  mediaPath: (v) => typeof v === 'string',
  waveformPath: (v) => typeof v === 'string' && v !== '',
  inPoint: isNumber,
  outPoint: isNumber,
  duration: (v) => isNumber(v) && v > 0,
  volume: isNumber,
  endBehavior: action,
  startBehavior: action,
  duckingBehavior: (v) => isObject(v) && typeof v.mode === 'string',
  customActions: Array.isArray,
  fadeOutDuration: isNumber,
  playFade: isNumber,
  stopFade: isNumber,
  crossFade: isNumber,
};

const VISUAL: Record<string, (v: unknown) => boolean> = {
  uuid: (v) => typeof v === 'string' && UUID.test(v),
  displayName: (v) => typeof v === 'string',
  mediaFileName: (v) => typeof v === 'string' && v !== '',
  mediaPath: (v) => typeof v === 'string',
  mediaType: (v) => v === 'image' || v === 'pdf',
  folder: (v) => typeof v === 'string',
  linkDelay: isNumber,
  fadeIn: isNumber,
  fadeOut: isNumber,
};

function fields(problems: string[], where: string, value: Json, rules: Record<string, (v: unknown) => boolean>): void {
  for (const [key, ok] of Object.entries(rules)) {
    if (!(key in value)) problems.push(`${where}: ${key} is missing`);
    else if (!ok(value[key])) problems.push(`${where}: ${key} has the wrong type or value`);
  }
}

// Entry names: what the extractor refuses, what breaks CueBard's unencoded
// file:/// URLs, and two names one disk without case would merge.
function checkNames(problems: string[], entries: ZipEntry[], archiveSize: number): void {
  const seen = new Set<string>();
  const folders = new Set<string>();
  for (const e of entries) {
    const name = e.name;
    if (name.startsWith('/')) problems.push(`entry "${name}": absolute`);
    if (name.includes('\\')) problems.push(`entry "${name}": backslash`);
    if (/^[A-Za-z]:/.test(name)) problems.push(`entry "${name}": drive letter`);
    if (name.split('/').includes('..')) problems.push(`entry "${name}": leaves its folder`);
    if (/[#?%]/.test(name)) problems.push(`entry "${name}": # ? or % breaks CueBard's media URLs`);
    if (!e.ascii && !e.utf8) problems.push(`entry "${name}": not ASCII and no UTF-8 flag in the central header`);
    if (!e.ascii && !e.localUtf8) problems.push(`entry "${name}": not ASCII and no UTF-8 flag in the local header`);
    if (e.localName !== name) problems.push(`entry "${name}": the local header names "${e.localName}"`);
    if (e.method !== 0 && e.method !== 8) problems.push(`entry "${name}": method ${e.method}, neither stored nor deflated`);
    const key = name.replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) problems.push(`entry "${name}": a second entry with this name, up to case`);
    seen.add(key);
    const parts = key.split('/');
    for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join('/'));
  }
  for (const e of entries) {
    if (!e.name.endsWith('/') && folders.has(e.name.toLowerCase())) problems.push(`entry "${e.name}": a file where a folder is`);
  }
  const total = entries.reduce((sum, e) => sum + e.size, 0);
  if (total > Math.max(20 * archiveSize, 1024 ** 3)) problems.push(`the entries unpack to ${total} bytes, past the extractor's cap`);
}

function projectText(zip: Uint8Array, e: ZipEntry): string {
  const data = zip.subarray(e.dataStart, e.dataStart + e.compressedSize);
  return decode(e.method === 8 ? inflateSync(data) : data);
}

export function checkCuebardPack(zip: Uint8Array): string[] {
  const problems: string[] = [];
  let entries: ZipEntry[];
  try {
    entries = readZip(zip);
  } catch (error) {
    return [(error as Error).message];
  }
  checkNames(problems, entries, zip.length);

  const projects = entries.filter((e) => !e.name.includes('/') && /\.(cuebard|liveplay)$/i.test(e.name));
  if (projects.length !== 1) {
    problems.push(`${projects.length} project files at the root, not one`);
    return problems;
  }
  const file = projects[0]!;
  if (!/\.cuebard$/.test(file.name)) problems.push(`project file "${file.name}": not .cuebard`);
  let project: unknown;
  try {
    project = JSON.parse(projectText(zip, file));
  } catch (error) {
    problems.push(`project file: ${(error as Error).message}`);
    return problems;
  }
  if (!isObject(project)) {
    problems.push('project file: not a JSON object');
    return problems;
  }
  fields(problems, 'project', project, PROJECT);

  const names = new Set(entries.map((e) => e.name));
  const uuids = new Set<string>();
  const audio = new Set<string>();
  const unique = (where: string, uuid: unknown) => {
    if (typeof uuid !== 'string') return;
    if (uuids.has(uuid)) problems.push(`${where}: uuid ${uuid} given twice`);
    uuids.add(uuid);
  };
  const media = (where: string, item: Json, folder: string) => {
    if (typeof item.mediaFileName !== 'string') return;
    if (item.mediaPath !== `${folder}${item.mediaFileName}`) problems.push(`${where}: mediaPath is not ${folder}<mediaFileName>`);
    if (!names.has(`${folder}${item.mediaFileName}`)) problems.push(`${where}: no entry ${folder}${item.mediaFileName}`);
  };
  const walk = (items: unknown, at: number[]) => {
    if (!Array.isArray(items)) return;
    items.forEach((item, i) => {
      const index = [...at, i];
      const where = `item [${index.join(', ')}]`;
      if (!isObject(item)) {
        problems.push(`${where}: not an object`);
        return;
      }
      fields(problems, where, item, ITEM);
      unique(where, item.uuid);
      if (Array.isArray(item.index) && item.index.join(',') !== index.join(',')) {
        problems.push(`${where}: index is [${item.index.join(', ')}]`);
      }
      if (item.type === 'group') {
        fields(problems, where, item, GROUP);
        walk(item.children, index);
      } else if (item.type === 'audio') {
        fields(problems, where, item, AUDIO);
        if (typeof item.uuid === 'string') audio.add(item.uuid);
        media(where, item, 'media/');
        if (isNumber(item.outPoint) && isNumber(item.duration) && item.outPoint > item.duration) {
          problems.push(`${where}: outPoint past the duration`);
        }
      }
    });
  };
  walk(project.items, []);

  const folders = new Set(Array.isArray(project.visualFolders) ? project.visualFolders : []);
  const visuals = Array.isArray(project.visualMedia) ? project.visualMedia : [];
  visuals.forEach((visual, i) => {
    const where = `visual ${i}`;
    if (!isObject(visual)) {
      problems.push(`${where}: not an object`);
      return;
    }
    fields(problems, where, visual, VISUAL);
    unique(where, visual.uuid);
    media(where, visual, 'media/visuals/');
    if (typeof visual.folder === 'string' && !folders.has(visual.folder)) {
      problems.push(`${where}: folder "${visual.folder}" is not in visualFolders`);
    }
    if ('linkedCueUuid' in visual && !(typeof visual.linkedCueUuid === 'string' && audio.has(visual.linkedCueUuid))) {
      problems.push(`${where}: linkedCueUuid names no audio item`);
    }
  });
  return problems;
}
