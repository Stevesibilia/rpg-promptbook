import { parseAdventure, templates } from 'promptbook-format';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  addFiles,
  addImagePrompt,
  addMusicPrompt,
  assignImage,
  assignTrack,
  boardRows,
  CAPS,
  chooseGeneralTrack,
  chooseImage,
  chooseTrack,
  duplicateTitles,
  fileHashes,
  generalMusic,
  LIMITS,
  MAX_REFERENCES,
  namedPrompts,
  readBoard,
  readDocumentBoard,
  readFiles,
  readImagePrompts,
  readMusicPrompts,
  removeFile,
  removeImagePrompt,
  removeMusicPrompt,
  updateMusicPrompt,
  setFileThumb,
  setFirstScenePrompt,
  setMusicPrompt,
  setPromptReferences,
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
      references: [],
      missingReferences: 0,
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
      'name: only a general, pc, npc or handout prompt has one',
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

  it('removes a prompt: a tombstone stays, its other keys go, its images wait in the tray, no file is touched', () => {
    const doc = project();
    const s = scene(doc, 'S1', 'collapsed library');
    const keep = scene(doc, 'S1', 'second shot');
    const [a, b] = addFiles(doc, [image(1, { promptId: s.id, matchedBy: 'prompt' }), image(2, { promptId: s.id })]).added;
    chooseImage(doc, s.id, a!.id);
    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);
    expect(removeImagePrompt(doc, s.id)).toEqual({ images: 2 });
    expect(transactions).toBe(1);
    expect([...promptsMap(doc).keys()].filter((k) => k.startsWith(`${s.id}/`))).toEqual([`${s.id}/removed`]);
    expect(readImagePrompts(doc).map((p) => p.id)).toEqual([keep.id]);
    expect(readFiles(doc).map((f) => [f.id, f.promptId]).sort()).toEqual([
      [a!.id, s.id],
      [b!.id, s.id],
    ].sort());
    const tray = unmatchedFiles(appendix, readImagePrompts(doc), readFiles(doc), []);
    expect(tray.map((u) => u.reason)).toEqual(['Its prompt was removed.', 'Its prompt was removed.']);
    expect(() => removeImagePrompt(doc, s.id)).toThrow(`No image prompt ${s.id}`);
  });

  it('removes a v0.6 prompt without writing to its images, which wait in the tray', () => {
    const doc = project();
    promptsMap(doc).set('legacy-S1/def', { category: 'scene', sceneId: 'S1' });
    v06File(doc, { id: 'old', sha256: hash(1), kind: 'image', sceneId: 'S1' });
    expect(readFiles(doc)[0]).toMatchObject({ promptId: 'legacy-S1', sceneId: null });
    const files = doc.getArray('files').toJSON();
    expect(removeImagePrompt(doc, 'legacy-S1')).toEqual({ images: 1 });
    expect(doc.getArray('files').toJSON()).toEqual(files);
    expect(unmatchedFiles(appendix, readImagePrompts(doc), readFiles(doc), [])).toMatchObject([
      { file: { id: 'old' }, reason: 'Its prompt was removed.' },
    ]);
    // Removed for good: no writer brings it back.
    expect(() => assignImage(doc, 'old', 'legacy-S1')).toThrow('No image prompt legacy-S1');
    expect(() => updateImagePrompt(doc, 'legacy-S1', { prompt: 'x' }, 'user')).toThrow('No image prompt legacy-S1');
  });

  it('does not count removed prompts toward the cap', () => {
    const doc = project();
    doc.transact(() => {
      for (let i = 0; i < CAPS.imagePrompts; i++) {
        promptsMap(doc).set(`p${i}/def`, { category: 'npc', sceneId: null });
        promptsMap(doc).set(`p${i}/removed`, true);
      }
    });
    expect(npc(doc, 'One more', 'x').order).toBe(1);
    expect(readImagePrompts(doc)).toHaveLength(1);
  });

  it('dates an edit no earlier than a migrated text from a clock running ahead, so the edit reads', () => {
    const doc = project();
    const ahead = '2099-01-01T00:00:00.000Z';
    promptsMap(doc).set('legacy-S1/def', { category: 'scene', sceneId: 'S1' });
    promptsMap(doc).set('legacy-S1/legacy', { prompt: 'old text', by: 'claude', at: ahead });
    updateImagePrompt(doc, 'legacy-S1', { prompt: 'new text' }, 'user', AT);
    expect(readImagePrompts(doc)[0]).toMatchObject({ prompt: 'new text', by: 'user', at: ahead });
    expect(setFirstScenePrompt(doc, 'S1', 'newer text', 'claude', AT)).toMatchObject({ prompt: 'newer text', at: ahead });
    expect(readImagePrompts(doc)[0]).toMatchObject({ prompt: 'newer text', by: 'claude' });
    // A migrated text older than the edit keeps the edit's own date.
    promptsMap(doc).set('legacy-S1/legacy', { prompt: 'old text', by: 'claude', at: AT });
    updateImagePrompt(doc, 'legacy-S1', { prompt: 'later text' }, 'user', LATER);
    expect(readImagePrompts(doc)[0]).toMatchObject({ prompt: 'later text', at: LATER });
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
    assignTrack(doc, t!.id, { sceneId: 'S4' });
    expect(readFiles(doc).find((f) => f.id === t!.id)).toMatchObject({ sceneId: 'S4', matchedBy: 'hand' });
    expect(readBoard(doc).get('S1')?.chosenTrack).toBeNull();
    expect(() => assignImage(doc, 'nope', n.id)).toThrow('No file nope');
    expect(() => assignImage(doc, t!.id, n.id)).toThrow('is not an image');
    expect(() => assignTrack(doc, a!.id, { sceneId: 'S1' })).toThrow('is not a track');
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
    const tray = unmatchedFiles(appendix, readImagePrompts(doc), readFiles(doc), []).map(({ file, reason }) => [file.sha256, reason]);
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

describe('generated images (board-image-generation D9, D12)', () => {
  const generated = (n: number, promptId: string, overrides: Partial<NewFile> = {}) =>
    image(n, {
      name: `S1-p1-gpt-${n}.png`,
      thumbSha256: null,
      promptId,
      matchedBy: 'generated',
      generatedModel: 'gpt',
      cost: 0.041,
      ...overrides,
    });
  const mapOfFile = (doc: Y.Doc, sha256: string) =>
    doc
      .getArray<Y.Map<unknown>>('files')
      .toArray()
      .find((item) => item.get('sha256') === sha256)!;

  it('reads a generated file back with its model, cost and matchedBy', () => {
    const doc = project({ document: APPENDIX });
    const p = scene(doc, 'S1', 'a library');
    const { added } = addFiles(doc, [generated(1, p.id), generated(2, p.id, { generatedModel: 'nb', cost: null, mime: 'image/jpeg' })]);
    expect(added.map((f) => [f.generatedModel, f.cost, f.matchedBy])).toEqual([
      ['gpt', 0.041, 'generated'],
      ['nb', null, 'generated'],
    ]);
    const files = readFiles(doc).sort((a, b) => (a.sha256 < b.sha256 ? -1 : 1));
    expect(files.map((f) => [f.generatedModel, f.cost, f.matchedBy, f.sceneId, f.promptId])).toEqual([
      ['gpt', 0.041, 'generated', null, p.id],
      ['nb', null, 'generated', null, p.id],
    ]);
    // The cost goes in the map only when set.
    expect(mapOfFile(doc, hash(2)).has('cost')).toBe(false);
    expect(mapOfFile(doc, hash(2)).get('generatedModel')).toBe('nb');
    expect(readDocumentBoard(doc).rows[0]!.prompts[0]!.images).toHaveLength(2);
  });

  it('reads an older file with both fields null, and writes neither into its map', () => {
    const doc = project();
    v06File(doc, { id: 'old', sha256: hash(3), kind: 'image', sceneId: 'S1' });
    addFiles(doc, [image(4), track(5)]);
    for (const file of readFiles(doc)) {
      expect(file.generatedModel).toBeNull();
      expect(file.cost).toBeNull();
    }
    for (const n of [4, 5]) {
      expect(mapOfFile(doc, hash(n)).has('generatedModel')).toBe(false);
      expect(mapOfFile(doc, hash(n)).has('cost')).toBe(false);
    }
  });

  it('drops a malformed model or cost to null, and reads none on a track', () => {
    const doc = project();
    addFiles(doc, [image(6), track(7)]);
    mapOfFile(doc, hash(6)).set('generatedModel', 'midjourney');
    mapOfFile(doc, hash(6)).set('cost', -1);
    mapOfFile(doc, hash(7)).set('generatedModel', 'gpt');
    mapOfFile(doc, hash(7)).set('cost', 0.04);
    for (const file of readFiles(doc)) expect([file.generatedModel, file.cost]).toEqual([null, null]);
    mapOfFile(doc, hash(6)).set('cost', '0.04');
    expect(readFiles(doc).find((f) => f.sha256 === hash(6))!.cost).toBeNull();
    mapOfFile(doc, hash(6)).set('cost', Number.NaN);
    expect(readFiles(doc).find((f) => f.sha256 === hash(6))!.cost).toBeNull();
  });

  it('refuses a generated field that is not one', () => {
    const doc = project();
    expect(() => addFiles(doc, [image(8, { generatedModel: 'flux' as 'gpt' })])).toThrow(/generatedModel/);
    expect(() => addFiles(doc, [image(8, { cost: -0.01 })])).toThrow(/cost/);
    expect(() => addFiles(doc, [image(8, { cost: Number.POSITIVE_INFINITY })])).toThrow(/cost/);
    expect(() => addFiles(doc, [track(8, { generatedModel: 'gpt' })])).toThrow(/only an image/);
    expect(readFiles(doc)).toEqual([]);
  });

  // atelier-image-provider design decision 11.
  const ATELIER_ID = '3f2c8a10-5b7e-4c1d-9a2b-0e6f4d8c1a77';

  it('reads a generated file without generatedVia as OpenRouter, and writes no generatedVia for it', () => {
    const doc = project({ document: APPENDIX });
    const p = scene(doc, 'S1', 'a library');
    const [file] = addFiles(doc, [generated(20, p.id)]).added;
    expect(file).toMatchObject({ generatedVia: 'openrouter', atelierImageId: null });
    expect(readFiles(doc)[0]).toMatchObject({ generatedVia: 'openrouter', atelierImageId: null });
    // The map is the one an OpenRouter image had before Atelier.
    expect(mapOfFile(doc, hash(20)).has('generatedVia')).toBe(false);
    expect(mapOfFile(doc, hash(20)).has('atelierImageId')).toBe(false);
    // Nor on a file that is not generated, which reads both null.
    addFiles(doc, [image(21), track(22)]);
    for (const n of [21, 22]) {
      expect(readFiles(doc).find((f) => f.sha256 === hash(n))).toMatchObject({ generatedVia: null, atelierImageId: null });
      expect(mapOfFile(doc, hash(n)).has('generatedVia')).toBe(false);
    }
  });

  it('reads a file generated through Atelier with its provider and Atelier id', () => {
    const doc = project({ document: APPENDIX });
    const p = scene(doc, 'S1', 'a library');
    const { added } = addFiles(doc, [
      generated(23, p.id, { generatedModel: 'nb', cost: 0.037, generatedVia: 'atelier', atelierImageId: ATELIER_ID }),
      generated(24, p.id, { generatedVia: 'openrouter' }),
    ]);
    expect(added.map((f) => [f.generatedVia, f.atelierImageId])).toEqual([
      ['atelier', ATELIER_ID],
      ['openrouter', null],
    ]);
    const read = readFiles(doc).find((f) => f.sha256 === hash(23))!;
    expect(read).toMatchObject({ generatedModel: 'nb', cost: 0.037, generatedVia: 'atelier', atelierImageId: ATELIER_ID });
    expect(mapOfFile(doc, hash(23)).get('generatedVia')).toBe('atelier');
    expect(mapOfFile(doc, hash(24)).get('generatedVia')).toBe('openrouter');
  });

  it('drops an Atelier id that is not a uuid or not on an Atelier image, and an unknown provider', () => {
    const doc = project({ document: APPENDIX });
    const p = scene(doc, 'S1', 'a library');
    addFiles(doc, [
      generated(25, p.id, { generatedVia: 'atelier', atelierImageId: ATELIER_ID }),
      generated(26, p.id),
      image(27),
    ]);
    const of = (n: number) => readFiles(doc).find((f) => f.sha256 === hash(n))!;
    for (const bad of ['javascript:alert(1)', `${ATELIER_ID}/x`, 42, '']) {
      mapOfFile(doc, hash(25)).set('atelierImageId', bad);
      expect(of(25)).toMatchObject({ generatedVia: 'atelier', atelierImageId: null });
    }
    // An id on a generated image that names another provider is not read.
    mapOfFile(doc, hash(26)).set('atelierImageId', ATELIER_ID);
    expect(of(26)).toMatchObject({ generatedVia: 'openrouter', atelierImageId: null });
    // An unknown provider on a generated image reads OpenRouter; on a file
    // that is not generated, none. A file that is not generated keeps its
    // Atelier id: it was attached from Atelier (connector-board-images
    // design decision 7).
    mapOfFile(doc, hash(25)).set('generatedVia', 'flux');
    expect(of(25).generatedVia).toBe('openrouter');
    mapOfFile(doc, hash(27)).set('generatedVia', 'atelier');
    mapOfFile(doc, hash(27)).set('atelierImageId', ATELIER_ID);
    expect(of(27)).toMatchObject({ generatedVia: null, atelierImageId: ATELIER_ID });
    mapOfFile(doc, hash(27)).set('atelierImageId', 'not-a-uuid');
    expect(of(27).atelierImageId).toBeNull();
  });

  // connector-board-images design decision 7.
  it('keeps the Atelier id of an image attached from Atelier, with no model, cost or provider', () => {
    const doc = project({ document: APPENDIX });
    const p = scene(doc, 'S1', 'a library');
    const { added } = addFiles(doc, [image(30, { promptId: p.id, matchedBy: 'hand', addedBy: 'claude', atelierImageId: ATELIER_ID })]);
    expect(added[0]).toMatchObject({ generatedModel: null, cost: null, generatedVia: null, atelierImageId: ATELIER_ID });
    expect(readFiles(doc).find((f) => f.sha256 === hash(30))).toMatchObject({
      promptId: p.id,
      matchedBy: 'hand',
      addedBy: 'claude',
      generatedModel: null,
      cost: null,
      generatedVia: null,
      atelierImageId: ATELIER_ID,
    });
    expect(mapOfFile(doc, hash(30)).get('atelierImageId')).toBe(ATELIER_ID);
    expect(mapOfFile(doc, hash(30)).has('generatedVia')).toBe(false);
    // A generated Atelier file reads as before.
    addFiles(doc, [generated(31, p.id, { generatedModel: 'nb', cost: 0.037, generatedVia: 'atelier', atelierImageId: ATELIER_ID })]);
    expect(readFiles(doc).find((f) => f.sha256 === hash(31))).toMatchObject({
      generatedModel: 'nb',
      cost: 0.037,
      generatedVia: 'atelier',
      atelierImageId: ATELIER_ID,
    });
  });

  it('refuses an Atelier id that is not a uuid on an attached image, or on an image generated through OpenRouter', () => {
    const doc = project();
    expect(() => addFiles(doc, [image(32, { atelierImageId: 'not-a-uuid' })])).toThrow(
      'files[0].atelierImageId: a uuid, on an image generated through Atelier or attached from it',
    );
    expect(() => addFiles(doc, [image(32, { generatedModel: 'gpt', generatedVia: 'openrouter', atelierImageId: ATELIER_ID })])).toThrow(
      /atelierImageId: a uuid, on an image generated through Atelier or attached from it/,
    );
    expect(readFiles(doc)).toEqual([]);
  });

  it('refuses a provider or Atelier id that is not one', () => {
    const doc = project();
    expect(() => addFiles(doc, [image(28, { generatedModel: 'gpt', generatedVia: 'flux' as 'atelier' })])).toThrow(/generatedVia/);
    expect(() => addFiles(doc, [image(28, { generatedVia: 'atelier' })])).toThrow(/generatedVia/);
    expect(() =>
      addFiles(doc, [image(28, { generatedModel: 'gpt', generatedVia: 'atelier', atelierImageId: 'not-a-uuid' })]),
    ).toThrow(/atelierImageId/);
    expect(() =>
      addFiles(doc, [image(28, { generatedModel: 'gpt', generatedVia: 'openrouter', atelierImageId: ATELIER_ID })]),
    ).toThrow(/atelierImageId/);
    expect(readFiles(doc)).toEqual([]);
  });

  it('keeps matchedBy generated through a move and back', () => {
    const doc = project({ document: APPENDIX });
    const p = scene(doc, 'S1', 'a library');
    const q = scene(doc, 'S1', 'another');
    const [file] = addFiles(doc, [generated(9, p.id)]).added;
    expect(readFiles(doc)[0]!.matchedBy).toBe('generated');
    assignImage(doc, file!.id, q.id);
    expect(readFiles(doc)[0]).toMatchObject({ promptId: q.id, matchedBy: 'hand', generatedModel: 'gpt', cost: 0.041 });
    // A file whose prompt is removed waits in Unmatched, its model and cost kept.
    removeImagePrompt(doc, q.id);
    const tray = readDocumentBoard(doc).unmatched;
    expect(tray.map((u) => [u.file.generatedModel, u.reason])).toEqual([['gpt', 'Its prompt was removed.']]);
  });

  it('sets a thumbnail once, only while it is null', () => {
    const doc = project({ document: APPENDIX });
    const p = scene(doc, 'S1', 'a library');
    const [file] = addFiles(doc, [generated(10, p.id)]).added;
    const other = replica(doc);
    expect(readFiles(doc)[0]!.thumbSha256).toBeNull();
    expect(setFileThumb(doc, file!.id, hash(2000))).toBe(true);
    expect(readFiles(doc)[0]!.thumbSha256).toBe(hash(2000));
    expect(setFileThumb(doc, file!.id, hash(2001))).toBe(false);
    expect(readFiles(doc)[0]!.thumbSha256).toBe(hash(2000));
    // Another device that has seen it set refuses too.
    sync(doc, other);
    expect(setFileThumb(other, file!.id, hash(2002))).toBe(false);
  });

  it('sets no thumbnail on a track, a missing file, or with a bad hash', () => {
    const doc = project();
    const [audio] = addFiles(doc, [track(11)]).added;
    expect(setFileThumb(doc, audio!.id, hash(2003))).toBe(false);
    expect(setFileThumb(doc, 'nope', hash(2003))).toBe(false);
    const [img] = addFiles(doc, [image(12, { thumbSha256: null })]).added;
    expect(() => setFileThumb(doc, img!.id, 'ABC')).toThrow(/thumbSha256/);
    expect(readFiles(doc).every((f) => f.thumbSha256 === null)).toBe(true);
  });
});

describe('reference images (reference-images D1 to D3)', () => {
  const generated = (n: number, promptId: string, overrides: Partial<NewFile> = {}) =>
    image(n, { thumbSha256: null, promptId, matchedBy: 'generated', generatedModel: 'gpt', cost: 0.041, ...overrides });
  // A board with a scene prompt, an NPC prompt and their images, plus a track.
  function board() {
    const doc = project({ document: APPENDIX });
    const p = scene(doc, 'S2', 'a ruined office');
    const anselmo = npc(doc, 'Padre Anselmo', 'portrait of an old priest');
    const [a, b, c, d] = addFiles(doc, [
      image(1, { promptId: anselmo.id }),
      image(2, { promptId: p.id }),
      image(3, { promptId: anselmo.id }),
      image(4),
    ]).added;
    const [audio] = addFiles(doc, [track(5)]).added;
    return { doc, p, anselmo, ids: [a!.id, b!.id, c!.id, d!.id], track: audio!.id };
  }
  const refsOf = (doc: Y.Doc, id: string) => readImagePrompts(doc).find((p) => p.id === id)!;

  it('remembers the references in one transaction under the flat key refs, in the order given', () => {
    const { doc, p, ids } = board();
    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);
    expect(setPromptReferences(doc, p.id, [ids[2]!, ids[0]!], 'user')).toEqual([ids[2], ids[0]]);
    expect(transactions).toBe(1);
    expect(promptsMap(doc).get(`${p.id}/refs`)).toEqual([ids[2], ids[0]]);
    expect(refsOf(doc, p.id)).toMatchObject({ references: [ids[2], ids[0]], missingReferences: 0 });
    // A new prompt has none.
    expect(refsOf(doc, readImagePrompts(doc).find((q) => q.name === 'Padre Anselmo')!.id)).toMatchObject({
      references: [],
      missingReferences: 0,
    });
  });

  it('takes an image of the same prompt, an unmatched image and an image of any category', () => {
    const { doc, p, ids } = board();
    // ids[1] is the prompt's own image, ids[3] waits in the tray, ids[0] is an NPC's.
    expect(setPromptReferences(doc, p.id, [ids[1]!, ids[3]!, ids[0]!], 'claude')).toEqual([ids[1], ids[3], ids[0]]);
  });

  it(`stores each id once, only image files of the project, the first ${MAX_REFERENCES}`, () => {
    const { doc, p, ids, track: trackId } = board();
    expect(MAX_REFERENCES).toBe(3);
    const stored = setPromptReferences(doc, p.id, [ids[0]!, ids[0]!, 'gone', trackId, ids[1]!, ids[2]!, ids[3]!], 'user');
    expect(stored).toEqual([ids[0], ids[1], ids[2]]);
    expect(promptsMap(doc).get(`${p.id}/refs`)).toEqual(stored);
  });

  it('deletes the key on an empty list, or one with no valid id, and writes nothing when unchanged', () => {
    const { doc, p, ids } = board();
    setPromptReferences(doc, p.id, [ids[0]!], 'user');
    let transactions = 0;
    let changed = 0;
    doc.on('afterTransaction', (tr: Y.Transaction) => {
      transactions++;
      if (tr.changed.size > 0) changed++;
    });
    setPromptReferences(doc, p.id, [ids[0]!], 'user');
    expect([transactions, changed]).toEqual([1, 0]);
    expect(setPromptReferences(doc, p.id, [], 'user')).toEqual([]);
    expect(promptsMap(doc).has(`${p.id}/refs`)).toBe(false);
    setPromptReferences(doc, p.id, [ids[0]!], 'user');
    expect(setPromptReferences(doc, p.id, ['gone'], 'user')).toEqual([]);
    expect(promptsMap(doc).has(`${p.id}/refs`)).toBe(false);
  });

  it('drops a reference whose file is removed, counts it as missing, and cleans it on the next write', () => {
    const { doc, p, ids } = board();
    setPromptReferences(doc, p.id, [ids[0]!, ids[1]!], 'user');
    removeFile(doc, ids[0]!);
    expect(refsOf(doc, p.id)).toMatchObject({ references: [ids[1]], missingReferences: 1 });
    // The stored list keeps it until a write.
    expect(promptsMap(doc).get(`${p.id}/refs`)).toEqual([ids[0], ids[1]]);
    setPromptReferences(doc, p.id, [...refsOf(doc, p.id).references, ids[2]!], 'user');
    expect(promptsMap(doc).get(`${p.id}/refs`)).toEqual([ids[1], ids[2]]);
    expect(refsOf(doc, p.id)).toMatchObject({ references: [ids[1], ids[2]], missingReferences: 0 });
  });

  it('reads hostile stored values: not a list, non-ids, duplicates, more than the cap', () => {
    const { doc, p, ids } = board();
    const key = `${p.id}/refs`;
    promptsMap(doc).set(key, 'nonsense');
    expect(refsOf(doc, p.id)).toMatchObject({ references: [], missingReferences: 0 });
    promptsMap(doc).set(key, [42, null, '', 'a/b', ids[0]!, ids[0]!, 'gone', 'gone']);
    expect(refsOf(doc, p.id)).toMatchObject({ references: [ids[0]], missingReferences: 1 });
    promptsMap(doc).set(key, [ids[3]!, ids[2]!, ids[1]!, ids[0]!]);
    expect(refsOf(doc, p.id)).toMatchObject({ references: [ids[3], ids[2], ids[1]], missingReferences: 0 });
  });

  it('refuses a bad prompt, a removed one, a list that is not one, an unknown author', () => {
    const { doc, p, ids } = board();
    expect(() => setPromptReferences(doc, 'nope', [ids[0]!], 'user')).toThrow(/No image prompt nope/);
    expect(() => setPromptReferences(doc, 'a/b', [ids[0]!], 'user')).toThrow(/promptId/);
    expect(() => setPromptReferences(doc, p.id, 'x' as unknown as string[], 'user')).toThrow(/references/);
    expect(() => setPromptReferences(doc, p.id, [7 as unknown as string], 'user')).toThrow(/references/);
    expect(() => setPromptReferences(doc, p.id, [ids[0]!], 'robot' as 'user')).toThrow(/by/);
    removeImagePrompt(doc, p.id);
    expect(() => setPromptReferences(doc, p.id, [ids[0]!], 'user')).toThrow(/No image prompt/);
  });

  it('syncs to another replica and goes with its prompt', () => {
    const { doc, p, ids } = board();
    const other = replica(doc);
    setPromptReferences(doc, p.id, [ids[0]!], 'user');
    sync(doc, other);
    expect(refsOf(other, p.id).references).toEqual([ids[0]]);
    removeImagePrompt(other, p.id);
    expect(promptsMap(other).has(`${p.id}/refs`)).toBe(false);
  });

  it('records the references of a generated image, in its map only when there are some', () => {
    const { doc, p, ids } = board();
    const { added } = addFiles(doc, [generated(10, p.id, { references: [ids[0]!, ids[2]!] }), generated(11, p.id, { references: [] }), generated(12, p.id)]);
    expect(added.map((f) => f.references)).toEqual([[ids[0], ids[2]], null, null]);
    const read = (n: number) => readFiles(doc).find((f) => f.sha256 === hash(n))!;
    expect([read(10).references, read(11).references, read(12).references]).toEqual([[ids[0], ids[2]], null, null]);
    const item = (n: number) =>
      doc
        .getArray<Y.Map<unknown>>('files')
        .toArray()
        .find((i) => i.get('sha256') === hash(n))!;
    expect(item(10).get('references')).toEqual([ids[0], ids[2]]);
    expect(item(11).has('references')).toBe(false);
    expect(item(12).has('references')).toBe(false);
    // Not filtered against the files: the viewer counts the ones removed.
    removeFile(doc, ids[0]!);
    expect(read(10).references).toEqual([ids[0], ids[2]]);
  });

  it('reads an older file, or one not generated, without references', () => {
    const { doc } = board();
    v06File(doc, { id: 'old', sha256: hash(20), kind: 'image', sceneId: 'S1' });
    expect(readFiles(doc).every((f) => f.references === null)).toBe(true);
    // A value on a file that was not generated, or a hostile one, reads as null or is cleaned.
    const items = doc.getArray<Y.Map<unknown>>('files').toArray();
    items[0]!.set('references', ['x']);
    expect(readFiles(doc).find((f) => f.id === items[0]!.get('id'))!.references).toBeNull();
    const { added } = addFiles(doc, [generated(21, null as unknown as string)]);
    const gen = items.length;
    const genItem = doc.getArray<Y.Map<unknown>>('files').get(gen);
    genItem.set('references', [1, 'a', 'a', 'b', 'c', 'd']);
    expect(readFiles(doc).find((f) => f.id === added[0]!.id)!.references).toEqual(['a', 'b', 'c']);
    genItem.set('references', 'a');
    expect(readFiles(doc).find((f) => f.id === added[0]!.id)!.references).toBeNull();
  });

  it('refuses references on a file not generated, more than the cap, duplicates, bad ids', () => {
    const { doc, p } = board();
    expect(() => addFiles(doc, [image(30, { references: ['a'] })])).toThrow(/references: only a generated image/);
    expect(() => addFiles(doc, [generated(31, p.id, { references: ['a', 'b', 'c', 'd'] })])).toThrow(/references: at most 3/);
    expect(() => addFiles(doc, [generated(32, p.id, { references: ['a', 'a'] })])).toThrow(/references/);
    expect(() => addFiles(doc, [generated(33, p.id, { references: ['a/b'] })])).toThrow(/references/);
    expect(() => addFiles(doc, [generated(34, p.id, { references: 'a' as unknown as string[] })])).toThrow(/references/);
    // An empty list on a file not generated is the same as none.
    expect(addFiles(doc, [image(35, { references: [] })]).added[0]!.references).toBeNull();
  });
});

// General images and music (general-board-items design decisions 1 to 5).

// Files added a second apart, so they read in the order they were added.
const second = (n: number) => `2026-10-20T09:00:${String(n).padStart(2, '0')}.000Z`;
const SUNO = { title: 'Tema di Sabaoth', style: 'dark orchestral, choir, slow', lyrics: '[Instrumental]\n[End]' };
const musicMap = (doc: Y.Doc) => doc.getMap<unknown>('musicPrompts');
const generalTrack = (n: number, musicId: string, overrides: Partial<NewFile> = {}): NewFile =>
  track(n, { name: `tema di sabaoth (${n}).mp3`, sceneId: null, musicId, addedAt: second(n), ...overrides });
const fileMap = (doc: Y.Doc, id: string) =>
  doc
    .getArray<Y.Map<unknown>>('files')
    .toArray()
    .find((item) => item.get('id') === id)!;

describe('General image prompts', () => {
  it('are named prompts with no scene, listed with the others', () => {
    const doc = project({ document: APPENDIX });
    const cover = addImagePrompt(doc, { category: 'general', name: 'Copertina', prompt: 'a cover --ar 2:3' }, 'claude', AT);
    const city = addImagePrompt(doc, { category: 'general', name: 'Messina dopo il terremoto', prompt: 'ruins' }, 'user', AT);
    npc(doc, 'Padre Anselmo', 'portrait');
    expect(cover).toMatchObject({ category: 'general', sceneId: null, name: 'Copertina', order: 1 });
    expect(city.order).toBe(2);
    expect(promptsMap(doc).get(`${cover.id}/def`)).toEqual({ category: 'general', sceneId: null });
    const board = readDocumentBoard(doc);
    expect(board.named.general.map((p) => [p.prompt.name, p.number, p.status])).toEqual([
      ['Copertina', 1, 'wanted'],
      ['Messina dopo il terremoto', 2, 'wanted'],
    ]);
    expect(board.named.npc).toHaveLength(1);
    expect(Object.keys(namedPrompts(readImagePrompts(doc), []))).toEqual(['general', 'pc', 'npc', 'handout']);
    const [img] = addFiles(doc, [image(1, { promptId: cover.id, matchedBy: 'prompt' })]).added;
    chooseImage(doc, cover.id, img!.id);
    expect(readDocumentBoard(doc).named.general[0]).toMatchObject({ status: 'chosen', chosen: img!.id });
    expect(readDocumentBoard(doc).unmatched).toEqual([]);
  });

  it('need a name and take no scene', () => {
    const doc = project();
    expect(() => addImagePrompt(doc, { category: 'general', prompt: 'x' }, 'user')).toThrow('name: is required');
    expect(() => addImagePrompt(doc, { category: 'general', name: 'A', sceneId: 'S1', prompt: 'x' }, 'user')).toThrow(
      'sceneId: only a scene prompt has one',
    );
  });
});

describe('General music prompts', () => {
  it('adds prompts in one transaction under flat keys, each appended after the others', () => {
    const doc = project();
    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);
    const a = addMusicPrompt(doc, SUNO, 'claude', AT);
    expect(transactions).toBe(1);
    const b = addMusicPrompt(doc, { title: 'Tra le macerie', style: 'ambient', lyrics: '' }, 'user', LATER);
    expect(a).toEqual({ id: a.id, ...SUNO, by: 'claude', at: AT, order: 1, chosenTrack: null });
    expect(b.order).toBe(2);
    expect([...musicMap(doc).keys()].sort()).toEqual([`${a.id}/music`, `${a.id}/order`, `${b.id}/music`, `${b.id}/order`].sort());
    expect(musicMap(doc).get(`${a.id}/music`)).toEqual({ ...SUNO, by: 'claude', at: AT });
    expect(readMusicPrompts(doc).map((m) => m.title)).toEqual(['Tema di Sabaoth', 'Tra le macerie']);
  });

  it('orders by order then id', () => {
    const doc = project();
    musicMap(doc).set('b/music', { ...SUNO, title: 'B' });
    musicMap(doc).set('b/order', 1);
    musicMap(doc).set('a/music', { ...SUNO, title: 'A' });
    musicMap(doc).set('a/order', 1);
    musicMap(doc).set('c/music', { ...SUNO, title: 'C' });
    musicMap(doc).set('c/order', 0.5);
    expect(readMusicPrompts(doc).map((m) => m.id)).toEqual(['c', 'a', 'b']);
    expect(addMusicPrompt(doc, SUNO, 'user').order).toBe(2);
  });

  it('checks the title, the limits and the date', () => {
    const doc = project();
    expect(() => addMusicPrompt(doc, { ...SUNO, title: '' }, 'user')).toThrow(/title/);
    expect(() => addMusicPrompt(doc, { ...SUNO, title: '   ' }, 'user')).toThrow('title: is required');
    expect(() => addMusicPrompt(doc, { ...SUNO, title: 'a\nb' }, 'user')).toThrow('title: must be one line');
    expect(() => addMusicPrompt(doc, { ...SUNO, title: 'x'.repeat(LIMITS.trackTitle + 1) }, 'user')).toThrow(/title/);
    expect(() => addMusicPrompt(doc, { ...SUNO, style: 'x'.repeat(LIMITS.style + 1) }, 'user')).toThrow(/style/);
    expect(() => addMusicPrompt(doc, { ...SUNO, lyrics: 'x'.repeat(LIMITS.lyrics + 1) }, 'user')).toThrow(/lyrics/);
    expect(() => addMusicPrompt(doc, SUNO, 'user', 'yesterday')).toThrow();
    expect(musicMap(doc).size).toBe(0);
  });

  it('updates any of the texts with who and when, refusing an empty title or an unknown id', () => {
    const doc = project();
    const m = addMusicPrompt(doc, SUNO, 'claude', AT);
    updateMusicPrompt(doc, m.id, { style: 'solo cello' }, 'user', LATER);
    expect(readMusicPrompts(doc)[0]).toMatchObject({ title: SUNO.title, style: 'solo cello', lyrics: SUNO.lyrics, by: 'user', at: LATER });
    updateMusicPrompt(doc, m.id, { title: 'Tema di Sabaoth II', lyrics: '[End]' }, 'claude', LATER);
    expect(readMusicPrompts(doc)[0]).toMatchObject({ title: 'Tema di Sabaoth II', style: 'solo cello', lyrics: '[End]', by: 'claude' });
    expect(() => updateMusicPrompt(doc, m.id, {}, 'user')).toThrow('Send title, style, lyrics or several');
    expect(() => updateMusicPrompt(doc, m.id, { title: '' }, 'user')).toThrow(/title/);
    expect(() => updateMusicPrompt(doc, 'nope', { style: 'x' }, 'user')).toThrow('No music prompt nope');
    expect(readMusicPrompts(doc)[0]!.title).toBe('Tema di Sabaoth II');
  });

  it('removes a prompt: a tombstone stays, its other keys go, its tracks wait in the tray untouched', () => {
    const doc = project({ document: APPENDIX });
    const m = addMusicPrompt(doc, SUNO, 'claude', AT);
    const keep = addMusicPrompt(doc, { ...SUNO, title: 'Altro' }, 'claude', AT);
    const { added } = addFiles(doc, [generalTrack(1, m.id), generalTrack(2, m.id)]);
    chooseGeneralTrack(doc, m.id, added[1]!.id);
    const files = doc.getArray('files').toJSON();
    expect(removeMusicPrompt(doc, m.id)).toEqual({ tracks: 2 });
    expect([...musicMap(doc).keys()].filter((k) => k.startsWith(`${m.id}/`))).toEqual([`${m.id}/removed`]);
    expect(doc.getArray('files').toJSON()).toEqual(files);
    expect(readMusicPrompts(doc).map((p) => p.id)).toEqual([keep.id]);
    expect(readDocumentBoard(doc).unmatched.map((u) => [u.file.id, u.reason])).toEqual([
      [added[0]!.id, 'Its prompt was removed.'],
      [added[1]!.id, 'Its prompt was removed.'],
    ]);
    expect(() => removeMusicPrompt(doc, m.id)).toThrow(`No music prompt ${m.id}`);
    expect(() => updateMusicPrompt(doc, m.id, { style: 'x' }, 'user')).toThrow(`No music prompt ${m.id}`);
    expect(() => chooseGeneralTrack(doc, m.id, null)).toThrow(`No music prompt ${m.id}`);
    expect(() => assignTrack(doc, added[0]!.id, { musicId: m.id })).toThrow(`No music prompt ${m.id}`);
  });

  it(`refuses past ${CAPS.musicPrompts} prompts, not counting removed ones, and readers keep the first ${CAPS.musicPrompts}`, () => {
    const doc = project();
    let first = '';
    doc.transact(() => {
      for (let i = 0; i < CAPS.musicPrompts; i++) {
        const m = addMusicPrompt(doc, { ...SUNO, title: `T${i}` }, 'claude', AT);
        if (i === 0) first = m.id;
      }
    });
    expect(() => addMusicPrompt(doc, SUNO, 'claude')).toThrow(`musicPrompts: at most ${CAPS.musicPrompts} items`);
    removeMusicPrompt(doc, first);
    expect(addMusicPrompt(doc, SUNO, 'claude').order).toBe(CAPS.musicPrompts + 1);
    // A newer client may have written more: readers keep the first ones.
    musicMap(doc).set('zz/music', SUNO);
    musicMap(doc).set('zz/order', 10_000);
    expect(readMusicPrompts(doc)).toHaveLength(CAPS.musicPrompts);
    expect(readMusicPrompts(doc).some((m) => m.id === 'zz')).toBe(false);
  });

  it('reads hostile values: no title, wrong shapes, orphan keys, a choice of another prompt', () => {
    const doc = project();
    const map = musicMap(doc);
    map.set('a/music', { title: '', style: 's' });
    map.set('b/music', 'not a record');
    map.set('c/order', 3);
    map.set('d/music', { title: 'D', style: 7, lyrics: null, by: 'robot', at: 'now' });
    map.set('d/order', Number.NaN);
    map.set('d/other', true);
    map.set('e/music', { title: 'E' });
    map.set('e/chosen', 'nope');
    expect(readMusicPrompts(doc)).toEqual([
      { id: 'd', title: 'D', style: '', lyrics: '', by: 'user', at: '', order: 0, chosenTrack: null },
      { id: 'e', title: 'E', style: '', lyrics: '', by: 'user', at: '', order: 0, chosenTrack: null },
    ]);
    const { added } = addFiles(doc, [generalTrack(1, 'd')]);
    map.set('e/chosen', added[0]!.id);
    expect(readMusicPrompts(doc).find((m) => m.id === 'e')!.chosenTrack).toBeNull();
  });

  it('converges when two devices edit and remove the same prompt: the removal wins', () => {
    const web = project();
    const m = addMusicPrompt(web, SUNO, 'claude', AT);
    const desktop = replica(web);
    removeMusicPrompt(web, m.id);
    updateMusicPrompt(desktop, m.id, { style: 'offline edit' }, 'user', LATER);
    chooseGeneralTrack(desktop, m.id, null);
    sync(web, desktop);
    expect(readMusicPrompts(web)).toEqual([]);
    expect(readMusicPrompts(desktop)).toEqual([]);
    expect(musicMap(web).toJSON()).toEqual(musicMap(desktop).toJSON());
  });

  it('keeps the prompts two devices add at once, and merges edits of different parts', () => {
    const a = project();
    const m = addMusicPrompt(a, SUNO, 'claude', AT);
    const b = replica(a);
    addMusicPrompt(a, { ...SUNO, title: 'A' }, 'user', AT);
    addMusicPrompt(b, { ...SUNO, title: 'B' }, 'user', AT);
    const [t] = addFiles(a, [generalTrack(1, m.id)]).added;
    sync(a, b);
    chooseGeneralTrack(a, m.id, t!.id);
    updateMusicPrompt(b, m.id, { lyrics: '[End]' }, 'user', LATER);
    sync(a, b);
    expect(readMusicPrompts(a)).toEqual(readMusicPrompts(b));
    expect(readMusicPrompts(a).map((p) => p.title).sort()).toEqual(['A', 'B', 'Tema di Sabaoth']);
    expect(readMusicPrompts(a).find((p) => p.id === m.id)).toMatchObject({ lyrics: '[End]', chosenTrack: t!.id });
  });
});

