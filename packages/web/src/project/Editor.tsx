import { useEffect, useRef } from 'react';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import * as Y from 'yjs';
import { tags } from '@lezer/highlight';

// Just enough Markdown highlighting to find one's way: headings, emphasis,
// and the marks and front matter in a quieter colour.
const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '600', color: 'var(--text)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: 'var(--faint)' },
  { tag: [tags.link, tags.url], color: 'var(--info)' },
  { tag: tags.quote, color: 'var(--muted)' },
  { tag: tags.monospace, fontFamily: 'var(--mono)', fontSize: '0.88em' },
]);

// The plain editor of the project page (design decision 9): CodeMirror 6 with
// Markdown, bound to the document's Y.Text, until the full editor (#3)
// replaces it. Undo covers this tab's own edits only.
export function Editor({ doc }: { doc: Y.Doc }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const text = doc.getText('document');
    const undoManager = new Y.UndoManager(text);
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: text.toString(),
        extensions: [
          keymap.of([...yUndoManagerKeymap, ...defaultKeymap, indentWithTab]),
          markdown(),
          syntaxHighlighting(highlight),
          EditorView.lineWrapping,
          placeholder('Write the prep document here.'),
          yCollab(text, null, { undoManager }),
          EditorView.contentAttributes.of({ 'aria-label': 'Prep document', spellcheck: 'true', lang: 'it' }),
        ],
      }),
    });
    return () => {
      view.destroy();
      undoManager.destroy();
    };
  }, [doc]);

  return <div className="editor" ref={host} />;
}
