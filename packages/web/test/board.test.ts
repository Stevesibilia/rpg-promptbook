import { describe, expect, it } from 'vitest';
import {
  addFiles,
  boardRows,
  readBoard,
  readFiles,
  readImagePrompts,
  setFirstScenePrompt,
  setMusicPrompt,
  type NewFile,
} from 'promptbook-project';
import type { AppendixRow } from 'promptbook-format';
import * as Y from 'yjs';
import {
  matchAgain,
  matchAgainToast,
  moveFile,
  removeFromScene,
  removeQuestion,
  toggleChoice,
} from '../src/board/actions.js';
import { countItems, countLine } from '../src/board/DropOverlay.js';
import { midjourneyWords } from '../src/board/MatchHelp.js';
import { dims, duration, filterCounts, keeps, shortName, summarize } from '../src/board/summary.js';
import { withFirstPrompt, type BoardRow } from '../src/board/useBoard.js';

// The board's summary and filters, the track menu's and the viewer's
// actions, and the drop overlay's count.

const status = (imageStatus: BoardRow['imageStatus'], musicStatus: BoardRow['musicStatus']) => ({ imageStatus, musicStatus });

describe('summary and filters', () => {
  const rows = [
    status('chosen', 'chosen'),
    status('chosen', 'received'),
    status('received', 'wanted'),
    status('received', 'wanted'),
    status('received', 'chosen'),
    status('wanted', 'wanted'),
  ];

  it('counts the scenes and each half by state', () => {
    expect(summarize(rows)).toEqual({
      scenes: 6,
      images: { chosen: 2, received: 3, wanted: 1 },
      music: { chosen: 2, received: 1, wanted: 3 },
    });
  });

  it('keeps the rows with at least one half in the state, and dims the other half', () => {
    expect(filterCounts(rows)).toEqual({ all: 6, wanted: 3, received: 4, chosen: 3 });
    expect(keeps(status('received', 'wanted'), 'wanted')).toBe(true);
    expect(keeps(status('received', 'chosen'), 'wanted')).toBe(false);
    expect(dims('received', 'wanted')).toBe(true);
    expect(dims('wanted', 'wanted')).toBe(false);
    expect(dims('received', 'all')).toBe(false);
  });

  it('writes durations and cuts long names', () => {
    expect(duration(192)).toBe('3:12');
    expect(duration(59.6)).toBe('1:00');
    expect(duration(null)).toBe('');
    expect(shortName('steve_a_vast_cathedral_nave_flooded_with_seawater.png')).toBe('steve_a_vast_cathedral_nave_flooded_with…');
    expect(shortName('untitled track.mp3')).toBe('untitled track.mp3');
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

function board() {
  const doc = new Y.Doc();
  setMusicPrompt(doc, 'S3', { title: 'Ordini del Re', style: 'martial', lyrics: '[End]' }, 'claude');
  addFiles(doc, [track('ordini del re.mp3', 'S3', 1), track('ordini del re (1).mp3', 'S3', 2)]);
  const scenes = appendix([
    ['S3', "L'ordine di Donato"],
    ['S4', 'Torre Faro e la canzone'],
  ]);
  const rows = () => boardRows(scenes, readBoard(doc), readImagePrompts(doc), readFiles(doc)).map(withFirstPrompt);
  return { doc, rows };
}

describe('the track menu', () => {
  it('moves a take to another scene, unchoosing it, and says where', () => {
    const { doc, rows } = board();
    // Added in one call, so ordered by id: found by name.
    const second = rows()[0]!.tracks.find((t) => t.name === 'ordini del re (1).mp3')!;
    expect(toggleChoice(doc, 'S3', second)).toBe(true);
    expect(rows()[0]!.musicStatus).toBe('chosen');
    expect(moveFile(doc, rows(), second.id, 'S4')).toBe('Moved to S4 · Torre Faro e la canzone.');
    const [s3, s4] = rows();
    expect(s3!.tracks.map((t) => t.name)).toEqual(['ordini del re.mp3']);
    expect(s3!.chosenTrack).toBeNull();
    expect(s4!.tracks).toMatchObject([{ name: 'ordini del re (1).mp3', matchedBy: 'hand' }]);
  });

  it('asks before removing a take, then removes it', () => {
    const { doc, rows } = board();
    const second = rows()[0]!.tracks[1]!;
    expect(removeQuestion(rows()[0]!, second)).toEqual({
      title: 'Remove this track?',
      text: "Take 2 leaves S3 · L'ordine di Donato.",
    });
    expect(removeFromScene(doc, second)).toBe('Track removed.');
    expect(rows()[0]!.tracks).toHaveLength(1);
  });

  it('does nothing for a take removed meanwhile (another tab, Claude)', () => {
    const { doc, rows } = board();
    const first = rows()[0]!.tracks[0]!;
    const drawn = rows();
    removeFromScene(doc, first);
    expect(removeFromScene(doc, first)).toBeNull();
    expect(moveFile(doc, drawn, first.id, 'S4')).toBeNull();
    expect(toggleChoice(doc, 'S3', first)).toBeNull();
  });

  it('toggles the choice as the document has it now', () => {
    const { doc, rows } = board();
    const first = rows()[0]!.tracks[0]!;
    toggleChoice(doc, 'S3', first);
    // A row drawn before: the badge still unchooses.
    expect(toggleChoice(doc, 'S3', first)).toBe(false);
    expect(rows()[0]!.chosenTrack).toBeNull();
  });
});

describe('Match again', () => {
  const image = (name: string, n: number): NewFile => ({
    ...track(name, 'S3', n),
    kind: 'image',
    mime: 'image/png',
    width: 1456,
    height: 816,
    duration: null,
    sceneId: null,
    matchedBy: null,
  });

  it('assigns the tray files that now match exactly one scene, and leaves the rest', () => {
    const { doc, rows } = board();
    addFiles(doc, [
      image('you_a_vast_cathedral_nave_flooded_with_seawater_0b6f2c1e-3d4a-4b5c-8d9e-0f1a2b3c4d5e_1.png', 10),
      { ...track('torre faro.mp3', 'S9', 11), matchedBy: null },
      { ...track('untitled track.mp3', 'S3', 12), sceneId: null, matchedBy: null },
    ]);
    // Prompts written after the drop.
    const s4 = setFirstScenePrompt(doc, 'S4', 'A vast cathedral nave flooded with seawater, torchlight --ar 16:9 --v 8.1', 'claude');
    setMusicPrompt(doc, 'S3', { title: 'Torre Faro', style: 'folk', lyrics: '[End]' }, 'claude');

    const assigned = matchAgain(doc, rows());
    expect(assigned).toHaveLength(2);
    expect(matchAgainToast(assigned.length)).toBe('2 files found their scene.');
    const byName = new Map(readFiles(doc).map((f) => [f.name, f]));
    expect(byName.get('torre faro.mp3')).toMatchObject({ sceneId: 'S3', matchedBy: 'title' });
    expect([...byName.values()].find((f) => f.kind === 'image')).toMatchObject({ promptId: s4.id, matchedBy: 'prompt' });
    expect(byName.get('untitled track.mp3')).toMatchObject({ sceneId: null, matchedBy: null });
    // The files already in a scene are left alone.
    expect(byName.get('ordini del re.mp3')).toMatchObject({ sceneId: 'S3', matchedBy: 'title' });
  });

  it('assigns nothing when a title is shared by two scenes', () => {
    const { doc, rows } = board();
    setMusicPrompt(doc, 'S4', { title: 'Ordini del Re', style: 'martial', lyrics: '[End]' }, 'claude');
    addFiles(doc, [{ ...track('ordini del re (2).mp3', 'S3', 20), sceneId: null, matchedBy: null }]);
    expect(matchAgain(doc, rows())).toEqual([]);
    expect(matchAgainToast(0)).toBe('No file found its scene.');
    expect(matchAgainToast(1)).toBe('1 file found its scene.');
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
