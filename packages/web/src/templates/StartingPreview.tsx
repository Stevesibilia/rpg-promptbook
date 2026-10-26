import { useEffect, useRef } from 'react';
import { EditorState, RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import type { AdventureTemplate } from 'promptbook-format';
import { markdownWithTables } from '../editor/cm/language.js';
import { preview, previewConfigOf } from '../editor/cm/preview.js';
import { tables } from '../editor/cm/tables.js';
import { editorHighlight } from '../editor/cm/theme.js';
import type { LineMark } from './marks.js';
import '../editor/editor.css';

// The starting document a new project would get from the draft
// (template-editor design decision 9): skeletonDocument's text in a
// read-only editor with the app's own live preview, so it looks as the
// project's editor will. Lines the draft changed are amber, added ones green,
// and headings say when their section is optional or not in the PDF.

class TagWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: TagWidget) {
    return other.text === this.text;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'pv-out';
    span.textContent = this.text;
    return span;
  }
}

const setMarks = StateEffect.define<readonly LineMark[]>();

// The marks, and the empty lines drawn low: the preview is a summary of the
// document's shape, not a page to write in.
function decorationsOf(state: EditorState, marks: readonly LineMark[]): DecorationSet {
  const byLine = new Map(marks.map((m) => [m.line, m]));
  const builder = new RangeSetBuilder<Decoration>();
  for (let n = 1; n <= state.doc.lines; n++) {
    const at = state.doc.line(n);
    const mark = byLine.get(n - 1);
    if (mark?.mark) builder.add(at.from, at.from, Decoration.line({ class: mark.mark === 'added' ? 'pv-new' : 'pv-hl' }));
    else if (at.length === 0) builder.add(at.from, at.from, Decoration.line({ class: 'pv-blank' }));
    if (mark?.optional) builder.add(at.to, at.to, Decoration.widget({ widget: new TagWidget('optional'), side: 1 }));
    if (mark?.out) builder.add(at.to, at.to, Decoration.widget({ widget: new TagWidget('not in the PDF'), side: 2 }));
  }
  return builder.finish();
}

const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setMarks)) return decorationsOf(tr.state, effect.value);
    return value.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const base = (template: AdventureTemplate): Extension => [
  markdownWithTables(),
  editorHighlight,
  preview(previewConfigOf(template, true)),
  tables,
  marksField,
  EditorView.editable.of(false),
  EditorState.readOnly.of(true),
  EditorView.lineWrapping,
  EditorView.contentAttributes.of({ 'aria-label': 'Starting document', lang: 'it' }),
];

export function StartingPreview({
  text,
  template,
  marks,
  chip,
}: {
  text: string;
  // The callouts and the scene id the preview styles with: the draft's, or
  // for a campaign, the built-in adventure's.
  template: AdventureTemplate;
  marks: readonly LineMark[];
  chip: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  // A new view when the template's boxes change, so the preview styles them.
  useEffect(() => {
    const created = new EditorView({
      parent: host.current!,
      state: EditorState.create({ doc: '', extensions: base(template) }),
    });
    view.current = created;
    return () => {
      view.current = null;
      created.destroy();
    };
  }, [template]);

  useEffect(() => {
    const current = view.current;
    if (!current) return;
    const doc = current.state.doc.toString();
    current.dispatch({
      ...(doc !== text ? { changes: { from: 0, to: doc.length, insert: text } } : {}),
      effects: setMarks.of(marks),
    });
  }, [text, marks, template]);

  return (
    <aside className="pv" aria-label="Starting document">
      <div className="ph">
        Starting document<span className="chip">{chip}</span>
      </div>
      <div className="pb editor" ref={host} data-testid="starting-document" />
    </aside>
  );
}
