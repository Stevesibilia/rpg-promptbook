import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  addFiles,
  addImagePrompt,
  chooseImage,
  chooseTrack,
  cuebardFileName,
  cuebardFiles,
  cuebardLeftOut,
  cuebardPack,
  cuebardUuid,
  needsDuration,
  readFiles,
  setMusicPrompt,
  type CuebardOptions,
  type NewFile,
} from '../src/index.js';
import { project, v06File } from './helpers.js';

const AT = '2026-10-21T09:00:00.000Z';
const NOW = '2026-10-21T12:00:00.000Z';
const ID = '00000000-0000-4000-8000-000000000001';
const hash = (n: number) => n.toString(16).padStart(64, '0');

const DOCUMENT = `# L'Ancora di Sabaoth

## Appendice: immagini e musica

### S1. La casa che cede

visual: collapsed library

mood: suffocating

### S2. Il molo

visual: the pier

### S3. La torre

visual: a tower
`;

// Files are read oldest first; added together they would be in id order.
let clock = 0;
const add = (doc: Y.Doc, files: NewFile[]) =>
  addFiles(
    doc,
    files.map((file) => ({ ...file, addedAt: new Date(Date.parse(AT) + clock++ * 1000).toISOString() })),
  );

const image = (n: number, name: string, promptId: string | null, mime = 'image/png'): NewFile => ({
  sha256: hash(n),
  thumbSha256: hash(1000 + n),
  name,
  kind: 'image',
  mime,
  size: 1000 + n,
  width: 1456,
  height: 816,
  duration: null,
  sceneId: null,
  promptId,
  matchedBy: promptId === null ? null : 'prompt',
  addedBy: 'user',
});

const track = (n: number, name: string, sceneId: string | null, duration: number | null = 190, mime = 'audio/mpeg'): NewFile => ({
  sha256: hash(n),
  thumbSha256: null,
  name,
  kind: 'audio',
  mime,
  size: 4000 + n,
  width: null,
  height: null,
  duration,
  sceneId,
  promptId: null,
  matchedBy: sceneId === null ? null : 'title',
  addedBy: 'user',
});

const scenePrompt = (doc: Y.Doc, sceneId: string) => addImagePrompt(doc, { category: 'scene', sceneId, prompt: 'p' }, 'claude', AT).id;
const named = (doc: Y.Doc, category: 'pc' | 'npc' | 'handout', name: string) =>
  addImagePrompt(doc, { category, name, prompt: 'p' }, 'claude', AT).id;

// D19's board: S1 with two image prompts (a chosen image of four; three and
// none chosen) and two tracks, none chosen, one with no length; S2 with a
// chosen track of two and no image prompt; S3 with an image and no track; a
// PC with two images, an NPC with none, a handout with one; an image and a
// track in the tray, and an image of a prompt whose scene left the appendix.
function board() {
  const doc = project({ document: DOCUMENT });
  const p1 = scenePrompt(doc, 'S1');
  const p2 = scenePrompt(doc, 'S1');
  const p3 = scenePrompt(doc, 'S3');
  const gone = scenePrompt(doc, 'S9');
  const pc = named(doc, 'pc', 'Rosalia Ferrante');
  named(doc, 'npc', "Za' Nina");
  const handout = named(doc, 'handout', 'Lettera del vescovo');
  setMusicPrompt(doc, 'S1', { title: ' Dominus Deus Sabaoth ', style: 'choir', lyrics: '' }, 'claude', AT);
  add(doc, [
    image(1, 'p1 a.png', p1),
    image(2, 'p1 b.png', p1),
    image(3, 'p1 c.png', p1),
    image(4, 'p1 d.png', p1),
    image(5, 'p2 a.png', p2),
    image(6, 'p2 b.png', p2),
    image(7, 'p2 c.png', p2),
    track(8, 'dominus 1.mp3', 'S1', 190.25),
    track(9, 'dominus 2.mp3', 'S1', null),
    track(10, 'molo vecchio.mp3', 'S2'),
    track(11, 'molo.mp3', 'S2', 95),
    image(12, 'torre.png', p3),
    image(13, 'rosalia 1.png', pc),
    image(14, 'rosalia 2.png', pc),
    image(15, 'lettera.png', handout),
    image(16, 'tray.png', null),
    track(17, 'tray.mp3', null),
    image(18, 'gone.png', gone),
  ]);
  const ids = new Map(readFiles(doc).map((f) => [f.name, f.id]));
  const id = (name: string) => ids.get(name)!;
  chooseImage(doc, p1, id('p1 b.png'));
  chooseTrack(doc, 'S2', id('molo.mp3'));
  return { doc, id };
}

