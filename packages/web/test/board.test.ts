import { describe, expect, it } from 'vitest';
import {
  addFiles,
  addImagePrompt,
  addMusicPrompt,
  assignImage,
  boardRows,
  generalMusic,
  namedPrompts,
  readBoard,
  readFiles,
  readImagePrompts,
  readMusicPrompts,
  removeImagePrompt,
  setFirstScenePrompt,
  setMusicPrompt,
  type NewFile,
} from 'promptbook-project';
import type { AppendixRow } from 'promptbook-format';
import * as Y from 'yjs';
import {
  addMusic,
  addPrompt,
  assignImageFromTray,
  assignTrackFromTray,
  EMPTY_TITLE,
  imageQuestion,
  matchAgain,
  matchAgainToast,
  moveImage,
  moveTrack,
  musicQuestion,
  promptQuestion,
  removeFromBoard,
  removeFromTray,
  removeMusic,
  removePrompt,
  saveMusic,
  savePrompt,
  toggleImage,
  toggleTrack,
  trackQuestion,
} from '../src/board/actions.js';
import { countItems, countLine } from '../src/board/DropOverlay.js';
import { midjourneyWords } from '../src/board/MatchHelp.js';
import {
  cardFilterCounts,
  dims,
  duration,
  firstWords,
  generalTabLine,
  joinAnd,
  keepsRow,
  menuLabel,
  musicOwner,
  newName,
  promptGroups,
  promptLabel,
  rowFilterCounts,
  sceneOwner,
  sectionLine,
  shapeOf,
  shortName,
  shownPrompts,
  stackLine,
  summarizeGeneral,
  summarizeScenes,
  tabLabel,
  tabLine,
  tabParam,
  trackGroups,
  trackPlaces,
} from '../src/board/summary.js';
import { trayFiles } from '../src/board/useBoard.js';

// The board's labels, summary, filters and tabs, the tray, the actions of
// the prompt blocks, cards, viewer, track menu and tray, and the drop
// overlay's count.

type Status = 'wanted' | 'received' | 'chosen';
const scene = (musicStatus: Status, ...prompts: Status[]) => ({ musicStatus, prompts: prompts.map((status) => ({ status })) });

describe('summary and filters', () => {
  const rows = [
    scene('chosen', 'chosen', 'received', 'wanted'),
    scene('received', 'received'),
    scene('wanted', 'received'),
    scene('wanted', 'chosen'),
    scene('chosen', 'received'),
    scene('wanted'),
  ];

  it('counts the scenes, the image prompts and the music by state', () => {
    expect(summarizeScenes(rows)).toEqual({
      scenes: 6,
      prompts: 7,
      images: { chosen: 2, received: 4, wanted: 1 },
      music: { chosen: 2, received: 1, wanted: 3 },
    });
  });

  it('keeps the rows with at least one prompt or the music in the state', () => {
    expect(rowFilterCounts(rows)).toEqual({ all: 6, wanted: 4, received: 4, chosen: 3 });
    expect(keepsRow(scene('received', 'chosen', 'wanted'), 'wanted')).toBe(true);
    expect(keepsRow(scene('chosen', 'received'), 'wanted')).toBe(false);
    expect(dims('received', 'wanted')).toBe(true);
    expect(dims('wanted', 'wanted')).toBe(false);
    expect(dims('received', 'all')).toBe(false);
  });

  it('counts the cards of a tab by state', () => {
    const npcs = ['chosen', 'received', 'received', 'wanted', 'wanted', 'wanted'].map((status) => ({ status }) as { status: Status });
    expect(cardFilterCounts(npcs)).toEqual({ all: 6, chosen: 1, received: 2, wanted: 3 });
  });

  it("writes each tab's second line and title", () => {
    const of = (...statuses: Status[]) => statuses.map((status) => ({ status }));
    expect(tabLine([])).toEqual({ line: 'none yet', title: '0 image prompts: 0 chosen, 0 received, 0 wanted', wanted: false });
    expect(tabLine(of('wanted', 'chosen', 'wanted', 'received'))).toMatchObject({
      line: '2 wanted',
      title: '4 image prompts: 1 chosen, 1 received, 2 wanted',
      wanted: true,
    });
    expect(tabLine(of('received', 'chosen', 'received')).line).toBe('2 received');
    expect(tabLine(of('chosen')).title).toBe('1 image prompt: 1 chosen, 0 received, 0 wanted');
    expect(tabLine(of('chosen', 'chosen')).line).toBe('all chosen');
    expect(stackLine(of('chosen', 'received', 'wanted'))).toBe('3 prompts · 1 chosen');
    expect(stackLine(of('wanted'))).toBe('1 prompt · 0 chosen');
    expect(stackLine([])).toBe('No prompts');
  });

  it('reads the tab from the address', () => {
    expect(tabParam('npcs')).toBe('npcs');
    expect(tabParam('general')).toBe('general');
    expect(tabParam(null)).toBe('scenes');
    expect(tabParam('nope')).toBe('scenes');
  });

  it('writes durations, cuts long names, and gives an image its shape', () => {
    expect(duration(192)).toBe('3:12');
    expect(duration(59.6)).toBe('1:00');
    expect(duration(null)).toBe('');
    expect(shortName('steve_a_vast_cathedral_nave_flooded_with_seawater.png')).toBe('steve_a_vast_cathedral_nave_flooded_with…');
    expect(shortName('untitled track.mp3')).toBe('untitled track.mp3');
    expect(shapeOf({ width: 896, height: 1344 })).toEqual({ ratio: '896 / 1344', tall: true });
    expect(shapeOf({ width: 1456, height: 816 })).toEqual({ ratio: '1456 / 816', tall: false });
    expect(shapeOf({ width: null, height: null })).toEqual({ ratio: '16 / 9', tall: false });
  });
});

