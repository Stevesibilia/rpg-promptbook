import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  addFiles,
  addImagePrompt,
  assignImage,
  chooseImage,
  chooseTrack,
  exportBoard,
  exportFolderName,
  exportProject,
  readFiles,
  removeImagePrompt,
  setFirstScenePrompt,
  setGdrarchive,
  setMusicPrompt,
  type NewFile,
} from '../src/index.js';
import { project, v06File } from './helpers.js';

const AT = '2026-10-20T09:00:00.000Z';
const hash = (n: number) => n.toString(16).padStart(64, '0');

const DOCUMENT = `# L'Ancora di Sabaoth

## Appendice: immagini e musica

### S1. La casa che cede

visual: collapsed library

mood: suffocating

### S2. Il molo

visual: the pier

mood: calm
`;

// Files are read oldest first; added together they would be in id order.
const add = (doc: Y.Doc, files: NewFile[]) =>
  addFiles(
    doc,
    files.map((file, i) => ({ ...file, addedAt: new Date(Date.parse(AT) + i * 1000).toISOString() })),
  );

const image = (n: number, name: string, promptId: string | null): NewFile => ({
  sha256: hash(n),
  thumbSha256: hash(1000 + n),
  name,
  kind: 'image',
  mime: 'image/png',
  size: 1000,
  width: 1456,
  height: 816,
  duration: null,
  sceneId: null,
  promptId,
  matchedBy: promptId === null ? null : 'prompt',
  addedBy: 'user',
});

const track = (n: number, name: string, sceneId: string | null = 'S1'): NewFile => ({
  sha256: hash(n),
  thumbSha256: null,
  name,
  kind: 'audio',
  mime: 'audio/mpeg',
  size: 4000,
  width: null,
  height: null,
  duration: 190,
  sceneId,
  promptId: null,
  matchedBy: sceneId === null ? null : 'title',
  addedBy: 'user',
});

const scenePrompt = (doc: Y.Doc, sceneId: string, prompt: string) =>
  addImagePrompt(doc, { category: 'scene', sceneId, prompt }, 'claude', AT).id;
const named = (doc: Y.Doc, category: 'pc' | 'npc' | 'handout', name: string, prompt: string) =>
  addImagePrompt(doc, { category, name, prompt }, 'claude', AT).id;

describe('the gdrarchive link in the export', () => {
  it('writes the own link in project.json, and no key without one', () => {
    const link = { url: 'https://gdrarchive.siberio.eu/campaigns/12', label: 'Kulthos' };
    const kulthos = project({ id: '00000000-0000-4000-8000-0000000000c1', category: 'campaign', title: 'Kulthos' });
    setGdrarchive(kulthos, link);
    const json = JSON.parse(exportProject(kulthos, { campaignTitle: null })['project.json']!);
    expect(json.gdrarchive).toEqual(link);
    expect(Object.keys(json).indexOf('gdrarchive')).toBe(Object.keys(json).indexOf('system') + 1);

    // An adventure inherits Kulthos's link but exports none of its own.
    const adventure = project({ category: 'adventure', campaignId: '00000000-0000-4000-8000-0000000000c1' });
    const plain = JSON.parse(exportProject(adventure, { campaignTitle: 'Kulthos' })['project.json']!);
    expect(plain).not.toHaveProperty('gdrarchive');
    expect(plain.campaign).toBe('Kulthos');
  });
});

