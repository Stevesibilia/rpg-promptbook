import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  addImagePrompt,
  assignImage,
  chooseImage,
  migratedView,
  migrateImagePrompts,
  needsImageMigration,
  readBoard,
  readDocumentBoard,
  readFiles,
  readImagePrompts,
  removeImagePrompt,
  updateImagePrompt,
} from '../src/index.js';
import { project, replica, sync, v06File } from './helpers.js';

const T0 = '2026-10-19T09:00:00.000Z';
const LATER = '2026-10-20T10:00:00.000Z';
const LATEST = '2026-10-20T11:00:00.000Z';
const hash = (n: number) => n.toString(16).padStart(64, '0');

const APPENDIX = `# L'Ancora di Sabaoth

## Appendice: immagini e musica

### S1. La casa che cede

visual: collapsed 1900s Sicilian library at night

### S2. L'ordine di Donato

visual: ruined doctor's office

### S3. La cattedrale

visual: collapsed cathedral facade
`;

const MUSIC = { title: 'Cinque e venti', style: 'dark ambient', lyrics: '[End]', by: 'claude', at: T0 };

// A board as v0.6 left it: S1 with a prompt, a chosen image, two images and
// music; S2 with a prompt and an image; S3 with an image and no prompt; one
// image in the tray.
function v06Board(): Y.Doc {
  const doc = project({ document: APPENDIX });
  doc.transact(() => {
    const board = doc.getMap<unknown>('board');
    board.set('S1/image', { prompt: 'collapsed 1900s Sicilian library at night --ar 16:9', by: 'claude', at: T0 });
    board.set('S1/chosenImage', 'i1');
    board.set('S1/music', MUSIC);
    board.set('S1/chosenTrack', 't1');
    board.set('S2/image', { prompt: "ruined doctor's office --ar 16:9", by: 'user', at: T0 });
  });
  v06File(doc, { id: 'i1', sha256: hash(1), kind: 'image', sceneId: 'S1' });
  v06File(doc, { id: 'i2', sha256: hash(2), kind: 'image', sceneId: 'S1' });
  v06File(doc, { id: 'i3', sha256: hash(3), kind: 'image', sceneId: 'S2' });
  v06File(doc, { id: 'i4', sha256: hash(4), kind: 'image', sceneId: 'S3' });
  v06File(doc, { id: 'i5', sha256: hash(5), kind: 'image', sceneId: null });
  v06File(doc, { id: 't1', sha256: hash(6), kind: 'audio', sceneId: 'S1' });
  return doc;
}

const rawFiles = (doc: Y.Doc) => doc.getArray<Y.Map<unknown>>('files').toJSON();
const boardKeys = (doc: Y.Doc) => [...doc.getMap('board').keys()].sort();
const promptKeys = (doc: Y.Doc) => [...doc.getMap('imagePrompts').keys()].sort();
const prompt = (doc: Y.Doc, id: string) => readImagePrompts(doc).find((p) => p.id === id);
const imagesOf = (doc: Y.Doc, id: string) =>
  readFiles(doc)
    .filter((f) => f.promptId === id)
    .map((f) => f.id)
    .sort();

