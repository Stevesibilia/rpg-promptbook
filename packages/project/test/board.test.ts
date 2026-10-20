import { parseAdventure, templates } from 'promptbook-format';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  addFiles,
  addImagePrompt,
  assignImage,
  assignTrack,
  boardRows,
  CAPS,
  chooseImage,
  chooseTrack,
  duplicateTitles,
  fileHashes,
  LIMITS,
  namedPrompts,
  readBoard,
  readDocumentBoard,
  readFiles,
  readImagePrompts,
  removeFile,
  removeImagePrompt,
  setFirstScenePrompt,
  setMusicPrompt,
  unmatchedFiles,
  updateImagePrompt,
  type NewFile,
} from '../src/index.js';
import { project, replica, sync, v06File } from './helpers.js';

const AT = '2026-10-20T09:00:00.000Z';
const LATER = '2026-10-20T10:00:00.000Z';
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
  sceneId: null,
  promptId: null,
  matchedBy: null,
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
  promptId: null,
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

const scene = (doc: Y.Doc, sceneId: string, prompt: string, at = AT) =>
  addImagePrompt(doc, { category: 'scene', sceneId, prompt }, 'claude', at);
const npc = (doc: Y.Doc, name: string, prompt: string) =>
  addImagePrompt(doc, { category: 'npc', name, prompt }, 'claude', AT);
const promptsMap = (doc: Y.Doc) => doc.getMap<unknown>('imagePrompts');

describe('music prompts', () => {
  it('reads as empty in a document that has no board', () => {
    const doc = project();
    expect(readBoard(doc)).toEqual(new Map());
    expect(readImagePrompts(doc)).toEqual([]);
    expect(readFiles(doc)).toEqual([]);
  });

  it('sets the music prompt and clears it with three empty fields', () => {
    const doc = project();
    const music = { title: 'Cinque e venti', style: 'dark ambient', lyrics: '[Instrumental]\n[End]' };
    setMusicPrompt(doc, 'S2', music, 'claude', AT);
    expect(readBoard(doc).get('S2')).toEqual({ music: { ...music, by: 'claude', at: AT }, chosenTrack: null });
    setMusicPrompt(doc, 'S2', { title: '', style: '', lyrics: '' }, 'user');
    expect(readBoard(doc).get('S2')).toBeUndefined();
  });

  it('writes the music prompt in one transaction under a flat key', () => {
    const doc = project();
    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);
    setMusicPrompt(doc, 'S1', { title: 't', style: 's', lyrics: 'l' }, 'user');
    expect(transactions).toBe(1);
    expect([...doc.getMap('board').keys()]).toEqual(['S1/music']);
  });

  it('checks the limits and the scene id', () => {
    const doc = project();
    const music = { title: 'x'.repeat(121), style: '', lyrics: '' };
    expect(() => setMusicPrompt(doc, 'S1', music, 'user')).toThrow('music.title: at most 120 characters');
    expect(() => setMusicPrompt(doc, 'S1', { ...music, title: '', style: 'x'.repeat(1001) }, 'user')).toThrow(
      'music.style: at most 1000 characters',
    );
    expect(() => setMusicPrompt(doc, 'S1', { ...music, title: '', lyrics: 'x'.repeat(3001) }, 'user')).toThrow(
      'music.lyrics: at most 3000 characters',
    );
    expect(() => setMusicPrompt(doc, 'S1/music', { ...music, title: 'x' }, 'user')).toThrow('is not a scene id');
    expect(() => setMusicPrompt(doc, 'S1', { ...music, title: 'x' }, 'user', 'yesterday')).toThrow('not an ISO 8601');
    expect(doc.getMap('board').size).toBe(0);
  });

  it('merges two replicas writing the image and the music of one scene', () => {
    const desktop = project();
    const server = replica(desktop);
    setFirstScenePrompt(desktop, 'S3', 'collapsed cathedral facade', 'user', AT);
    setMusicPrompt(server, 'S3', { title: 'Ordini del Re', style: 'martial', lyrics: '[End]' }, 'claude', AT);
    sync(desktop, server);
    for (const doc of [desktop, server]) {
      expect(readBoard(doc).get('S3')?.music).toMatchObject({ title: 'Ordini del Re', by: 'claude' });
      expect(readImagePrompts(doc)).toMatchObject([{ sceneId: 'S3', prompt: 'collapsed cathedral facade', by: 'user' }]);
    }
  });

  it('reads values another client wrote with the wrong shape as empty, and ignores the legacy keys', () => {
    const doc = project();
    const board = doc.getMap<unknown>('board');
    board.set('S1/music', { title: 7, style: 'x', by: 'robot', at: 'never' });
    board.set('S1/chosenTrack', 'no-such-file');
    board.set('S1/image', { prompt: 'read by the migration only', by: 'claude', at: AT });
    board.set('nonsense', { prompt: 'x' });
    expect(readBoard(doc)).toEqual(
      new Map([['S1', { music: { title: '', style: 'x', lyrics: '', by: 'user', at: '' }, chosenTrack: null }]]),
    );
    expect(readImagePrompts(doc)).toEqual([]);
  });
});

