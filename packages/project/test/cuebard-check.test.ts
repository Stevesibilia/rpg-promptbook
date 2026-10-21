import { strToU8, zipSync, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';
import { addFiles, addImagePrompt, checkCuebardPack, cuebardPack, type NewFile } from '../src/index.js';
import { project } from './helpers.js';

const hash = (n: number) => n.toString(16).padStart(64, '0');

const DOCUMENT = `## Appendice: immagini e musica

### S1. La casa che cede

### S2. Il molo
`;

const file = (n: number, name: string, fields: Partial<NewFile>): NewFile => ({
  sha256: hash(n),
  thumbSha256: null,
  name,
  kind: 'audio',
  mime: 'audio/mpeg',
  size: 100,
  width: null,
  height: null,
  duration: 60,
  sceneId: 'S1',
  promptId: null,
  matchedBy: 'hand',
  addedBy: 'user',
  addedAt: `2026-10-21T09:00:0${n}.000Z`,
  ...fields,
});

// A good pack: two tracks, one with an accented name, a scene image linked to
// the first and a PC's image.
function good() {
  const doc = project({ document: DOCUMENT });
  const scene = addImagePrompt(doc, { category: 'scene', sceneId: 'S1', prompt: 'p' }, 'claude').id;
  const pc = addImagePrompt(doc, { category: 'pc', name: 'Rosalia', prompt: 'p' }, 'claude').id;
  addFiles(doc, [
    file(1, 'Città.mp3', {}),
    file(2, 'molo.mp3', { sceneId: 'S2' }),
    file(3, 'casa.png', { kind: 'image', mime: 'image/png', sceneId: null, promptId: scene, duration: null }),
    file(4, 'rosalia.png', { kind: 'image', mime: 'image/png', sceneId: null, promptId: pc, duration: null }),
  ]);
  return cuebardPack(doc, { now: '2026-10-21T12:00:00.000Z' });
}

type Project = Record<string, any>;

// The pack zipped as the server does: the project file deflated, the media
// stored. `change` edits the project, `extra` adds or replaces entries.
function zip(change: (p: Project) => void = () => {}, extra: Zippable = {}, drop: string[] = []): Uint8Array {
  const pack = good();
  const json = JSON.parse(pack.projectFile.json) as Project;
  change(json);
  const files: Zippable = { [pack.projectFile.path]: [strToU8(JSON.stringify(json)), { level: 6 }] };
  for (const entry of pack.entries) if (!drop.includes(entry.path)) files[entry.path] = [strToU8(`bytes of ${entry.path}`), { level: 0 }];
  return zipSync({ ...files, ...extra });
}

// The offset of an entry's central header.
function central(bytes: Uint8Array, name: string): number {
  const encoded = strToU8(name);
  for (let at = 0; at + 46 < bytes.length; at++) {
    if (bytes[at] !== 0x50 || bytes[at + 1] !== 0x4b || bytes[at + 2] !== 0x01 || bytes[at + 3] !== 0x02) continue;
    const length = bytes[at + 28]! | (bytes[at + 29]! << 8);
    if (length === encoded.length && encoded.every((b, i) => bytes[at + 46 + i] === b)) return at;
  }
  throw new Error(`no central header for ${name}`);
}

const local = (bytes: Uint8Array, name: string) => {
  const at = central(bytes, name) + 42;
  return (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)) >>> 0;
};

const audio = (p: Project, g = 0, c = 0) => p.items[g].children[c];

