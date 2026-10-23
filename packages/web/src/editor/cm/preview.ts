import { syntaxTree } from '@codemirror/language';
import { Facet, StateEffect, StateField, type EditorState, type Extension, type Range, type Text } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import type { CalloutDefinition, Template } from 'promptbook-format';

// The live preview (design decision 4): decorations over the source, built
// from the Markdown syntax tree so they follow every keystroke. Marks show on
// the lines a selection touches while the editor has focus, and are hidden
// everywhere else. The text itself never changes.

export interface PreviewConfig {
  callouts: readonly CalloutDefinition[];
  // The scene id prefix ("S"), styled in scene headings; null for none.
  sceneIdPrefix: string | null;
}

export const previewConfigOf = (template: Template, checked: boolean): PreviewConfig => ({
  callouts: template.callouts,
  sceneIdPrefix: checked ? template.ids.scene : null,
});

// What the preview does to a range of the text.
export type PreviewItem =
  | { kind: 'hide'; from: number; to: number }
  | { kind: 'line'; from: number; className: string }
  | { kind: 'mark'; from: number; to: number; className: string }
  | { kind: 'callout'; from: number; to: number; label: string }
  | { kind: 'fold'; from: number; to: number; keys: number }
  // «Choose…» at the end of the `licenza:` line.
  | { kind: 'licence'; at: number };

// Whether the editor has focus, kept in the state so the preview stays a
// function of the state.
const setFocused = StateEffect.define<boolean>();

export const focusedField = StateField.define<boolean>({
  create: () => false,
  update: (value, tr) => tr.effects.reduce((v, e) => (e.is(setFocused) ? e.value : v), value),
});

// CodeMirror sends a focus change after the transaction that noticed it,
// once the current task is over. A panel that moves the cursor and then
// focuses the editor (an outline jump, an Insert) gets the blur of its own
// click delivered after the focus, and no focus change after it. So the
// field is checked against the view once things settle, and put right.
const focusCheck = ViewPlugin.define((view) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const check = () => {
    timer = null;
    if (view.hasFocus !== view.state.field(focusedField)) view.dispatch({ effects: setFocused.of(view.hasFocus) });
  };
  return {
    update(update: ViewUpdate) {
      if (timer === null && update.view.hasFocus !== update.state.field(focusedField)) timer = setTimeout(check, 20);
    },
    destroy() {
      if (timer !== null) clearTimeout(timer);
    },
  };
});

export const focusTracking: Extension = [
  focusedField,
  EditorView.focusChangeEffect.of((_state, focusing) => setFocused.of(focusing)),
  focusCheck,
];

// The lines touched by a selection, as [first, last] line numbers.
export function activeLines(state: EditorState): [number, number][] {
  if (!state.field(focusedField, false)) return [];
  return state.selection.ranges.map((r) => [state.doc.lineAt(r.from).number, state.doc.lineAt(r.to).number]);
}

export const isActive = (active: [number, number][], line: number) => active.some(([a, b]) => line >= a && line <= b);

// Front matter

export interface FrontMatter {
  from: number;
  // The end of the closing fence.
  to: number;
  // Line numbers of the fences.
  open: number;
  close: number;
}

const FENCE = /^---[ \t]*$/;
const CLOSE = /^(---|\.\.\.)[ \t]*$/;

// A document that opens with a --- line and closes it with --- or ...,
// like the format package's front matter.
export function frontMatterOf(doc: Text): FrontMatter | null {
  if (doc.lines < 2 || !FENCE.test(doc.line(1).text)) return null;
  for (let n = 2; n <= doc.lines; n++) {
    const line = doc.line(n);
    if (CLOSE.test(line.text)) return { from: 0, to: line.to, open: 1, close: n };
  }
  return null;
}

export const KEY = /^([A-Za-z_][\w-]*)[ \t]*:/;
const SHOWN_KEYS = 4;

// The front matter's look and fold: fences faint, keys coloured, and past
// the fourth key the rest folded behind «▸ N more keys» while no selection
// is inside it; «Choose…» after `licenza:` while its line shows. A function
// of the state, used by a field (a fold hides line breaks, which a view
// plugin may not).
export function frontMatterItems(state: EditorState): PreviewItem[] {
  const fm = frontMatterOf(state.doc);
  if (!fm) return [];
  const { doc } = state;
  const items: PreviewItem[] = [];
  const keyLines: number[] = [];
  let licence: number | null = null;
  for (let n = fm.open; n <= fm.close; n++) {
    const line = doc.line(n);
    const fence = n === fm.open || n === fm.close;
    items.push({ kind: 'line', from: line.from, className: fence ? 'cm-fm cm-fm-fence' : 'cm-fm' });
    const key = fence ? null : KEY.exec(line.text);
    if (key) {
      keyLines.push(n);
      if (key[1] === 'licenza' && licence === null) licence = n;
      items.push({ kind: 'mark', from: line.from, to: line.from + key[0].length, className: 'cm-fm-key' });
    }
  }
  const inside = activeLines(state).some(([a, b]) => b >= fm.open && a <= fm.close);
  const folded = !inside && keyLines.length > SHOWN_KEYS;
  if (folded) {
    const from = doc.line(keyLines[SHOWN_KEYS]!).from;
    const to = doc.line(fm.close - 1).to;
    items.push({ kind: 'fold', from, to, keys: keyLines.length - SHOWN_KEYS });
  }
  if (licence !== null && !(folded && licence >= keyLines[SHOWN_KEYS]!)) {
    items.push({ kind: 'licence', at: doc.line(licence).to });
  }
  return items;
}

