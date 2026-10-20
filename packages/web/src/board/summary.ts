import {
  halfStatuses,
  imageCategories,
  type BoardRow,
  type HalfStatus,
  type ImageCategory,
  type NamedCategory,
  type PromptRow,
} from 'promptbook-project';

// The board's labels, summary line, filters and tabs (asset-board specs,
// status per half; image-categories design decision 7): counts per tab and
// state, the rows and cards each filter keeps, and every name a prompt is
// given on the board.

export const filters = ['all', ...halfStatuses] as const;
export type Filter = (typeof filters)[number];

export const filterLabels: Record<Filter, string> = {
  all: 'All',
  wanted: 'Wanted',
  received: 'Received',
  chosen: 'Chosen',
};

export const statusLabels: Record<HalfStatus, string> = {
  wanted: 'Wanted',
  received: 'Received',
  chosen: 'Chosen',
};

export type HalfCounts = Record<HalfStatus, number>;

const none = (): HalfCounts => ({ wanted: 0, received: 0, chosen: 0 });

export function tally(statuses: readonly HalfStatus[]): HalfCounts {
  const counts = none();
  for (const status of statuses) counts[status] += 1;
  return counts;
}

// The tabs, in order, and what each says. The address holds the tab as
// `?tab=pcs`; Scenes has none.
export const tabs = ['scenes', 'pcs', 'npcs', 'handouts'] as const;
export type Tab = (typeof tabs)[number];

export const tabOf: Record<ImageCategory, Tab> = { scene: 'scenes', pc: 'pcs', npc: 'npcs', handout: 'handouts' };
export const categoryOf: Record<Tab, ImageCategory> = { scenes: 'scene', pcs: 'pc', npcs: 'npc', handouts: 'handout' };

export const tabParam = (value: string | null): Tab =>
  value !== null && (tabs as readonly string[]).includes(value) ? (value as Tab) : 'scenes';

export interface CategoryText {
  // «NPCs»
  tab: string;
  // «NPC»
  one: string;
  add: string;
}

export interface NamedText extends CategoryText {
  empty: string;
  what: string;
  // The Name field's placeholder.
  example: string;
}

export const categoryText: Record<'scene', CategoryText> & Record<NamedCategory, NamedText> = {
  scene: { tab: 'Scenes', one: 'Scene', add: 'Add image prompt' },
  pc: {
    tab: 'PCs',
    one: 'PC',
    add: 'Add PC',
    empty: 'No PCs yet',
    what: 'Portraits of the player characters, one prompt each: a name, then a Midjourney prompt.',
    example: 'Rosalia Ferrante',
  },
  npc: {
    tab: 'NPCs',
    one: 'NPC',
    add: 'Add NPC',
    empty: 'No NPCs yet',
    what: 'Portraits of the people the PCs meet, one prompt each: a name, then a Midjourney prompt.',
    example: 'Padre Anselmo',
  },
  handout: {
    tab: 'Handouts',
    one: 'Handout',
    add: 'Add handout',
    empty: 'No handouts yet',
    what: 'Props you hand to the players, like letters, maps and posters. One prompt each: a name, then a Midjourney prompt.',
    example: 'Lettera di Salvi',
  },
};

// «New NPC»: the name of a pc, npc or handout left without one.
export const newName = (category: NamedCategory): string => `New ${categoryText[category].one}`;

// A prompt as the board shows it: its row, and its scene's id and title for
// a scene prompt.
export interface ShownPrompt {
  row: PromptRow;
  scene: { sceneId: string; title: string } | null;
}

export interface Named {
  pc: PromptRow[];
  npc: PromptRow[];
  handout: PromptRow[];
}

// Every prompt the board shows, by id: the scenes' in row order, then the
// PCs, the NPCs and the handouts.
export function shownPrompts(rows: readonly BoardRow[], named: Named): Map<string, ShownPrompt> {
  const shown = new Map<string, ShownPrompt>();
  for (const row of rows) {
    for (const p of row.prompts) shown.set(p.prompt.id, { row: p, scene: { sceneId: row.sceneId, title: row.title } });
  }
  for (const category of ['pc', 'npc', 'handout'] as const) {
    for (const p of named[category]) shown.set(p.prompt.id, { row: p, scene: null });
  }
  return shown;
}

const nameOf = (p: PromptRow) => p.prompt.name || newName(p.prompt.category as NamedCategory);

// «S1 · prompt 2», long «S1 · La casa che cede · prompt 2»; «NPC · Padre
// Anselmo».
export function promptLabel({ row, scene }: ShownPrompt, long = false): string {
  if (scene) return `${scene.sceneId}${long ? ` · ${scene.title}` : ''} · prompt ${row.number}`;
  return `${categoryText[row.prompt.category].one} · ${nameOf(row)}`;
}

// The first words of a prompt, «…» when there are more: «portrait of an old
// Sicilian…».
export function firstWords(text: string, n = 5): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, n).join(' ').replace(/,$/, '') + (words.length > n ? '…' : '');
}

// In a menu: «S1 #2 · collapsed 1900s Sicilian library at…»; a name.
export function menuLabel({ row, scene }: ShownPrompt): string {
  if (scene) return `${scene.sceneId} #${row.number}${row.prompt.prompt ? ` · ${firstWords(row.prompt.prompt)}` : ''}`;
  return nameOf(row);
}

