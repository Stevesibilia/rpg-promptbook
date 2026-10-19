import { useEffect, useRef } from 'react';
import { indentWithTab } from '@codemirror/commands';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, highlightActiveLine, keymap, placeholder } from '@codemirror/view';
import { templates } from 'promptbook-format';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import * as Y from 'yjs';
import { analysis } from './analysis/field.js';
import { connectWorker } from './analysis/client.js';
import { baseKeymap } from './cm/keymap.js';
import { markdownWithTables } from './cm/language.js';
import { preview, previewConfigOf } from './cm/preview.js';
import { problems, pushDiagnostics, undoBoundary } from './cm/problems.js';
import { slashMenu } from './cm/slash.js';
import { tables } from './cm/tables.js';
import { editorHighlight } from './cm/theme.js';

// The prep document's editor: CodeMirror 6 bound to the document's Y.Text,
// with the live preview, and for adventures and one-shots the problems found
// by the parse worker. Undo covers this tab's own edits only.
export function Editor({
  doc,
  checked,
  extensions = [],
  onView,
}: {
  doc: Y.Doc;
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
          preview(previewConfigOf(templates.avventura, checked)),
          tables,
          analysis({ checked, connect: connectWorker, onResult: pushDiagnostics }),
          checked ? problems : [],
          slashMenu(templates.avventura, checked),
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
    return () => {
      latest.current.onView?.(null);
      view.destroy();
      undoManager.destroy();
    };
  }, [doc, checked]);

  return <div className="editor" ref={host} />;
}