const appendix = (rows: [string, string][]): AppendixRow[] =>
  rows.map(([sceneId, title]) => ({ sceneId, title, heading: `${sceneId}. ${title}` }) as unknown as AppendixRow);

const track = (name: string, sceneId: string, n: number): NewFile => ({
  sha256: n.toString(16).padStart(64, '0'),
  thumbSha256: null,
  name,
  kind: 'audio',
  mime: 'audio/mpeg',
  size: 1000,
  width: null,
  height: null,
  duration: 180,
  sceneId,
  promptId: null,
  matchedBy: 'title',
  addedBy: 'user',
});

const image = (name: string, n: number, promptId: string | null = null, size: [number, number] = [1456, 816]): NewFile => ({
  ...track(name, 'S3', n),
  kind: 'image',
  mime: 'image/png',
  width: size[0],
  height: size[1],
  duration: null,
  sceneId: null,
  promptId,
  matchedBy: promptId ? 'prompt' : null,
});

const uuid = '0b6f2c1e-3d4a-4b5c-8d9e-0f1a2b3c4d5e';

function board() {
  const doc = new Y.Doc();
  setMusicPrompt(doc, 'S3', { title: 'Ordini del Re', style: 'martial', lyrics: '[End]' }, 'claude');
  addFiles(doc, [track('ordini del re.mp3', 'S3', 1), track('ordini del re (1).mp3', 'S3', 2)]);
  const s3 = addImagePrompt(
    doc,
    { category: 'scene', sceneId: 'S3', prompt: 'collapsed cathedral facade in 1908 Messina, Italian soldiers --ar 16:9' },
    'claude',
  );
  const s4a = addImagePrompt(doc, { category: 'scene', sceneId: 'S4', prompt: 'Sicilian fishing village at the tip of the strait' }, 'claude');
  const s4b = addImagePrompt(
    doc,
    { category: 'scene', sceneId: 'S4', prompt: 'portrait of an old Sicilian fisherwoman singing on the beach at dusk' },
    'user',
  );
  const nina = addImagePrompt(
    doc,
    { category: 'npc', name: "Za' Nina", prompt: 'portrait of an old Sicilian fisherwoman singing, black shawl --ar 2:3' },
    'claude',
  );
  const turi = addImagePrompt(doc, { category: 'npc', name: 'Turi', prompt: 'portrait of a barefoot Sicilian boy in 1908' }, 'user');
  const letter = addImagePrompt(doc, { category: 'handout', name: 'Lettera di Salvi', prompt: 'a handwritten letter on yellowed paper' }, 'claude');
  addFiles(doc, [0, 1, 2, 3].map((i) => image(`steve_collapsed_cathedral_facade_${uuid}_${i}.png`, 30 + i, s3.id)));
  const scenes = appendix([
    ['S3', "L'ordine di Donato"],
    ['S4', 'Torre Faro e la canzone'],
  ]);
  const rows = () => boardRows(scenes, readBoard(doc), readImagePrompts(doc), readFiles(doc));
  const named = () => namedPrompts(readImagePrompts(doc), readFiles(doc));
  const shown = () => shownPrompts(rows(), named());
  const tray = () => trayFiles(scenes, rows(), named(), readImagePrompts(doc), readFiles(doc));
  const places = () => trackPlaces(rows(), []);
  return { doc, rows, named, shown, tray, places, ids: { s3: s3.id, s4a: s4a.id, s4b: s4b.id, nina: nina.id, turi: turi.id, letter: letter.id } };
}