describe('image prompts', () => {
  it('adds prompts in every category, each in one transaction under flat keys', () => {
    const doc = project();
    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);
    const s1 = scene(doc, 'S1', 'collapsed 1900s Sicilian library at night --ar 16:9');
    const anselmo = npc(doc, 'Padre Anselmo', 'portrait of an old priest --ar 2:3');
    const pc = addImagePrompt(doc, { category: 'pc', name: 'Rosalia Ferrante', prompt: 'portrait of a young woman' }, 'user', AT);
    const letter = addImagePrompt(doc, { category: 'handout', name: 'Lettera di Salvi', prompt: 'an old letter' }, 'user', AT);
    expect(transactions).toBe(4);
    expect(s1).toEqual({
      id: s1.id,
      category: 'scene',
      sceneId: 'S1',
      name: null,
      prompt: 'collapsed 1900s Sicilian library at night --ar 16:9',
      by: 'claude',
      at: AT,
      order: 1,
      chosenFileId: null,
    });
    expect(anselmo).toMatchObject({ category: 'npc', sceneId: null, name: 'Padre Anselmo', order: 1 });
    expect(readImagePrompts(doc).map((p) => p.id).sort()).toEqual([s1.id, anselmo.id, pc.id, letter.id].sort());
    expect(readImagePrompts(doc).find((p) => p.id === letter.id)).toEqual(letter);
    expect([...promptsMap(doc).keys()].filter((k) => k.startsWith(anselmo.id)).sort()).toEqual(
      ['def', 'name', 'order', 'prompt'].map((part) => `${anselmo.id}/${part}`),
    );
    expect(promptsMap(doc).get(`${anselmo.id}/def`)).toEqual({ category: 'npc', sceneId: null });
  });

  it('appends a new prompt after the others of its scene or category, a migrated prompt 1 staying first', () => {
    const doc = project();
    promptsMap(doc).set('legacy-S1/def', { category: 'scene', sceneId: 'S1' });
    const two = scene(doc, 'S1', 'second shot');
    const three = scene(doc, 'S1', 'third shot');
    const other = scene(doc, 'S2', 'another scene');
    const n1 = npc(doc, 'Turi', 'portrait of a boy');
    const n2 = npc(doc, 'Za’ Nina', 'portrait of a fisherwoman');
    expect([two.order, three.order, other.order, n1.order, n2.order]).toEqual([1, 2, 1, 1, 2]);
    const s1 = readImagePrompts(doc).filter((p) => p.sceneId === 'S1');
    expect(s1.map((p) => p.id)).toEqual(['legacy-S1', two.id, three.id]);
    expect(s1[0]).toMatchObject({ order: 0, prompt: '', by: 'user', at: '' });
  });

  it('takes a name only for PCs, NPCs and handouts, and a scene only for scene prompts', () => {
    const doc = project();
    expect(() => addImagePrompt(doc, { category: 'scene', prompt: 'x' }, 'user')).toThrow('sceneId: is required');
    expect(() => addImagePrompt(doc, { category: 'scene', sceneId: 'S1', name: 'n', prompt: 'x' }, 'user')).toThrow(
      'name: only a pc, npc or handout prompt has one',
    );
    expect(() => addImagePrompt(doc, { category: 'npc', prompt: 'x' }, 'user')).toThrow('name: is required');
    expect(() => addImagePrompt(doc, { category: 'npc', name: '  ', prompt: 'x' }, 'user')).toThrow('name: is required');
    expect(() => addImagePrompt(doc, { category: 'pc', name: 'a\nb', prompt: 'x' }, 'user')).toThrow('name: must be one line');
    expect(() => addImagePrompt(doc, { category: 'pc', sceneId: 'S1', name: 'n', prompt: 'x' }, 'user')).toThrow(
      'sceneId: only a scene prompt has one',
    );
    expect(() => addImagePrompt(doc, { category: 'map' as 'pc', name: 'n', prompt: 'x' }, 'user')).toThrow('unknown category');
    expect(() => addImagePrompt(doc, { category: 'scene', sceneId: 'S1/x', prompt: 'x' }, 'user')).toThrow('is not a scene id');
    expect(() => scene(doc, 'S1', 'x'.repeat(LIMITS.imagePrompt + 1))).toThrow('prompt: at most 2000 characters');
    expect(() => addImagePrompt(doc, { category: 'npc', name: 'x'.repeat(LIMITS.name + 1), prompt: 'x' }, 'user')).toThrow(
      'name: at most 200 characters',
    );
    expect(() => scene(doc, 'S1', 'x', 'yesterday')).toThrow('not an ISO 8601');
    const s = scene(doc, 'S1', 'x');
    expect(() => updateImagePrompt(doc, s.id, { name: 'n' }, 'user')).toThrow('name: a scene prompt has none');
    expect(() => updateImagePrompt(doc, s.id, {}, 'user')).toThrow('Send prompt, name or both');
    expect(() => updateImagePrompt(doc, 'nope', { prompt: 'y' }, 'user')).toThrow('No image prompt nope');
    expect(readImagePrompts(doc)).toHaveLength(1);
    expect(promptsMap(doc).size).toBe(3);
  });

  it(`refuses past ${CAPS.imagePrompts} prompts, and readers keep the first ${CAPS.imagePrompts}`, () => {
    const doc = project();
    doc.transact(() => {
      for (let i = 0; i < CAPS.imagePrompts - 1; i++) {
        promptsMap(doc).set(`p${String(i).padStart(4, '0')}/def`, { category: 'npc', sceneId: null });
        promptsMap(doc).set(`p${String(i).padStart(4, '0')}/order`, i);
      }
    });
    npc(doc, 'Last', 'the last one');
    expect(() => npc(doc, 'One more', 'x')).toThrow(`imagePrompts: at most ${CAPS.imagePrompts} items`);
    expect(() => setFirstScenePrompt(doc, 'S1', 'x', 'user')).toThrow(`imagePrompts: at most ${CAPS.imagePrompts} items`);
    promptsMap(doc).set('zzz/def', { category: 'pc', sceneId: null });
    promptsMap(doc).set('zzz/order', 10_000);
    const read = readImagePrompts(doc);
    expect(read).toHaveLength(CAPS.imagePrompts);
    expect(read.some((p) => p.id === 'zzz')).toBe(false);
  });

  it('updates the text with who and when, and the name, two replicas merging the two', () => {
    const doc = project();
    const n = npc(doc, 'Turi', 'portrait of a boy');
    const other = replica(doc);
    updateImagePrompt(doc, n.id, { prompt: 'portrait of a Sicilian boy' }, 'user', LATER);
    updateImagePrompt(other, n.id, { name: 'Turi Mancuso' }, 'claude', LATER);
    sync(doc, other);
    for (const d of [doc, other]) {
      expect(readImagePrompts(d)[0]).toMatchObject({
        name: 'Turi Mancuso',
        prompt: 'portrait of a Sicilian boy',
        by: 'user',
        at: LATER,
      });
    }
  });

  it('removes a prompt: its keys go, its images keep its id and wait in the tray, no file is removed', () => {
    const doc = project();
    const s = scene(doc, 'S1', 'collapsed library');
    const keep = scene(doc, 'S1', 'second shot');
    const [a, b] = addFiles(doc, [image(1, { promptId: s.id, matchedBy: 'prompt' }), image(2, { promptId: s.id })]).added;
    chooseImage(doc, s.id, a!.id);
    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);
    expect(removeImagePrompt(doc, s.id)).toEqual({ images: 2 });
    expect(transactions).toBe(1);
    expect([...promptsMap(doc).keys()].some((k) => k.startsWith(`${s.id}/`))).toBe(false);
    expect(readImagePrompts(doc).map((p) => p.id)).toEqual([keep.id]);
    expect(readFiles(doc).map((f) => [f.id, f.promptId]).sort()).toEqual([
      [a!.id, s.id],
      [b!.id, s.id],
    ].sort());
    const tray = unmatchedFiles(appendix, readImagePrompts(doc), readFiles(doc));
    expect(tray.map((u) => u.reason)).toEqual(['Its prompt was removed.', 'Its prompt was removed.']);
    expect(() => removeImagePrompt(doc, s.id)).toThrow(`No image prompt ${s.id}`);
  });

  it('writes the removed id on a v0.6 image, so a later migration does not take it back', () => {
    const doc = project();
    promptsMap(doc).set('legacy-S1/def', { category: 'scene', sceneId: 'S1' });
    v06File(doc, { id: 'old', sha256: hash(1), kind: 'image', sceneId: 'S1' });
    expect(readFiles(doc)[0]).toMatchObject({ promptId: 'legacy-S1', sceneId: null });
    expect(removeImagePrompt(doc, 'legacy-S1')).toEqual({ images: 1 });
    const item = doc.getArray<Y.Map<unknown>>('files').get(0);
    expect([item.get('promptId'), item.get('sceneId')]).toEqual(['legacy-S1', 'S1']);
  });

  it('sets the text of a scene’s first prompt, creating it when the scene has none', () => {
    const doc = project();
    const created = setFirstScenePrompt(doc, 'S1', 'collapsed library', 'claude', AT);
    expect(created).toMatchObject({ category: 'scene', sceneId: 'S1', prompt: 'collapsed library', order: 1 });
    const second = scene(doc, 'S1', 'second shot');
    const updated = setFirstScenePrompt(doc, 'S1', 'a burning library', 'user', LATER);
    expect(updated).toMatchObject({ id: created.id, prompt: 'a burning library', by: 'user', at: LATER });
    expect(readImagePrompts(doc).map((p) => [p.id, p.prompt])).toEqual([
      [created.id, 'a burning library'],
      [second.id, 'second shot'],
    ]);
  });

  it('reads hostile values: bad defs, orphan keys, a choice of another prompt, unknown parts', () => {
    const doc = project();
    const map = promptsMap(doc);
    const s = scene(doc, 'S1', 'collapsed library');
    const t = scene(doc, 'S2', 'ruined office');
    const [a] = addFiles(doc, [image(1, { promptId: t.id })]).added;
    map.set('bad1/def', { category: 'poster', sceneId: null });
    map.set('bad2/def', { category: 'scene', sceneId: null });
    map.set('bad3/def', 'scene');
    map.set('bad4/def', { category: 'scene', sceneId: 'S1/x' });
    map.set('orphan/prompt', { prompt: 'raced a removal', by: 'claude', at: AT });
    map.set(`${s.id}/chosen`, a!.id);
    map.set(`${s.id}/order`, 'first');
    map.set(`${s.id}/colour`, 'red');
    map.set('no-slash', 1);
    map.set('n/def', { category: 'npc', sceneId: 'S1' });
    map.set('n/prompt', { prompt: 7, by: 'robot', at: 'never' });
    const read = readImagePrompts(doc);
    expect(read.map((p) => p.id).sort()).toEqual(['n', s.id, t.id].sort());
    expect(read.find((p) => p.id === s.id)).toMatchObject({ chosenFileId: null, order: 0 });
    expect(read.find((p) => p.id === 'n')).toMatchObject({ sceneId: null, name: '', prompt: '', by: 'user', at: '' });
  });

  it('reads the later of the text and the migrated one, and the choice over the migrated choice', () => {
    const doc = project();
    const map = promptsMap(doc);
    const [a, b] = addFiles(doc, [image(1, { promptId: 'legacy-S1' }), image(2, { promptId: 'legacy-S1' })]).added;
    map.set('legacy-S1/def', { category: 'scene', sceneId: 'S1' });
    map.set('legacy-S1/legacy', { prompt: 'old', by: 'claude', at: LATER, chosen: a!.id });
    map.set('legacy-S1/prompt', { prompt: 'edited before', by: 'user', at: AT });
    expect(readImagePrompts(doc)[0]).toMatchObject({ prompt: 'old', by: 'claude', at: LATER, chosenFileId: a!.id });
    map.set('legacy-S1/prompt', { prompt: 'edited after', by: 'user', at: '2026-10-20T11:00:00.000Z' });
    map.set('legacy-S1/chosen', b!.id);
    expect(readImagePrompts(doc)[0]).toMatchObject({ prompt: 'edited after', by: 'user', chosenFileId: b!.id });
    map.set('legacy-S1/prompt', { prompt: 'same instant', by: 'user', at: LATER });
    map.set('legacy-S1/chosen', null);
    expect(readImagePrompts(doc)[0]).toMatchObject({ prompt: 'same instant', chosenFileId: null });
  });
});