// With its tab: «NPCs · Za' Nina», «Scenes · S4 #2 · portrait of an old…».
export const tabLabel = (p: ShownPrompt): string => `${categoryText[p.row.prompt.category].tab} · ${menuLabel(p)}`;

export interface Option {
  value: string;
  label: string;
}

export interface OptionGroup {
  label: string;
  options: Option[];
}

// «Assign to prompt…» and «Move to another prompt…»: the prompts listed
// first, under «Its name matches», then every shown prompt grouped by
// category, the one left out excepted. Empty groups are left out.
export function promptGroups(
  shown: ReadonlyMap<string, ShownPrompt>,
  { first = [], except = null }: { first?: readonly string[]; except?: string | null } = {},
): OptionGroup[] {
  const groups: OptionGroup[] = [];
  const firstOptions = first.flatMap((id) => {
    const p = shown.get(id);
    return p ? [{ value: id, label: tabLabel(p) }] : [];
  });
  if (firstOptions.length > 0) groups.push({ label: 'Its name matches', options: firstOptions });
  for (const category of imageCategories) {
    const options = [...shown.values()]
      .filter((p) => p.row.prompt.category === category && p.row.prompt.id !== except)
      .map((p) => ({ value: p.row.prompt.id, label: menuLabel(p) }));
    if (options.length > 0) groups.push({ label: categoryText[category].tab, options });
  }
  return groups;
}

// «A and B», «A, B and C».
export function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

// Summary and filters on the Scenes tab: a row is kept when at least one of
// its prompts, or its music, is in the filter's state.

type SceneStatus = Pick<BoardRow, 'musicStatus'> & { prompts: readonly Pick<PromptRow, 'status'>[] };

export interface SceneSummary {
  scenes: number;
  prompts: number;
  images: HalfCounts;
  music: HalfCounts;
}

export function summarizeScenes(rows: readonly SceneStatus[]): SceneSummary {
  const statuses = rows.flatMap((row) => row.prompts.map((p) => p.status));
  return {
    scenes: rows.length,
    prompts: statuses.length,
    images: tally(statuses),
    music: tally(rows.map((row) => row.musicStatus)),
  };
}

export const keepsRow = (row: SceneStatus, filter: Filter): boolean =>
  filter === 'all' || row.musicStatus === filter || row.prompts.some((p) => p.status === filter);

export function rowFilterCounts(rows: readonly SceneStatus[]): Record<Filter, number> {
  const counts = { all: 0, wanted: 0, received: 0, chosen: 0 };
  for (const filter of filters) counts[filter] = rows.filter((row) => keepsRow(row, filter)).length;
  return counts;
}

// On the PCs, NPCs and Handouts tabs: the cards in the filter's state.
export const keepsCard = (p: Pick<PromptRow, 'status'>, filter: Filter): boolean => filter === 'all' || p.status === filter;

export function cardFilterCounts(prompts: readonly Pick<PromptRow, 'status'>[]): Record<Filter, number> {
  const counts = tally(prompts.map((p) => p.status));
  return { all: prompts.length, ...counts };
}

// What dims under a filter: a block or half not in its state.
export const dims = (status: HalfStatus, filter: Filter): boolean => filter !== 'all' && status !== filter;

// A tab's second line: «none yet», «2 wanted», «3 received», «all chosen»;
// and its title.
export function tabLine(prompts: readonly Pick<PromptRow, 'status'>[]): { line: string; title: string; wanted: boolean } {
  const c = tally(prompts.map((p) => p.status));
  const n = prompts.length;
  const line =
    n === 0 ? 'none yet' : c.wanted ? `${c.wanted} wanted` : c.received ? `${c.received} received` : 'all chosen';
  const title = `${n} image ${n === 1 ? 'prompt' : 'prompts'}: ${c.chosen} chosen, ${c.received} received, ${c.wanted} wanted`;
  return { line, title, wanted: c.wanted > 0 };
}

// «3 prompts · 1 chosen», «No prompts».
export function stackLine(prompts: readonly Pick<PromptRow, 'status'>[]): string {
  if (prompts.length === 0) return 'No prompts';
  const chosen = prompts.filter((p) => p.status === 'chosen').length;
  return `${prompts.length} ${prompts.length === 1 ? 'prompt' : 'prompts'} · ${chosen} chosen`;
}

// «S3 · L'ordine di Donato».
export const sceneLabel = (row: Pick<BoardRow, 'sceneId' | 'title'>): string => `${row.sceneId} · ${row.title}`;

// «3:12»; '' when unknown.
export function duration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '';
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

// «2.1 MB», «840 KB».
export function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// A name cut at 40 characters with «…», as the tray's toast shows it.
export const shortName = (name: string): string => (name.length > 40 ? `${name.slice(0, 40)}…` : name);

// An image's shape for its thumbnail and the viewer: its own width and
// height, 16:9 when unknown.
export function shapeOf(file: { width: number | null; height: number | null }): { ratio: string; tall: boolean } {
  if (!file.width || !file.height) return { ratio: '16 / 9', tall: false };
  return { ratio: `${file.width} / ${file.height}`, tall: file.height > file.width };
}
