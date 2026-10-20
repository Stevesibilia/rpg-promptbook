import { describe, expect, it } from 'vitest';
import {
  addFiles,
  assignFile,
  chooseFile,
  exportBoard,
  exportFolderName,
  exportProject,
  readFiles,
  setImagePrompt,
  setMusicPrompt,
  type NewFile,
} from '../src/index.js';
import { project } from './helpers.js';
import type * as Y from 'yjs';

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

const image = (n: number, name: string, overrides: Partial<NewFile> = {}): NewFile => ({
  sha256: hash(n),
  thumbSha256: hash(1000 + n),
  name,
  kind: 'image',
  mime: 'image/png',
  size: 1000,
  width: 1456,
  height: 816,
  duration: null,
  sceneId: 'S1',
  matchedBy: 'prompt',
  addedBy: 'user',
  ...overrides,
});

const track = (n: number, name: string, overrides: Partial<NewFile> = {}): NewFile => ({
  sha256: hash(n),
  thumbSha256: null,
  name,
  kind: 'audio',
  mime: 'audio/mpeg',
  size: 4000,
  width: null,
  height: null,
  duration: 190,
  sceneId: 'S1',
  matchedBy: 'title',
  addedBy: 'user',
  ...overrides,
});

describe('the board in the export', () => {
  it('has a board.md before project.json, empty when there is nothing to say', () => {
    const files = exportProject(project(), { campaignTitle: null });
    expect(Object.keys(files).slice(-2)).toEqual(['board.md', 'project.json']);
    expect(files['board.md']).toBe('');
  });

  it('lists each appendix row in order with its prompts, authors, dates and chosen files', () => {
    const doc = project({ document: DOCUMENT });
    setImagePrompt(doc, 'S1', 'a collapsed library --ar 16:9 --v 8.1', 'claude', AT);
    setMusicPrompt(doc, 'S1', { title: 'La casa cede', style: 'dark ambient, low drones', lyrics: '[Intro]\n[End]' }, 'user', AT);
    add(doc, [image(1, 'steve_a_collapsed_library_1.png'), track(2, 'la casa cede.mp3')]);
    const [img, mus] = readFiles(doc);
    chooseFile(doc, 'S1', 'image', img!.id);
    chooseFile(doc, 'S1', 'audio', mus!.id);

    expect(exportProject(doc, { campaignTitle: null })['board.md']).toBe(
      [
        '## S1 · La casa che cede',
        '',
        '### Image',
        '',
        '```',
        'a collapsed library --ar 16:9 --v 8.1',
        '```',
        '',
        `by Claude · ${AT}`,
        '',
        'Chosen: steve_a_collapsed_library_1.png',
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
        '### Image',
        '',
        'No prompt yet.',
        '',
        '### Music',
        '',
        'No prompt yet.',
        '',
      ].join('\n'),
    );
  });

  it('fences a text that holds backticks with a longer fence', () => {
    const doc = project({ document: DOCUMENT });
    setImagePrompt(doc, 'S1', 'a ``` b', 'claude', AT);
    expect(exportBoard(doc).markdown).toContain('````\na ``` b\n````');
  });

  it('puts each file in its scene’s folder and the tray in files/unmatched', () => {
    const doc = project({ document: DOCUMENT });
    add(doc, [
      image(1, 'one.png'),
      track(2, 'two.mp3'),
      image(3, 'three.png', { sceneId: 'S2' }),
      track(4, 'lost.mp3', { sceneId: null, matchedBy: null }),
      // Names a scene the appendix has no row for: shown in the tray.
      image(5, 'orphan.png', { sceneId: 'S9' }),
    ]);
    expect(exportBoard(doc).files).toEqual([
      { path: 'files/S1/one.png', sha256: hash(1) },
      { path: 'files/S1/two.mp3', sha256: hash(2) },
      { path: 'files/S2/three.png', sha256: hash(3) },
      { path: 'files/unmatched/lost.mp3', sha256: hash(4) },
      { path: 'files/unmatched/orphan.png', sha256: hash(5) },
    ]);
  });

  it('numbers a name taken twice in one folder before its extension, in any case', () => {
    const doc = project({ document: DOCUMENT });
    add(doc, [
      track(1, 'take.mp3'),
      track(2, 'Take.mp3'),
      track(3, 'take.mp3', { sceneId: 'S2' }),
      track(4, 'archive'),
      track(5, 'archive'),
      track(6, 'a.tar.gz'),
      track(7, 'a.tar.gz'),
    ]);
    expect(exportBoard(doc).files.map((f) => f.path)).toEqual([
      'files/S1/take.mp3',
      'files/S1/Take (2).mp3',
      'files/S1/archive',
      'files/S1/archive (2)',
      'files/S1/a.tar.gz',
      'files/S1/a.tar (2).gz',
      'files/S2/take.mp3',
    ]);
  });

  it('names the chosen file as it is exported', () => {
    const doc = project({ document: DOCUMENT });
    add(doc, [track(1, 'take.mp3'), track(2, 'take.mp3')]);
    const [, second] = readFiles(doc);
    chooseFile(doc, 'S1', 'audio', second!.id);
    expect(exportBoard(doc).markdown).toContain('Chosen: take (2).mp3');
  });

  it('keeps every name inside its folder', () => {
    const doc = project({ document: DOCUMENT });
    add(doc, [
      image(1, '../../etc/passwd'),
      image(2, '..'),
      image(3, 'a\\b:c*d?.png'),
      image(4, 'dots...'),
      image(5, 'tab\tname.png'),
    ]);
    const paths = exportBoard(doc).files.map((f) => f.path);
    expect(paths).toEqual([
      'files/S1/..-..-etc-passwd',
      'files/S1/file',
      'files/S1/a-b-c-d-.png',
      'files/S1/dots',
      'files/S1/tab-name.png',
    ]);
    for (const path of paths) expect(path.split('/')).toHaveLength(3);
  });

  it('never lists a thumbnail', () => {
    const doc = project({ document: DOCUMENT });
    add(doc, [image(1, 'one.png')]);
    expect(exportBoard(doc).files.map((f) => f.sha256)).toEqual([hash(1)]);
  });

  it('exports a moved file under its new scene and an unmatched one in the tray', () => {
    const doc = project({ document: DOCUMENT });
    add(doc, [image(1, 'one.png')]);
    const [file] = readFiles(doc);
    assignFile(doc, file!.id, 'S2');
    expect(exportBoard(doc).files[0]!.path).toBe('files/S2/one.png');
    assignFile(doc, file!.id, null);
    expect(exportBoard(doc).files[0]!.path).toBe('files/unmatched/one.png');
  });

  it('exports the files of a campaign, which has no rows, in the tray', () => {
    const doc = project({ category: 'campaign', document: '# Campagna\n' });
    add(doc, [image(1, 'one.png')]);
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
