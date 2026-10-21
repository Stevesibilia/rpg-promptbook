import { useEffect, useState } from 'react';
import type { EditorState } from '@codemirror/state';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import { templates } from 'promptbook-format';
import { countWords } from 'promptbook-project';
import { analysisField } from './analysis/field.js';
import { problemsOf } from './cm/hidden.js';
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
  hidden: number;
}

// The counts leave out the hidden problems, counted apart (hide-problems
// design decision 8).
export function snapshotOf(state: EditorState): Snapshot {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const value = state.field(analysisField, false);
  const parts = problemsOf(state);
  const shown = parts?.shown ?? [];
  return {
    place: currentItem(state, head)?.place ?? '',
    line: line.number,
    column: head - line.from + 1,
    checked: !!value?.checked,
    errors: shown.filter((s) => s.problem.severity === 'error').length,
    warnings: shown.filter((s) => s.problem.severity === 'warning').length,
    hidden: parts?.hidden.length ?? 0,
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
  onHidden,
}: {
  view: EditorView | null;
  updates: UpdateSource;
  onProblems(): void;
  onHidden(): void;
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
      {snapshot.checked && snapshot.hidden > 0 && (
        <button className="hcount" onClick={onHidden} title="Show the hidden problems">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.5 9.5 6-.5.8-1.6 2.2-3.1 3.5M6.6 7.6C4.6 8.9 3.2 10.8 2.5 12c1 1.5 4.5 6 9.5 6 1.6 0 3-.4 4.3-1.1" />
          </svg>
          {snapshot.hidden} hidden
        </button>
      )}
      {words !== null && <span>{plural(words, 'word')}</span>}
      <span className="r">
        {snapshot.checked ? `Template: ${template.name} v${template.version}` : 'Campaign · not checked'}
      </span>
    </>
  );
}