describe('files', () => {
  it('adds files with an id and a date, and skips a sha256 already listed', () => {
    const doc = project();
    const first = addFiles(doc, [
      image(1, { addedAt: AT, promptId: 'p1', matchedBy: 'prompt' }),
      track(2, { addedAt: AT }),
    ]).added;
    expect(first.map((f) => f.sha256)).toEqual([hash(1), hash(2)]);
    expect(first[0]).toMatchObject({
      kind: 'image',
      thumbSha256: hash(1001),
      width: 1456,
      duration: null,
      promptId: 'p1',
      sceneId: null,
      matchedBy: 'prompt',
    });
    expect(first[1]).toMatchObject({ kind: 'audio', thumbSha256: null, duration: 192.5, sceneId: 'S1', promptId: null });
    const later = '2026-10-21T09:00:00.000Z';
    const again = addFiles(doc, [image(1), image(3, { addedAt: later }), image(3)]);
    expect(again.added.map((f) => f.sha256)).toEqual([hash(3)]);
    expect(again.added[0]).toMatchObject({ promptId: null, matchedBy: null });
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
    expect(() => addFiles(doc, [image(1, { sceneId: 'S1' })])).toThrow('an image belongs to a prompt');
    expect(() => addFiles(doc, [image(1, { promptId: 'a/b' })])).toThrow('is not a prompt id');
    expect(() => addFiles(doc, [track(1, { promptId: 'p' })])).toThrow('a track belongs to a scene');
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
      bad({
        id: 'c',
        sha256: hash(7),
        kind: 'audio',
        size: 'big',
        width: 10,
        thumbSha256: hash(8),
        matchedBy: 'magic',
        promptId: 'p',
      }),
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
      promptId: null,
      addedBy: 'user',
    });
  });

  it('reads an image’s prompt from its promptId, else from its v0.6 scene, and never its scene', () => {
    const doc = project();
    v06File(doc, { id: 'old', sha256: hash(1), kind: 'image', sceneId: 'S3' });
    v06File(doc, { id: 'both', sha256: hash(2), kind: 'image', sceneId: 'S3' });
    doc.getArray<Y.Map<unknown>>('files').get(1).set('promptId', 'p9');
    v06File(doc, { id: 'none', sha256: hash(3), kind: 'image', sceneId: null });
    v06File(doc, { id: 't', sha256: hash(4), kind: 'audio', sceneId: 'S3' });
    expect(readFiles(doc).map((f) => [f.id, f.promptId, f.sceneId])).toEqual([
      ['both', 'p9', null],
      ['none', null, null],
      ['old', 'legacy-S3', null],
      ['t', null, 'S3'],
    ]);
  });

  it('names every hash the document lists, thumbnails and unknown kinds included', () => {
    const doc = project();
    addFiles(doc, [image(1), track(2)]);
    const item = new Y.Map<unknown>();
    for (const [k, v] of Object.entries({ id: 'v', sha256: hash(3), kind: 'video', thumbSha256: 'bad' })) item.set(k, v);
    doc.getArray<Y.Map<unknown>>('files').push([item]);
    expect([...fileHashes(doc)].sort()).toEqual([hash(1), hash(2), hash(3), hash(1001)].sort());
  });

  it('chooses and unchooses an image of the prompt', () => {
    const doc = project();
    const s = scene(doc, 'S1', 'x');
    const [a, b] = addFiles(doc, [image(1, { promptId: s.id }), image(2, { promptId: s.id })]).added;
    const chosen = () => readImagePrompts(doc)[0]!.chosenFileId;
    chooseImage(doc, s.id, b!.id);
    expect(chosen()).toBe(b!.id);
    chooseImage(doc, s.id, a!.id);
    expect(chosen()).toBe(a!.id);
    chooseImage(doc, s.id, null);
    expect(chosen()).toBeNull();
  });

  it('refuses to choose an image of another prompt, a track, or for no prompt', () => {
    const doc = project();
    const s = scene(doc, 'S1', 'x');
    const n = npc(doc, 'Turi', 'y');
    const [a, t] = addFiles(doc, [image(1, { promptId: n.id }), track(2)]).added;
    expect(() => chooseImage(doc, s.id, a!.id)).toThrow(`No image ${a!.id} in ${s.id}`);
    expect(() => chooseImage(doc, s.id, t!.id)).toThrow(`No image ${t!.id} in ${s.id}`);
    expect(() => chooseImage(doc, 'nope', null)).toThrow('No image prompt nope');
    expect(() => chooseTrack(doc, 'S1', a!.id)).toThrow(`No track ${a!.id} in S1`);
    chooseTrack(doc, 'S1', t!.id);
    expect(readBoard(doc).get('S1')?.chosenTrack).toBe(t!.id);
  });

  it('moves an image to another prompt, unchoosing it in the old one, and a track to another scene', () => {
    const doc = project();
    const s = scene(doc, 'S1', 'x');
    const n = npc(doc, 'Turi', 'y');
    const [a, t] = addFiles(doc, [image(1, { promptId: s.id }), track(2)]).added;
    chooseImage(doc, s.id, a!.id);
    chooseTrack(doc, 'S1', t!.id);
    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);
    assignImage(doc, a!.id, n.id);
    expect(transactions).toBe(1);
    expect(readFiles(doc).find((f) => f.id === a!.id)).toMatchObject({ promptId: n.id, matchedBy: 'hand' });
    expect(readImagePrompts(doc).find((p) => p.id === s.id)?.chosenFileId).toBeNull();
    assignImage(doc, a!.id, null);
    expect(readFiles(doc).find((f) => f.id === a!.id)).toMatchObject({ promptId: null, matchedBy: null });
    assignTrack(doc, t!.id, 'S4');
    expect(readFiles(doc).find((f) => f.id === t!.id)).toMatchObject({ sceneId: 'S4', matchedBy: 'hand' });
    expect(readBoard(doc).get('S1')?.chosenTrack).toBeNull();
    expect(() => assignImage(doc, 'nope', n.id)).toThrow('No file nope');
    expect(() => assignImage(doc, t!.id, n.id)).toThrow('is not an image');
    expect(() => assignTrack(doc, a!.id, 'S1')).toThrow('is not a track');
    expect(() => assignImage(doc, a!.id, 'gone')).toThrow('No image prompt gone');
  });

  it('moves a v0.6 image off its scene, writing its prompt and clearing its scene', () => {
    const doc = project();
    promptsMap(doc).set('legacy-S1/def', { category: 'scene', sceneId: 'S1' });
    promptsMap(doc).set('legacy-S1/legacy', { prompt: 'old', by: 'claude', at: AT, chosen: 'old' });
    v06File(doc, { id: 'old', sha256: hash(1), kind: 'image', sceneId: 'S1' });
    const n = npc(doc, 'Turi', 'y');
    expect(readImagePrompts(doc).find((p) => p.id === 'legacy-S1')?.chosenFileId).toBe('old');
    assignImage(doc, 'old', n.id);
    const item = doc.getArray<Y.Map<unknown>>('files').get(0);
    expect([item.get('promptId'), item.get('sceneId')]).toEqual([n.id, null]);
    expect(readImagePrompts(doc).find((p) => p.id === 'legacy-S1')?.chosenFileId).toBeNull();
    expect(promptsMap(doc).get('legacy-S1/chosen')).toBeNull();
  });

  it('removes a file, unchoosing it', () => {
    const doc = project();
    const s = scene(doc, 'S1', 'x');
    const [a, b] = addFiles(doc, [image(1, { promptId: s.id }), image(2, { promptId: s.id })]).added;
    chooseImage(doc, s.id, a!.id);
    removeFile(doc, a!.id);
    expect(readFiles(doc).map((f) => f.id)).toEqual([b!.id]);
    expect(promptsMap(doc).get(`${s.id}/chosen`)).toBeNull();
    removeFile(doc, 'nope');
    expect(readFiles(doc)).toHaveLength(1);
  });

  it('reads a choice whose file was removed by another replica as none', () => {
    const one = project();
    const s = scene(one, 'S1', 'x');
    const [a] = addFiles(one, [image(1, { promptId: s.id })]).added;
    const two = replica(one);
    chooseImage(one, s.id, a!.id);
    removeFile(two, a!.id);
    sync(one, two);
    expect(readImagePrompts(one)[0]!.chosenFileId).toBeNull();
    expect(readImagePrompts(two)[0]!.chosenFileId).toBeNull();
  });
});