describe('tracks of General music (D3)', () => {
  it('adds a track to a General music prompt, writing musicId only when set', () => {
    const doc = project();
    const m = addMusicPrompt(doc, SUNO, 'claude', AT);
    const { added } = addFiles(doc, [generalTrack(1, m.id), track(2, { addedAt: second(2) })]);
    expect(added.map((f) => [f.sceneId, f.musicId, f.matchedBy])).toEqual([
      [null, m.id, 'title'],
      ['S1', null, 'title'],
    ]);
    expect(fileMap(doc, added[0]!.id).get('musicId')).toBe(m.id);
    expect(fileMap(doc, added[1]!.id).has('musicId')).toBe(false);
    expect(readFiles(doc).map((f) => f.musicId)).toEqual([m.id, null]);
  });

  it('refuses a track naming a scene and a music prompt, and an image naming a music prompt', () => {
    const doc = project();
    expect(() => addFiles(doc, [generalTrack(1, 'm', { sceneId: 'S1' })])).toThrow('not both');
    expect(() => addFiles(doc, [image(2, { musicId: 'm' })])).toThrow(/musicId/);
    expect(() => addFiles(doc, [generalTrack(3, 'a/b')])).toThrow(/musicId/);
    expect(readFiles(doc)).toEqual([]);
  });

  it('reads a track with both ids as the scene’s: an older client assigned it there', () => {
    const doc = project({ document: APPENDIX });
    const m = addMusicPrompt(doc, SUNO, 'claude', AT);
    const [t] = addFiles(doc, [generalTrack(1, m.id)]).added;
    chooseGeneralTrack(doc, m.id, t!.id);
    // What v0.23's assignTrack writes: sceneId only.
    fileMap(doc, t!.id).set('sceneId', 'S2');
    expect(readFiles(doc)[0]).toMatchObject({ sceneId: 'S2', musicId: null });
    const board = readDocumentBoard(doc);
    expect(board.rows.find((r) => r.sceneId === 'S2')!.tracks.map((f) => f.id)).toEqual([t!.id]);
    expect(board.music[0]).toMatchObject({ tracks: [], status: 'wanted', prompt: { chosenTrack: null } });
    expect(board.unmatched).toEqual([]);
    // Moving it on clears the stale choice and musicId.
    assignTrack(doc, t!.id, null);
    expect(musicMap(doc).get(`${m.id}/chosen`)).toBeNull();
    expect(fileMap(doc, t!.id).has('musicId')).toBe(false);
  });

  it('assigns a track between scenes, General music and the tray, unchoosing it in its old owner', () => {
    const doc = project({ document: APPENDIX });
    const m = addMusicPrompt(doc, SUNO, 'claude', AT);
    const [t] = addFiles(doc, [track(1)]).added;
    chooseTrack(doc, 'S1', t!.id);
    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);
    assignTrack(doc, t!.id, { musicId: m.id });
    expect(transactions).toBe(1);
    expect(readBoard(doc).get('S1')?.chosenTrack).toBeNull();
    expect(readFiles(doc)[0]).toMatchObject({ sceneId: null, musicId: m.id, matchedBy: 'hand' });
    expect(fileMap(doc, t!.id).get('sceneId')).toBeNull();
    chooseGeneralTrack(doc, m.id, t!.id);
    expect(readMusicPrompts(doc)[0]!.chosenTrack).toBe(t!.id);
    assignTrack(doc, t!.id, { sceneId: 'S2' }, 'title');
    expect(musicMap(doc).get(`${m.id}/chosen`)).toBeNull();
    expect(readFiles(doc)[0]).toMatchObject({ sceneId: 'S2', musicId: null, matchedBy: 'title' });
    expect(fileMap(doc, t!.id).has('musicId')).toBe(false);
    assignTrack(doc, t!.id, { musicId: m.id });
    assignTrack(doc, t!.id, null);
    expect(readFiles(doc)[0]).toMatchObject({ sceneId: null, musicId: null, matchedBy: null });
    expect(() => assignTrack(doc, t!.id, { musicId: 'nope' })).toThrow('No music prompt nope');
    expect(() => assignTrack(doc, t!.id, { musicId: 'a/b' })).toThrow(/musicId/);
  });

  it('keeps the choice when a track is assigned to the prompt it is in', () => {
    const doc = project();
    const m = addMusicPrompt(doc, SUNO, 'claude', AT);
    const [t] = addFiles(doc, [generalTrack(1, m.id)]).added;
    chooseGeneralTrack(doc, m.id, t!.id);
    assignTrack(doc, t!.id, { musicId: m.id }, 'hand');
    expect(readMusicPrompts(doc)[0]!.chosenTrack).toBe(t!.id);
  });

  it('chooses only a track of the prompt, and unchooses a removed file', () => {
    const doc = project();
    const m = addMusicPrompt(doc, SUNO, 'claude', AT);
    const [own, other] = addFiles(doc, [generalTrack(1, m.id), track(2)]).added;
    expect(() => chooseGeneralTrack(doc, m.id, other!.id)).toThrow(`No track ${other!.id} in ${m.id}`);
    expect(() => chooseGeneralTrack(doc, 'nope', null)).toThrow('No music prompt nope');
    chooseGeneralTrack(doc, m.id, own!.id);
    expect(() => chooseTrack(doc, 'S1', own!.id)).toThrow(`No track ${own!.id} in S1`);
    removeFile(doc, own!.id);
    expect(musicMap(doc).get(`${m.id}/chosen`)).toBeNull();
    expect(readMusicPrompts(doc)[0]!.chosenTrack).toBeNull();
  });
});

