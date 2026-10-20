import { assignFile, chooseFile, readBoard, removeFile, type BoardRow, type FileEntry } from 'promptbook-project';
import type * as Y from 'yjs';
import { sceneLabel } from './summary.js';

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

// «Moved to S4 · Torre Faro e la canzone.»; null when the file is gone.
export function moveFile(doc: Y.Doc, rows: readonly BoardRow[], fileId: string, sceneId: string): string | null {
  if (!listed(doc, fileId)) return null;
  assignFile(doc, fileId, sceneId, 'hand');
  return `Moved to ${label(rows, sceneId)}.`;
}

// From the tray: «Assigned to S3 · L'ordine di Donato.».
export function assignFromTray(doc: Y.Doc, rows: readonly BoardRow[], fileId: string, sceneId: string): string | null {
  if (!listed(doc, fileId)) return null;
  assignFile(doc, fileId, sceneId, 'hand');
  return `Assigned to ${label(rows, sceneId)}.`;
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

// Chooses the file for its scene, or unchooses it when it is the chosen one.
// The choice is read from the document, not the row drawn, so a choice made
// meanwhile in another tab is toggled as it is now. True when it is now
// chosen; null when the file left the scene meanwhile.
export function toggleChoice(doc: Y.Doc, sceneId: string, file: FileEntry): boolean | null {
  const entry = readBoard(doc).get(sceneId);
  const chosen = file.kind === 'image' ? entry?.chosenImage : entry?.chosenTrack;
  try {
    chooseFile(doc, sceneId, file.kind, chosen === file.id ? null : file.id);
  } catch {
    return null;
  }
  return chosen !== file.id;
}
