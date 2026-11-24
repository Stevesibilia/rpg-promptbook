import {
  addImagePrompt,
  addMusicPrompt,
  assignImage,
  assignTrack,
  CAPS,
  chooseGeneralTrack,
  chooseImage,
  chooseTrack,
  matchFile,
  namedCategories,
  readBoard,
  readFiles,
  readImagePrompts,
  readMusicPrompts,
  removeFile,
  removeImagePrompt,
  removeMusicPrompt,
  updateImagePrompt,
  updateMusicPrompt,
  type FileEntry,
  type MatchTargets,
  type MusicCardRow,
  type MusicInput,
  type NamedCategory,
  type TrackTarget,
} from 'promptbook-project';
import type * as Y from 'yjs';
import {
  categoryText,
  musicLabel,
  newName,
  promptLabel,
  shortName,
  tabLabel,
  type ShownPrompt,
  type TrackOwner,
  type TrackPlace,
} from './summary.js';

// What the prompt blocks and cards, the viewer, the track menu and the tray
// do, with the toast each says. The document may have changed since the
// board was drawn (Claude, another tab): an action on a file or a prompt
// that is gone or moved does nothing and says nothing, rather than throwing.

// The file as the document holds it now.
const fileNow = (doc: Y.Doc, fileId: string) => readFiles(doc).find((f) => f.id === fileId);

// What files are matched against as the document holds them now, read
// afresh rather than from the rows drawn: the image prompts with a text of
// the given scenes, in their order, then of the General images, PCs, NPCs
// and handouts; the scenes' music titles; and the General music prompts.
export function targetsOf(doc: Y.Doc, sceneIds: readonly string[]): MatchTargets {
  const prompts = readImagePrompts(doc).filter((p) => p.prompt.trim() !== '');
  const board = readBoard(doc);
  return {
    prompts: [
      ...sceneIds.flatMap((sceneId) => prompts.filter((p) => p.category === 'scene' && p.sceneId === sceneId)),
      ...namedCategories.flatMap((category) => prompts.filter((p) => p.category === category)),
    ].map((p) => ({ id: p.id, prompt: p.prompt })),
    scenes: sceneIds.map((sceneId) => ({ sceneId, title: board.get(sceneId)?.music?.title ?? null })),
    music: readMusicPrompts(doc).map((m) => ({ musicId: m.id, title: m.title })),
  };
}

// The General music prompts that exist now, by id.
const liveMusicIds = (doc: Y.Doc) => new Set(readMusicPrompts(doc).map((m) => m.id));

// A track has its place on the board: a scene of the appendix, or a General
// music prompt that exists (a scene's wins when both are set, design
// decision 3).
function trackPlaced(file: FileEntry, sceneIds: readonly string[], music: ReadonlySet<string>): boolean {
  if (file.sceneId !== null) return sceneIds.includes(file.sceneId);
  return file.musicId !== null && music.has(file.musicId);
}

// A prompt the board shows as the document holds it now: not removed, and
// for a scene prompt, its scene in the appendix (design decision 4).
const shownNow = (doc: Y.Doc, sceneIds: readonly string[], promptId: string) =>
  readImagePrompts(doc).some((p) => p.id === promptId && (p.sceneId === null || sceneIds.includes(p.sceneId)));

// An image to a prompt; false when the image is gone or the prompt is not
// shown any more.
function toPrompt(doc: Y.Doc, sceneIds: readonly string[], fileId: string, promptId: string): boolean {
  if (fileNow(doc, fileId)?.kind !== 'image' || !shownNow(doc, sceneIds, promptId)) return false;
  try {
    assignImage(doc, fileId, promptId, 'hand');
    return true;
  } catch {
    return false;
  }
}

// A track to a scene or a General music prompt; false when the track is
// gone or the music prompt was removed meanwhile.
function toOwner(doc: Y.Doc, fileId: string, target: Exclude<TrackTarget, null>): boolean {
  if (fileNow(doc, fileId)?.kind !== 'audio') return false;
  try {
    assignTrack(doc, fileId, target, 'hand');
    return true;
  } catch {
    return false;
  }
}