describe('General music on the board (D5)', () => {
  it('derives the cards, their statuses and the titles used twice across scenes and General', () => {
    const doc = project({ document: APPENDIX });
    setMusicPrompt(doc, 'S1', { title: 'Cinque e venti', style: 's', lyrics: 'l' }, 'claude', AT);
    const theme = addMusicPrompt(doc, SUNO, 'claude', AT);
    const ruins = addMusicPrompt(doc, { ...SUNO, title: 'Tra le macerie' }, 'claude', AT);
    const twice = addMusicPrompt(doc, { ...SUNO, title: 'cinque e VENTI!' }, 'claude', AT);
    const { added } = addFiles(doc, [generalTrack(1, theme.id), generalTrack(2, theme.id), generalTrack(3, ruins.id)]);
    chooseGeneralTrack(doc, theme.id, added[1]!.id);
    const board = readDocumentBoard(doc);
    expect(board.music.map((c) => [c.prompt.title, c.tracks.map((f) => f.id), c.status, c.duplicateTitle])).toEqual([
      ['Tema di Sabaoth', [added[0]!.id, added[1]!.id], 'chosen', false],
      ['Tra le macerie', [added[2]!.id], 'received', false],
      ['cinque e VENTI!', [], 'wanted', true],
    ]);
    expect(board.music[0]!.prompt.chosenTrack).toBe(added[1]!.id);
    expect(board.rows.find((r) => r.sceneId === 'S1')!.duplicateTitle).toBe(true);
    expect(duplicateTitles(board.rows, readMusicPrompts(doc))).toEqual(['Cinque e venti']);
    expect(duplicateTitles([], [{ title: 'A' }, { title: 'a' }, { title: 'B' }])).toEqual(['A']);
    expect(board.rows.flatMap((r) => r.tracks)).toEqual([]);
    expect(board.unmatched).toEqual([]);
    expect(twice.order).toBe(3);
  });

  it('builds the cards from prompts and files alone', () => {
    const doc = project();
    const m = addMusicPrompt(doc, SUNO, 'claude', AT);
    addFiles(doc, [generalTrack(1, m.id), track(2, { sceneId: null })]);
    const cards = generalMusic(readMusicPrompts(doc), readFiles(doc));
    expect(cards.map((c) => [c.tracks.length, c.status, c.duplicateTitle])).toEqual([[1, 'received', false]]);
  });

  it('puts in the tray a track with no owner and one whose General prompt is gone', () => {
    const doc = project({ document: APPENDIX });
    const m = addMusicPrompt(doc, SUNO, 'claude', AT);
    const { added } = addFiles(doc, [
      track(1, { sceneId: null, addedAt: second(1) }),
      generalTrack(2, 'never-there'),
      generalTrack(3, m.id),
    ]);
    expect(readDocumentBoard(doc).unmatched.map((u) => [u.file.id, u.reason])).toEqual([
      [added[0]!.id, null],
      [added[1]!.id, 'Its prompt was removed.'],
    ]);
    expect(unmatchedFiles(appendix, [], readFiles(doc), [])).toHaveLength(3);
  });

  it('reads as empty in a document with no General music', () => {
    const board = readDocumentBoard(project({ document: APPENDIX }));
    expect(board.music).toEqual([]);
    expect(board.named.general).toEqual([]);
  });
});
