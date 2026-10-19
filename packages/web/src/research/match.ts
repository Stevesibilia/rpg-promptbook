import type { ResearchNote } from 'promptbook-project';

// Which research notes go with a scene (connector design decision 14): a
// note's topic and the scene share a word, a run of letters or digits of
// four characters or more, compared without case or accents.

const RUN = /[\p{L}\p{M}\p{N}]+/gu;
const MIN_LENGTH = 4;

const normal = (word: string) => word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Each word of the text once, normalised, with the spelling it first had.
function wordMap(text: string): Map<string, string> {
  const words = new Map<string, string>();
  for (const [run] of text.matchAll(RUN)) {
    const key = normal(run);
    if ([...key].length >= MIN_LENGTH && !words.has(key)) words.set(key, run);
  }
  return words;
}

// The words of a text, normalised: «Città del Porto» gives citta, porto.
export function wordsOf(text: string): Set<string> {
  return new Set(wordMap(text).keys());
}

export interface NoteMatch {
  note: ResearchNote;
  // The topic's words the scene holds, as the topic spells them.
  words: string[];
}

// The notes whose topic shares a word with the scene, those sharing the most
// first, then the newest edit; at most `limit`.
export function notesFor(sceneText: string, notes: readonly ResearchNote[], limit = 3): NoteMatch[] {
  const scene = wordsOf(sceneText);
  const edited = (n: ResearchNote) => Date.parse(n.editedAt) || 0;
  return notes
    .map((note) => ({ note, words: [...wordMap(note.topic)].filter(([key]) => scene.has(key)).map(([, w]) => w) }))
    .filter((m) => m.words.length > 0)
    .sort(
      (a, b) =>
        b.words.length - a.words.length ||
        edited(b.note) - edited(a.note) ||
        (a.note.id < b.note.id ? -1 : a.note.id > b.note.id ? 1 : 0),
    )
    .slice(0, limit);
}

export interface SceneText {
  id: string;
  text: string;
}

// The scenes a topic is mentioned in, by the same rule: «mentioned in S1, S4».
export function scenesFor(topic: string, scenes: readonly SceneText[]): string[] {
  const words = wordsOf(topic);
  if (words.size === 0) return [];
  return scenes.filter((scene) => [...wordsOf(scene.text)].some((w) => words.has(w))).map((scene) => scene.id);
}
