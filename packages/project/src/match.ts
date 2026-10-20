// Intake by filename (asset-board design decision 10, image-categories
// design decision 3): a Midjourney image finds the prompt, in any category,
// that starts with the words in its name, a Suno track the scene whose music
// title is its name. Pure, so the observed names are the tests.

// What a name is compared by: accents, case, spaces and punctuation do not
// count. Midjourney drops apostrophes and turns the rest into underscores, so
// every character that is not a letter or a digit goes.
export function matchKey(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export interface MidjourneyName {
  user: string;
  // The first words of the prompt, as in the name.
  words: string[];
  job: string;
  // The image of the grid, when the name has one.
  n: number | null;
}

const MIDJOURNEY =
  /^(?<user>[^_]+)_(?<words>.+)_(?<job>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_(?<n>\d+))?\.(png|jpe?g|webp)$/i;

// `<user>_<first words of the prompt>_<job id>[_<n>].png`, or null.
export function parseMidjourney(name: string): MidjourneyName | null {
  const groups = MIDJOURNEY.exec(name)?.groups;
  if (!groups) return null;
  const words = groups.words!.split('_').filter((w) => w !== '');
  if (words.length === 0) return null;
  return {
    user: groups.user!,
    words,
    job: groups.job!,
    n: groups.n === undefined ? null : Number(groups.n),
  };
}

export interface SunoName {
  // The name without its extension and take number: the track title.
  title: string;
  // 1 for "title (1).mp3", Suno's second take; null for the first.
  take: number | null;
}

const SUNO = /^(?<stem>.+)\.(mp3|m4a|aac|wav|ogg|flac)$/i;
const TAKE = / \((\d+)\)$/;

// `<title>[ (<n>)].mp3`, or null for another extension.
export function parseSuno(name: string): SunoName | null {
  const stem = SUNO.exec(name)?.groups?.stem;
  if (stem === undefined) return null;
  const take = TAKE.exec(stem);
  const title = (take ? stem.slice(0, take.index) : stem).trim();
  if (title === '') return null;
  return { title, take: take ? Number(take[1]) : null };
}

// What a file is matched against (image-categories design decision 3): the
// image prompts of every category with their text, and the scenes with their
// music title.
export interface MatchPrompt {
  id: string;
  prompt: string;
}

export interface MatchScene {
  sceneId: string;
  // The scene's music title; null when it has none.
  title: string | null;
}

export interface MatchTargets {
  prompts: readonly MatchPrompt[];
  scenes: readonly MatchScene[];
}

export type MatchResult =
  | { promptId: string; matchedBy: 'prompt' }
  | { sceneId: string; matchedBy: 'title' }
  // candidates: the prompt ids when two or more match, else none.
  | { reason: string; candidates: string[] };

// Midjourney cuts a name mid-word, so the words need only start the prompt.
// A user name with underscores leaves words of its own in front: when nothing
// matches, the words without their first one, then without the first two, are
// tried, as long as that much of the key is left.
const MIN_FALLBACK_KEY = 12;

function matchImage(words: string[], targets: readonly MatchPrompt[]): MatchResult {
  const quoted = words.slice(0, 5).join(' ');
  const prompts = targets.flatMap((p) => {
    const key = matchKey(p.prompt);
    return key === '' ? [] : [{ id: p.id, key }];
  });
  for (let drop = 0; drop <= 2 && drop < words.length; drop++) {
    const key = matchKey(words.slice(drop).join(' '));
    if (key === '' || (drop > 0 && key.length < MIN_FALLBACK_KEY)) break;
    const found = prompts.filter((p) => p.key.startsWith(key));
    if (found.length === 1) return { promptId: found[0]!.id, matchedBy: 'prompt' };
    if (found.length > 1) return { reason: `Several prompts start with "${quoted}".`, candidates: found.map((p) => p.id) };
  }
  return { reason: `No prompt starts with "${quoted}".`, candidates: [] };
}

function matchTrack(title: string, scenes: readonly MatchScene[]): MatchResult {
  const key = matchKey(title);
  const found = key === '' ? [] : scenes.filter((s) => s.title !== null && matchKey(s.title) === key);
  if (found.length === 1) return { sceneId: found[0]!.sceneId, matchedBy: 'title' };
  if (found.length > 1) return { reason: `Several scenes have the track title "${title}".`, candidates: [] };
  return { reason: `No track title "${title}".`, candidates: [] };
}

// The prompt an image belongs to, or the scene a track belongs to, by its
// name; or why it has none.
export function matchFile(name: string, kind: 'image' | 'audio', targets: MatchTargets): MatchResult {
  if (kind === 'image') {
    const parsed = parseMidjourney(name);
    if (parsed) return matchImage(parsed.words, targets.prompts);
  } else {
    const parsed = parseSuno(name);
    if (parsed) return matchTrack(parsed.title, targets.scenes);
  }
  return { reason: 'Not a Midjourney or Suno name.', candidates: [] };
}

interface TargetPrompt {
  prompt: { id: string; prompt: string };
}

// What files are matched against on a board: the prompts it shows with a
// text, scenes first in row order, then PCs, NPCs and handouts; and its
// scenes. Scene prompts whose scene has no row are not shown, so never
// matched (design decision 4).
export function matchTargets(board: {
  rows: readonly { sceneId: string; prompts: readonly TargetPrompt[]; music: { title: string } | null }[];
  named: { pc: readonly TargetPrompt[]; npc: readonly TargetPrompt[]; handout: readonly TargetPrompt[] };
}): { prompts: MatchPrompt[]; scenes: MatchScene[] } {
  const shown = [
    ...board.rows.flatMap((row) => row.prompts),
    ...board.named.pc,
    ...board.named.npc,
    ...board.named.handout,
  ];
  return {
    prompts: shown.flatMap(({ prompt }) => (prompt.prompt.trim() === '' ? [] : [{ id: prompt.id, prompt: prompt.prompt }])),
    scenes: board.rows.map((row) => ({ sceneId: row.sceneId, title: row.music?.title ?? null })),
  };
}
