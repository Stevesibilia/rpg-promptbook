import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { nextDiagnostic, previousDiagnostic } from '@codemirror/lint';
import { Prec } from '@codemirror/state';
import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';
import { readMeta } from 'promptbook-project';
import type * as Y from 'yjs';
import { StatusSelect } from '../projects/controls.js';
import { categoryLabels } from '../projects/list.js';
import { useProjects } from '../projects/useProjects.js';
import { Shell } from '../shell/Shell.js';
import { useDocValue } from '../sync/hooks.js';
import { editorKeymap, keyLabel, shortcut, type ShortcutHandlers } from './cm/keymap.js';
import { Editor } from './Editor.js';
import { OutlinePanel } from './OutlinePanel.js';
import { INSPECTOR_KEY, OUTLINE_KEY, usePanel, useShortcuts } from './panels.js';
import { StatusBar, type UpdateSource } from './StatusBar.js';
import './editor.css';

const label = (id: Parameters<typeof shortcut>[0]) => `${shortcut(id).label} (${keyLabel(shortcut(id).keys)})`;

// The live project page (design decisions 1 and 11): the top bar with its
// toggles, the outline, the editor, the inspector and the status bar.
export function EditorPage({ doc }: { doc: Y.Doc }) {
  const meta = useDocValue(doc, readMeta);
  const { projects } = useProjects();
  const campaign = meta.campaignId ? projects?.find((p) => p.id === meta.campaignId) : undefined;
  const checked = meta.category !== 'campaign';

  const [outline, setOutline] = usePanel(OUTLINE_KEY);
  const [inspector, setInspector] = usePanel(INSPECTOR_KEY);
  const [focus, setFocus] = useState(false);
  const [view, setView] = useState<EditorView | null>(null);

  // The editor's updates, for the status bar.
  const listeners = useRef(new Set<(update: ViewUpdate) => void>());
  const updates = useCallback<UpdateSource>((listener) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);

  const toProblem = (run: typeof nextDiagnostic) => () => {
    if (!view) return;
    view.focus();
    run(view);
  };
  const handlers: ShortcutHandlers = {
    outline: () => setOutline((open) => !open),
    inspector: () => setInspector((open) => !open),
    focus: () => setFocus((on) => !on),
    nextProblem: toProblem(nextDiagnostic),
    previousProblem: toProblem(previousDiagnostic),
    // Left alone outside focus mode, so Escape keeps its other uses.
    ...(focus ? { escape: () => setFocus(false) } : {}),
  };
  const latest = useRef(handlers);
  latest.current = handlers;
  useShortcuts(handlers);

  // Read once, when the editor's view is created.
  const extensions = useMemo(
    () => [
      Prec.high(keymap.of(editorKeymap(() => latest.current))),
      EditorView.updateListener.of((update) => listeners.current.forEach((listener) => listener(update))),
    ],
    [],
  );

  return (
    <Shell
      rail="document"
      focus={focus}
      crumbs={
        <>
          <Link to="/">Projects</Link>
          {campaign && (
            <>
              {' › '}
              <Link to={`/?p=${campaign.id}`}>{campaign.title}</Link>
            </>
          )}
          {' › '}
          <b>{meta.title}</b>
        </>
      }
      topExtra={
        <div className="top-meta hide-in-focus">
          <span className="cat">{categoryLabels[meta.category]}</span>
          <StatusSelect doc={doc} status={meta.status} />
        </div>
      }
      topEnd={
        <div className="top-tools">
          <button
            className={`tb hide-in-focus${outline ? ' on' : ''}`}
            title={label('outline')}
            aria-label="Outline"
            aria-pressed={outline}
            onClick={() => setOutline((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
            </svg>
          </button>
          <button
            className={`tb hide-in-focus${inspector ? ' on' : ''}`}
            title={label('inspector')}
            aria-label="Inspector"
            aria-pressed={inspector}
            onClick={() => setInspector((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M15 4v16" />
            </svg>
          </button>
          <button
            className={`tb${focus ? ' on' : ''}`}
            title={label('focus')}
            aria-label="Focus mode"
            aria-pressed={focus}
            onClick={() => setFocus((on) => !on)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          </button>
          <span className="kbd hide-in-focus" title={shortcut('palette').label}>
            {keyLabel(shortcut('palette').keys)}
          </span>
        </div>
      }
      left={outline ? <OutlinePanel view={view} updates={updates} /> : undefined}
      right={inspector ? <div className="inspector" aria-label="Inspector" /> : undefined}
      status={<StatusBar view={view} updates={updates} onProblems={() => setInspector(true)} />}
    >
      <Editor doc={doc} checked={checked} extensions={extensions} onView={setView} />
    </Shell>
  );
}