describe('labels', () => {
  it('names a prompt by its scene and number, or its category and name', () => {
    const { shown, ids } = board();
    const s4b = shown().get(ids.s4b)!;
    expect(promptLabel(s4b)).toBe('S4 · prompt 2');
    expect(promptLabel(s4b, true)).toBe('S4 · Torre Faro e la canzone · prompt 2');
    expect(menuLabel(s4b)).toBe('S4 #2 · portrait of an old Sicilian…');
    expect(tabLabel(s4b)).toBe('Scenes · S4 #2 · portrait of an old Sicilian…');
    const nina = shown().get(ids.nina)!;
    expect(promptLabel(nina)).toBe("NPC · Za' Nina");
    expect(promptLabel(nina, true)).toBe("NPC · Za' Nina");
    expect(menuLabel(nina)).toBe("Za' Nina");
    expect(tabLabel(nina)).toBe("NPCs · Za' Nina");
    expect(firstWords('collapsed 1900s Sicilian library at night, broken beams')).toBe('collapsed 1900s Sicilian library at…');
    expect(firstWords('rocky cape, at sunset')).toBe('rocky cape, at sunset');
    expect(joinAnd(['A', 'B', 'C'])).toBe('A, B and C');
    expect(joinAnd(['A', 'B'])).toBe('A and B');
  });

  it('groups the prompts by category, those matched first, the current one left out', () => {
    const { shown, ids } = board();
    const groups = promptGroups(shown(), { first: [ids.s4b, ids.nina], except: ids.turi });
    expect(groups.map((g) => g.label)).toEqual(['Its name matches', 'Scenes', 'NPCs', 'Handouts']);
    expect(groups[0]!.options).toEqual([
      { value: ids.s4b, label: 'Scenes · S4 #2 · portrait of an old Sicilian…' },
      { value: ids.nina, label: "NPCs · Za' Nina" },
    ]);
    expect(groups[1]!.options.map((o) => o.label)).toEqual([
      'S3 #1 · collapsed cathedral facade in 1908…',
      'S4 #1 · Sicilian fishing village at the…',
      'S4 #2 · portrait of an old Sicilian…',
    ]);
    expect(groups[2]!.options.map((o) => o.label)).toEqual(["Za' Nina"]);
    expect(promptGroups(shown()).map((g) => g.label)).toEqual(['Scenes', 'NPCs', 'Handouts']);
  });
});

describe('the track menu', () => {
  it('moves a take to another scene, unchoosing it, and says where', () => {
    const { doc, rows, places } = board();
    // Added in one call, so ordered by id: found by name.
    const second = rows()[0]!.tracks.find((t) => t.name === 'ordini del re (1).mp3')!;
    expect(toggleTrack(doc, { sceneId: 'S3' }, second.id)).toBe(true);
    expect(rows()[0]!.musicStatus).toBe('chosen');
    expect(moveTrack(doc, places(), second.id, 'scene:S4')).toBe('Moved to S4 · Torre Faro e la canzone.');
    const [s3, s4] = rows();
    expect(s3!.tracks.map((t) => t.name)).toEqual(['ordini del re.mp3']);
    expect(s3!.chosenTrack).toBeNull();
    expect(s4!.tracks).toMatchObject([{ name: 'ordini del re (1).mp3', matchedBy: 'hand' }]);
  });

  it('asks before removing a take, then removes it', () => {
    const { doc, rows } = board();
    const second = rows()[0]!.tracks[1]!;
    expect(trackQuestion(sceneOwner(rows()[0]!), second)).toEqual({
      title: 'Remove this track?',
      text: "Take 2 leaves S3 · L'ordine di Donato.",
    });
    expect(removeFromBoard(doc, second)).toBe('Track removed.');
    expect(rows()[0]!.tracks).toHaveLength(1);
  });

  it('does nothing for a take removed meanwhile (another tab, Claude)', () => {
    const { doc, rows, places } = board();
    const first = rows()[0]!.tracks[0]!;
    const drawn = places();
    removeFromBoard(doc, first);
    expect(removeFromBoard(doc, first)).toBeNull();
    expect(moveTrack(doc, drawn, first.id, 'scene:S4')).toBeNull();
    expect(toggleTrack(doc, { sceneId: 'S3' }, first.id)).toBeNull();
  });

  it('toggles the choice as the document has it now', () => {
    const { doc, rows } = board();
    const first = rows()[0]!.tracks[0]!;
    toggleTrack(doc, { sceneId: 'S3' }, first.id);
    // A row drawn before: the badge still unchooses.
    expect(toggleTrack(doc, { sceneId: 'S3' }, first.id)).toBe(false);
    expect(rows()[0]!.chosenTrack).toBeNull();
  });
});

