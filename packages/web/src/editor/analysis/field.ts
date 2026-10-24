import {
  ChangeSet,
  StateEffect,
  StateField,
  type ChangeDesc,
  type EditorState,
  type Extension,
  type Text,
} from '@codemirror/state';
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import { parseAdventure, type AdventureTemplate, type ParseResult, type Range } from 'promptbook-format';
import { createAnalysisClient, type AnalysisClient, type Connect } from './client.js';

// A part of the document the panels point at, with its positions in the
// current text.
export interface Place {
  kind: 'meta' | 'section' | 'scene' | 'sheet';
  // The index in the model's list of that kind; 0 for the front matter.
  index: number;
  from: number;
  to: number;
  // The start of its heading, or `from` for the front matter.
  head: number;
}

export interface Span {
  from: number;
  to: number;
}

export interface Analysis {
  // False for a campaign, which is never parsed (design decision 2).
  checked: boolean;
  // The project's template, which every parse uses; null only before the
  // editor set one.
  template: AdventureTemplate | null;
  // The text the result was computed for.
  doc: Text | null;
  result: ParseResult | null;
  // Mapped through every change since `doc`.
  places: readonly Place[];
  // The problems' ranges, in the order of `result.problems`.
  spots: readonly Span[];
}

export const setAnalysis = StateEffect.define<{ doc: Text; result: ParseResult; changes: ChangeDesc }>();

// Added to a write (a move, an insert) to have its text parsed now rather
// than after the typing delay, so the panels catch up at once.
export const analyseNow = StateEffect.define<null>();

function placesOf({ model }: ParseResult): Place[] {
  const places: Place[] = [];
  const { range } = model.meta;
  if (range)
    places.push({ kind: 'meta', index: 0, from: range.start.offset, to: range.end.offset, head: range.start.offset });
  const add = (kind: Place['kind'], items: readonly { range: Range; headingRange: Range }[]) =>
    items.forEach((item, index) =>
      places.push({
        kind,
        index,
        from: item.range.start.offset,
        to: item.range.end.offset,
        head: item.headingRange.start.offset,
      }),
    );
  add('section', model.sections);
  add('scene', model.scenes);
  add('sheet', model.sheets);
  return places;
}

// Typing at a heading's first character belongs to that heading; typing at
// an item's end belongs to it too, so the cursor stays in its place while the
// next result is computed. Items never touch: blank lines are between them.
const mapPlace = (place: Place, changes: ChangeDesc): Place => ({
  ...place,
  from: changes.mapPos(place.from, -1),
  to: changes.mapPos(place.to, 1),
  head: changes.mapPos(place.head, -1),
});

const mapSpot = (spot: Span, changes: ChangeDesc): Span => {
  const from = changes.mapPos(spot.from, 1);
  return { from, to: Math.max(from, changes.mapPos(spot.to, -1)) };
};

function mapAll(value: Analysis, changes: ChangeDesc): Analysis {
  return {
    ...value,
    places: value.places.map((p) => mapPlace(p, changes)),
    spots: value.spots.map((s) => mapSpot(s, changes)),
  };
}

const empty = (checked: boolean, template: AdventureTemplate | null): Analysis => ({
  checked,
  template,
  doc: null,
  result: null,
  places: [],
  spots: [],
});

export const analysisField = StateField.define<Analysis>({
  create: () => empty(false, null),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(setAnalysis)) continue;
      const { doc, result, changes } = effect.value;
      value = {
        checked: value.checked,
        template: value.template,
        doc,
        result,
        places: placesOf(result),
        spots: result.problems.map((p) => ({ from: p.range.start.offset, to: p.range.end.offset })),
      };
      if (!changes.empty) value = mapAll(value, changes);
    }
    if (tr.docChanged && value.result) value = mapAll(value, tr.changes);
    return value;
  },
});

// Fresh: computed for the text as it is now.
export const isFresh = (state: EditorState): boolean => {
  const value = state.field(analysisField, false);
  return !!value?.result && value.doc === state.doc;
};

// The result every write starts from: the analysis when it is fresh, a new
// parse of the text with the project's template otherwise; null for a
// campaign. Never stale (decision 3).
export function writableResult(state: EditorState, parse = parseCurrent): ParseResult | null {
  const value = state.field(analysisField, false);
  if (!value?.checked || !value.template) return null;
  if (value.result && value.doc === state.doc) return value.result;
  return parse(state.doc.toString(), value.template);
}

function parseCurrent(text: string, template: AdventureTemplate): ParseResult {
  return parseAdventure(text, { template });
}

// Called with each result the worker sends back, inside the transaction that
// stores it, to add effects of its own (the diagnostics).
export type OnResult = (state: EditorState, result: ParseResult, fresh: boolean) => StateEffect<unknown>[];

interface Sent {
  doc: Text;
  // From `doc` to the current text.
  changes: ChangeSet;
}

// Sends the text to the worker and stores its answers in the field, with
// the changes made since the text was sent so positions can be mapped.
function driver(template: AdventureTemplate, connect: Connect, onResult: OnResult) {
  return ViewPlugin.define((view: EditorView) => {
    let sent: Sent | null = null;
    const client: AnalysisClient = createAnalysisClient<Sent>({
      connect,
      read() {
        const doc = view.state.doc;
        sent = { doc, changes: ChangeSet.empty(doc.length) };
        return { text: doc.toString(), template, tag: sent };
      },
      apply(tag, result) {
        if (tag !== sent) return;
        sent = null;
        const fresh = tag.changes.empty;
        view.dispatch({
          effects: [
            setAnalysis.of({ doc: tag.doc, result, changes: tag.changes }),
            ...onResult(view.state, result, fresh),
          ],
        });
      },
    });
    client.flush();
    return {
      update(update: ViewUpdate) {
        if (!update.docChanged) return;
        if (sent) sent.changes = sent.changes.compose(update.changes);
        const now = update.transactions.some((tr) => tr.effects.some((e) => e.is(analyseNow)));
        if (now) client.flush();
        else client.changed();
      },
      destroy() {
        sent = null;
        client.dispose();
      },
    };
  });
}

export interface AnalysisOptions {
  checked: boolean;
  template: AdventureTemplate;
  connect: Connect;
  onResult?: OnResult;
}

export function analysis({ checked, template, connect, onResult = () => [] }: AnalysisOptions): Extension {
  const field = analysisField.init(() => empty(checked, template));
  return checked ? [field, driver(template, connect, onResult)] : field;
}
