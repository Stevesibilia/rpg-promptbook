import type { Problem } from 'promptbook-format';
import {
  hideProblem,
  putHidden,
  readHidden,
  restoreAll,
  restoreProblem,
  SNOOZE_MS,
  type HiddenEntry,
} from 'promptbook-project';
import type * as Y from 'yjs';
import { snoozeDate } from '../dates.js';
import type { ToastAction } from '../ui/Toast.js';
import type { Hiding } from './Checks.js';
import type { HideAs } from './cm/problems.js';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Hide, restore and restore all, each followed by a toast whose Undo puts
// back the entries it replaced (hide-problems design decision 14). The
// tooltip, Checks and the status bar share it. Undo leaves alone a key that
// changed since, on another device or by a later hide here: the newer change
// wins.
export function hidingActions(doc: Y.Doc, toast: (message: string, action?: ToastAction) => void): Hiding {
  // `left`: what each key held after the action, by its hide time, or null
  // once deleted.
  const undoable = (
    message: string,
    previous: ReadonlyMap<string, HiddenEntry | null>,
    left: ReadonlyMap<string, string | null>,
  ) => {
    let done = false;
    toast(message, {
      label: 'Undo',
      run() {
        if (done) return;
        done = true;
        const now = readHidden(doc);
        const back = new Map([...previous].filter(([key]) => (now.get(key)?.at ?? null) === left.get(key)));
        if (back.size > 0) putHidden(doc, back, new Date());
        toast(back.size > 0 ? 'Undone' : 'Nothing undone: changed on another device');
      },
    });
  };
  return {
    hide(problem: Problem, text: string, as: HideAs) {
      const now = new Date();
      const until = as === 'dismiss' ? null : new Date(now.getTime() + SNOOZE_MS[as]).toISOString();
      const { key, previous } = hideProblem(doc, problem, text, until ? 'snoozed' : 'dismissed', until, now);
      undoable(
        until ? `Snoozed until ${snoozeDate(until, now)}` : 'Problem dismissed',
        new Map([[key, previous]]),
        new Map([[key, now.toISOString()]]),
      );
    },
    restore(key: string) {
      const previous = restoreProblem(doc, key, new Date());
      undoable('Problem restored', new Map([[key, previous]]), new Map([[key, null]]));
    },
    // `keys` has one key per row; identical problems share one.
    restoreAll(keys: readonly string[]) {
      const removed = restoreAll(doc, keys, new Date());
      const restored = keys.filter((key) => removed.has(key)).length;
      undoable(
        `${plural(restored, 'problem')} restored`,
        removed,
        new Map([...removed.keys()].map((key) => [key, null])),
      );
    },
  };
}