describe('images and prompts', () => {
  it("chooses per prompt, leaving the scene's other prompts alone", () => {
    const { doc, rows, ids } = board();
    const second = rows()[0]!.prompts[0]!.images[1]!;
    expect(toggleImage(doc, ids.s3, second.id)).toBe(true);
    expect(rows()[0]!.prompts[0]).toMatchObject({ status: 'chosen', chosen: second.id });
    expect(rows()[1]!.prompts.map((p) => p.status)).toEqual(['wanted', 'wanted']);
    expect(toggleImage(doc, ids.s3, second.id)).toBe(false);
    // Drawn under S3 but moved meanwhile: nothing.
    moveImage(doc, new Map(), ['S3', 'S4'], second.id, ids.turi);
    assignImageFromTray(doc, new Map(), ['S3', 'S4'], second.id, ids.turi);
    expect(readFiles(doc).find((f) => f.id === second.id)!.promptId).toBe(ids.s3);
  });

  it('moves an image to a prompt of another category, and asks before removing one', () => {
    const { doc, rows, named, shown, ids } = board();
    const second = rows()[0]!.prompts[0]!.images[1]!;
    toggleImage(doc, ids.s3, second.id);
    expect(imageQuestion(shown().get(ids.s3)!, second)).toEqual({
      title: 'Remove this image?',
      text: "Image 2 leaves S3 · L'ordine di Donato · prompt 1.",
    });
    expect(moveImage(doc, shown(), ['S3', 'S4'], second.id, ids.turi)).toBe('Moved to NPC · Turi.');
    expect(rows()[0]!.prompts[0]).toMatchObject({ status: 'received', chosen: null });
    const turi = named().npc.find((p) => p.prompt.id === ids.turi)!;
    expect(turi.images).toMatchObject([{ id: second.id, matchedBy: 'hand' }]);
    expect(imageQuestion(shown().get(ids.turi)!, second).text).toBe('Image 1 leaves NPC · Turi.');
    // To a prompt removed meanwhile: nothing.
    const drawn = shown();
    removeImagePrompt(doc, ids.letter);
    expect(moveImage(doc, drawn, ['S3', 'S4'], second.id, ids.letter)).toBeNull();
    // To a scene prompt whose scene left the appendix meanwhile: nothing.
    expect(moveImage(doc, drawn, ['S3'], second.id, ids.s4b)).toBeNull();
    expect(readFiles(doc).find((f) => f.id === second.id)!.promptId).toBe(ids.turi);
  });

  it("adds a prompt as the user's and says where", () => {
    const { doc, rows, named } = board();
    expect(addPrompt(doc, { category: 'scene', sceneId: 'S4' }, 'overturned boats on the shore')).toEqual({
      added: true,
      said: 'Added S4 · prompt 3. Copy it into Midjourney.',
    });
    expect(rows()[1]!.prompts.map((p) => [p.number, p.prompt.by, p.status])).toEqual([
      [1, 'claude', 'wanted'],
      [2, 'user', 'wanted'],
      [3, 'user', 'wanted'],
    ]);
    expect(addPrompt(doc, { category: 'npc', name: 'Padre Anselmo' }, 'portrait of an old Sicilian priest').said).toBe(
      'Added NPC · Padre Anselmo. Copy it into Midjourney.',
    );
    expect(addPrompt(doc, { category: 'handout', name: '' }, 'an antique nautical chart').said).toBe(
      'Added Handout · New Handout. Copy it into Midjourney.',
    );
    expect(named().handout.map((p) => p.prompt.name)).toEqual(['Lettera di Salvi', 'New Handout']);
  });

  it('saves a prompt and a name, and says nothing was saved once it is removed', () => {
    const { doc, named, ids } = board();
    expect(savePrompt(doc, ids.turi, { prompt: 'portrait of a barefoot boy', name: 'Turi Lo Presti', category: 'npc' })).toBe(true);
    expect(named().npc.find((p) => p.prompt.id === ids.turi)!.prompt).toMatchObject({
      name: 'Turi Lo Presti',
      prompt: 'portrait of a barefoot boy',
      by: 'user',
    });
    expect(savePrompt(doc, ids.turi, { prompt: 'portrait', name: '', category: 'npc' })).toBe(true);
    expect(named().npc.find((p) => p.prompt.id === ids.turi)!.prompt.name).toBe('New NPC');
    removeImagePrompt(doc, ids.turi);
    expect(savePrompt(doc, ids.turi, { prompt: 'portrait', category: 'npc' })).toBe(false);
  });

  it("removes a prompt after asking, its images to the tray as a removed prompt's", () => {
    const { doc, rows, shown, tray, ids } = board();
    expect(promptQuestion(shown().get(ids.s3)!)).toEqual({
      title: 'Remove this image prompt?',
      text: "S3 · L'ordine di Donato · prompt 1 leaves the board.",
      note: 'Its 4 images move to Unmatched, where you can assign them to another prompt.',
    });
    expect(promptQuestion(shown().get(ids.turi)!)).toMatchObject({
      text: 'NPC · Turi leaves the board.',
      note: 'It has no images yet.',
    });
    expect(removePrompt(doc, ids.s3)).toBe('Prompt removed. 4 images in Unmatched.');
    expect(removePrompt(doc, ids.s3)).toBeNull();
    expect(removePrompt(doc, ids.turi)).toBe('Prompt removed.');
    expect(rows()[0]!.prompts).toEqual([]);
    expect(tray().filter((t) => t.file.kind === 'image').map((t) => t.reason)).toEqual(Array(4).fill('Its prompt was removed.'));
    expect(readFiles(doc).filter((f) => f.kind === 'image')).toHaveLength(4);
  });
});