describe('the board in the export', () => {
  it('has a board.md before project.json, empty when there is nothing to say', () => {
    const files = exportProject(project(), { campaignTitle: null });
    expect(Object.keys(files).slice(-2)).toEqual(['board.md', 'project.json']);
    expect(files['board.md']).toBe('');
  });

  it('writes a part per category: the scenes with their prompts numbered and music, then PCs, NPCs and handouts', () => {
    const doc = project({ document: DOCUMENT });
    const first = setFirstScenePrompt(doc, 'S1', 'a collapsed library --ar 16:9 --v 8.1', 'claude', AT).id;
    scenePrompt(doc, 'S1', '');
    setMusicPrompt(doc, 'S1', { title: 'La casa cede', style: 'dark ambient, low drones', lyrics: '[Intro]\n[End]' }, 'user', AT);
    const rosalia = named(doc, 'pc', 'Rosalia Ferrante', 'portrait of a young nurse --ar 2:3 --v 8.1');
    named(doc, 'npc', 'Padre Anselmo', 'portrait of an old priest --ar 2:3 --v 8.1');
    add(doc, [
      image(1, 'steve_a_collapsed_library_1.png', first),
      track(2, 'la casa cede.mp3'),
      image(3, 'steve_portrait_of_a_young_nurse_0.png', rosalia),
    ]);
    const [img, mus, portrait] = readFiles(doc);
    chooseImage(doc, first, img!.id);
    chooseTrack(doc, 'S1', mus!.id);
    chooseImage(doc, rosalia, portrait!.id);

    expect(exportProject(doc, { campaignTitle: null })['board.md']).toBe(
      [
        '# Scenes',
        '',
        '## S1 · La casa che cede',
        '',
        '### Image prompt 1',
        '',
        '```',
        'a collapsed library --ar 16:9 --v 8.1',
        '```',
        '',
        `by Claude · ${AT}`,
        '',
        'Chosen: steve_a_collapsed_library_1.png',
        '',
        '### Image prompt 2',
        '',
        'No prompt yet.',
        '',
        '### Music',
        '',
        'Title: La casa cede',
        '',
        'Style:',
        '',
        '```',
        'dark ambient, low drones',
        '```',
        '',
        'Lyrics:',
        '',
        '```',
        '[Intro]',
        '[End]',
        '```',
        '',
        `by you · ${AT}`,
        '',
        'Chosen: la casa cede.mp3',
        '',
        '## S2 · Il molo',
        '',
        'No image prompts yet.',
        '',
        '### Music',
        '',
        'No prompt yet.',
        '',
        '# PCs',
        '',
        '## Rosalia Ferrante',
        '',
        '```',
        'portrait of a young nurse --ar 2:3 --v 8.1',
        '```',
        '',
        `by Claude · ${AT}`,
        '',
        'Chosen: steve_portrait_of_a_young_nurse_0.png',
        '',
        '# NPCs',
        '',
        '## Padre Anselmo',
        '',
        '```',
        'portrait of an old priest --ar 2:3 --v 8.1',
        '```',
        '',
        `by Claude · ${AT}`,
        '',
        '# Handouts',
        '',
        'None yet.',
        '',
      ].join('\n'),
    );
  });

  it('writes the other parts when the document has no appendix', () => {
    const doc = project({ document: '# Senza appendice\n' });
    named(doc, 'handout', 'Lettera di Salvi', 'an old letter --ar 3:4 --v 8.1');
    const markdown = exportBoard(doc).markdown;
    expect(markdown.startsWith('# Scenes\n\nNone yet.\n\n# PCs\n\nNone yet.\n\n# NPCs\n\nNone yet.\n\n# Handouts\n\n## Lettera di Salvi\n')).toBe(true);
  });

  it('fences a text that holds backticks with a longer fence', () => {
    const doc = project({ document: DOCUMENT });
    setFirstScenePrompt(doc, 'S1', 'a ``` b', 'claude', AT);
    expect(exportBoard(doc).markdown).toContain('````\na ``` b\n````');
  });

  it('puts each file in its prompt’s or scene’s folder, and the tray in files/unmatched', () => {
    const doc = project({ document: DOCUMENT });
    const s1a = scenePrompt(doc, 'S1', 'first');
    const s1b = scenePrompt(doc, 'S1', 'second');
    const s2 = scenePrompt(doc, 'S2', 'third');
    const hidden = scenePrompt(doc, 'S9', 'kept, not shown');
    const gone = scenePrompt(doc, 'S2', 'removed');
    const anselmo = named(doc, 'npc', 'Padre Anselmo', 'x');
    const letter = named(doc, 'handout', 'Lettera: di Salvi?', 'y');
    const rosalia = named(doc, 'pc', 'Rosalia', 'z');
    add(doc, [
      image(1, 'one.png', s1a),
      image(2, 'two.png', s1b),
      track(3, 'take.mp3'),
      image(4, 'three.png', s2),
      image(5, 'priest.png', anselmo),
      image(6, 'letter.png', letter),
      image(7, 'nurse.png', rosalia),
      track(8, 'lost.mp3', null),
      // Its prompt's scene has no row in the appendix: in the tray.
      image(9, 'orphan.png', hidden),
      image(10, 'removed.png', gone),
      image(11, 'never.png', null),
    ]);
    removeImagePrompt(doc, gone);
    expect(exportBoard(doc).files).toEqual([
      { path: 'files/scenes/S1/1/one.png', sha256: hash(1) },
      { path: 'files/scenes/S1/2/two.png', sha256: hash(2) },
      { path: 'files/scenes/S1/music/take.mp3', sha256: hash(3) },
      { path: 'files/scenes/S2/1/three.png', sha256: hash(4) },
      { path: 'files/pcs/Rosalia/nurse.png', sha256: hash(7) },
      { path: 'files/npcs/Padre Anselmo/priest.png', sha256: hash(5) },
      { path: 'files/handouts/Lettera- di Salvi-/letter.png', sha256: hash(6) },
      { path: 'files/unmatched/lost.mp3', sha256: hash(8) },
      { path: 'files/unmatched/orphan.png', sha256: hash(9) },
      { path: 'files/unmatched/removed.png', sha256: hash(10) },
      { path: 'files/unmatched/never.png', sha256: hash(11) },
    ]);
  });

  it('gives two NPCs with one name, in any case, their own folders, and an empty name «Untitled»', () => {
    const doc = project({ document: DOCUMENT });
    const a = named(doc, 'npc', 'Turi', 'a');
    const b = named(doc, 'npc', 'turi', 'b');
    const c = named(doc, 'pc', 'Turi', 'c');
    const d = named(doc, 'handout', 'x', 'd');
    doc.getMap('imagePrompts').set(`${d}/name`, '');
    add(doc, [image(1, 'a.png', a), image(2, 'b.png', b), image(3, 'c.png', c), image(4, 'd.png', d)]);
    expect(exportBoard(doc).files.map((f) => f.path)).toEqual([
      'files/pcs/Turi/c.png',
      'files/npcs/Turi/a.png',
      'files/npcs/turi (2)/b.png',
      'files/handouts/Untitled/d.png',
    ]);
    expect(exportBoard(doc).markdown).toContain('## Untitled');
  });

  it('numbers a name taken twice in one folder before its extension, in any case', () => {
    const doc = project({ document: DOCUMENT });
    add(doc, [
      track(1, 'take.mp3'),
      track(2, 'Take.mp3'),
      track(3, 'take.mp3', 'S2'),
      track(4, 'archive'),
      track(5, 'archive'),
      track(6, 'a.tar.gz'),
      track(7, 'a.tar.gz'),
    ]);
    expect(exportBoard(doc).files.map((f) => f.path)).toEqual([
      'files/scenes/S1/music/take.mp3',
      'files/scenes/S1/music/Take (2).mp3',
      'files/scenes/S1/music/archive',
      'files/scenes/S1/music/archive (2)',
      'files/scenes/S1/music/a.tar.gz',
      'files/scenes/S1/music/a.tar (2).gz',
      'files/scenes/S2/music/take.mp3',
    ]);
  });

  it('names the chosen file as it is exported', () => {
    const doc = project({ document: DOCUMENT });
    add(doc, [track(1, 'take.mp3'), track(2, 'take.mp3')]);
    const [, second] = readFiles(doc);
    chooseTrack(doc, 'S1', second!.id);
    expect(exportBoard(doc).markdown).toContain('Chosen: take (2).mp3');
  });

  it('keeps every name inside its folder', () => {
    const doc = project({ document: DOCUMENT });
    const p = scenePrompt(doc, 'S1', 'x');
    add(doc, [
      image(1, '../../etc/passwd', p),
      image(2, '..', p),
      image(3, 'a\\b:c*d?.png', p),
      image(4, 'dots...', p),
      image(5, 'tab\tname.png', p),
    ]);
    const paths = exportBoard(doc).files.map((f) => f.path);
    expect(paths).toEqual([
      'files/scenes/S1/1/..-..-etc-passwd',
      'files/scenes/S1/1/file',
      'files/scenes/S1/1/a-b-c-d-.png',
      'files/scenes/S1/1/dots',
      'files/scenes/S1/1/tab-name.png',
    ]);
    for (const path of paths) expect(path.split('/')).toHaveLength(5);
  });

  it('never lists a thumbnail', () => {
    const doc = project({ document: DOCUMENT });
    add(doc, [image(1, 'one.png', scenePrompt(doc, 'S1', 'x'))]);
    expect(exportBoard(doc).files.map((f) => f.sha256)).toEqual([hash(1)]);
  });

  it('exports a moved file under its new prompt and an unmatched one in the tray', () => {
    const doc = project({ document: DOCUMENT });
    const npc = named(doc, 'npc', 'Turi', 'x');
    add(doc, [image(1, 'one.png', scenePrompt(doc, 'S1', 'y'))]);
    const [file] = readFiles(doc);
    assignImage(doc, file!.id, npc);
    expect(exportBoard(doc).files[0]!.path).toBe('files/npcs/Turi/one.png');
    assignImage(doc, file!.id, null);
    expect(exportBoard(doc).files[0]!.path).toBe('files/unmatched/one.png');
  });

  it('exports a board from before image categories as each scene’s prompt 1, leaving the document as it is', () => {
    const doc = project({ document: DOCUMENT });
    doc.getMap<unknown>('board').set('S1/image', { prompt: 'a collapsed library', by: 'claude', at: AT });
    doc.getMap<unknown>('board').set('S1/chosenImage', 'i2');
    v06File(doc, { id: 'i1', sha256: hash(1), kind: 'image', sceneId: 'S1', name: 'one.png' });
    v06File(doc, { id: 'i2', sha256: hash(2), kind: 'image', sceneId: 'S1', name: 'two.png', addedAt: '2026-10-19T09:01:00.000Z' });
    v06File(doc, { id: 't1', sha256: hash(3), kind: 'audio', sceneId: 'S1', name: 'take.mp3' });
    const state = Y.encodeStateAsUpdate(doc);
    const { markdown, files } = exportBoard(doc);
    expect(files.map((f) => f.path)).toEqual([
      'files/scenes/S1/1/one.png',
      'files/scenes/S1/1/two.png',
      'files/scenes/S1/music/take.mp3',
    ]);
    expect(markdown).toContain('### Image prompt 1\n\n```\na collapsed library\n```\n\nby Claude · 2026-10-20T09:00:00.000Z\n\nChosen: two.png');
    expect(Y.encodeStateAsUpdate(doc)).toEqual(state);
  });

  it('exports the files of a campaign in the tray, with an empty board.md', () => {
    const doc = project({ category: 'campaign', document: '# Campagna\n' });
    add(doc, [image(1, 'one.png', null)]);
    expect(exportBoard(doc)).toEqual({
      markdown: '',
      files: [{ path: 'files/unmatched/one.png', sha256: hash(1) }],
    });
  });
});

describe('exportFolderName', () => {
  it('never gives a folder that climbs out of the zip', () => {
    const taken = new Set<string>();
    expect([
      exportFolderName('..', taken),
      exportFolderName('.', taken),
      exportFolderName('...', taken),
      exportFolderName('', taken),
      exportFolderName('a\u0000b\tc', taken),
    ]).toEqual(['Untitled', 'Untitled (2)', 'Untitled (3)', 'Untitled (4)', 'a-b-c']);
  });
});
