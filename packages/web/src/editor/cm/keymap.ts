import { defaultKeymap, toggleComment } from '@codemirror/commands';
import { nextDiagnostic, previousDiagnostic } from '@codemirror/lint';
import type { KeyBinding } from '@codemirror/view';

// The editor's shortcuts (design decision 11), one table for the editor, the
// document-level handler, the tooltips and the palette. Mod is ⌘ on the Mac
// and Ctrl elsewhere.

export type ShortcutId =
  | 'outline'
  | 'inspector'
  | 'focus'
  | 'syntax'
  | 'palette'
  | 'pdfReview'
  | 'nextProblem'
  | 'previousProblem'
  | 'escape';

export interface Shortcut {
  id: ShortcutId;
  keys: string;
  label: string;
}

export const shortcuts: readonly Shortcut[] = [
  { id: 'outline', keys: 'Mod-1', label: 'Toggle outline' },
  { id: 'inspector', keys: 'Mod-2', label: 'Toggle inspector' },
  { id: 'focus', keys: 'Mod-.', label: 'Focus mode' },
  { id: 'syntax', keys: 'Mod-/', label: 'Syntax sheet' },
  { id: 'palette', keys: 'Mod-k', label: 'Command palette' },
  // Firefox keeps ⌘⇧P for a private window; the button and the palette cover it.
  { id: 'pdfReview', keys: 'Mod-Shift-p', label: 'Review PDF' },
  { id: 'nextProblem', keys: 'F8', label: 'Next problem' },
  { id: 'previousProblem', keys: 'Shift-F8', label: 'Previous problem' },
  { id: 'escape', keys: 'Escape', label: 'Close a dialog, leave focus mode' },
];

export const shortcut = (id: ShortcutId): Shortcut => shortcuts.find((s) => s.id === id)!;

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

// "Mod-k" as the keyboard shows it: ⌘K on the Mac, Ctrl+K elsewhere.
export function keyLabel(keys: string, mac = isMac): string {
  const parts = keys.split('-');
  // "Mod--" would be a minus key; none of the table's keys is one.
  const key = parts.pop()!;
  const name = key.length === 1 ? key.toUpperCase() : key;
  const symbols: Record<string, [string, string]> = {
    Mod: ['⌘', 'Ctrl'],
    Shift: ['⇧', 'Shift'],
    Alt: ['⌥', 'Alt'],
    Ctrl: ['⌃', 'Ctrl'],
  };
  const mods = parts.map((m) => symbols[m]?.[mac ? 0 : 1] ?? m);
  return mac ? mods.join('') + name : [...mods, name].join('+');
}

// The shortcut a key event stands for, outside CodeMirror. Shift is ignored
// for keys typed as a symbol: "/" is Shift-7 on an Italian keyboard.
export function matchShortcut(event: KeyboardEvent, mac = isMac): ShortcutId | null {
  for (const { id, keys } of shortcuts) {
    const parts = keys.split('-');
    const key = parts.pop()!;
    const mod = parts.includes('Mod');
    const shift = parts.includes('Shift');
    const symbol = key.length === 1 && !/[a-z]/i.test(key);
    if ((mac ? event.metaKey : event.ctrlKey) !== mod) continue;
    if ((mac ? event.ctrlKey : event.metaKey) || event.altKey) continue;
    if (!symbol && event.shiftKey !== shift) continue;
    if (event.key.toLowerCase() !== key.toLowerCase()) continue;
    return id;
  }
  return null;
}

export type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>;

// The table as CodeMirror bindings. F8 and Shift-F8 run the lint commands;
// the others call the page's handlers. Escape is left to bubble, so
// CodeMirror's own uses of it come first.
export function editorKeymap(handlers: () => ShortcutHandlers): KeyBinding[] {
  return shortcuts
    .filter((s) => s.id !== 'escape')
    .map(({ id, keys }) => ({
      key: keys,
      preventDefault: true,
      run:
        id === 'nextProblem'
          ? nextDiagnostic
          : id === 'previousProblem'
            ? previousDiagnostic
            : () => {
                const run = handlers()[id];
                run?.();
                return !!run;
              },
    }));
}

// CodeMirror's default bindings without Mod-/ (toggle comment), which opens
// the syntax sheet here.
export const baseKeymap: readonly KeyBinding[] = defaultKeymap.filter((b) => b.run !== toggleComment);