describe('the tray', () => {
  it('names the prompts an image matches, and lists them first', () => {
    const { doc, shown, tray, ids } = board();
    addFiles(doc, [
      image(`steve_portrait_of_an_old_Sicilian_fisherwoman_singing_${uuid}_0.png`, 40, null, [896, 1344]),
      image(`steve_a_vast_cathedral_nave_flooded_${uuid}_1.png`, 41),
    ]);
    const images = tray().filter((t) => t.file.kind === 'image');
    const amb = images.find((t) => t.file.name.includes('fisherwoman'));
    const none = images.find((t) => t.file.name.includes('cathedral'));
    expect(amb).toMatchObject({ reason: 'Several prompts start with "portrait of an old Sicilian".', candidates: [ids.s4b, ids.nina] });
    expect(none).toMatchObject({ reason: 'No prompt starts with "a vast cathedral nave flooded".', candidates: [] });
    expect(assignImageFromTray(doc, shown(), ['S3', 'S4'], amb!.file.id, ids.nina)).toBe("Assigned to NPCs · Za' Nina.");
    expect(tray().map((t) => t.file.id)).not.toContain(amb!.file.id);
  });

  it('removes a file at once, unless it left the tray meanwhile', () => {
    const { doc, tray, ids } = board();
    addFiles(doc, [image(`steve_a_vast_cathedral_nave_flooded_${uuid}_1.png`, 41), image(`steve_unknown_${uuid}_2.png`, 42)]);
    const [first, second] = tray().filter((t) => t.file.kind === 'image');
    // Assigned in another tab before the click.
    assignImage(doc, first!.file.id, ids.turi);
    expect(removeFromTray(doc, ['S3', 'S4'], first!.file.id)).toBeNull();
    expect(readFiles(doc).some((f) => f.id === first!.file.id)).toBe(true);
    expect(removeFromTray(doc, ['S3', 'S4'], second!.file.id)).toBe(`Removed ${shortName(second!.file.name)}.`);
    expect(removeFromTray(doc, ['S3', 'S4'], second!.file.id)).toBeNull();
  });

  it("says a scene prompt's images wait while its scene is not in the appendix", () => {
    const doc = new Y.Doc();
    const s6 = setFirstScenePrompt(doc, 'S6', 'a lighthouse at night', 'claude');
    addFiles(doc, [image(`steve_a_lighthouse_at_night_${uuid}_0.png`, 50, s6.id)]);
    const files = readFiles(doc);
    expect(trayFiles([], [], { general: [], pc: [], npc: [], handout: [] }, readImagePrompts(doc), files)).toMatchObject([
      { reason: 'Scene S6 is not in the appendix.', candidates: [] },
    ]);
  });
});

describe('Match again', () => {
  it('assigns the tray files that now match exactly one prompt or scene, in any category', () => {
    const { doc, rows } = board();
    addFiles(doc, [
      image(`you_a_vast_cathedral_nave_flooded_with_seawater_${uuid}_1.png`, 10),
      image(`you_portrait_of_an_old_Sicilian_priest_${uuid}_0.png`, 13),
      { ...track('torre faro.mp3', 'S9', 11), matchedBy: null },
      { ...track('untitled track.mp3', 'S3', 12), sceneId: null, matchedBy: null },
    ]);
    // Prompts written after the drop.
    const s4 = setFirstScenePrompt(doc, 'S4', 'A vast cathedral nave flooded with seawater, torchlight --ar 16:9 --v 8.1', 'claude');
    const anselmo = addImagePrompt(doc, { category: 'npc', name: 'Padre Anselmo', prompt: 'portrait of an old Sicilian priest' }, 'claude');
    setMusicPrompt(doc, 'S3', { title: 'Torre Faro', style: 'folk', lyrics: '[End]' }, 'claude');

    const assigned = matchAgain(
      doc,
      rows().map((r) => r.sceneId),
    );
    expect(assigned).toHaveLength(3);
    expect(matchAgainToast(assigned.length)).toBe('3 files found their prompt.');
    const byName = new Map(readFiles(doc).map((f) => [f.name, f]));
    expect(byName.get('torre faro.mp3')).toMatchObject({ sceneId: 'S3', matchedBy: 'title' });
    expect(byName.get(`you_a_vast_cathedral_nave_flooded_with_seawater_${uuid}_1.png`)).toMatchObject({
      promptId: s4.id,
      matchedBy: 'prompt',
    });
    expect(byName.get(`you_portrait_of_an_old_Sicilian_priest_${uuid}_0.png`)).toMatchObject({ promptId: anselmo.id });
    expect(byName.get('untitled track.mp3')).toMatchObject({ sceneId: null, matchedBy: null });
    // The files already in a scene are left alone.
    expect(byName.get('ordini del re.mp3')).toMatchObject({ sceneId: 'S3', matchedBy: 'title' });
  });

  it('assigns nothing when a title is shared by two scenes, or a name matches two prompts', () => {
    const { doc, rows } = board();
    setMusicPrompt(doc, 'S4', { title: 'Ordini del Re', style: 'martial', lyrics: '[End]' }, 'claude');
    addFiles(doc, [
      { ...track('ordini del re (2).mp3', 'S3', 20), sceneId: null, matchedBy: null },
      image(`steve_portrait_of_an_old_Sicilian_fisherwoman_singing_${uuid}_2.png`, 21),
    ]);
    expect(matchAgain(doc, rows().map((r) => r.sceneId))).toEqual([]);
    expect(matchAgainToast(0)).toBe('Matched again: no file found a single prompt.');
    expect(matchAgainToast(1)).toBe('1 file found its prompt.');
  });
});

