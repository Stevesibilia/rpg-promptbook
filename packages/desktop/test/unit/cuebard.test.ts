import { createHash, randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync, ftruncateSync } from 'node:fs';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { parseFile } from 'music-metadata';
import {
  addFiles,
  addImagePrompt,
  checkCuebardPack,
  cuebardUuid,
  readFiles,
  setMusicPrompt,
  type NewFile,
} from 'promptbook-project';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { exportCuebard, NOT_HERE } from '../../src/main/cuebard.js';
import { Files } from '../../src/main/files.js';
import { packName, packTarget, registerIpc } from '../../src/main/ipc.js';
import { Store } from '../../src/main/store.js';
import type { SyncEngine } from '../../src/main/sync.js';
import { projectDoc, tempDir } from './helpers.js';

// The CueBard pack built in main (cuebard-export design decision 15), from
// a Files over a temporary folder, offline: the pack written and passing
// CueBard's rules, a length read from a WAV, a file not on this computer and
// a track with no length left out and counted, only audio parsed and each
// content once, the limits before any reading, a project not here refused,
// a failed or stopped write leaving nothing; the IPC call's arguments.

const parsed = vi.hoisted(() => [] as string[]);
vi.mock('music-metadata', async (original) => {
  const real = await original<typeof import('music-metadata')>();
  return {
    ...real,
    parseFile: (path: string, options: Parameters<typeof real.parseFile>[1]) => {
      parsed.push(path);
      return real.parseFile(path, options);
    },
  };
});

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  save: { canceled: true, filePath: '' } as { canceled: boolean; filePath: string },
  offered: [] as unknown[],
}));
vi.mock('electron', () => ({
  app: { isPackaged: false, getVersion: () => '0.0.0' },
  BrowserWindow: { fromWebContents: () => null },
  dialog: {
    showSaveDialog: async (options: unknown) => {
      electron.offered.push(options);
      return electron.save;
    },
  },
  ipcMain: { handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => electron.handlers.set(channel, handler) },
  shell: {},
  session: {},
}));

const P1 = '0b9d2c3e-1f4a-4b5c-8d6e-7f8a9b0c1d2e';
const TITLE = "L'Ancora di Sabaoth";
const NOW = '2026-10-21T12:00:00.000Z';
const DOCUMENT = ['## Appendice: immagini e musica', '', '### S1. La casa che cede', '', '### S2. Il molo', '', '### S3. La torre', ''].join('\n');

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const png = (size = 4096) => Buffer.concat([PNG_HEAD, randomBytes(size - PNG_HEAD.length)]);
// An MP3 a reader finds no length in: a tag and silence with no frame.
const untimed = () => Buffer.concat([Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00', 'latin1'), Buffer.alloc(4086)]);

// A mono 16-bit WAV of `seconds` at 8 kHz.
function wav(seconds: number): Buffer {
  const rate = 8000;
  const data = Buffer.alloc(Math.round(rate * seconds) * 2);
  for (let i = 0; i < data.length / 2; i++) data.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / rate)), i * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8, 'ascii');
  head.write('fmt ', 12, 'ascii');
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36, 'ascii');
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

let clock = 0;
const image = (bytes: Buffer, name: string, promptId: string | null): NewFile => ({
  sha256: sha(bytes),
  thumbSha256: null,
  name,
  kind: 'image',
  mime: 'image/png',
  size: bytes.length,
  width: 1456,
  height: 816,
  duration: null,
  sceneId: null,
  promptId,
  matchedBy: promptId === null ? null : 'hand',
  addedBy: 'user',
  addedAt: new Date(Date.parse('2026-10-21T09:00:00.000Z') + clock++ * 1000).toISOString(),
});
const track = (bytes: Buffer, name: string, sceneId: string | null, duration: number | null, mime = 'audio/mpeg'): NewFile => ({
  ...image(bytes, name, null),
  kind: 'audio',
  mime,
  width: null,
  height: null,
  duration,
  sceneId,
  promptId: null,
  matchedBy: sceneId === null ? null : 'hand',
});

let dir: ReturnType<typeof tempDir>;
let store: Store;
let files: Files;
let docs: Map<string, Y.Doc>;
let downloaded: Set<string>;

const folder = () => join(dir.dir, 'files');
const out = () => join(dir.dir, 'out');

