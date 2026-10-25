import { useEffect, useMemo, useRef } from 'react';
import { indentWithTab } from '@codemirror/commands';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, highlightActiveLine, keymap, placeholder } from '@codemirror/view';
import type { AdventureTemplate } from 'promptbook-format';
import { nextExpiry, readHidden } from 'promptbook-project';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import type * as Y from 'yjs';
import { analysisField } from './analysis/field.js';
import { connectWorker } from './analysis/client.js';
import { baseKeymap } from './cm/keymap.js';
import { markdownWithTables } from './cm/language.js';
import { hiddenField, hiddenOf, type HiddenState } from './cm/hidden.js';
import { hiddenEffects, problems, pushDiagnostics, undoBoundary } from './cm/problems.js';
import { tables } from './cm/tables.js';
import { editorHighlight } from './cm/theme.js';
import { templateChange, templateCompartment, templateExtension, type TemplateParts } from './template-parts.js';
import { destroyEditorUndoManager, editorUndoManager } from './undo.js';

const partsOf = (checked: boolean): TemplateParts => ({ checked, connect: connectWorker, onResult: pushDiagnostics });

// The longest the snooze timer waits before looking again: a day, well under
// setTimeout's limit of 2^31-1 ms.
const MAX_WAIT = 86_400_000;

// The prep document's editor: CodeMirror 6 bound to the document's Y.Text,
// with the live preview, and for adventures and one-shots the problems found
// by the parse worker, less those the owner hid. Undo covers this tab's own
// edits only, and an update to another template version as one step
// (template-editor design decision 18). A new template reconfigures the
// view, keeping its undo history (design decision 14).
export function Editor({
  doc,
  template,
  checked,
  extensions = [],
  onView,
}: {
  doc: Y.Doc;
  // The project's template: the preview, the `/` menu and every parse use it.
  template: AdventureTemplate;
  // False for a campaign: no parsing, no problems (design decision 2).
  checked: boolean;
  // The page's own extensions (shortcuts, listeners), read when the view is
  // created.
  extensions?: Extension;
  onView?(view: EditorView | null): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ extensions, onView, template });
  latest.current = { extensions, onView, template };
  const compartment = useMemo(templateCompartment, []);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    const text = doc.getText('document');
    const undoManager = editorUndoManager(doc);
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: text.toString(),
        extensions: [
          latest.current.extensions,
          keymap.of([...yUndoManagerKeymap, ...baseKeymap, indentWithTab]),
          markdownWithTables(),
          editorHighlight,
          templateExtension(compartment, latest.current.template, partsOf(checked)),
          tables,
          hiddenField.init(() => ({ entries: readHidden(doc), now: new Date() })),
          checked ? problems : [],
          undoBoundary.of(() => undoManager.stopCapturing()),
          highlightActiveLine(),
          EditorView.lineWrapping,
          placeholder('Write the prep document here.'),
          yCollab(text, null, { undoManager }),
          EditorView.contentAttributes.of({ 'aria-label': 'Prep document', spellcheck: 'true', lang: 'it' }),
        ],
      }),
    });
    viewRef.current = view;
    latest.current.onView?.(view);

    // The hidden problems follow the project's map, and come back when a
    // snooze ends without a reload (hide-problems design decision 7).
    const hidden = doc.getMap('hiddenProblems');
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = ({ entries, now }: HiddenState) => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      const next = nextExpiry(entries, now);
      if (!next) return;
      // A snooze may end years away, past what setTimeout can wait: the wait
      // is cut to a day and checked again then.
      const wait = Math.min(Math.max(next.getTime() - Date.now(), 0), MAX_WAIT);
      timer = setTimeout(() => {
        timer = null;
        if (Date.now() >= next.getTime()) refresh();
        else schedule(hiddenOf(view.state));
      }, wait);
    };
    const refresh = () => {
      const value: HiddenState = { entries: readHidden(doc), now: new Date() };
      view.dispatch({ effects: hiddenEffects(view.state, value) });
      schedule(value);
    };
    hidden.observe(refresh);
    schedule(hiddenOf(view.state));

    return () => {
      hidden.unobserve(refresh);
      if (timer !== null) clearTimeout(timer);
      latest.current.onView?.(null);
      viewRef.current = null;
      view.destroy();
      destroyEditorUndoManager(doc, undoManager);
    };
  }, [doc, checked, compartment]);

  // Another template for the same document: the view stays.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.field(analysisField, false)?.template === template) return;
    view.dispatch(templateChange(compartment, template, partsOf(checked)));
  }, [template, checked, compartment]);

  return <div className="editor" ref={host} />;
}