// The viewer: «Moved to NPC · Turi.»; null when the image or the prompt is
// gone.
export function moveImage(
  doc: Y.Doc,
  shown: ReadonlyMap<string, ShownPrompt>,
  sceneIds: readonly string[],
  fileId: string,
  promptId: string,
): string | null {
  const to = shown.get(promptId);
  if (!to || !toPrompt(doc, sceneIds, fileId, promptId)) return null;
  return `Moved to ${promptLabel(to)}.`;
}

// The track menu: «Moved to S4 · Torre Faro e la canzone.», «Moved to
// General · Tra le macerie.»; `to` is a place's value.
export function moveTrack(doc: Y.Doc, places: readonly TrackPlace[], fileId: string, to: string): string | null {
  const place = places.find((p) => p.value === to);
  if (!place || !toOwner(doc, fileId, place.target)) return null;
  return `Moved to ${place.label}.`;
}

// From the tray: «Assigned to NPCs · Za' Nina.».
export function assignImageFromTray(
  doc: Y.Doc,
  shown: ReadonlyMap<string, ShownPrompt>,
  sceneIds: readonly string[],
  fileId: string,
  promptId: string,
): string | null {
  const to = shown.get(promptId);
  if (!to || !toPrompt(doc, sceneIds, fileId, promptId)) return null;
  return `Assigned to ${tabLabel(to)}.`;
}

// From the tray: «Assigned to S3 · L'ordine di Donato.», «Assigned to
// General · La scossa.».
export function assignTrackFromTray(
  doc: Y.Doc,
  places: readonly TrackPlace[],
  fileId: string,
  to: string,
): string | null {
  const place = places.find((p) => p.value === to);
  if (!place || !toOwner(doc, fileId, place.target)) return null;
  return `Assigned to ${place.label}.`;
}

// Match again (the tray): every file in the tray matched against the prompts
// and titles as the document holds them now, in every category; those that
// match exactly one prompt, scene or General music prompt are assigned to
// it, in one transaction.
// The ids of the files assigned.
export function matchAgain(doc: Y.Doc, sceneIds: readonly string[]): string[] {
  const scenes = new Set(sceneIds);
  const targets = targetsOf(doc, sceneIds);
  const music = new Set(targets.music.map((m) => m.musicId));
  const shown = new Set(
    readImagePrompts(doc)
      .filter((p) => p.sceneId === null || scenes.has(p.sceneId))
      .map((p) => p.id),
  );
  const assigned: string[] = [];
  doc.transact(() => {
    for (const file of readFiles(doc)) {
      const placed =
        file.kind === 'image'
          ? file.promptId !== null && shown.has(file.promptId)
          : trackPlaced(file, sceneIds, music);
      if (placed) continue;
      const match = matchFile(file.name, file.kind, targets);
      if ('promptId' in match) assignImage(doc, file.id, match.promptId, match.matchedBy);
      else if ('sceneId' in match) assignTrack(doc, file.id, { sceneId: match.sceneId }, match.matchedBy);
      else if ('musicId' in match) assignTrack(doc, file.id, { musicId: match.musicId }, match.matchedBy);
      else continue;
      assigned.push(file.id);
    }
  });
  return assigned;
}

// «3 files found their prompt.», «1 file found its prompt.»
export function matchAgainToast(n: number): string {
  if (n === 0) return 'Matched again: no file found a single prompt.';
  return n === 1 ? '1 file found its prompt.' : `${n} files found their prompt.`;
}

// The confirm before an image leaves its prompt: «Remove this image?»,
// «Image 2 leaves S3 · L'ordine di Donato · prompt 1.», «Image 2 leaves NPC
// · Turi.».
export function imageQuestion(prompt: ShownPrompt, file: FileEntry): { title: string; text: string } {
  const n = prompt.row.images.findIndex((f) => f.id === file.id) + 1;
  return { title: 'Remove this image?', text: `Image ${n} leaves ${promptLabel(prompt, true)}.` };
}

