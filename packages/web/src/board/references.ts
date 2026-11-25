import { MAX_REFERENCES, type FileEntry, type NamedCategory } from 'promptbook-project';
import type { ViewerRow } from './generate.js';
import { newName, shortName, type ShownPrompt } from './summary.js';

// Reference images on a prompt (reference-images design decisions 12 to 17):
// the labels, the picker's order and rules, and the lines that name them,
// kept out of the components so they can be tested.

// «S1 · 2» for an image of a scene's prompt 2, «Padre Anselmo» for one of a
// named prompt.
export function imageLabel({ row, scene }: ShownPrompt): string {
  if (scene) return `${scene.sceneId} · ${row.number}`;
  return row.prompt.name || newName(row.prompt.category as NamedCategory);
}

// An image the picker offers: its file, its label, and whether it is the one
// chosen for its prompt.
export interface BoardImage {
  file: FileEntry;
  label: string;
  chosen: boolean;
}

// The images on the board's prompts, in board order (the scenes' prompts,
// then the General images, the PCs, the NPCs and the handouts, each prompt's
// images oldest first), the chosen ones moved to the front, each group
// keeping that order.
export function boardImages(shown: ReadonlyMap<string, ShownPrompt>): BoardImage[] {
  const all: BoardImage[] = [];
  for (const prompt of shown.values()) {
    const label = imageLabel(prompt);
    for (const file of prompt.row.images) {
      if (file.kind === 'image') all.push({ file, label, chosen: prompt.row.chosen === file.id });
    }
  }
  return [...all.filter((i) => i.chosen), ...all.filter((i) => !i.chosen)];
}

// The label of every image file of the project: an image on a prompt by its
// prompt, one in the Unmatched tray by its file name.
export function referenceLabels(
  shown: ReadonlyMap<string, ShownPrompt>,
  files: readonly FileEntry[],
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const prompt of shown.values()) {
    const label = imageLabel(prompt);
    for (const file of prompt.row.images) labels.set(file.id, label);
  }
  for (const file of files) {
    if (file.kind === 'image' && !labels.has(file.id)) labels.set(file.id, shortName(file.name));
  }
  return labels;
}

// A tile of the picker: picked or not, and why it cannot be picked, or null.
export interface TileState {
  selected: boolean;
  disabled: string | null;
}

export const NOT_ON_SERVER = 'Not on the server yet';
export const AT_MOST = `${MAX_REFERENCES} references at most`;

// A picked tile can always be unpicked. Another is off when its image is
// only on this device, or when MAX_REFERENCES are picked.
export function tileState(fileId: string, picked: readonly string[], onlyHere: boolean): TileState {
  if (picked.includes(fileId)) return { selected: true, disabled: null };
  if (onlyHere) return { selected: false, disabled: NOT_ON_SERVER };
  if (picked.length >= MAX_REFERENCES) return { selected: false, disabled: AT_MOST };
  return { selected: false, disabled: null };
}

// A click on a tile: unpicks a picked image, picks another at the end while
// fewer than MAX_REFERENCES are picked.
export function togglePick(picked: readonly string[], fileId: string): string[] {
  if (picked.includes(fileId)) return picked.filter((id) => id !== fileId);
  if (picked.length >= MAX_REFERENCES) return [...picked];
  return [...picked, fileId];
}

// After «References»: «1 of 3», or «up to 3, from this board».
export const referencesHint = (n: number): string =>
  n > 0 ? `${n} of ${MAX_REFERENCES}` : `up to ${MAX_REFERENCES}, from this board`;

// «+ Add an image», then «+ Add».
export const addLabel = (n: number): string => (n > 0 ? '+ Add' : '+ Add an image');

// «1 reference no longer on the board».
export const missingLine = (n: number): string =>
  `${n} ${n === 1 ? 'reference' : 'references'} no longer on the board`;

// The prompt card's line: «References: Padre Anselmo, S1 · 2»; null with none.
export function cardLine(ids: readonly string[], labels: ReadonlyMap<string, string>): string | null {
  const named = ids.flatMap((id) => {
    const label = labels.get(id);
    return label === undefined ? [] : [label];
  });
  return named.length > 0 ? `References: ${named.join(', ')}` : null;
}

// The viewer's row for an image generated with references: the labels of
// those still on the board, then «1 removed» for the others. Null for an
// image made without.
export function referencesRow(
  ids: readonly string[] | null,
  labels: ReadonlyMap<string, string>,
): ViewerRow | null {
  if (!ids || ids.length === 0) return null;
  const named = ids.flatMap((id) => {
    const label = labels.get(id);
    return label === undefined ? [] : [label];
  });
  const removed = ids.length - named.length;
  return { label: 'References', value: [...named, ...(removed > 0 ? [`${removed} removed`] : [])].join(', ') };
}
