import { useEffect, useRef } from 'react';
import { indentWithTab } from '@codemirror/commands';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, highlightActiveLine, keymap, placeholder } from '@codemirror/view';
import type { AdventureTemplate } from 'promptbook-format';
import { nextExpiry, readHidden } from 'promptbook-project';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import * as Y from 'yjs';
import { analysis } from './analysis/field.js';
import { connectWorker } from './analysis/client.js';
import { baseKeymap } from './cm/keymap.js';
import { markdownWithTables } from './cm/language.js';
import { preview, previewConfigOf } from './cm/preview.js';
import { hiddenField, hiddenOf, type HiddenState } from './cm/hidden.js';
import { hiddenEffects, problems, pushDiagnostics, undoBoundary } from './cm/problems.js';
import { slashMenu } from './cm/slash.js';
import { tables } from './cm/tables.js';
import { editorHighlight } from './cm/theme.js';

// The longest the snooze timer waits before looking again: a day, well under
// setTimeout's limit of 2^31-1 ms.
const MAX_WAIT = 86_400_000;

// The prep document's editor: CodeMirror 6 bound to the document's Y.Text,
// with the live preview, and for adventures and one-shots the problems found
// by the parse worker, less those the owner hid. Undo covers this tab's own
// edits only.
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
  const latest = useRef({ extensions, onView });
  latest.current = { extensions, onView };

  useEffect(() => {
    const text = doc.getText('document');
    const undoManager = new Y.UndoManager(text);
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: text.toString(),
        extensions: [
          latest.current.extensions,
          keymap.of([...yUndoManagerKeymap, ...baseKeymap, indentWithTab]),
          markdownWithTables(),
          editorHighlight,
          preview(previewConfigOf(template, checked)),
          tables,
          hiddenField.init(() => ({ entries: readHidden(doc), now: new Date() })),
          analysis({ checked, template, connect: connectWorker, onResult: pushDiagnostics }),
          checked ? problems : [],
          slashMenu(template, checked),
          undoBoundary.of(() => undoManager.stopCapturing()),
          highlightActiveLine(),
          EditorView.lineWrapping,
          placeholder('Write the prep document here.'),
          yCollab(text, null, { undoManager }),
          EditorView.contentAttributes.of({ 'aria-label': 'Prep document', spellcheck: 'true', lang: 'it' }),
        ],
      }),
    });
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
      view.destroy();
      undoManager.destroy();
    };
  }, [doc, template, checked]);

  return <div className="editor" ref={host} />;
}