describe('checkCuebardPack', () => {
  it('finds nothing in a good pack, the accented name carrying the UTF-8 flag', () => {
    const bytes = zip();
    expect(checkCuebardPack(bytes)).toEqual([]);
    const at = local(bytes, 'media/Città.mp3');
    expect(((bytes[at + 6]! | (bytes[at + 7]! << 8)) & 0x800) !== 0).toBe(true);
  });

  it('refuses what is not a whole zip', () => {
    expect(checkCuebardPack(new Uint8Array(100))).toEqual(['no end of central directory: not a whole zip']);
  });

  it('asks for exactly one .cuebard project file at the root', () => {
    const pack = good();
    const none = zipSync({ [`sub/${pack.projectFile.path}`]: strToU8(pack.projectFile.json) });
    expect(checkCuebardPack(none)).toEqual(['0 project files at the root, not one']);
    expect(checkCuebardPack(zip(() => {}, { 'other.liveplay': strToU8('{}') }))).toEqual(['2 project files at the root, not one']);
    const liveplay = zipSync({ 'a.liveplay': strToU8(pack.projectFile.json) });
    expect(checkCuebardPack(liveplay)).toContain('project file "a.liveplay": not .cuebard');
  });

  it('refuses names the extractor refuses or CueBard’s URLs break on', () => {
    const cases: [string, string][] = [
      ['/abs.txt', 'absolute'],
      ['a\\b.txt', 'backslash'],
      ['C:/x.txt', 'drive letter'],
      ['media/../../x.txt', 'leaves its folder'],
      ['media/a#1.mp3', '# ? or %'],
      ['media/50%.mp3', '# ? or %'],
      ['media/CITTÀ.MP3', 'a second entry with this name, up to case'],
      ['media/visuals', 'a file where a folder is'],
    ];
    for (const [name, problem] of cases) {
      const found = checkCuebardPack(zip(() => {}, { [name]: strToU8('x') }));
      expect(found.some((p) => p.startsWith(`entry "${name}"`) && p.includes(problem)), `${name}: ${found.join('; ')}`).toBe(true);
    }
  });

  it('refuses a name not ASCII without the UTF-8 flag', () => {
    const bytes = zip();
    const at = central(bytes, 'media/Città.mp3');
    bytes[at + 9] = bytes[at + 9]! & ~0x08;
    const lo = local(bytes, 'media/Città.mp3');
    bytes[lo + 7] = bytes[lo + 7]! & ~0x08;
    expect(checkCuebardPack(bytes)).toEqual([
      'entry "media/Città.mp3": not ASCII and no UTF-8 flag in the central header',
      'entry "media/Città.mp3": not ASCII and no UTF-8 flag in the local header',
    ]);
  });

  it('refuses a method neither stored nor deflated, and entries past the extractor’s cap', () => {
    const method = zip();
    method[central(method, 'media/molo.mp3') + 10] = 12;
    expect(checkCuebardPack(method)).toEqual(['entry "media/molo.mp3": method 12, neither stored nor deflated']);
    const large = zip();
    const at = central(large, 'media/molo.mp3') + 24;
    large.set([0x00, 0x00, 0x00, 0x50], at);
    expect(checkCuebardPack(large)).toEqual([expect.stringMatching(/^the entries unpack to \d+ bytes, past the extractor's cap$/)]);
  });

  it('refuses a project file that is not JSON or not an object', () => {
    const pack = good();
    const broken = zipSync({ [pack.projectFile.path]: strToU8('{ not json') });
    expect(checkCuebardPack(broken)[0]).toMatch(/^project file: /);
    expect(checkCuebardPack(zipSync({ [pack.projectFile.path]: strToU8('[]') }))).toEqual(['project file: not a JSON object']);
  });

  it('asks for every field CueBard reads at schemaVersion 5, with its type', () => {
    const cases: [(p: Project) => void, string][] = [
      [(p) => (p.name = ''), 'project: name has the wrong type or value'],
      [(p) => delete p.items, 'project: items is missing'],
      [(p) => (p.schemaVersion = 6), 'project: schemaVersion has the wrong type or value'],
      [(p) => delete p.visualMedia, 'project: visualMedia is missing'],
      [(p) => delete p.visualFolders, 'project: visualFolders is missing'],
      [(p) => delete p.theme, 'project: theme is missing'],
      [(p) => delete p.items[0].startBehavior, 'item [0]: startBehavior is missing'],
      [(p) => (p.items[0].startBehavior = { action: 'nothing' }), 'item [0]: startBehavior has the wrong type or value'],
      [(p) => delete audio(p).duration, 'item [0, 0]: duration is missing'],
      [(p) => (audio(p).duration = 0), 'item [0, 0]: duration has the wrong type or value'],
      [(p) => delete audio(p).endBehavior, 'item [0, 0]: endBehavior is missing'],
      [(p) => delete audio(p).duckingBehavior, 'item [0, 0]: duckingBehavior is missing'],
      [(p) => delete audio(p).outPoint, 'item [0, 0]: outPoint is missing'],
      [(p) => (audio(p).outPoint = 1000), 'item [0, 0]: outPoint past the duration'],
      [(p) => (audio(p).index = [0, 1]), 'item [0, 0]: index is [0, 1]'],
      [(p) => (audio(p).uuid = 'not a uuid!'), 'item [0, 0]: uuid has the wrong type or value'],
      [(p) => delete p.visualMedia[0].fadeIn, 'visual 0: fadeIn is missing'],
      [(p) => (p.visualMedia[0].mediaType = 'video'), 'visual 0: mediaType has the wrong type or value'],
    ];
    for (const [change, problem] of cases) {
      const found = checkCuebardPack(zip(change));
      expect(found, problem).toContain(problem);
    }
  });

  it('asks for unique ids, media that exist, links to audio items and known folders', () => {
    expect(checkCuebardPack(zip((p) => (p.items[1].uuid = p.items[0].uuid)))).toEqual([
      expect.stringMatching(/^item \[1\]: uuid .* given twice$/),
    ]);
    expect(checkCuebardPack(zip((p) => (p.visualMedia[1].uuid = audio(p).uuid)))[0]).toMatch(/^visual 1: uuid .* given twice$/);
    expect(checkCuebardPack(zip(() => {}, {}, ['media/molo.mp3']))).toEqual(['item [1, 0]: no entry media/molo.mp3']);
    expect(checkCuebardPack(zip((p) => (audio(p).mediaPath = 'media/other.mp3')))).toEqual([
      'item [0, 0]: mediaPath is not media/<mediaFileName>',
    ]);
    expect(checkCuebardPack(zip((p) => (p.visualMedia[0].linkedCueUuid = p.items[0].uuid)))).toEqual([
      'visual 0: linkedCueUuid names no audio item',
    ]);
    expect(checkCuebardPack(zip((p) => (p.visualFolders = ['Scenes'])))).toEqual(['visual 1: folder "PCs" is not in visualFolders']);
  });
});
