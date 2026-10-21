import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import type * as Y from 'yjs';
import { TodoList } from '../projects/TodoList.js';
import { Checks, type Hiding } from './Checks.js';
import { ResearchSection } from './ResearchSection.js';
import { SeedView } from './SeedView.js';
import type { UpdateSource } from './StatusBar.js';
import { ThisScene } from './ThisScene.js';

export type SectionId = 'scene' | 'checks' | 'todo' | 'research' | 'seed';
export type Sections = Record<SectionId, boolean>;

export const SECTIONS_KEY = 'promptbook.editor.sections';
const initial: Sections = { scene: true, checks: true, todo: true, research: false, seed: false };

// The inspector's sections open or closed, remembered in this browser like
// the panels.
export function useSections(): [Sections, (id: SectionId, open: boolean) => void] {
  const [sections, setSections] = useState<Sections>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? '{}') as Partial<Sections>;
      const out = { ...initial };
      for (const id of Object.keys(initial) as SectionId[]) if (typeof stored[id] === 'boolean') out[id] = stored[id];
      return out;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (id: SectionId, open: boolean) =>
      setSections((current) => {
        if (current[id] === open) return current;
        const next = { ...current, [id]: open };
        try {
          localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
        } catch {
          // Private windows may refuse; the section still follows for this page.
        }
        return next;
      }),
    [],
  );
  return [sections, set];
}

// The project's to-do list as the projects panel shows it, its open state
// remembered with the other sections.
function TodoSection({ doc, open, onToggle }: { doc: Y.Doc; open: boolean; onToggle(open: boolean): void }) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(onToggle);
  latest.current = onToggle;
  useLayoutEffect(() => {
    const details = host.current?.querySelector('details');
    if (details && details.open !== open) details.open = open;
  }, [open]);
  useEffect(() => {
    const element = host.current!;
    // `toggle` does not bubble; it is caught on its way down.
    const listen = (event: Event) => {
      if (event.target instanceof HTMLDetailsElement && event.target.parentElement === element)
        latest.current(event.target.open);
    };
    element.addEventListener('toggle', listen, true);
    return () => element.removeEventListener('toggle', listen, true);
  }, []);
  return (
    <div ref={host} className="todo-section">
      <TodoList doc={doc} />
    </div>
  );
}

// The right panel (design decision 8; Research from the connector's decision
// 14). A campaign shows To-do and Seed only.
export function Inspector({
  doc,
  projectId,
  checked,
  view,
  updates,
  sections,
  setSection,
  hiding,
  hiddenOpen,
  onHiddenToggle,
  hiddenFlash,
}: {
  doc: Y.Doc;
  projectId: string;
  checked: boolean;
  view: EditorView | null;
  updates: UpdateSource;
  sections: Sections;
  setSection(id: SectionId, open: boolean): void;
  // The hide actions, and whether Checks' hidden problems are listed, held by
  // the page so the status bar can open them (hide-problems decision 14).
  hiding: Hiding;
  hiddenOpen: boolean;
  onHiddenToggle(open: boolean): void;
  hiddenFlash: boolean;
}) {
  return (
    <div className="inspector" aria-label="Inspector">
      {checked && (
        <>
          <ThisScene view={view} updates={updates} open={sections.scene} onToggle={(o) => setSection('scene', o)} />
          <Checks
            view={view}
            updates={updates}
            open={sections.checks}
            onToggle={(o) => setSection('checks', o)}
            hiding={hiding}
            hiddenOpen={hiddenOpen}
            onHiddenToggle={onHiddenToggle}
            flash={hiddenFlash}
          />
        </>
      )}
      <TodoSection doc={doc} open={sections.todo} onToggle={(o) => setSection('todo', o)} />
      {checked && (
        <ResearchSection
          doc={doc}
          projectId={projectId}
          view={view}
          updates={updates}
          open={sections.research}
          onToggle={(o) => setSection('research', o)}
        />
      )}
      <SeedView doc={doc} projectId={projectId} open={sections.seed} onToggle={(o) => setSection('seed', o)} />
    </div>
  );
}