const parse = (doc: Y.Doc, opts: Partial<CuebardOptions> = {}) => {
  const pack = cuebardPack(doc, { now: NOW, ...opts });
  return { pack, project: JSON.parse(pack.projectFile.json) };
};

describe('cuebardPack', () => {
  it('writes the whole project file: groups, tracks, visuals in their folders, links', () => {
    const { doc, id } = board();
    const pack = cuebardPack(doc, { now: NOW, durations: new Map([[id('dominus 2.mp3'), 201.5]]) });
    const uuid = (kind: 'group' | 'track' | 'visual', key: string) => cuebardUuid(ID, kind, key);
    const t = (name: string, displayName: string, index: number[], duration: number) => {
      const u = uuid('track', id(name));
      return {
        uuid: u,
        index,
        displayName,
        color: '#6b7280',
        type: 'audio',
        mediaFileName: name,
        mediaPath: `media/${name}`,
        waveformPath: `${u}.json`,
        inPoint: 0,
        outPoint: duration,
        duration,
        volume: 1,
        endBehavior: { action: 'loop' },
        startBehavior: { action: 'nothing' },
        duckingBehavior: { mode: 'stop-all', duckFadeIn: 0.25, duckFadeOut: 1 },
        customActions: [],
        fadeOutDuration: 1,
        playFade: 0,
        stopFade: 0,
        crossFade: 0,
      };
    };
    const g = (sceneId: string, displayName: string, index: number, children: unknown[]) => ({
      uuid: uuid('group', sceneId),
      index: [index],
      displayName,
      color: '#3300FF',
      type: 'group',
      children,
      isExpanded: true,
      startBehavior: { action: 'play-first' },
      endBehavior: { action: 'nothing' },
    });
    const v = (name: string, displayName: string, folder: string, link?: string) => {
      const u = uuid('visual', id(name));
      return {
        uuid: u,
        displayName,
        mediaFileName: `${u}_${name}`,
        mediaPath: `media/visuals/${u}_${name}`,
        mediaType: 'image',
        folder,
        ...(link ? { linkedCueUuid: uuid('track', id(link)) } : {}),
        linkDelay: 0,
        fadeIn: 0,
        fadeOut: 0,
      };
    };
    const expected = {
      name: "L'Ancora di Sabaoth",
      version: '1.0.0',
      schemaVersion: 5,
      folderPath: '',
      items: [
        g('S1', 'S1. La casa che cede', 0, [
          t('dominus 1.mp3', 'Dominus Deus Sabaoth', [0, 0], 190.25),
          t('dominus 2.mp3', 'Dominus Deus Sabaoth (2)', [0, 1], 201.5),
        ]),
        g('S2', 'S2. Il molo', 1, [t('molo.mp3', 'molo', [1, 0], 95)]),
        g('S3', 'S3. La torre', 2, []),
      ],
      cartItems: [],
      cartOnlyItems: [],
      visualMedia: [
        v('p1 b.png', 'S1. La casa che cede', 'Scenes', 'dominus 1.mp3'),
        v('p2 a.png', 'S1. La casa che cede · 2', 'Scenes', 'dominus 1.mp3'),
        v('p2 b.png', 'S1. La casa che cede · 3', 'Scenes', 'dominus 1.mp3'),
        v('p2 c.png', 'S1. La casa che cede · 4', 'Scenes', 'dominus 1.mp3'),
        v('torre.png', 'S3. La torre', 'Scenes'),
        v('rosalia 1.png', 'Rosalia Ferrante', 'PCs'),
        v('rosalia 2.png', 'Rosalia Ferrante (2)', 'PCs'),
        v('lettera.png', 'Lettera del vescovo', 'Handouts'),
      ],
      visualFolders: ['Scenes', 'PCs', 'Handouts'],
      visualDisplayEnabled: true,
      theme: { mode: 'cobalt', accentColor: '' },
      createdAt: NOW,
      lastModified: NOW,
    };
    expect(pack.fileName).toBe("L'Ancora di Sabaoth.cbpack");
    expect(pack.projectFile.path).toBe("L'Ancora di Sabaoth.cuebard");
    expect(pack.projectFile.json).toBe(`${JSON.stringify(expected, null, 2)}\n`);
    expect(pack.entries.map((e) => e.path)).toEqual([
      'media/dominus 1.mp3',
      'media/dominus 2.mp3',
      'media/molo.mp3',
      ...expected.visualMedia.map((m) => m.mediaPath),
    ]);
    expect(pack.entries[0]).toEqual({ path: 'media/dominus 1.mp3', sha256: hash(8), fileId: id('dominus 1.mp3'), kind: 'audio', size: 4008 });
    expect(pack.summary).toEqual({
      groups: 3,
      tracks: 3,
      images: { scene: 5, pc: 2, npc: 0, handout: 1 },
      bytes: 4008 + 4009 + 4011 + 1002 + 1005 + 1006 + 1007 + 1012 + 1013 + 1014 + 1015,
      empty: false,
      warnings: [
        { kind: 'no-track', sceneId: 'S3', label: 'S3. La torre' },
        { kind: 'no-image', category: 'npc', label: 'NPC "Za\' Nina"', number: null, name: "Za' Nina" },
      ],
    });
  });

  it('leaves out the tray, a removed scene’s images and the thumbnails', () => {
    const { doc } = board();
    const { pack } = parse(doc);
    const shas = new Set(pack.entries.map((e) => e.sha256));
    for (const n of [16, 17, 18, 1, 3, 4, 10]) expect(shas.has(hash(n)), `file ${n}`).toBe(false);
    for (const n of [1001, 1002, 1013]) expect(shas.has(hash(n))).toBe(false);
  });

  it('leaves out a track with no length, warns, and takes one read from the file', () => {
    const { doc, id } = board();
    const without = parse(doc);
    expect(without.pack.entries.map((e) => e.path)).not.toContain('media/dominus 2.mp3');
    expect(without.project.items[0].children).toHaveLength(1);
    expect(without.pack.summary.tracks).toBe(2);
    expect(without.pack.summary.warnings[0]).toEqual({
      kind: 'no-duration',
      sceneId: 'S1',
      label: 'S1. La casa che cede',
      fileId: id('dominus 2.mp3'),
      fileName: 'dominus 2.mp3',
    });
    expect(cuebardLeftOut(without.pack, 'not on the server')).toBe('S1. La casa che cede: dominus 2.mp3 (length unknown)\n');
    // A length not finite or not above 0 is no length.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(parse(doc, { durations: new Map([[id('dominus 2.mp3'), bad]]) }).pack.summary.tracks).toBe(2);
    }
    const filled = parse(doc, { durations: new Map([[id('dominus 2.mp3'), 201.5]]) });
    expect(filled.project.items[0].children[1].duration).toBe(201.5);
    expect(filled.project.items[0].children[1].outPoint).toBe(201.5);
    // The document is not written.
    expect(readFiles(doc).find((f) => f.id === id('dominus 2.mp3'))!.duration).toBeNull();
  });

  it('removes a missing file and relinks the scene’s images, the other names and ids unchanged', () => {
    const { doc, id } = board();
    const durations = new Map([[id('dominus 2.mp3'), 201.5]]);
    const whole = parse(doc, { durations }).project;
    const { pack, project: cut } = parse(doc, { durations, missing: new Set([id('dominus 1.mp3'), id('p2 a.png')]) });
    const second = whole.items[0].children[1];
    expect(cut.items[0].children).toEqual([{ ...second, index: [0, 0] }]);
    expect(cut.visualMedia.filter((v: { folder: string }) => v.folder === 'Scenes').map((v: { displayName: string }) => v.displayName)).toEqual([
      'S1. La casa che cede',
      'S1. La casa che cede · 3',
      'S1. La casa che cede · 4',
      'S3. La torre',
    ]);
    for (const visual of cut.visualMedia.slice(0, 3)) expect(visual.linkedCueUuid).toBe(second.uuid);
    const before = new Map(whole.visualMedia.map((v: { uuid: string; mediaFileName: string }) => [v.uuid, v.mediaFileName]));
    for (const visual of cut.visualMedia) expect(visual.mediaFileName).toBe(before.get(visual.uuid));
    expect(pack.summary.warnings.filter((w) => w.kind === 'missing')).toEqual([
      { kind: 'missing', fileId: id('p2 a.png'), fileName: 'p2 a.png', label: 'S1. La casa che cede' },
      { kind: 'missing', fileId: id('dominus 1.mp3'), fileName: 'dominus 1.mp3', label: 'S1. La casa che cede' },
    ]);
    expect(cuebardLeftOut(pack, 'not on the server')).toBe(
      'S1. La casa che cede: p2 a.png (not on the server)\nS1. La casa che cede: dominus 1.mp3 (not on the server)\n',
    );
    // Both tracks of a scene gone: its images have no link.
    const none = parse(doc, { durations, missing: new Set([id('dominus 1.mp3'), id('dominus 2.mp3')]) }).project;
    expect(none.visualMedia[0]).not.toHaveProperty('linkedCueUuid');
    expect(none.items[0].children).toEqual([]);
  });

  it('gives the warnings in board order, each scene its images then its music', () => {
    const doc = project({ document: DOCUMENT });
    const s1 = scenePrompt(doc, 'S1');
    scenePrompt(doc, 'S1');
    const pc = named(doc, 'pc', 'Rosalia');
    // Another client may write an empty name.
    doc.getMap('imagePrompts').set(`${named(doc, 'pc', 'x')}/name`, '  ');
    named(doc, 'handout', 'Mappa');
    add(doc, [image(1, 'a.png', s1), track(2, 'b.mp3', 'S2', null), image(3, 'c.png', pc)]);
    const { pack } = parse(doc, { missing: new Set([readFiles(doc).find((f) => f.name === 'c.png')!.id]) });
    expect(pack.summary.warnings.map((w) => [w.kind, w.label, 'number' in w ? w.number : undefined])).toEqual([
      ['no-image', 'S1. La casa che cede', 2],
      ['no-track', 'S1. La casa che cede', undefined],
      ['no-duration', 'S2. Il molo', undefined],
      ['no-track', 'S3. La torre', undefined],
      ['missing', 'PC "Rosalia"', undefined],
      ['no-image', 'PC "Untitled"', null],
      ['no-image', 'Handout "Mappa"', null],
    ]);
    expect(pack.summary.empty).toBe(false);
  });

  it('is empty with nothing picked, and not when the only track has no length', () => {
    const doc = project({ document: DOCUMENT });
    expect(parse(doc).pack.summary.empty).toBe(true);
    expect(parse(doc).project.items).toHaveLength(3);
    add(doc, [track(1, 'b.mp3', 'S2', null), image(2, 'tray.png', null)]);
    expect(parse(doc).pack.entries).toEqual([]);
    expect(parse(doc).pack.summary.empty).toBe(false);
  });

  it('names a scene’s single image after the scene, and a scene with no music title’s tracks after their files', () => {
    const doc = project({ document: DOCUMENT });
    const p = scenePrompt(doc, 'S2');
    add(doc, [image(1, 'pier.png', p), track(2, 'onde.mp3', 'S2'), track(3, 'vento.flac', 'S2', 60, 'audio/flac')]);
    const { project: file } = parse(doc);
    expect(file.visualMedia.map((v: { displayName: string }) => v.displayName)).toEqual(['S2. Il molo']);
    expect(file.items[1].children.map((c: { displayName: string }) => c.displayName)).toEqual(['onde', 'vento']);
    expect(file.visualFolders).toEqual(['Scenes']);
  });

  it('makes media names safe, unique up to case, with an extension CueBard takes', () => {
    const doc = project({ document: DOCUMENT, title: 'Notte? 50%' });
    const p = scenePrompt(doc, 'S1');
    const names = [
      'Tema #1 100%.mp3',
      '../../escape.mp3',
      '..',
      'a\u0007b.mp3',
      'Città.mp3',
      'Tema.mp3',
      'tema.MP3',
      'q?.mp3',
      `${'a'.repeat(150)}.mp3`,
      'trailing. . ',
      'CON.mp3',
      '.mp3',
      'ς.mp3',
      'Σ.mp3',
      'ﬁne.mp3',
      'fine.mp3',
      `${'音'.repeat(120)}.mp3`,
    ];
    add(doc, [
      ...names.map((name, i) => track(i + 1, name, 'S1')),
      track(20, 'senza estensione', 'S2', 30, 'audio/wav'),
      track(21, 'visuals', 'S2', 30, 'audio/x-unknown'),
      track(22, 'onda.m4a', 'S3', 30, 'audio/mp4'),
      image(23, 'mappa', p, 'image/jpeg'),
      image(24, 'carta #2.webp', p, 'image/webp'),
    ]);
    const { pack, project: file } = parse(doc);
    expect(pack.fileName).toBe('Notte- 50-.cbpack');
    expect(pack.projectFile.path).toBe('Notte- 50-.cuebard');
    expect(file.name).toBe('Notte? 50%');
    expect(pack.entries.filter((e) => e.kind === 'audio').map((e) => e.path)).toEqual([
      'media/Tema -1 100-.mp3',
      'media/-..-escape.mp3',
      'media/track.mp3',
      'media/a-b.mp3',
      'media/Città.mp3',
      'media/Tema.mp3',
      'media/tema (2).MP3',
      'media/q-.mp3',
      `media/${'a'.repeat(100)}.mp3`,
      'media/trailing.mp3',
      'media/_CON.mp3',
      'media/mp3.mp3',
      'media/ς.mp3',
      'media/Σ (2).mp3',
      'media/ﬁne.mp3',
      'media/fine (2).mp3',
      `media/${'音'.repeat(50)}.mp3`,
      'media/senza estensione.wav',
      'media/visuals (2)',
      'media/onda.m4a',
    ]);
    expect(pack.entries.find((e) => e.path.includes('Citt'))!.path).toBe('media/Città.mp3');
    const visuals = pack.entries.filter((e) => e.kind === 'image').map((e) => e.path.replace(/^media\/visuals\/[0-9a-f-]{36}_/, ''));
    expect(visuals).toEqual(['mappa.jpg', 'carta -2.webp']);
  });

  it('exports a campaign’s named images only', () => {
    const doc = project({ category: 'campaign', document: DOCUMENT });
    const npc = named(doc, 'npc', 'Padre Anselmo');
    add(doc, [image(1, 'a.png', npc), image(2, 'b.png', npc)]);
    const { pack, project: file } = parse(doc);
    expect(file.items).toEqual([]);
    expect(file.visualFolders).toEqual(['NPCs']);
    expect(file.visualMedia.map((v: { displayName: string; linkedCueUuid?: string }) => [v.displayName, v.linkedCueUuid])).toEqual([
      ['Padre Anselmo', undefined],
      ['Padre Anselmo (2)', undefined],
    ]);
    expect(pack.summary.groups).toBe(0);
  });

  it('reads a board from before image categories migrated, leaving the document as it is', () => {
    const doc = project({ document: DOCUMENT });
    doc.getMap<unknown>('board').set('S1/image', { prompt: 'a library', by: 'claude', at: AT });
    doc.getMap<unknown>('board').set('S1/chosenImage', 'i2');
    v06File(doc, { id: 'i1', sha256: hash(1), kind: 'image', sceneId: 'S1' });
    v06File(doc, { id: 'i2', sha256: hash(2), kind: 'image', sceneId: 'S1' });
    v06File(doc, { id: 't1', sha256: hash(3), kind: 'audio', sceneId: 'S1' });
    const before = Y.encodeStateAsUpdate(doc);
    const { pack, project: file } = parse(doc);
    expect(pack.entries.map((e) => e.sha256)).toEqual([hash(3), hash(2)]);
    expect(file.visualMedia[0].linkedCueUuid).toBe(cuebardUuid(ID, 'track', 't1'));
    expect(Buffer.from(Y.encodeStateAsUpdate(doc)).equals(Buffer.from(before))).toBe(true);
  });

  it('gives the same pack for the same board, but the dates', () => {
    const { doc } = board();
    const a = cuebardPack(doc, { now: NOW });
    const b = cuebardPack(doc, { now: '2027-01-01T00:00:00.000Z' });
    expect(b.projectFile.json.replaceAll('2027-01-01T00:00:00.000Z', NOW)).toBe(a.projectFile.json);
    expect(b.entries).toEqual(a.entries);
  });

  it('keeps the first of a file id written twice', () => {
    const { doc, id } = board();
    const copy = doc.getArray<Y.Map<unknown>>('files').toArray().find((item) => item.get('id') === id('molo.mp3'))!.clone();
    doc.getArray<Y.Map<unknown>>('files').push([copy]);
    expect(cuebardFiles(doc).filter((f) => f.id === id('molo.mp3'))).toHaveLength(1);
  });
});