// A file already in the store, as a download or a put left it.
function onDisk(bytes: Buffer, hash = sha(bytes)): void {
  mkdirSync(join(folder(), hash.slice(0, 2)), { recursive: true });
  writeFileSync(join(folder(), hash.slice(0, 2), hash), bytes);
}

function open(): Files {
  const engine = {
    isOnline: false,
    ids: () => [...docs.keys()],
    doc: (id: string) => docs.get(id) ?? null,
    has: (id: string) => docs.has(id),
    isDownloaded: (id: string) => downloaded.has(id),
    filesChanged: () => {},
  };
  files = new Files({
    folder: folder(),
    store,
    engine: engine as unknown as SyncEngine,
    client: () => null,
    emit: () => {},
    statusDelayMs: 1,
    docDelayMs: 1,
  });
  return files;
}

const deps = () => ({ engine: { isDownloaded: (id: string) => downloaded.has(id), doc: (id: string) => docs.get(id) ?? null }, files });

beforeEach(() => {
  dir = tempDir('pb-cuebard-');
  mkdirSync(folder(), { recursive: true });
  mkdirSync(out(), { recursive: true });
  store = Store.open(join(dir.dir, 'promptbook.sqlite'));
  docs = new Map();
  downloaded = new Set();
  parsed.length = 0;
});

afterEach(async () => {
  await files?.close();
  store.close();
  dir.remove();
});

// The board of the server's test, on this computer: S1 a WAV with no
// recorded length (read from the file) and an image, S2 an MP3 with a
// recorded length, S3 a track whose bytes give no length, the named
// categories, a picked image not on this computer, a track whose bytes are
// a PNG, and a file in the tray.
function board() {
  const bytes = {
    citta: wav(2.5),
    molo: Buffer.concat([untimed(), randomBytes(16)]),
    rotta: untimed(),
    casa: png(),
    rosalia: png(4097),
    anselmo: png(4098),
    lettera: png(4099),
    absent: png(4100),
    fake: png(4101),
    tray: png(4102),
  };
  const doc = projectDoc(P1, TITLE, DOCUMENT);
  const scene = addImagePrompt(doc, { category: 'scene', sceneId: 'S1', prompt: 'a library' }, 'claude').id;
  const pc = addImagePrompt(doc, { category: 'pc', name: 'Rosalia', prompt: 'a nurse' }, 'claude').id;
  const npc = addImagePrompt(doc, { category: 'npc', name: 'Padre Anselmo', prompt: 'a priest' }, 'claude').id;
  const handout = addImagePrompt(doc, { category: 'handout', name: 'Lettera', prompt: 'a letter' }, 'claude').id;
  setMusicPrompt(doc, 'S1', { title: 'Dominus Deus Sabaoth', style: 'choir', lyrics: '' }, 'claude');
  addFiles(doc, [
    track(bytes.citta, 'Città.wav', 'S1', null, 'audio/wav'),
    track(bytes.molo, 'molo.mp3', 'S2', 95),
    track(bytes.rotta, 'rotta.mp3', 'S3', null),
    track(bytes.fake, 'finto.mp3', 'S3', null),
    image(bytes.casa, 'casa.png', scene),
    image(bytes.rosalia, 'rosalia.png', pc),
    image(bytes.anselmo, 'anselmo.png', npc),
    image(bytes.lettera, 'lettera.png', handout),
    image(bytes.absent, 'altrove.png', handout),
    image(bytes.tray, 'tray.png', null),
  ]);
  for (const [key, b] of Object.entries(bytes)) if (key !== 'absent') onDisk(b);
  docs.set(P1, doc);
  downloaded.add(P1);
  return { doc, bytes };
}

