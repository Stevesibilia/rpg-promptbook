import { parseAdventure, templates } from 'promptbook-format';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  addFiles,
  assignFile,
  boardRows,
  CAPS,
  chooseFile,
  duplicateTitles,
  fileHashes,
  LIMITS,
  readBoard,
  readFiles,
  removeFile,
  setImagePrompt,
  setMusicPrompt,
  unmatchedFiles,
  type NewFile,
} from '../src/index.js';
import { project, replica, sync } from './helpers.js';

const AT = '2026-10-20T09:00:00.000Z';
const hash = (n: number) => n.toString(16).padStart(64, '0');

// Files added at the same moment are read in the order of their ids.
const byId = (doc: Y.Doc) => {
  const ids = new Map(readFiles(doc).map((f) => [f.sha256, f.id]));
  return (a: string, b: string) => (ids.get(a)! < ids.get(b)! ? -1 : 1);
};

const image = (n: number, overrides: Partial<NewFile> = {}): NewFile => ({
  sha256: hash(n),
  thumbSha256: hash(1000 + n),
  name: `steve_scene_${n}.png`,
  kind: 'image',
  mime: 'image/png',
  size: 2_100_000,
  width: 1456,
  height: 816,
  duration: null,
  sceneId: 'S1',
  matchedBy: 'prompt',
  addedBy: 'user',
  ...overrides,
});

const track = (n: number, overrides: Partial<NewFile> = {}): NewFile => ({
  sha256: hash(n),
  thumbSha256: null,
  name: `cinque e venti (${n}).mp3`,
  kind: 'audio',
  mime: 'audio/mpeg',
  size: 4_000_000,
  width: null,
  height: null,
  duration: 192.5,
  sceneId: 'S1',
  matchedBy: 'title',
  addedBy: 'user',
  ...overrides,
});

const APPENDIX = `# L'Ancora di Sabaoth

## Appendice: immagini e musica

### S1. La casa che cede

visual: collapsed 1900s Sicilian library at night

mood: chaotic, suffocating

### S2. L'ordine di Donato

visual: ruined doctor's office

### Senza id

visual: nothing
`;

const appendix = parseAdventure(APPENDIX, { template: templates.avventura }).model.appendix;

describe('prompts', () => {
  it('reads as empty in a document that has no board', () => {
    const doc = project();
    expect(readBoard(doc)).toEqual(new Map());
    expect(readFiles(doc)).toEqual([]);
  });

  it('sets, overwrites and clears the image prompt, with who and when', () => {
    const doc = project();
    setImagePrompt(doc, 'S1', 'collapsed library --ar 16:9', 'claude', AT);
    expect(readBoard(doc).get('S1')).toEqual({
      image: { prompt: 'collapsed library --ar 16:9', by: 'claude', at: AT },
      music: null,
      chosenImage: null,
      chosenTrack: null,
    });
    setImagePrompt(doc, 'S1', 'a library', 'user', '2026-10-20T10:00:00.000Z');
    expect(readBoard(doc).get('S1')?.image).toEqual({ prompt: 'a library', by: 'user', at: '2026-10-20T10:00:00.000Z' });
    setImagePrompt(doc, 'S1', '', 'user');
    expect(readBoard(doc).get('S1')).toBeUndefined();
  });

  it('sets the music prompt and clears it with three empty fields', () => {
    const doc = project();
    const music = { title: 'Cinque e venti', style: 'dark ambient', lyrics: '[Instrumental]\n[End]' };
    setMusicPrompt(doc, 'S2', music, 'claude', AT);
    expect(readBoard(doc).get('S2')?.music).toEqual({ ...music, by: 'claude', at: AT });
    setMusicPrompt(doc, 'S2', { title: '', style: '', lyrics: '' }, 'user');
    expect(readBoard(doc).get('S2')).toBeUndefined();
  });

  it('writes each prompt in one transaction under a flat key', () => {
    const doc = project();
    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);
    setImagePrompt(doc, 'S1', 'x', 'user');
    setMusicPrompt(doc, 'S1', { title: 't', style: 's', lyrics: 'l' }, 'user');
    expect(transactions).toBe(2);
    expect([...doc.getMap('board').keys()].sort()).toEqual(['S1/image', 'S1/music']);
  });

  it('checks the limits and the scene id', () => {
    const doc = project();
    expect(() => setImagePrompt(doc, 'S1', 'x'.repeat(LIMITS.imagePrompt + 1), 'user')).toThrow(
      'image.prompt: at most 2000 characters',
    );
    const music = { title: 'x'.repeat(121), style: '', lyrics: '' };
    expect(() => setMusicPrompt(doc, 'S1', music, 'user')).toThrow('music.title: at most 120 characters');
    expect(() => setMusicPrompt(doc, 'S1', { ...music, title: '', style: 'x'.repeat(1001) }, 'user')).toThrow(
      'music.style: at most 1000 characters',
    );
    expect(() => setMusicPrompt(doc, 'S1', { ...music, title: '', lyrics: 'x'.repeat(3001) }, 'user')).toThrow(
      'music.lyrics: at most 3000 characters',
    );
    expect(() => setImagePrompt(doc, 'S1/image', 'x', 'user')).toThrow('is not a scene id');
    expect(() => setImagePrompt(doc, 'S1', 'x', 'user', 'yesterday')).toThrow('not an ISO 8601');
    expect(doc.getMap('board').size).toBe(0);
  });

  it('merges two replicas writing the two halves of one scene', () => {
    const desktop = project();
    const server = replica(desktop);
    setImagePrompt(desktop, 'S3', 'collapsed cathedral facade', 'user', AT);
    setMusicPrompt(server, 'S3', { title: 'Ordini del Re', style: 'martial', lyrics: '[End]' }, 'claude', AT);
    sync(desktop, server);
    for (const doc of [desktop, server]) {
      expect(readBoard(doc).get('S3')).toMatchObject({
        image: { prompt: 'collapsed cathedral facade', by: 'user' },
        music: { title: 'Ordini del Re', by: 'claude' },
      });
    }
  });

  it('reads values another client wrote with the wrong shape as empty', () => {
    const doc = project();
    const board = doc.getMap<unknown>('board');
    board.set('S1/image', 'not a record');
    board.set('S1/music', { title: 7, style: 'x', by: 'robot', at: 'never' });
    board.set('S1/chosenImage', 'no-such-file');
    board.set('nonsense', { prompt: 'x' });
    expect(readBoard(doc)).toEqual(
      new Map([
        [
          'S1',
          {
            image: null,
            music: { title: '', style: 'x', lyrics: '', by: 'user', at: '' },
            chosenImage: null,
            chosenTrack: null,
          },
        ],
      ]),
    );
  });
});

