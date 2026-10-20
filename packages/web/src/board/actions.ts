import {
  addImagePrompt,
  assignImage,
  assignTrack,
  chooseImage,
  chooseTrack,
  matchFile,
  namedCategories,
  readBoard,
  readFiles,
  readImagePrompts,
  removeFile,
  type FileEntry,
  type MatchedBy,
  type MatchTargets,
} from 'promptbook-project';
import type * as Y from 'yjs';
import { sceneLabel } from './summary.js';
import type { BoardRow } from './useBoard.js';

// What the viewer, the track menu and the tray do to a file, with the toast
// each says. The document may have changed since the board was drawn (Claude,
// another tab): an action on a file that is gone or moved does nothing and
// says nothing, rather than throwing.

const label = (rows: readonly BoardRow[], sceneId: string) => {
  const row = rows.find((r) => r.sceneId === sceneId);
  return row ? sceneLabel(row) : sceneId;
};

const listed = (doc: Y.Doc, fileId: string) =>
  doc
    .getArray<Y.Map<unknown>>('files')
    .toArray()
    .some((item) => item.get('id') === fileId);

// What files are matched against as the document holds them now, read
// afresh rather than from the rows drawn: the image prompts with a text of
// the given scenes, in their order, then of the PCs, NPCs and handouts; and
// the scenes' music titles.
export function targetsOf(doc: Y.Doc, sceneIds: readonly string[]): MatchTargets {
  const prompts = readImagePrompts(doc).filter((p) => p.prompt.trim() !== '');
  const board = readBoard(doc);
  return {
    prompts: [
      ...sceneIds.flatMap((sceneId) => prompts.filter((p) => p.sceneId === sceneId)),
      ...namedCategories.flatMap((category) => prompts.filter((p) => p.category === category)),
    ].map((p) => ({ id: p.id, prompt: p.prompt })),
    scenes: sceneIds.map((sceneId) => ({ sceneId, title: board.get(sceneId)?.music?.title ?? null })),
  };
}

// The scene's first image prompt, created with no text when the scene has
// none: until the board shows image categories (brief B), an image goes to a
// scene as it did before.
function firstPromptOf(doc: Y.Doc, sceneId: string): string {
  const first = readImagePrompts(doc).find((p) => p.category === 'scene' && p.sceneId === sceneId);
  return first ? first.id : addImagePrompt(doc, { category: 'scene', sceneId, prompt: '' }, 'user').id;
}

function toScene(doc: Y.Doc, fileId: string, sceneId: string, matched: MatchedBy): void {
  doc.transact(() => {
    const file = readFiles(doc).find((f) => f.id === fileId);
    if (file?.kind === 'image') assignImage(doc, fileId, firstPromptOf(doc, sceneId), matched);
    else if (file) assignTrack(doc, fileId, sceneId, matched);
  });
}

// «Moved to S4 · Torre Faro e la canzone.»; null when the file is gone.
export function moveFile(doc: Y.Doc, rows: readonly BoardRow[], fileId: string, sceneId: string): string | null {
  if (!listed(doc, fileId)) return null;
  toScene(doc, fileId, sceneId, 'hand');
  return `Moved to ${label(rows, sceneId)}.`;
}

// From the tray: «Assigned to S3 · L'ordine di Donato.».
export function assignFromTray(doc: Y.Doc, rows: readonly BoardRow[], fileId: string, sceneId: string): string | null {
  if (!listed(doc, fileId)) return null;
  toScene(doc, fileId, sceneId, 'hand');
  return `Assigned to ${label(rows, sceneId)}.`;
}

// Match again (the tray): every file in the tray matched against the prompts
// and titles as the document holds them now; those that match exactly one
// prompt or scene are assigned to it, in one transaction. The ids of the
// files assigned.
export function matchAgain(doc: Y.Doc, rows: readonly BoardRow[]): string[] {
  const scenes = new Set(rows.map((r) => r.sceneId));
  const targets = targetsOf(doc, [...scenes]);
  const shown = new Set(
    readImagePrompts(doc)
      .filter((p) => p.sceneId === null || scenes.has(p.sceneId))
      .map((p) => p.id),
  );
  const assigned: string[] = [];
  doc.transact(() => {
    for (const file of readFiles(doc)) {
      if (file.kind === 'image' ? file.promptId !== null && shown.has(file.promptId) : file.sceneId !== null && scenes.has(file.sceneId)) {
        continue;
      }
      const match = matchFile(file.name, file.kind, targets);
      if ('promptId' in match) assignImage(doc, file.id, match.promptId, match.matchedBy);
      else if ('sceneId' in match) assignTrack(doc, file.id, match.sceneId, match.matchedBy);
      else continue;
      assigned.push(file.id);
    }
  });
  return assigned;
}

// «3 files found their scene.», «1 file found its scene.»
export function matchAgainToast(n: number): string {
  if (n === 0) return 'No file found its scene.';
  return n === 1 ? '1 file found its scene.' : `${n} files found their scene.`;
}

// The confirm before a file leaves its scene: «Remove this track?», «Take 2
// leaves S3 · L'ordine di Donato.».
export function removeQuestion(row: BoardRow, file: FileEntry): { title: string; text: string } {
  const image = file.kind === 'image';
  const list = image ? row.images : row.tracks;
  const n = list.findIndex((f) => f.id === file.id) + 1;
  return {
    title: image ? 'Remove this image?' : 'Remove this track?',
    text: `${image ? 'Image' : 'Take'} ${n} leaves ${sceneLabel(row)}.`,
  };
}

export const REMOVE_NOTE = 'The file in your Downloads folder is not touched.';

// «Image removed.» or «Track removed.»; null when it was gone already.
export function removeFromScene(doc: Y.Doc, file: FileEntry): string | null {
  if (!listed(doc, file.id)) return null;
  removeFile(doc, file.id);
  return file.kind === 'image' ? 'Image removed.' : 'Track removed.';
}

// Chooses the file for its prompt or scene, or unchooses it when it is the
// chosen one. The choice is read from the document, not the row drawn, so a
// choice made meanwhile in another tab is toggled as it is now. True when it
// is now chosen; null when the file left its prompt or scene meanwhile.
export function toggleChoice(doc: Y.Doc, sceneId: string, file: FileEntry): boolean | null {
  const chosen =
    file.kind === 'image'
      ? readImagePrompts(doc).find((p) => p.id === file.promptId)?.chosenFileId
      : readBoard(doc).get(sceneId)?.chosenTrack;
  const next = chosen === file.id ? null : file.id;
  try {
    if (file.kind === 'image') chooseImage(doc, file.promptId ?? '', next);
    else chooseTrack(doc, sceneId, next);
  } catch {
    return null;
  }
  return chosen !== file.id;
}