describe('texts of any length', () => {
  it('are clipped in the project file and the warnings', () => {
    const long = 'x'.repeat(10_000);
    const doc = project({ document: DOCUMENT.replace('La torre', long), title: long });
    const p = named(doc, 'npc', 'Padre Anselmo');
    doc.getMap('imagePrompts').set(`${p}/name`, long);
    add(doc, [image(1, 'a.png', p), track(2, 'b.mp3', 'S3', null)]);
    // Another client may write names past the writers' limits.
    for (const item of doc.getArray<Y.Map<unknown>>('files').toArray()) item.set('name', `${long}.${item.get('kind') === 'image' ? 'png' : 'mp3'}`);
    const { pack, project: file } = parse(doc);
    expect(file.name).toHaveLength(200);
    expect(file.items[2].displayName).toBe(`S3. ${'x'.repeat(200)}`);
    expect(file.visualMedia[0].displayName).toHaveLength(200);
    expect(pack.summary.warnings.filter((w) => w.kind === 'no-duration')).toEqual([
      { kind: 'no-duration', sceneId: 'S3', label: `S3. ${'x'.repeat(200)}`, fileId: readFiles(doc)[1]!.id, fileName: 'x'.repeat(255) },
    ]);
    expect(pack.projectFile.json.length).toBeLessThan(5000);
  });
});

