import { StateEffect, StateField, type EditorState, type Text } from '@codemirror/state';
import type { ParseResult, Problem } from 'promptbook-format';
import { isActive, problemKey, type HiddenEntry } from 'promptbook-project';
import { analysisField } from '../analysis/field.js';

// The problems the owner has hidden, in the editor's state (hide-problems
// design decision 12): the project's `hiddenProblems` entries and the clock
// they are read against. The page sets it on every change of the entries and
// when a snooze ends; every panel reads it from here.
export interface HiddenState {
  entries: ReadonlyMap<string, HiddenEntry>;
  now: Date;
}

export const setHidden = StateEffect.define<HiddenState>();

const none: HiddenState = { entries: new Map(), now: new Date(0) };

export const hiddenField = StateField.define<HiddenState>({
  create: () => none,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setHidden)) value = effect.value;
    return value;
  },
});

export const hiddenOf = (state: EditorState): HiddenState => state.field(hiddenField, false) ?? none;

// The text a result was computed for and its problems' keys, in the order of
// `result.problems` (design decision 11): one string per result, kept as
// long as the result is.
export interface Keyed {
  text: string;
  keys: readonly string[];
}

const keyed = new WeakMap<ParseResult, Keyed>();

// `doc` must be the text the result was computed for (`Analysis.doc`).
export function keysOf(result: ParseResult, doc: Text): Keyed {
  let value = keyed.get(result);
  if (!value) {
    const text = doc.toString();
    value = { text, keys: result.problems.map((problem) => problemKey(problem, text)) };
    keyed.set(result, value);
  }
  return value;
}

export interface Shown {
  problem: Problem;
  // Its index in `result.problems`, and so in `Analysis.spots`.
  index: number;
  key: string;
}

export interface Hidden extends Shown {
  entry: HiddenEntry;
}

export interface Partition {
  // The text the problems were computed for.
  text: string;
  shown: readonly Shown[];
  hidden: readonly Hidden[];
}

const partitions = new WeakMap<ParseResult, { hidden: HiddenState; value: Partition }>();

// A result's problems split into shown and hidden, each in the result's order.
export function partitionOf(result: ParseResult, doc: Text, state: HiddenState): Partition {
  const cached = partitions.get(result);
  if (cached?.hidden === state) return cached.value;
  const { text, keys } = keysOf(result, doc);
  const shown: Shown[] = [];
  const hidden: Hidden[] = [];
  result.problems.forEach((problem, index) => {
    const key = keys[index]!;
    const entry = state.entries.get(key);
    if (entry && isActive(entry, state.now)) hidden.push({ problem, index, key, entry });
    else shown.push({ problem, index, key });
  });
  const value = { text, shown, hidden };
  partitions.set(result, { hidden: state, value });
  return value;
}

// The latest analysis's problems split, fresh or stale; null while there is
// none and for a campaign.
export function problemsOf(state: EditorState): Partition | null {
  const value = state.field(analysisField, false);
  if (!value?.result || !value.doc) return null;
  return partitionOf(value.result, value.doc, hiddenOf(state));
}