// The rest of the document

// The format package's callout line, without the quote marker.
const CALLOUT = /^\[!([A-Za-z][\w-]*)(?:\|([\w-]+))?\](?:[ \t]+(.*?))?[ \t]*$/;
const QUOTE = /^[ \t]*>[ \t]?/;

export function calloutOf(text: string, callouts: readonly CalloutDefinition[]) {
  const quote = QUOTE.exec(text);
  if (!quote) return null;
  const match = CALLOUT.exec(text.slice(quote[0].length));
  if (!match) return null;
  const [, type, meta = null, title] = match;
  const definition = callouts.find((c) => c.type === type && (c.meta ?? null) === meta);
  return definition ? { definition, title: title?.trim() || null, start: quote[0].length } : null;
}

// The decorations of the visible ranges, outside the front matter.
export function inlineItems(
  state: EditorState,
  ranges: readonly { from: number; to: number }[],
  config: PreviewConfig,
): PreviewItem[] {
  const { doc } = state;
  const active = activeLines(state);
  const fm = frontMatterOf(doc);
  const items: PreviewItem[] = [];
  const seen = new Set<number>();
  const off = (pos: number) => !isActive(active, doc.lineAt(pos).number);
  const hideMarks = (marks: readonly { from: number; to: number }[]) => {
    for (const mark of marks) items.push({ kind: 'hide', from: mark.from, to: mark.to });
  };

  for (const { from, to } of ranges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'Document') return;
        if (fm && node.from < fm.to) return false;
        // Tables are drawn, or shown whole as source, by tables.ts.
        if (node.name === 'Table') return false;
        const heading = /^ATXHeading(\d)$/.exec(node.name);
        if (heading) {
          const line = doc.lineAt(node.from);
          items.push({ kind: 'line', from: line.from, className: `cm-h${heading[1]}` });
          const marks = node.node.getChildren('HeaderMark');
          if (off(node.from)) {
            for (const mark of marks) {
              // The opening mark takes the space after it, a closing one the space before.
              const opening = mark.from === line.from + (line.text.length - line.text.trimStart().length);
              const space = opening ? doc.sliceString(mark.to, mark.to + 1) === ' ' : false;
              const before = !opening && doc.sliceString(mark.from - 1, mark.from) === ' ';
              items.push({ kind: 'hide', from: before ? mark.from - 1 : mark.from, to: space ? mark.to + 1 : mark.to });
            }
          }
          if (heading[1] === '3' && config.sceneIdPrefix) {
            const start = marks[0] ? marks[0].to : node.from;
            const rest = doc.sliceString(start, line.to);
            const id = new RegExp(`^\\s*(${escapeRegExp(config.sceneIdPrefix)}\\d+\\.)`).exec(rest);
            if (id) {
              const at = start + id[0].length - id[1]!.length;
              items.push({ kind: 'mark', from: at, to: at + id[1]!.length, className: 'cm-sid' });
            }
          }
          return;
        }
        if (node.name === 'StrongEmphasis') {
          const line = doc.lineAt(node.from);
          const inner = doc.sliceString(node.from + 2, node.to - 2);
          const atStart = !line.text.slice(0, node.from - line.from).trim();
          const alone = atStart && !doc.sliceString(node.to, line.to).trim();
          if (atStart && (inner.trimEnd().endsWith(':') || alone)) {
            items.push({ kind: 'mark', from: node.from, to: node.to, className: 'cm-fl' });
          }
          if (off(node.from)) hideMarks(node.node.getChildren('EmphasisMark'));
          return;
        }
        if (node.name === 'Emphasis') {
          if (off(node.from)) hideMarks(node.node.getChildren('EmphasisMark'));
          return;
        }
        if (node.name === 'Blockquote') {
          // A quote across two visible ranges is drawn once.
          if (seen.has(node.from)) return;
          seen.add(node.from);
          const first = doc.lineAt(node.from);
          const callout = calloutOf(first.text, config.callouts);
          if (!callout) return;
          const last = doc.lineAt(node.to).number;
          const { definition, title } = callout;
          const role = `cm-callout cm-callout-${definition.role}${definition.column === 'side' ? ' cm-callout-side' : ''}`;
          for (let n = first.number; n <= last; n++) {
            const line = doc.line(n);
            const edge = `${n === first.number ? ' cm-callout-head' : ''}${n === last ? ' cm-callout-end' : ''}`;
            items.push({ kind: 'line', from: line.from, className: role + edge });
            if (isActive(active, n)) continue;
            if (n === first.number) {
              items.push({
                kind: 'callout',
                from: line.from,
                to: line.to,
                label: title ? `${definition.label} · ${title}` : definition.label,
              });
              continue;
            }
            const quote = QUOTE.exec(line.text);
            if (quote) items.push({ kind: 'hide', from: line.from, to: line.from + quote[0].length });
          }
          return;
        }
        return;
      },
    });
  }
  return items;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The ranges the preview takes out of view, for the tests.