describe('migrating a v0.6 board', () => {
  it('makes each scene’s prompt, choice and images its prompt 1, and leaves the files and the music alone', () => {
    const doc = v06Board();
    const files = rawFiles(doc);
    expect(needsImageMigration(doc)).toBe(true);
    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);
    expect(migrateImagePrompts(doc)).toBe(true);
    expect(transactions).toBe(1);
    expect(needsImageMigration(doc)).toBe(false);
    expect(readImagePrompts(doc)).toEqual([
      {
        id: 'legacy-S1',
        category: 'scene',
        sceneId: 'S1',
        name: null,
        prompt: 'collapsed 1900s Sicilian library at night --ar 16:9',
        by: 'claude',
        at: T0,
        order: 0,
        chosenFileId: 'i1',
      },
      {
        id: 'legacy-S2',
        category: 'scene',
        sceneId: 'S2',
        name: null,
        prompt: "ruined doctor's office --ar 16:9",
        by: 'user',
        at: T0,
        order: 0,
        chosenFileId: null,
      },
      { id: 'legacy-S3', category: 'scene', sceneId: 'S3', name: null, prompt: '', by: 'user', at: '', order: 0, chosenFileId: null },
    ]);
    expect(promptKeys(doc)).toEqual(['legacy-S1/def', 'legacy-S1/legacy', 'legacy-S2/def', 'legacy-S2/legacy', 'legacy-S3/def']);
    expect(boardKeys(doc)).toEqual(['S1/chosenTrack', 'S1/music']);
    expect(readBoard(doc).get('S1')).toEqual({ music: MUSIC, chosenTrack: 't1' });
    expect(rawFiles(doc)).toEqual(files);
    const board = readDocumentBoard(doc);
    expect(board.rows.map((r) => [r.sceneId, r.prompts.map((p) => [p.prompt.id, p.status, p.images.map((f) => f.id)])])).toEqual([
      ['S1', [['legacy-S1', 'chosen', ['i1', 'i2']]]],
      ['S2', [['legacy-S2', 'received', ['i3']]]],
      ['S3', [['legacy-S3', 'received', ['i4']]]],
    ]);
    expect(board.unmatched.map((u) => u.file.id)).toEqual(['i5']);
  });

  it('changes nothing when run twice', () => {
    const doc = v06Board();
    migrateImagePrompts(doc);
    const state = Y.encodeStateVector(doc);
    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);
    expect(migrateImagePrompts(doc)).toBe(false);
    expect(transactions).toBe(0);
    expect(Y.encodeStateVector(doc)).toEqual(state);
  });

  it('needs nothing on a new board or one with no legacy', () => {
    const doc = project({ document: APPENDIX });
    expect(needsImageMigration(doc)).toBe(false);
    expect(migrateImagePrompts(doc)).toBe(false);
    addImagePrompt(doc, { category: 'scene', sceneId: 'S1', prompt: 'x' }, 'user');
    expect(needsImageMigration(doc)).toBe(false);
  });

  it('migrates a prompt whose old value has the wrong shape, keeping its images', () => {
    const doc = project({ document: APPENDIX });
    doc.getMap<unknown>('board').set('S1/image', 'not a record');
    doc.getMap<unknown>('board').set('S1/chosenImage', 7);
    doc.getMap<unknown>('board').set('S1/x/image', { prompt: 'a key no scene can have' });
    v06File(doc, { id: 'i1', sha256: hash(1), kind: 'image', sceneId: 'S1' });
    migrateImagePrompts(doc);
    expect(readImagePrompts(doc)).toMatchObject([{ id: 'legacy-S1', prompt: '', chosenFileId: null }]);
    expect(boardKeys(doc)).toEqual(['S1/x/image']);
    expect(needsImageMigration(doc)).toBe(false);
  });

  it('gives a view of the migrated board without touching the document', () => {
    const doc = v06Board();
    const state = Y.encodeStateAsUpdate(doc);
    const view = migratedView(doc);
    expect(view).not.toBe(doc);
    expect(readImagePrompts(view).map((p) => p.id)).toEqual(['legacy-S1', 'legacy-S2', 'legacy-S3']);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(state);
    expect(readImagePrompts(doc)).toEqual([]);
    migrateImagePrompts(doc);
    expect(migratedView(doc)).toBe(doc);
  });

  it('lets an older client’s later prompt and choice win, and its new images join prompt 1', () => {
    const doc = v06Board();
    migrateImagePrompts(doc);
    chooseImage(doc, 'legacy-S1', 'i2');
    const old = replica(doc);
    // v0.6 writes its single prompt, its choice and an image of S1.
    old.getMap<unknown>('board').set('S1/image', { prompt: 'the old client’s text', by: 'user', at: LATER });
    old.getMap<unknown>('board').set('S1/chosenImage', 'i1');
    v06File(old, { id: 'i7', sha256: hash(7), kind: 'image', sceneId: 'S1' });
    sync(doc, old);
    expect(needsImageMigration(doc)).toBe(true);
    migrateImagePrompts(doc);
    expect(prompt(doc, 'legacy-S1')).toMatchObject({ prompt: 'the old client’s text', at: LATER, chosenFileId: 'i1' });
    expect(imagesOf(doc, 'legacy-S1')).toEqual(['i1', 'i2', 'i7']);
    expect(boardKeys(doc)).toEqual(['S1/chosenTrack', 'S1/music']);
  });

  it('keeps an edit made after an older client’s earlier prompt', () => {
    const doc = v06Board();
    migrateImagePrompts(doc);
    const old = replica(doc);
    old.getMap<unknown>('board').set('S1/image', { prompt: 'written earlier, synced late', by: 'user', at: LATER });
    updateImagePrompt(doc, 'legacy-S1', { prompt: 'edited later' }, 'claude', LATEST);
    sync(doc, old);
    migrateImagePrompts(doc);
    expect(prompt(doc, 'legacy-S1')).toMatchObject({ prompt: 'edited later', by: 'claude', at: LATEST });
  });

  it('brings back a removed prompt 1 with its images when an older client writes to its scene', () => {
    const doc = v06Board();
    migrateImagePrompts(doc);
    const old = replica(doc);
    expect(removeImagePrompt(doc, 'legacy-S2')).toEqual({ images: 1 });
    expect(needsImageMigration(doc)).toBe(false);
    v06File(old, { id: 'i8', sha256: hash(8), kind: 'image', sceneId: 'S2' });
    sync(doc, old);
    migrateImagePrompts(doc);
    expect(prompt(doc, 'legacy-S2')).toMatchObject({ prompt: '' });
    expect(imagesOf(doc, 'legacy-S2')).toEqual(['i3', 'i8']);
  });
});