describe('files', () => {
  it('adds files with an id and a date, and skips a sha256 already listed', () => {
    const doc = project();
    const first = addFiles(doc, [image(1, { addedAt: AT }), track(2, { addedAt: AT })]);
    expect(first.skipped).toEqual([]);
    expect(first.added.map((f) => f.sha256)).toEqual([hash(1), hash(2)]);
    expect(first.added[0]).toMatchObject({ kind: 'image', thumbSha256: hash(1001), width: 1456, duration: null });
    expect(first.added[1]).toMatchObject({ kind: 'audio', thumbSha256: null, width: null, duration: 192.5 });
    const later = '2026-10-21T09:00:00.000Z';
    const again = addFiles(doc, [image(1), image(3, { addedAt: later }), image(3)]);
    expect(again.added.map((f) => f.sha256)).toEqual([hash(3)]);
    expect(again.skipped.map((f) => f.sha256)).toEqual([hash(1), hash(3)]);
    expect(readFiles(doc).map((f) => f.sha256)).toEqual([...[hash(1), hash(2)].sort(byId(doc)), hash(3)]);
  });

  it('adds a batch in one transaction', () => {
    const doc = project();
    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);
    addFiles(doc, [image(1), image(2), image(3)]);
    expect(transactions).toBe(1);
  });

  it('reads files oldest first, ties by id', () => {
    const doc = project();
    addFiles(doc, [image(1, { addedAt: '2026-10-20T10:00:00.000Z' }), image(2, { addedAt: AT })]);
    addFiles(doc, [image(3, { addedAt: AT })]);
    const files = readFiles(doc);
    expect(files[0]!.addedAt).toBe(AT);
    expect(files.map((f) => f.sha256).slice(0, 2).sort()).toEqual([hash(2), hash(3)]);
    expect(files[0]!.id < files[1]!.id).toBe(true);
    expect(files[2]!.sha256).toBe(hash(1));
  });

  it('checks every file before adding any', () => {
    const doc = project();
    expect(() => addFiles(doc, [image(1), image(2, { sha256: 'ABC' })])).toThrow('files[1].sha256');
    expect(() => addFiles(doc, [image(1, { name: 'x'.repeat(LIMITS.fileName + 1) })])).toThrow(
      'files[0].name: at most 255 characters',
    );
    expect(() => addFiles(doc, [image(1, { kind: 'video' as 'image' })])).toThrow('unknown kind');
    expect(() => addFiles(doc, [image(1, { thumbSha256: 'x' })])).toThrow('thumbSha256');
    expect(() => addFiles(doc, [image(1, { size: -1 })])).toThrow('size');
    expect(readFiles(doc)).toEqual([]);
  });

  it(`refuses past ${CAPS.files} files`, () => {
    const doc = project();
    addFiles(doc, Array.from({ length: CAPS.files - 1 }, (_, i) => image(i + 1)));
    expect(() => addFiles(doc, [image(9001), image(9002)])).toThrow(`files: at most ${CAPS.files} items`);
    expect(readFiles(doc)).toHaveLength(CAPS.files - 1);
    addFiles(doc, [image(9001)]);
    expect(readFiles(doc)).toHaveLength(CAPS.files);
  });

  it('leaves out files another client wrote without an id, a valid sha256 or a known kind', () => {
    const doc = project();
    addFiles(doc, [image(1)]);
    const files = doc.getArray<Y.Map<unknown>>('files');
    const bad = (fields: Record<string, unknown>) => {
      const item = new Y.Map<unknown>();
      for (const [k, v] of Object.entries(fields)) item.set(k, v);
      return item;
    };
    files.push([
      bad({ id: 'a', sha256: 'XYZ', kind: 'image' }),
      bad({ id: 'b', sha256: hash(5), kind: 'video' }),
      bad({ id: 7, sha256: hash(6), kind: 'image' }),
      bad({ id: 'c', sha256: hash(7), kind: 'audio', size: 'big', width: 10, thumbSha256: hash(8), matchedBy: 'magic' }),
    ]);
    const read = readFiles(doc);
    expect(read.map((f) => f.id).includes('c')).toBe(true);
    expect(read).toHaveLength(2);
    expect(read.find((f) => f.id === 'c')).toMatchObject({
      size: 0,
      width: null,
      thumbSha256: null,
      matchedBy: null,
      sceneId: null,
      addedBy: 'user',
    });
  });

  it('names every hash the document lists, thumbnails and unknown kinds included', () => {
    const doc = project();
    addFiles(doc, [image(1), track(2)]);
    const item = new Y.Map<unknown>();
    for (const [k, v] of Object.entries({ id: 'v', sha256: hash(3), kind: 'video', thumbSha256: 'bad' })) item.set(k, v);
    doc.getArray<Y.Map<unknown>>('files').push([item]);
    expect([...fileHashes(doc)].sort()).toEqual([hash(1), hash(2), hash(3), hash(1001)].sort());
  });

  it('chooses and unchooses a file of the scene', () => {
    const doc = project();
    const [a, b] = addFiles(doc, [image(1), image(2)]).added;
    chooseFile(doc, 'S1', 'image', b!.id);
    expect(readBoard(doc).get('S1')?.chosenImage).toBe(b!.id);
    chooseFile(doc, 'S1', 'image', a!.id);
    expect(readBoard(doc).get('S1')?.chosenImage).toBe(a!.id);
    chooseFile(doc, 'S1', 'image', null);
    expect(readBoard(doc).get('S1')?.chosenImage).toBeNull();
  });

  it('refuses to choose a file of another scene or kind', () => {
    const doc = project();
    const [a, t] = addFiles(doc, [image(1, { sceneId: 'S2' }), track(2)]).added;
    expect(() => chooseFile(doc, 'S1', 'image', a!.id)).toThrow(`No image ${a!.id} in S1`);
    expect(() => chooseFile(doc, 'S1', 'image', t!.id)).toThrow(`No image ${t!.id} in S1`);
    chooseFile(doc, 'S1', 'audio', t!.id);
    expect(readBoard(doc).get('S1')?.chosenTrack).toBe(t!.id);
  });

  it('moves a file to another scene, unchoosing it in the old one', () => {
    const doc = project();
    const [a, t] = addFiles(doc, [image(1), track(2)]).added;
    chooseFile(doc, 'S1', 'image', a!.id);
    chooseFile(doc, 'S1', 'audio', t!.id);
    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);
    assignFile(doc, a!.id, 'S4');
    expect(transactions).toBe(1);
    expect(readFiles(doc).find((f) => f.id === a!.id)).toMatchObject({ sceneId: 'S4', matchedBy: 'hand' });
    expect(readBoard(doc).get('S1')).toMatchObject({ chosenImage: null, chosenTrack: t!.id });
    assignFile(doc, t!.id, null);
    expect(readFiles(doc).find((f) => f.id === t!.id)).toMatchObject({ sceneId: null, matchedBy: null });
    expect(readBoard(doc).get('S1')?.chosenTrack).toBeNull();
    expect(() => assignFile(doc, 'nope', 'S1')).toThrow('No file nope');
  });

  it('removes a file, unchoosing it', () => {
    const doc = project();
    const [a, b] = addFiles(doc, [image(1), image(2)]).added;
    chooseFile(doc, 'S1', 'image', a!.id);
    removeFile(doc, a!.id);
    expect(readFiles(doc).map((f) => f.id)).toEqual([b!.id]);
    expect(readBoard(doc).get('S1')?.chosenImage).toBeNull();
    removeFile(doc, 'nope');
    expect(readFiles(doc)).toHaveLength(1);
  });

  it('reads a choice whose file was removed by another replica as none', () => {
    const one = project();
    const [a] = addFiles(one, [image(1)]).added;
    const two = replica(one);
    chooseFile(one, 'S1', 'image', a!.id);
    removeFile(two, a!.id);
    sync(one, two);
    expect(readBoard(one).get('S1')?.chosenImage).toBeNull();
    expect(readBoard(two).get('S1')?.chosenImage).toBeNull();
  });
});

