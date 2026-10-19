import { useEffect, useState } from 'react';
import type { EditorState } from '@codemirror/state';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import { templates } from 'promptbook-format';
import { countWords } from 'promptbook-project';
import { analysisField } from './analysis/field.js';
import { frontMatterOf } from './cm/preview.js';
import { currentItem } from './outline.js';

export type UpdateSource = (listener: (update: ViewUpdate) => void) => () => void;

interface Snapshot {
  place: string;
  line: number;
  column: number;
  checked: boolean;
  errors: number;
  warnings: number;
}

function snapshotOf(state: EditorState): Snapshot {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const value = state.field(analysisField, false);
  const problems = value?.result?.problems ?? [];
  return {
    place: currentItem(state, head)?.place ?? '',
    line: line.number,
    column: head - line.from + 1,
    checked: !!value?.checked,
    errors: problems.filter((p) => p.severity === 'error').length,
    warnings: problems.filter((p) => p.severity === 'warning').length,
  };
}

const same = (a: Snapshot | null, b: Snapshot) =>
  !!a && (Object.keys(b) as (keyof Snapshot)[]).every((key) => a[key] === b[key]);

// Words after the front matter, as in the projects list.
function wordsOf(state: EditorState): number {
  const fm = frontMatterOf(state.doc);
  return countWords(state.sliceDoc(fm ? fm.to : 0));
}

const WORDS_DELAY = 300;
const plural = (n: number, word: string) => `${n.toLocaleString('en')} ${word}${n === 1 ? '' : 's'}`;
const template = templates.avventura;

// The status bar's left part (design decision 12); the shell adds the sync
// state on the right.
export function StatusBar({
  view,
  updates,
  onProblems,
}: {
  view: EditorView | null;
  updates: UpdateSource;
  onProblems(): void;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [words, setWords] = useState<number | null>(null);

  useEffect(() => {
    if (!view) {
      setSnapshot(null);
      setWords(null);
      return;
    }
    setSnapshot(snapshotOf(view.state));
    setWords(wordsOf(view.state));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = updates((update) => {
      const next = snapshotOf(update.state);
      setSnapshot((current) => (same(current, next) ? current : next));
      if (!update.docChanged) return;
      if (timer !== null) clearTimeout(timer);
      // Counted when the typing pauses; the cleanup clears a timer left
      // when the view goes.
      timer = setTimeout(() => {
        timer = null;
        setWords(wordsOf(update.view.state));
      }, WORDS_DELAY);
    });
    return () => {
      unsubscribe();
      if (timer !== null) clearTimeout(timer);
    };
  }, [view, updates]);

  if (!snapshot) return null;
  return (
    <>
      {snapshot.place && <span>{snapshot.place}</span>}
      <span>
        Ln {snapshot.line}, Col {snapshot.column}
      </span>
      {snapshot.checked && (
        <button className="counts" onClick={onProblems} title="Show the checks">
          <span className={snapshot.errors ? 'd' : ''}>● {plural(snapshot.errors, 'error')}</span>
          <span className={snapshot.warnings ? 'a' : ''}>● {plural(snapshot.warnings, 'warning')}</span>
        </button>
      )}
      {words !== null && <span>{plural(words, 'word')}</span>}
      <span className="r">
        {snapshot.checked ? `Template: ${template.name} v${template.version}` : 'Campaign · not checked'}
      </span>
    </>
  );
}