// Two replicas holding the same v0.6 board both migrate, then edit before
// they meet: one edits a text, chooses an image and moves another; the other
// adds prompts and edits another text. Concurrent writes to one key are
// resolved by client id, so the test runs for both orders.
describe.each([
  [1, 2],
  [2, 1],
])('two replicas migrating at once (client ids %i and %i)', (idA, idB) => {
  const open = (base: Y.Doc, clientID: number) => {
    const doc = new Y.Doc();
    doc.clientID = clientID;
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(base));
    return doc;
  };

  it('keeps every edit, one prompt 1 per scene, the same reading on both', () => {
    const base = v06Board();
    const a = open(base, idA);
    const b = open(base, idB);
    expect(migrateImagePrompts(a)).toBe(true);
    expect(migrateImagePrompts(b)).toBe(true);

    updateImagePrompt(a, 'legacy-S1', { prompt: 'a burning library' }, 'user', LATER);
    chooseImage(a, 'legacy-S1', 'i2');
    assignImage(a, 'i3', 'legacy-S1');

    const shot = addImagePrompt(b, { category: 'scene', sceneId: 'S1', prompt: 'the reading room' }, 'claude', LATER);
    const nina = addImagePrompt(b, { category: 'npc', name: 'Za’ Nina', prompt: 'portrait of a fisherwoman' }, 'claude', LATER);
    updateImagePrompt(b, 'legacy-S2', { prompt: 'ruined office at night' }, 'claude', LATER);

    sync(a, b);

    const reading = (doc: Y.Doc) => ({
      prompts: readImagePrompts(doc),
      files: readFiles(doc),
      board: [...doc.getMap('board').entries()].sort(),
      keys: promptKeys(doc),
    });
    expect(reading(a)).toEqual(reading(b));
    for (const doc of [a, b]) {
      expect(readImagePrompts(doc).map((p) => p.id).sort()).toEqual(
        ['legacy-S1', 'legacy-S2', 'legacy-S3', shot.id, nina.id].sort(),
      );
      expect(prompt(doc, 'legacy-S1')).toMatchObject({ prompt: 'a burning library', by: 'user', chosenFileId: 'i2' });
      expect(prompt(doc, 'legacy-S2')).toMatchObject({ prompt: 'ruined office at night', by: 'claude' });
      expect(imagesOf(doc, 'legacy-S1')).toEqual(['i1', 'i2', 'i3']);
      expect(imagesOf(doc, 'legacy-S2')).toEqual([]);
      expect(boardKeys(doc)).toEqual(['S1/chosenTrack', 'S1/music']);
      expect(readBoard(doc).get('S1')).toEqual({ music: MUSIC, chosenTrack: 't1' });
      expect(needsImageMigration(doc)).toBe(false);
      expect(readDocumentBoard(doc).rows[0]!.prompts.map((p) => [p.prompt.id, p.number])).toEqual([
        ['legacy-S1', 1],
        [shot.id, 2],
      ]);
    }
    expect(migrateImagePrompts(a)).toBe(false);
  });

  it('keeps a choice made on one replica while the other migrates later', () => {
    const base = v06Board();
    const a = open(base, idA);
    const b = open(base, idB);
    migrateImagePrompts(a);
    chooseImage(a, 'legacy-S1', 'i2');
    chooseImage(a, 'legacy-S2', 'i3');
    migrateImagePrompts(b);
    sync(a, b);
    for (const doc of [a, b]) {
      expect(prompt(doc, 'legacy-S1')?.chosenFileId).toBe('i2');
      expect(prompt(doc, 'legacy-S2')?.chosenFileId).toBe('i3');
    }
    expect(readImagePrompts(a)).toEqual(readImagePrompts(b));
  });
});