describe('cuebardFiles and needsDuration', () => {
  it('list what D1 picks in project-file order, and the tracks with no length', () => {
    const { doc } = board();
    expect(cuebardFiles(doc).map((f) => f.name)).toEqual([
      'dominus 1.mp3',
      'dominus 2.mp3',
      'molo.mp3',
      'p1 b.png',
      'p2 a.png',
      'p2 b.png',
      'p2 c.png',
      'torre.png',
      'rosalia 1.png',
      'rosalia 2.png',
      'lettera.png',
    ]);
    expect(needsDuration(doc).map((f) => f.name)).toEqual(['dominus 2.mp3']);
  });
});

describe('cuebardUuid', () => {
  it('is a lower-case version 4 layout, stable, and unique over the board', () => {
    const uuid = cuebardUuid(ID, 'track', 'f1');
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(cuebardUuid(ID, 'track', 'f1')).toBe(uuid);
    expect(cuebardUuid(ID, 'visual', 'f1')).not.toBe(uuid);
    expect(cuebardUuid('00000000-0000-4000-8000-000000000002', 'track', 'f1')).not.toBe(uuid);
    const { project: file } = parse(board().doc);
    const ids = [
      ...file.items.flatMap((g: { uuid: string; children: { uuid: string }[] }) => [g.uuid, ...g.children.map((c) => c.uuid)]),
      ...file.visualMedia.map((v: { uuid: string }) => v.uuid),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('cuebardFileName', () => {
  it('gives «Untitled» for an empty title and cuts a long one', () => {
    expect(cuebardFileName('')).toBe('Untitled.cbpack');
    expect(cuebardFileName(' .. ')).toBe('Untitled.cbpack');
    expect(cuebardFileName('Vol. 2')).toBe('Vol. 2.cbpack');
    expect(cuebardFileName('a'.repeat(150))).toBe(`${'a'.repeat(100)}.cbpack`);
    // 150 bytes at most: two each.
    expect(cuebardFileName('è'.repeat(150))).toBe(`${'è'.repeat(75)}.cbpack`);
    expect(cuebardFileName('AUX')).toBe('_AUX.cbpack');
    expect(cuebardFileName("L'Ancora di Sabaoth")).toBe("L'Ancora di Sabaoth.cbpack");
  });
});