describe('the CueBard export on the desktop', () => {
  it('writes the pack offline from the files here, reading the lengths the board lacks, and counts what it left out', async () => {
    const { doc, bytes } = board();
    open();
    const target = join(out(), `${TITLE}.cbpack`);
    expect(await exportCuebard(deps(), P1, target, NOW)).toEqual({ saved: true, leftOut: 3, name: `${TITLE}.cbpack` });
    expect(readdirSync(out())).toEqual([`${TITLE}.cbpack`]);

    const pack = new Uint8Array(readFileSync(target));
    writeFileSync(join(dir.dir, 'pack.cbpack'), pack);
    if (process.env.CUEBARD_PACK_OUT) writeFileSync(process.env.CUEBARD_PACK_OUT, pack);
    expect(checkCuebardPack(pack)).toEqual([]);
    const zip = unzipSync(pack);
    const ids = new Map(readFiles(doc).map((f) => [f.name, f.id]));
    const visual = (name: string) => `media/visuals/${cuebardUuid(P1, 'visual', ids.get(name)!)}_${name}`;
    expect(Object.keys(zip).sort()).toEqual(
      [
        `${TITLE}.cuebard`,
        'left-out.txt',
        'media/Città.wav',
        'media/molo.mp3',
        visual('casa.png'),
        visual('rosalia.png'),
        visual('anselmo.png'),
        visual('lettera.png'),
      ].sort(),
    );
    expect(Buffer.from(zip['media/Città.wav']!).equals(bytes.citta)).toBe(true);
    expect(Buffer.from(zip[visual('casa.png')]!).equals(bytes.casa)).toBe(true);
    expect(strFromU8(zip['left-out.txt']!)).toBe(
      [
        'S3. La torre: rotta.mp3 (length unknown)',
        'S3. La torre: finto.mp3 (length unknown)',
        'Handout "Lettera": altrove.png (not on this computer)',
        '',
      ].join('\n'),
    );
    const project = JSON.parse(strFromU8(zip[`${TITLE}.cuebard`]!));
    expect(project.name).toBe(TITLE);
    expect(project.createdAt).toBe(NOW);
    const s1 = project.items[0].children;
    expect(s1).toHaveLength(1);
    expect(s1[0].displayName).toBe('Dominus Deus Sabaoth');
    expect(s1[0].duration).toBeCloseTo(2.5, 3);
    // The length read is not written to the document.
    expect(readFiles(doc).find((f) => f.name === 'Città.wav')!.duration).toBeNull();
    // Only audio parsed, each content once: the WAV and the untimed MP3,
    // never the PNG filed as a track, nor the timed MP3.
    expect(parsed.map((p) => p.slice(-64)).sort()).toEqual([sha(bytes.citta), sha(bytes.rotta)].sort());
  });

  it('refuses a project not on this computer, and writes nothing', async () => {
    board();
    downloaded.clear();
    open();
    await expect(exportCuebard(deps(), P1, join(out(), 'x.cbpack'), NOW)).rejects.toThrow(NOT_HERE);
    expect(readdirSync(out())).toEqual([]);
  });

  it('refuses a pack past 4 GB before it reads any length or writes anything', async () => {
    const { doc } = board();
    // A sparse file named as a picked track's hash: its size, not its bytes.
    const hash = 'f'.repeat(64);
    mkdirSync(join(folder(), 'ff'), { recursive: true });
    const fd = openSync(join(folder(), 'ff', hash), 'w');
    ftruncateSync(fd, 4_100_000_000);
    closeSync(fd);
    addFiles(doc, [{ ...track(Buffer.from('x'), 'enorme.wav', 'S2', 60, 'audio/wav'), sha256: hash, size: 10 }]);
    open();
    await expect(exportCuebard(deps(), P1, join(out(), 'x.cbpack'), NOW)).rejects.toThrow(
      'This project holds more than 4 GB of images and tracks for CueBard, more than one pack can take. Choose fewer files on the board.',
    );
    expect(parsed).toEqual([]);
    expect(readdirSync(out())).toEqual([]);
  });

  it('refuses on the sizes the document gives before it fetches a file not here', async () => {
    const { doc } = board();
    addFiles(doc, [{ ...track(Buffer.from('y'), 'lontano.wav', 'S2', 60, 'audio/wav'), size: 4_100_000_000 }]);
    open();
    const localPath = vi.spyOn(files, 'localPath');
    await expect(exportCuebard(deps(), P1, join(out(), 'x.cbpack'), NOW)).rejects.toThrow(/more than 4 GB/);
    expect(localPath).not.toHaveBeenCalled();
    expect(readdirSync(out())).toEqual([]);
  });

  it('leaves no file and no part when the write fails, and says so plainly', async () => {
    board();
    open();
    const target = join(out(), 'missing-folder', 'x.cbpack');
    await expect(exportCuebard(deps(), P1, target, NOW)).rejects.toThrow(
      /^The CueBard pack could not be written\. Check the folder and the free space, then try again\.$/,
    );
    expect(readdirSync(out())).toEqual([]);
  });

  it('writes through a part of its own, leaving a file of that name alone', async () => {
    board();
    open();
    const target = join(out(), 'x.cbpack');
    writeFileSync(`${target}.part`, 'mine');
    await exportCuebard(deps(), P1, target, NOW);
    expect(readdirSync(out()).sort()).toEqual(['x.cbpack', 'x.cbpack.part']);
    expect(readFileSync(`${target}.part`, 'utf8')).toBe('mine');
    expect(checkCuebardPack(new Uint8Array(readFileSync(target)))).toEqual([]);
  });

  it('stops at sign-out mid-write, leaving no file and no part', async () => {
    const { doc } = board();
    const big = Buffer.concat([PNG_HEAD, Buffer.alloc(96 * 1024 * 1024)]);
    onDisk(big);
    const npc = addImagePrompt(doc, { category: 'npc', name: 'Grande', prompt: 'a giant' }, 'claude').id;
    addFiles(doc, [image(big, 'grande.png', npc)]);
    open();
    const target = join(out(), 'x.cbpack');
    const running = exportCuebard(deps(), P1, target, NOW);
    while (!readdirSync(out()).some((n) => n.endsWith('.part'))) await new Promise((r) => setTimeout(r, 1));
    await files.close();
    await expect(running).rejects.toThrow(/^Signed out: the CueBard pack was not saved\.$/);
    expect(readdirSync(out())).toEqual([]);
  });
});

