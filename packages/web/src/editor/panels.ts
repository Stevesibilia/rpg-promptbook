import { useCallback, useEffect, useRef, useState } from 'react';
import { matchShortcut, type ShortcutHandlers } from './cm/keymap.js';

// A panel open or closed, remembered in this browser like the theme.
export function usePanel(
  key: string,
  initial = true,
): [boolean, (open: boolean | ((open: boolean) => boolean)) => void] {
  const [open, setOpen] = useState(() => {
    try {
      const value = localStorage.getItem(key);
      return value === null ? initial : value === 'open';
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: boolean | ((open: boolean) => boolean)) =>
      setOpen((current) => {
        const value = typeof next === 'function' ? next(current) : next;
        try {
          localStorage.setItem(key, value ? 'open' : 'closed');
        } catch {
          // Private windows may refuse; the panel still follows for this page.
        }
        return value;
      }),
    [key],
  );
  return [open, set];
}

export const OUTLINE_KEY = 'promptbook.editor.outline';
export const INSPECTOR_KEY = 'promptbook.editor.inspector';

const inDialog = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest('[role="dialog"], dialog');

// The shortcut table for the whole page (design decision 11): what the
// editor already handled is left alone, and nothing runs while a dialog has
// the focus.
export function useShortcuts(handlers: ShortcutHandlers): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || inDialog(event.target) || inDialog(document.activeElement)) return;
      const id = matchShortcut(event);
      const run = id && latest.current[id];
      if (!run) return;
      event.preventDefault();
      run();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