export function hiddenRanges(items: readonly PreviewItem[]): { from: number; to: number }[] {
  return items
    .filter(
      (i): i is Extract<PreviewItem, { to: number }> => i.kind === 'hide' || i.kind === 'callout' || i.kind === 'fold',
    )
    .map(({ from, to }) => ({ from, to }))
    .sort((a, b) => a.from - b.from || a.to - b.to);
}

// Widgets

class CalloutLabel extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  eq(other: CalloutLabel) {
    return other.label === this.label;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-callout-label';
    span.textContent = this.label;
    return span;
  }
  ignoreEvent() {
    return false;
  }
}

class FoldWidget extends WidgetType {
  constructor(
    readonly keys: number,
    readonly at: number,
  ) {
    super();
  }
  eq(other: FoldWidget) {
    return other.keys === this.keys && other.at === this.at;
  }
  toDOM(view: EditorView) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-fm-more';
    button.textContent = `▸ ${this.keys} more key${this.keys === 1 ? '' : 's'}`;
    // Putting the cursor inside the front matter unfolds it.
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.at } });
      view.focus();
    });
    return button;
  }
  ignoreEvent() {
    return true;
  }
}

// Opens the licence pane: the page's, read from the state so the widget
// never holds a stale one.
export const licenceHandler = Facet.define<() => void>();

class LicenceChoose extends WidgetType {
  // One per document, so a rebuild keeps its DOM.
  eq() {
    return true;
  }
  toDOM(view: EditorView) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-fm-licence';
    button.setAttribute('aria-haspopup', 'dialog');
    button.title = 'Choose a licence for this project';
    button.textContent = 'Choose…';
    // The cursor and the fold stay as they are.
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      if (event.button !== 0) return;
      view.state.facet(licenceHandler).forEach((open) => open());
    });
    return button;
  }
  ignoreEvent() {
    return true;
  }
}

const hide = Decoration.replace({});

function toDecorations(items: readonly PreviewItem[]): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const item of items) {
    switch (item.kind) {
      case 'hide':
        if (item.to > item.from) ranges.push(hide.range(item.from, item.to));
        break;
      case 'line':
        ranges.push(Decoration.line({ class: item.className }).range(item.from));
        break;
      case 'mark':
        if (item.to > item.from) ranges.push(Decoration.mark({ class: item.className }).range(item.from, item.to));
        break;
      case 'callout':
        ranges.push(Decoration.replace({ widget: new CalloutLabel(item.label) }).range(item.from, item.to));
        break;
      case 'fold':
        ranges.push(
          Decoration.replace({ widget: new FoldWidget(item.keys, item.from), block: true }).range(item.from, item.to),
        );
        break;
      case 'licence':
        ranges.push(Decoration.widget({ widget: new LicenceChoose(), side: 1 }).range(item.at));
        break;
    }
  }
  return Decoration.set(ranges, true);
}

const frontMatterField = StateField.define<DecorationSet>({
  create: (state) => toDecorations(frontMatterItems(state)),
  update: (value, tr) =>
    tr.docChanged || tr.selection || tr.effects.some((e) => e.is(setFocused))
      ? toDecorations(frontMatterItems(tr.state))
      : value,
  provide: (field) => EditorView.decorations.from(field),
});

function inlinePlugin(config: PreviewConfig) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = toDecorations(inlineItems(view.state, view.visibleRanges, config));
      }
      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          update.state.field(focusedField) !== update.startState.field(focusedField) ||
          syntaxTree(update.state) !== syntaxTree(update.startState)
        ) {
          this.decorations = toDecorations(inlineItems(update.state, update.view.visibleRanges, config));
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

export function preview(config: PreviewConfig): Extension {
  return [focusTracking, frontMatterField, inlinePlugin(config)];
}
