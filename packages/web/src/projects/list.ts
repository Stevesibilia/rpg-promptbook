import type { Category, Status } from 'promptbook-project';
import type { ProjectRow } from '../api.js';

// Filtering, grouping and sorting the project list (spec projects-screen,
// Projects list). Pure, so it is tested without a browser.

export type SortKey = 'edited' | 'title' | 'due' | 'left';

export interface ListFilters {
  query: string;
  // Null for All.
  category: Category | null;
  statuses: Status[];
  grouped: boolean;
  sort: SortKey;
}

export const defaultFilters = (): ListFilters => ({
  query: '',
  category: null,
  statuses: ['draft', 'in-progress'],
  grouped: true,
  sort: 'edited',
});

export interface ListRow {
  project: ProjectRow;
  // Listed under its campaign.
  child: boolean;
  // A campaign shown only because some of its projects match.
  dimmed: boolean;
}

export interface ListResult {
  rows: ListRow[];
  // Projects that match, dimmed campaigns not counted.
  shown: number;
  total: number;
}

export function matches(project: ProjectRow, filters: ListFilters): boolean {
  if (filters.category && project.category !== filters.category) return false;
  if (!filters.statuses.includes(project.status)) return false;
  const query = filters.query.trim().toLocaleLowerCase();
  if (!query) return true;
  return `${project.title}\n${project.seed}`.toLocaleLowerCase().includes(query);
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

const comparators: Record<SortKey, (a: ProjectRow, b: ProjectRow) => number> = {
  // Most recent first.
  edited: (a, b) => b.editedAt.localeCompare(a.editedAt),
  title: (a, b) => collator.compare(a.title, b.title),
  // Soonest first; projects with no due date last.
  due: (a, b) =>
    a.nextDue === b.nextDue ? 0 : a.nextDue === null ? 1 : b.nextDue === null ? -1 : a.nextDue.localeCompare(b.nextDue),
  // Fewest items left first.
  left: (a, b) => a.todoTotal - a.todoDone - (b.todoTotal - b.todoDone),
};

// Ties fall back to the title, so the order never jumps between refreshes.
export const compareProjects = (key: SortKey) => (a: ProjectRow, b: ProjectRow) =>
  comparators[key](a, b) || collator.compare(a.title, b.title) || a.id.localeCompare(b.id);

export function buildList(projects: readonly ProjectRow[], filters: ListFilters): ListResult {
  const compare = compareProjects(filters.sort);
  const match = (p: ProjectRow) => matches(p, filters);
  const rows: ListRow[] = [];
  let shown = 0;
  if (!filters.grouped) {
    for (const project of projects.filter(match).sort(compare)) rows.push({ project, child: false, dimmed: false });
    return { rows, shown: rows.length, total: projects.length };
  }
  const campaignIds = new Set(projects.filter((p) => p.category === 'campaign').map((p) => p.id));
  // A project whose campaign is not in the list stands alone at the top.
  const parentOf = (p: ProjectRow) =>
    p.category !== 'campaign' && p.campaignId && campaignIds.has(p.campaignId) ? p.campaignId : null;
  const top = projects.filter((p) => parentOf(p) === null).sort(compare);
  for (const project of top) {
    const children =
      project.category === 'campaign'
        ? projects.filter((p) => parentOf(p) === project.id && match(p)).sort(compare)
        : [];
    if (match(project)) {
      rows.push({ project, child: false, dimmed: false });
      shown += 1;
    } else if (children.length) {
      rows.push({ project, child: false, dimmed: true });
    }
    for (const child of children) rows.push({ project: child, child: true, dimmed: false });
    shown += children.length;
  }
  return { rows, shown, total: projects.length };
}

export function categoryCounts(projects: readonly ProjectRow[]): Record<Category | 'all', number> {
  const counts = { all: projects.length, campaign: 0, adventure: 0, 'one-shot': 0 };
  for (const p of projects) counts[p.category] += 1;
  return counts;
}

// The filters as remembered in the browser, checked field by field so an old
// or edited value cannot break the page.
export function readFilters(raw: string | null): ListFilters {
  const filters = defaultFilters();
  if (!raw) return filters;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof ListFilters, unknown>>;
    if (typeof value.query === 'string') filters.query = value.query;
    if (
      value.category === null ||
      value.category === 'campaign' ||
      value.category === 'adventure' ||
      value.category === 'one-shot'
    ) {
      filters.category = value.category;
    }
    if (Array.isArray(value.statuses)) {
      filters.statuses = (['draft', 'in-progress', 'complete'] as const).filter((s) =>
        (value.statuses as unknown[]).includes(s),
      );
    }
    if (typeof value.grouped === 'boolean') filters.grouped = value.grouped;
    if (value.sort === 'edited' || value.sort === 'title' || value.sort === 'due' || value.sort === 'left') {
      filters.sort = value.sort;
    }
  } catch {
    // Keep the defaults.
  }
  return filters;
}

// The meta line under a title: the system and, for adventures and one-shots,
// the scenes and the problems the format package found.
export function metaLine(p: ProjectRow): string {
  const parts: string[] = [];
  if (p.system) parts.push(p.system);
  if (p.category !== 'campaign') {
    if (p.scenes !== null) parts.push(plural(p.scenes, 'scene'));
    const problems: string[] = [];
    if (p.errors) problems.push(plural(p.errors, 'error'));
    if (p.warnings) problems.push(plural(p.warnings, 'warning'));
    if (problems.length) parts.push(problems.join(', '));
  }
  return parts.join(' · ');
}

export const plural = (n: number, word: string) => `${n.toLocaleString('en-GB')} ${word}${n === 1 ? '' : 's'}`;

export const categoryLabels: Record<Category, string> = {
  campaign: 'Campaign',
  adventure: 'Adventure',
  'one-shot': 'One-shot',
};

export const statusLabels: Record<Status, string> = {
  draft: 'Draft',
  'in-progress': 'In progress',
  complete: 'Complete',
};
