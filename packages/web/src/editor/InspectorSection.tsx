import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { UpdateSource } from './StatusBar.js';

// A value read from the editor's state, read again after each update and
// kept when `same` says it did not change.
export function useViewValue<T>(
  view: EditorView | null,
  updates: UpdateSource,
  read: (state: EditorState) => T,
  same: (a: T, b: T) => boolean,
): T | null {
  const [value, setValue] = useState<T | null>(null);
  const latest = useRef({ read, same });
  latest.current = { read, same };
  useEffect(() => {
    if (!view) return setValue(null);
    setValue(latest.current.read(view.state));
    return updates((update) => {
      const next = latest.current.read(update.state);
      setValue((current) => (current !== null && latest.current.same(current, next) ? current : next));
    });
  }, [view, updates]);
  return value;
}

// One section of the inspector, open and closed by its summary.
export function Section({
  open,
  onToggle,
  summary,
  children,
  className = '',
}: {
  open: boolean;
  onToggle(open: boolean): void;
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`acc ${className}`} open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
      <summary>{summary}</summary>
      <div className="body">{children}</div>
    </details>
  );
}