describe('rows', () => {
  it('makes one row per appendix row with a scene id, in document order, with its prompts in order', () => {
    const doc = project();
    const p1 = scene(doc, 'S2', 'ruined office');
    const p2 = scene(doc, 'S2', 'the doctor’s desk');
    const rows = boardRows(appendix, readBoard(doc), readImagePrompts(doc), readFiles(doc));
    expect(rows.map((r) => [r.sceneId, r.title, r.visual, r.mood])).toEqual([
      ['S1', 'La casa che cede', 'collapsed 1900s Sicilian library at night', 'chaotic, suffocating'],
      ['S2', "L'ordine di Donato", "ruined doctor's office", null],
    ]);
    expect(rows[1]!.prompts.map((p) => [p.prompt.id, p.number])).toEqual([
      [p1.id, 1],
      [p2.id, 2],
    ]);
    expect(rows[0]).toMatchObject({ prompts: [], music: null, tracks: [] });
  });

  it('derives each prompt’s status from its images, and the music’s from its tracks', () => {
    const doc = project();
    const a = scene(doc, 'S1', 'x');
    const b = scene(doc, 'S1', 'y');
    const [f] = addFiles(doc, [image(1, { promptId: a.id }), image(2, { promptId: a.id }), track(3, { sceneId: 'S2' })]).added;
    let [s1, s2] = boardRows(appendix, readBoard(doc), readImagePrompts(doc), readFiles(doc));
    expect(s1!.prompts.map((p) => p.status)).toEqual(['received', 'wanted']);
    expect([s1!.musicStatus, s2!.musicStatus]).toEqual(['wanted', 'received']);
    chooseImage(doc, a.id, f!.id);
    [s1, s2] = boardRows(appendix, readBoard(doc), readImagePrompts(doc), readFiles(doc));
    expect(s1!.prompts[0]).toMatchObject({ status: 'chosen', chosen: f!.id });
    expect(s1!.prompts[0]!.images).toHaveLength(2);
    expect(s1!.prompts[1]).toMatchObject({ prompt: { id: b.id }, images: [], status: 'wanted' });
    expect(s2!.tracks).toHaveLength(1);
  });

  it('lists the PCs, the NPCs and the handouts, each in order with its images', () => {
    const doc = project();
    const turi = npc(doc, 'Turi', 'x');
    const nina = npc(doc, 'Za’ Nina', 'y');
    const letter = addImagePrompt(doc, { category: 'handout', name: 'Lettera', prompt: 'z' }, 'user');
    addFiles(doc, [image(1, { promptId: nina.id })]);
    const named = namedPrompts(readImagePrompts(doc), readFiles(doc));
    expect(named.pc).toEqual([]);
    expect(named.npc.map((p) => [p.prompt.id, p.number, p.status])).toEqual([
      [turi.id, 1, 'wanted'],
      [nina.id, 2, 'received'],
    ]);
    expect(named.handout.map((p) => p.prompt.id)).toEqual([letter.id]);
  });

  it('marks the rows whose music titles share a match key', () => {
    const doc = project();
    setMusicPrompt(doc, 'S1', { title: 'Cinque e venti', style: '', lyrics: '' }, 'claude');
    setMusicPrompt(doc, 'S2', { title: 'cinque-e-venti!', style: '', lyrics: '' }, 'claude');
    const rows = boardRows(appendix, readBoard(doc), [], readFiles(doc));
    expect(rows.map((r) => r.duplicateTitle)).toEqual([true, true]);
    expect(duplicateTitles(rows)).toEqual(['Cinque e venti']);
    setMusicPrompt(doc, 'S2', { title: 'Anatomia', style: '', lyrics: '' }, 'claude');
    expect(boardRows(appendix, readBoard(doc), [], readFiles(doc)).map((r) => r.duplicateTitle)).toEqual([false, false]);
  });

  it('puts in the tray what has no prompt or scene, a removed prompt’s images, and what the appendix does not show', () => {
    const doc = project();
    const shown = scene(doc, 'S1', 'shown');
    const hidden = scene(doc, 'S6', 'kept, not shown');
    const gone = npc(doc, 'Turi', 'removed');
    const n = (k: number) => ({ addedAt: `2026-10-20T09:0${k}:00.000Z` });
    addFiles(doc, [
      image(1, { promptId: shown.id, ...n(1) }),
      image(2, n(2)),
      image(3, { promptId: hidden.id, ...n(3) }),
      image(4, { promptId: gone.id, ...n(4) }),
      track(5, { sceneId: null, ...n(5) }),
      track(6, { sceneId: 'S6', ...n(6) }),
      track(7, n(7)),
    ]);
    removeImagePrompt(doc, gone.id);
    const tray = unmatchedFiles(appendix, readImagePrompts(doc), readFiles(doc)).map(({ file, reason }) => [file.sha256, reason]);
    expect(tray).toEqual([
      [hash(2), null],
      [hash(3), 'Scene S6 is not in the appendix.'],
      [hash(4), 'Its prompt was removed.'],
      [hash(5), null],
      [hash(6), 'Scene S6 is not in the appendix.'],
    ]);
  });

  it('reads the board of the document, with the PCs, NPCs and handouts and the scene prompts it hides', () => {
    const doc = project({ document: APPENDIX });
    const s1 = scene(doc, 'S1', 'shown');
    const h1 = scene(doc, 'S6', 'hidden one');
    const h2 = scene(doc, 'S6', 'hidden two');
    const turi = npc(doc, 'Turi', 'x');
    const board = readDocumentBoard(doc);
    expect(board.rows.map((r) => [r.sceneId, r.prompts.map((p) => p.prompt.id)])).toEqual([
      ['S1', [s1.id]],
      ['S2', []],
    ]);
    expect(board.named.npc.map((p) => p.prompt.id)).toEqual([turi.id]);
    expect(board.outsideAppendix.map((p) => [p.prompt.id, p.number])).toEqual([
      [h1.id, 1],
      [h2.id, 2],
    ]);
    expect(board.unmatched).toEqual([]);
  });
});
