import { statuses, type Status } from 'promptbook-project';
import { statusLabels } from '../projects/list.js';
import { shortcut, type ShortcutId } from './cm/keymap.js';
import type { OutlineItem } from './outline.js';

// The command palette's entries and filter (design decision 10). Pure, so it
// is tested without a browser.

export type PaletteAction =
  // An outline item, found again by its key and name when it runs.
  | { kind: 'go'; key: string; name: string }
  | { kind: 'shortcut'; id: Exclude<ShortcutId, 'palette' | 'escape'> }
  | { kind: 'status'; status: Status }
  | { kind: 'pdf' }
  | { kind: 'projects' };

export interface PaletteEntry {
  // Unique in the list, stable while the outline stays the same.
  key: string;
  label: string;
  // The shortcut as in the table ("Mod-1"), shown on the row.
  keys: string | null;
  action: PaletteAction;
}

// Commands first, then every outline item. Problems and the PDF are offered
// only where there are checks: adventures and one-shots.
export function paletteEntries(items: readonly OutlineItem[], { checked }: { checked: boolean }): PaletteEntry[] {
  const fromTable = (id: Exclude<ShortcutId, 'palette' | 'escape'>): PaletteEntry => ({
    key: `cmd:${id}`,
    label: shortcut(id).label,
    keys: shortcut(id).keys,
    action: { kind: 'shortcut', id },
  });
  return [
    fromTable('outline'),
    fromTable('inspector'),
    fromTable('focus'),
    fromTable('syntax'),
    ...statuses.map((status): PaletteEntry => ({
      key: `status:${status}`,
      label: `Set status: ${statusLabels[status]}`,
      keys: null,
      action: { kind: 'status', status },
    })),
    ...(checked
      ? [
          fromTable('nextProblem'),
          fromTable('previousProblem'),
          { key: 'pdf', label: 'PDF preview', keys: null, action: { kind: 'pdf' } } satisfies PaletteEntry,
          fromTable('pdfReview'),
        ]
      : []),
    { key: 'projects', label: 'Back to projects', keys: null, action: { kind: 'projects' } },
    ...items.map((item): PaletteEntry => ({
      key: `go:${item.key}`,
      label: `Go to ${item.id ? `${item.id} ` : ''}${item.name}`,
      keys: null,
      action: { kind: 'go', key: item.key, name: item.name },
    })),
  ];
}

// Lower case, without accents: «Verità» and «verita» are the same.
export const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Whether every word of the query is in the text, in the order typed.
export function matches(text: string, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const haystack = fold(text);
  let from = 0;
  for (const word of words) {
    const at = haystack.indexOf(word, from);
    if (at < 0) return false;
    from = at + word.length;
  }
  return true;
}

export function filterEntries(entries: readonly PaletteEntry[], query: string): PaletteEntry[] {
  return entries.filter((entry) => matches(entry.label, query));
}

// The outline item an entry stands for, in the outline as it is now: the
// same key and name, else the only item with that name. Null when it is gone.
export function resolveItem(
  items: readonly OutlineItem[],
  action: Extract<PaletteAction, { kind: 'go' }>,
): OutlineItem | null {
  const same = items.find((item) => item.key === action.key && item.name === action.name);
  if (same) return same;
  const named = items.filter((item) => item.name === action.name);
  return named.length === 1 ? named[0]! : null;
}