describe('the drop overlay', () => {
  it('counts the dragged files by MIME type', () => {
    const items = [
      ...Array.from({ length: 10 }, () => ({ kind: 'file', type: 'image/png' })),
      ...Array.from({ length: 4 }, () => ({ kind: 'file', type: 'audio/mpeg' })),
      { kind: 'string', type: 'text/plain' },
    ];
    expect(countLine(countItems(items))).toBe('14 files · 10 images, 4 tracks');
    expect(countLine(countItems([{ kind: 'file', type: 'image/png' }]))).toBe('1 file · 1 image');
    expect(countLine(countItems([{ kind: 'file', type: '' }]))).toBe('1 file');
  });
});

describe('matching help', () => {
  it('writes a prompt as Midjourney names it', () => {
    expect(midjourneyWords("ruined doctor's office in 1908 Messina, anatomical drawings")).toBe(
      'ruined_doctors_office_in_1908_Messina',
    );
  });
});

// General images and music (general-board-items design decision 9).

function generalBoard() {
  const base = board();
  const { doc } = base;
  const messina = addImagePrompt(
    doc,
    { category: 'general', name: 'Messina dopo il terremoto', prompt: 'panorama of Messina in ruins after the 1908 earthquake' },
    'claude',
  );
  const copertina = addImagePrompt(doc, { category: 'general', name: 'Copertina', prompt: 'an ancient bronze anchor rising' }, 'user');
  const tema = addMusicPrompt(doc, { title: 'Tema di Sabaoth', style: 'dark orchestral', lyrics: '[End]' }, 'claude');
  const macerie = addMusicPrompt(doc, { title: 'Tra le macerie', style: 'dark ambient', lyrics: '[End]' }, 'claude');
  const scossa = addMusicPrompt(doc, { title: 'La scossa', style: 'tense percussive', lyrics: '[End]' }, 'user');
  addFiles(doc, [
    { ...track('tema di sabaoth.mp3', 'S3', 60), sceneId: null, musicId: tema.id },
    { ...track('tema di sabaoth (1).mp3', 'S3', 61), sceneId: null, musicId: tema.id },
    { ...track('tra le macerie.mp3', 'S3', 62), sceneId: null, musicId: macerie.id },
    { ...track('untitled track.mp3', 'S3', 63), sceneId: null, matchedBy: null },
  ]);
  addFiles(doc, [0, 1].map((i) => image(`steve_panorama_of_messina_in_ruins_${uuid}_${i}.png`, 70 + i, messina.id)));
  const scenes = appendix([
    ['S3', "L'ordine di Donato"],
    ['S4', 'Torre Faro e la canzone'],
  ]);
  const rows = () => boardRows(scenes, readBoard(doc), readImagePrompts(doc), readFiles(doc), readMusicPrompts(doc));
  const music = () => generalMusic(readMusicPrompts(doc), readFiles(doc), rows());
  const named = () => namedPrompts(readImagePrompts(doc), readFiles(doc));
  const shown = () => shownPrompts(rows(), named());
  const tray = () => trayFiles(scenes, rows(), named(), readImagePrompts(doc), readFiles(doc), music());
  const places = () => trackPlaces(rows(), music());
  const card = (id: string) => music().find((m) => m.prompt.id === id)!;
  return {
    doc,
    rows,
    music,
    named,
    shown,
    tray,
    places,
    card,
    ids: { ...base.ids, messina: messina.id, copertina: copertina.id, tema: tema.id, macerie: macerie.id, scossa: scossa.id },
  };
}