describe('rows', () => {
  it('makes one row per appendix row with a scene id, in document order', () => {
    const doc = project();
    setImagePrompt(doc, 'S2', 'ruined office', 'claude', AT);
    const rows = boardRows(appendix, readBoard(doc), readFiles(doc));
    expect(rows.map((r) => [r.sceneId, r.title, r.visual, r.mood])).toEqual([
      ['S1', 'La casa che cede', 'collapsed 1900s Sicilian library at night', 'chaotic, suffocating'],
      ['S2', "L'ordine di Donato", "ruined doctor's office", null],
    ]);
    expect(rows[1]!.image).toEqual({ prompt: 'ruined office', by: 'claude', at: AT });
    expect(rows[0]).toMatchObject({ image: null, music: null, images: [], tracks: [] });
  });

  it('derives each half’s status from its files', () => {
    const doc = project();
    const [a] = addFiles(doc, [image(1), image(2), track(3, { sceneId: 'S2' })]).added;
    let [s1, s2] = boardRows(appendix, readBoard(doc), readFiles(doc));
    expect([s1!.imageStatus, s1!.musicStatus, s2!.imageStatus, s2!.musicStatus]).toEqual([
      'received',
      'wanted',
      'wanted',
      'received',
    ]);
    chooseFile(doc, 'S1', 'image', a!.id);
    [s1, s2] = boardRows(appendix, readBoard(doc), readFiles(doc));
    expect(s1).toMatchObject({ imageStatus: 'chosen', chosenImage: a!.id });
    expect(s1!.images).toHaveLength(2);
    expect(s2!.tracks).toHaveLength(1);
  });

  it('marks the rows whose music titles share a match key', () => {
    const doc = project();
    setMusicPrompt(doc, 'S1', { title: 'Cinque e venti', style: '', lyrics: '' }, 'claude');
    setMusicPrompt(doc, 'S2', { title: 'cinque-e-venti!', style: '', lyrics: '' }, 'claude');
    const rows = boardRows(appendix, readBoard(doc), readFiles(doc));
    expect(rows.map((r) => r.duplicateTitle)).toEqual([true, true]);
    expect(duplicateTitles(rows)).toEqual(['Cinque e venti']);
    setMusicPrompt(doc, 'S2', { title: 'Anatomia', style: '', lyrics: '' }, 'claude');
    expect(boardRows(appendix, readBoard(doc), readFiles(doc)).map((r) => r.duplicateTitle)).toEqual([false, false]);
  });

  it('puts in the tray files with no scene and files whose scene is not in the appendix', () => {
    const doc = project();
    setImagePrompt(doc, 'S6', 'kept, not shown', 'claude');
    addFiles(doc, [image(1), image(2, { sceneId: null }), image(3, { sceneId: 'S6' })]);
    const files = readFiles(doc);
    expect(boardRows(appendix, readBoard(doc), files).map((r) => r.sceneId)).toEqual(['S1', 'S2']);
    const tray = unmatchedFiles(appendix, files).map(({ file, reason }) => [file.sha256, reason]);
    expect(tray.sort()).toEqual([
      [hash(2), null],
      [hash(3), 'Scene S6 is not in the appendix.'],
    ]);
    expect(readBoard(doc).get('S6')?.image?.prompt).toBe('kept, not shown');
  });
});
