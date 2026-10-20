// Intake by filename (asset-board design decision 10): a Midjourney image
// finds the scene whose image prompt starts with the words in its name, a
// Suno track the scene whose music title is its name. Pure, so the observed
// names are the tests.

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

// What a file is matched against: a board row's prompts.
export interface MatchRow {
  sceneId: string;
  image: { prompt: string } | null;
  music: { title: string } | null;
}

export type MatchResult = { sceneId: string; matchedBy: 'prompt' | 'title' } | { reason: string };

// Midjourney cuts a name mid-word, so the words need only start the prompt.
// A user name with underscores leaves words of its own in front: when nothing
// matches, the words without their first one, then without the first two, are
// tried, as long as that much of the key is left.
const MIN_FALLBACK_KEY = 12;

function matchImage(words: string[], rows: readonly MatchRow[]): MatchResult {
  const quoted = words.slice(0, 5).join(' ');
  const prompts = rows.flatMap((row) => (row.image ? [{ sceneId: row.sceneId, key: matchKey(row.image.prompt) }] : []));
  for (let drop = 0; drop <= 2 && drop < words.length; drop++) {
    const key = matchKey(words.slice(drop).join(' '));
    if (key === '' || (drop > 0 && key.length < MIN_FALLBACK_KEY)) break;
    const found = prompts.filter((p) => p.key.startsWith(key));
    if (found.length === 1) return { sceneId: found[0]!.sceneId, matchedBy: 'prompt' };
    if (found.length > 1) return { reason: `Several prompts start with "${quoted}".` };
  }
  return { reason: `No prompt starts with "${quoted}".` };
}

function matchTrack(title: string, rows: readonly MatchRow[]): MatchResult {
  const key = matchKey(title);
  const found = key === '' ? [] : rows.filter((row) => row.music && matchKey(row.music.title) === key);
  if (found.length === 1) return { sceneId: found[0]!.sceneId, matchedBy: 'title' };
  if (found.length > 1) return { reason: `Several scenes have the track title "${title}".` };
  return { reason: `No track title "${title}".` };
}

// The scene a file belongs to by its name, or why it has none.
export function matchFile(name: string, kind: 'image' | 'audio', rows: readonly MatchRow[]): MatchResult {
  if (kind === 'image') {
    const parsed = parseMidjourney(name);
    if (parsed) return matchImage(parsed.words, rows);
  } else {
    const parsed = parseSuno(name);
    if (parsed) return matchTrack(parsed.title, rows);
  }
  return { reason: 'Not a Midjourney or Suno name.' };
}