describe('the General tab', () => {
  it('counts images and music prompts together, and each by state', () => {
    const { doc, named, music, card, ids } = generalBoard();
    toggleTrack(doc, { musicId: ids.tema }, card(ids.tema).tracks[1]!.id);
    const images = named().general;
    expect(images.map((p) => p.status)).toEqual(['received', 'wanted']);
    expect(music().map((m) => m.status)).toEqual(['chosen', 'received', 'wanted']);
    const sum = summarizeGeneral(images, music());
    expect(sum).toEqual({
      images: 2,
      imageCounts: { chosen: 0, received: 1, wanted: 1 },
      music: 3,
      musicCounts: { chosen: 1, received: 1, wanted: 1 },
      filters: { all: 5, chosen: 1, received: 2, wanted: 2 },
    });
    expect(generalTabLine(images, music())).toEqual({
      line: '2 wanted',
      title: '2 images and 3 music prompts: 1 chosen, 2 received, 2 wanted',
      wanted: true,
      count: 5,
    });
    expect(generalTabLine([], []).line).toBe('none yet');
    expect(sectionLine(images, 'image', 'images')).toBe('2 images · 0 chosen');
    expect(sectionLine(music(), 'music prompt', 'music prompts')).toBe('3 music prompts · 1 chosen');
    expect(sectionLine(music().slice(0, 1), 'music prompt', 'music prompts')).toBe('1 music prompt · 1 chosen');
  });

  it('names a General image and lists it after the scenes', () => {
    const { shown, ids } = generalBoard();
    const messina = shown().get(ids.messina)!;
    expect(promptLabel(messina)).toBe('General · Messina dopo il terremoto');
    expect(tabLabel(messina)).toBe('General · Messina dopo il terremoto');
    expect(promptGroups(shown()).map((g) => g.label)).toEqual(['Scenes', 'General', 'NPCs', 'Handouts']);
    expect(newName('general')).toBe('New image');
  });

  it('adds a General image, an empty name becoming «New image»', () => {
    const doc = new Y.Doc();
    expect(addPrompt(doc, { category: 'general', name: 'Messina dopo il terremoto' }, 'panorama of Messina')).toEqual({
      added: true,
      said: 'Added General · Messina dopo il terremoto. Copy it into Midjourney.',
    });
    expect(addPrompt(doc, { category: 'general', name: '' }, 'a cover').said).toBe(
      'Added General · New image. Copy it into Midjourney.',
    );
    expect(readImagePrompts(doc).map((p) => [p.category, p.name])).toEqual([
      ['general', 'Messina dopo il terremoto'],
      ['general', 'New image'],
    ]);
  });

  it('adds a music prompt as the user, refusing an empty title', () => {
    const doc = new Y.Doc();
    expect(addMusic(doc, { title: '  ', style: 'x', lyrics: '' })).toEqual({ added: false, said: EMPTY_TITLE });
    expect(readMusicPrompts(doc)).toEqual([]);
    expect(addMusic(doc, { title: 'La scossa', style: 'tense', lyrics: '[End]' })).toEqual({
      added: true,
      said: 'Added General · La scossa. Copy it into Suno.',
    });
    expect(readMusicPrompts(doc)).toMatchObject([{ title: 'La scossa', by: 'user' }]);
  });

  it('retitles a music prompt, keeping its tracks', () => {
    const { doc, card, ids } = generalBoard();
    expect(saveMusic(doc, ids.macerie, { title: 'Tra le rovine', style: 'dark ambient', lyrics: '[End]' })).toBe(true);
    expect(card(ids.macerie)).toMatchObject({ prompt: { title: 'Tra le rovine', by: 'user' }, status: 'received' });
    removeMusic(doc, ids.macerie);
    expect(saveMusic(doc, ids.macerie, { title: 'Again', style: '', lyrics: '' })).toBe(false);
  });

  it('asks before removing a music prompt, then sends its tracks to Unmatched', () => {
    const { doc, card, tray, ids } = generalBoard();
    expect(musicQuestion(card(ids.tema))).toEqual({
      title: 'Remove this music prompt?',
      text: 'General · Tema di Sabaoth leaves the board.',
      note: 'Its 2 tracks move to Unmatched, where you can assign them to a scene or another music prompt.',
    });
    expect(musicQuestion(card(ids.scossa)).note).toBe('It has no tracks yet.');
    expect(removeMusic(doc, ids.tema)).toBe('Music prompt removed. 2 tracks in Unmatched.');
    expect(removeMusic(doc, ids.tema)).toBeNull();
    expect(removeMusic(doc, ids.scossa)).toBe('Music prompt removed.');
    // Added in one call, so ordered by id: sorted by name.
    expect(tray().map((t) => [t.file.name, t.reason]).sort()).toEqual([
      ['tema di sabaoth (1).mp3', 'Its prompt was removed.'],
      ['tema di sabaoth.mp3', 'Its prompt was removed.'],
      ['untitled track.mp3', 'No track title "untitled track".'],
    ]);
  });

  it('chooses one track per General music prompt', () => {
    const { doc, card, ids } = generalBoard();
    const [first, second] = card(ids.tema).tracks;
    expect(toggleTrack(doc, { musicId: ids.tema }, second!.id)).toBe(true);
    expect(card(ids.tema)).toMatchObject({ status: 'chosen', prompt: { chosenTrack: second!.id } });
    expect(toggleTrack(doc, { musicId: ids.tema }, first!.id)).toBe(true);
    expect(card(ids.tema).prompt.chosenTrack).toBe(first!.id);
    expect(toggleTrack(doc, { musicId: ids.tema }, first!.id)).toBe(false);
    // Not this prompt's: nothing.
    expect(toggleTrack(doc, { musicId: ids.macerie }, first!.id)).toBeNull();
    expect(toggleTrack(doc, { sceneId: 'S3' }, first!.id)).toBeNull();
  });

  it('moves a track between scenes and General music, unchoosing it, and says where', () => {
    const { doc, rows, card, places, ids } = generalBoard();
    const s3 = rows()[0]!.tracks.find((t) => t.name === 'ordini del re.mp3')!;
    expect(trackGroups(places(), sceneOwner(rows()[0]!).target)).toEqual([
      { label: 'Scenes', options: [{ value: 'scene:S4', label: 'S4 · Torre Faro e la canzone' }] },
      {
        label: 'General',
        options: [
          { value: `music:${ids.tema}`, label: 'Tema di Sabaoth' },
          { value: `music:${ids.macerie}`, label: 'Tra le macerie' },
          { value: `music:${ids.scossa}`, label: 'La scossa' },
        ],
      },
    ]);
    expect(moveTrack(doc, places(), s3.id, `music:${ids.macerie}`)).toBe('Moved to General · Tra le macerie.');
    expect(card(ids.macerie).tracks.map((t) => t.name).sort()).toEqual(['ordini del re.mp3', 'tra le macerie.mp3']);
    const take = card(ids.tema).tracks[0]!;
    toggleTrack(doc, { musicId: ids.tema }, take.id);
    expect(moveTrack(doc, places(), take.id, 'scene:S4')).toBe('Moved to S4 · Torre Faro e la canzone.');
    expect(card(ids.tema).prompt.chosenTrack).toBeNull();
    expect(rows()[1]!.tracks.map((t) => t.name)).toEqual([take.name]);
    expect(trackQuestion(musicOwner(card(ids.macerie)), card(ids.macerie).tracks[1]!)).toEqual({
      title: 'Remove this track?',
      text: 'Take 2 leaves General · Tra le macerie.',
    });
    // A music prompt removed meanwhile: nothing.
    const drawn = places();
    removeMusic(doc, ids.scossa);
    expect(moveTrack(doc, drawn, take.id, `music:${ids.scossa}`)).toBeNull();
  });

  it('assigns a track from the tray to a General music prompt', () => {
    const { doc, tray, places, card, ids } = generalBoard();
    const untitled = tray().find((t) => t.file.name === 'untitled track.mp3')!.file;
    expect(assignTrackFromTray(doc, places(), untitled.id, `music:${ids.scossa}`)).toBe('Assigned to General · La scossa.');
    expect(card(ids.scossa).tracks).toMatchObject([{ name: 'untitled track.mp3', matchedBy: 'hand' }]);
    expect(tray()).toEqual([]);
    // Placed now: the tray's Remove does nothing.
    expect(removeFromTray(doc, ['S3', 'S4'], untitled.id)).toBeNull();
  });

  it('matches again against General music titles', () => {
    const { doc, card, tray, ids } = generalBoard();
    addFiles(doc, [{ ...track('la scossa (1).mp3', 'S3', 80), sceneId: null, matchedBy: null }]);
    expect(tray().map((t) => t.reason)).toContain('');
    const assigned = matchAgain(doc, ['S3', 'S4']);
    expect(assigned).toHaveLength(1);
    expect(card(ids.scossa).tracks).toMatchObject([{ name: 'la scossa (1).mp3', matchedBy: 'title' }]);
  });

  it('leaves a title shared by a scene and a General prompt in Unmatched, warning on both', () => {
    const { doc, rows, music, tray, ids } = generalBoard();
    setMusicPrompt(doc, 'S4', { title: 'La scossa', style: '', lyrics: '' }, 'user');
    addFiles(doc, [{ ...track('la scossa.mp3', 'S3', 81), sceneId: null, matchedBy: null }]);
    expect(rows()[1]!.duplicateTitle).toBe(true);
    expect(music().find((m) => m.prompt.id === ids.scossa)!.duplicateTitle).toBe(true);
    expect(matchAgain(doc, ['S3', 'S4'])).toEqual([]);
    expect(tray().find((t) => t.file.name === 'la scossa.mp3')!.reason).toBe(
      'Several music prompts have the track title "la scossa".',
    );
  });
});