// The confirm before a track leaves its scene or General music prompt:
// «Remove this track?», «Take 2 leaves S3 · L'ordine di Donato.».
export function trackQuestion(owner: TrackOwner, file: FileEntry): { title: string; text: string } {
  const n = owner.tracks.findIndex((f) => f.id === file.id) + 1;
  return { title: 'Remove this track?', text: `Take ${n} leaves ${owner.label}.` };
}

export const REMOVE_NOTE = 'The file in your Downloads folder is not touched.';

// The tray's Remove, at once: «Removed <name>.»; null when the file is gone
// or no longer waits in the tray (assigned meanwhile, here or elsewhere).
export function removeFromTray(doc: Y.Doc, sceneIds: readonly string[], fileId: string): string | null {
  const file = fileNow(doc, fileId);
  if (!file) return null;
  const waiting =
    file.kind === 'image'
      ? file.promptId === null || !shownNow(doc, sceneIds, file.promptId)
      : !trackPlaced(file, sceneIds, liveMusicIds(doc));
  if (!waiting) return null;
  removeFile(doc, fileId);
  return `Removed ${shortName(file.name)}.`;
}

// «Image removed.» or «Track removed.»; null when it was gone already.
export function removeFromBoard(doc: Y.Doc, file: FileEntry): string | null {
  if (!fileNow(doc, file.id)) return null;
  removeFile(doc, file.id);
  return file.kind === 'image' ? 'Image removed.' : 'Track removed.';
}

// Chooses the image for its prompt, or unchooses it when it is the chosen
// one. The prompt and the choice are read from the document, not the board
// drawn, so a choice made meanwhile in another tab is toggled as it is now.
// True when it is now chosen; null when the image left that prompt
// meanwhile.
export function toggleImage(doc: Y.Doc, promptId: string, fileId: string): boolean | null {
  if (fileNow(doc, fileId)?.promptId !== promptId) return null;
  const chosen = readImagePrompts(doc).find((p) => p.id === promptId)?.chosenFileId ?? null;
  try {
    chooseImage(doc, promptId, chosen === fileId ? null : fileId);
  } catch {
    return null;
  }
  return chosen !== fileId;
}

// The same for a track and its scene or General music prompt.
export function toggleTrack(doc: Y.Doc, owner: TrackOwner['target'], fileId: string): boolean | null {
  const file = fileNow(doc, fileId);
  if (!file) return null;
  let chosen: string | null;
  try {
    if ('sceneId' in owner) {
      if (file.sceneId !== owner.sceneId) return null;
      chosen = readBoard(doc).get(owner.sceneId)?.chosenTrack ?? null;
      chooseTrack(doc, owner.sceneId, chosen === fileId ? null : fileId);
    } else {
      if (file.sceneId !== null || file.musicId !== owner.musicId) return null;
      chosen = readMusicPrompts(doc).find((m) => m.id === owner.musicId)?.chosenTrack ?? null;
      chooseGeneralTrack(doc, owner.musicId, chosen === fileId ? null : fileId);
    }
  } catch {
    return null;
  }
  return chosen !== fileId;
}

export const EMPTY_PROMPT = 'Write the prompt first: its first words are how its images find it.';

export const FULL = `The project holds ${CAPS.imagePrompts} image prompts, the most it can.`;

// A new prompt from the Add editor, as the user's: «Added S1 · prompt 3.
// Copy it into Midjourney.», «Added NPC · Padre Anselmo. …»; nothing added
// when the project is full. The caller checks the text first; an empty name
// becomes «New NPC».
export function addPrompt(
  doc: Y.Doc,
  target: { category: 'scene'; sceneId: string } | { category: NamedCategory; name: string },
  prompt: string,
): { added: boolean; said: string } {
  if (readImagePrompts(doc).length >= CAPS.imagePrompts) return { added: false, said: FULL };
  if (target.category === 'scene') {
    const entry = addImagePrompt(doc, { category: 'scene', sceneId: target.sceneId, prompt }, 'user');
    const n =
      readImagePrompts(doc)
        .filter((p) => p.category === 'scene' && p.sceneId === target.sceneId)
        .findIndex((p) => p.id === entry.id) + 1;
    return { added: true, said: `Added ${target.sceneId} · prompt ${n}. Copy it into Midjourney.` };
  }
  const name = target.name || newName(target.category);
  addImagePrompt(doc, { category: target.category, name, prompt }, 'user');
  return { added: true, said: `Added ${categoryText[target.category].one} · ${name}. Copy it into Midjourney.` };
}