describe('pb:files:export-cuebard', () => {
  const event = { senderFrame: { url: 'promptbook://app/projects' }, sender: {} };
  const app = { account: null as null | { engine: unknown; files: Files }, options: { secrets: { isEncryptionAvailable: () => true } } };

  beforeEach(() => {
    electron.handlers.clear();
    electron.offered.length = 0;
    registerIpc(app as never, {} as never);
  });
  const call = (...args: unknown[]) => electron.handlers.get('pb:files:export-cuebard')!(event, ...args);

  it('checks its arguments', async () => {
    expect(packName('Notte- 50-.cbpack')).toBe('Notte- 50-.cbpack');
    expect(() => packName('../../x.zip')).toThrow('Invalid file name.');
    expect(packName('a/b/c.cbpack')).toBe('c.cbpack');
    expect(packTarget('/tmp/x.cbpack')).toBe('/tmp/x.cbpack');
    expect(packTarget('/tmp/x.CBPACK')).toBe('/tmp/x.CBPACK');
    expect(packTarget('/tmp/x')).toBe('/tmp/x.cbpack');
    await expect(call('not-a-uuid', 'x.cbpack')).rejects.toThrow('Invalid project id.');
    await expect(call(P1, 42)).rejects.toThrow('Invalid file name.');
    await expect(call(P1, 'x.zip')).rejects.toThrow('Invalid file name.');
    expect(electron.offered).toEqual([]);
    expect(() =>
      electron.handlers.get('pb:files:export-cuebard')!({ senderFrame: { url: 'https://evil.example/' } }, P1, 'x.cbpack'),
    ).toThrow('Not from the app.');
  });

  it('offers the name with the CueBard filter, and answers nothing saved when cancelled', async () => {
    electron.save = { canceled: true, filePath: '' };
    expect(await call(P1, `${TITLE}.cbpack`)).toEqual({ saved: false, leftOut: 0, name: '' });
    expect(electron.offered).toEqual([
      { defaultPath: `${TITLE}.cbpack`, filters: [{ name: 'CueBard pack', extensions: ['cbpack'] }] },
    ]);
  });

  it('builds the pack where the dialog says, under the name the user chose, adding the extension taken off', async () => {
    board();
    open();
    app.account = { engine: deps().engine, files };
    electron.save = { canceled: false, filePath: join(out(), 'Sabaoth') };
    // Offered «L'Ancora di Sabaoth.cbpack», saved as «Sabaoth».
    expect(await call(P1, `${TITLE}.cbpack`)).toEqual({ saved: true, leftOut: 3, name: 'Sabaoth.cbpack' });
    expect(readdirSync(out())).toEqual(['Sabaoth.cbpack']);
    expect(checkCuebardPack(new Uint8Array(readFileSync(join(out(), 'Sabaoth.cbpack'))))).toEqual([]);
    // Typed again without the extension: the dialog did not ask about the
    // file it would replace.
    await expect(call(P1, `${TITLE}.cbpack`)).rejects.toThrow(
      'Sabaoth.cbpack exists already: export again and choose another name.',
    );
    app.account = null;
  });
});

// parseFile is the real one behind the record.
void parseFile;