// Save in a prompt's editor, as the user's, dated now; an empty name becomes
// «New NPC». False when the prompt was removed meanwhile.
export function savePrompt(
  doc: Y.Doc,
  id: string,
  patch: { prompt: string; name?: string; category: string },
): boolean {
  try {
    const name =
      patch.name === undefined || patch.category === 'scene'
        ? undefined
        : patch.name || newName(patch.category as NamedCategory);
    updateImagePrompt(doc, id, name === undefined ? { prompt: patch.prompt } : { prompt: patch.prompt, name }, 'user');
    return true;
  } catch {
    return false;
  }
}

// The confirm before a prompt leaves the board.
export function promptQuestion(prompt: ShownPrompt): { title: string; text: string; note: string } {
  const n = prompt.row.images.length;
  return {
    title: 'Remove this image prompt?',
    text: `${promptLabel(prompt, true)} leaves the board.`,
    note:
      n === 0
        ? 'It has no images yet.'
        : n === 1
          ? 'Its 1 image moves to Unmatched, where you can assign it to another prompt.'
          : `Its ${n} images move to Unmatched, where you can assign them to another prompt.`,
  };
}

// «Prompt removed. 4 images in Unmatched.», «Prompt removed.»; null when it
// was removed already.
export function removePrompt(doc: Y.Doc, id: string): string | null {
  let images: number;
  try {
    images = removeImagePrompt(doc, id).images;
  } catch {
    return null;
  }
  if (images === 0) return 'Prompt removed.';
  return `Prompt removed. ${images} ${images === 1 ? 'image' : 'images'} in Unmatched.`;
}

// General music prompts (general-board-items design decision 9).

export const EMPTY_TITLE = 'Write the title first: it is how its tracks find it.';

export const FULL_MUSIC = `The project holds ${CAPS.musicPrompts} music prompts, the most it can.`;

// A new General music prompt from the Add card, as the user's: «Added
// General · La scossa. Copy it into Suno.»; nothing added with no title or
// when the project is full.
export function addMusic(doc: Y.Doc, music: MusicInput): { added: boolean; said: string } {
  if (music.title.trim() === '') return { added: false, said: EMPTY_TITLE };
  if (readMusicPrompts(doc).length >= CAPS.musicPrompts) return { added: false, said: FULL_MUSIC };
  try {
    const entry = addMusicPrompt(doc, music, 'user');
    return { added: true, said: `Added General · ${entry.title}. Copy it into Suno.` };
  } catch {
    return { added: false, said: FULL_MUSIC };
  }
}

// Save in a General music prompt's editor, as the user's, dated now. False
// when the prompt was removed meanwhile; the caller refuses an empty title.
export function saveMusic(doc: Y.Doc, id: string, music: MusicInput): boolean {
  try {
    updateMusicPrompt(doc, id, music, 'user');
    return true;
  } catch {
    return false;
  }
}

// The confirm before a General music prompt leaves the board.
export function musicQuestion(card: MusicCardRow): { title: string; text: string; note: string } {
  const n = card.tracks.length;
  return {
    title: 'Remove this music prompt?',
    text: `${musicLabel(card)} leaves the board.`,
    note:
      n === 0
        ? 'It has no tracks yet.'
        : n === 1
          ? 'Its 1 track moves to Unmatched, where you can assign it to a scene or another music prompt.'
          : `Its ${n} tracks move to Unmatched, where you can assign them to a scene or another music prompt.`,
  };
}

// «Music prompt removed. 2 tracks in Unmatched.», «Music prompt removed.»;
// null when it was removed already.
export function removeMusic(doc: Y.Doc, id: string): string | null {
  let tracks: number;
  try {
    tracks = removeMusicPrompt(doc, id).tracks;
  } catch {
    return null;
  }
  if (tracks === 0) return 'Music prompt removed.';
  return `Music prompt removed. ${tracks} ${tracks === 1 ? 'track' : 'tracks'} in Unmatched.`;
}
