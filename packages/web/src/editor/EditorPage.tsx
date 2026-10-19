import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { nextDiagnostic, previousDiagnostic } from '@codemirror/lint';
import { Prec } from '@codemirror/state';
import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';
import { blockAt } from 'promptbook-layout';
import { readMeta, setStatus } from 'promptbook-project';
import type * as Y from 'yjs';
import { StatusSelect } from '../projects/controls.js';
import { categoryLabels } from '../projects/list.js';
import { useProjects } from '../projects/useProjects.js';
import { Shell } from '../shell/Shell.js';
import { useDocValue } from '../sync/hooks.js';
import { editorKeymap, keyLabel, shortcut, type ShortcutHandlers } from './cm/keymap.js';
import { CommandPalette } from './CommandPalette.js';
import { Editor } from './Editor.js';
import { Inspector, useSections } from './Inspector.js';
import { outlineOf } from './outline.js';
import { OutlinePanel } from './OutlinePanel.js';
import { resolveItem, type PaletteAction } from './palette.js';
import { INSPECTOR_KEY, OUTLINE_KEY, PDF_KEY, usePanel, useShortcuts } from './panels.js';
import { usePdfOptions } from './pdf/options.js';
import { PdfPane } from './pdf/PdfPane.js';
import { PdfSource } from './pdf/PdfSheet.js';
import { usePdf } from './pdf/usePdf.js';
import { StatusBar, type UpdateSource } from './StatusBar.js';
import { SyntaxSheet } from './SyntaxSheet.js';
import { jumpTo } from './writes.js';
import './editor.css';
import './pdf/pdf.css';

const label = (id: Parameters<typeof shortcut>[0]) => `${shortcut(id).label} (${keyLabel(shortcut(id).keys)})`;

// The live project page (design decisions 1 and 11): the top bar with its
// toggles, the outline, the editor, the inspector or the PDF preview, and the
// status bar.
export function EditorPage({ doc }: { doc: Y.Doc }) {
  const meta = useDocValue(doc, readMeta);
  const { projects } = useProjects();
  const campaign = meta.campaignId ? projects?.find((p) => p.id === meta.campaignId) : undefined;
  const checked = meta.category !== 'campaign';

  const [outline, setOutline] = usePanel(OUTLINE_KEY);
  const [inspector, setInspector] = usePanel(INSPECTOR_KEY);
  const [sections, setSection] = useSections();
  const [focus, setFocus] = useState(false);
  const [view, setView] = useState<EditorView | null>(null);
  const [dialog, setDialog] = useState<'palette' | 'syntax' | null>(null);
  const navigate = useNavigate();
  const [pdfOpen, setPdfOpen] = usePanel(PDF_KEY, false);
  const [pdfOptions] = usePdfOptions(meta.id);
  // The pane takes the inspector's place for adventures and one-shots.
  const pane = checked && pdfOpen;

  // The editor's updates, for the status bar.
  const listeners = useRef(new Set<(update: ViewUpdate) => void>());
  const updates = useCallback<UpdateSource>((listener) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);

  const { snapshot: pdfSnapshot } = usePdf({
    view,
    updates,
    active: checked && pane && !focus,
    options: pdfOptions,
    title: meta.title,
  });
  // A double-click on a page: the text printed there, in the text the build
  // read; jumpTo keeps it inside the text as it is now.
  const jumpFromPdf = (page: number, y: number) => {
    const good = pdfSnapshot?.good;
    const at = good && blockAt(good.positions, page, y);
    if (!view || !at) return;
    jumpTo(view, at.from, 'center');
  };
  const toggleInspector = () => {
    if (pane) {
      setPdfOpen(false);
      setInspector(true);
    } else setInspector((open) => !open);
  };

  const toProblem = (run: typeof nextDiagnostic) => () => {
    if (!view) return;
    view.focus();
    run(view);
  };
  const handlers: ShortcutHandlers = {
    outline: () => setOutline((open) => !open),
    inspector: toggleInspector,
    focus: () => setFocus((on) => !on),
    nextProblem: toProblem(nextDiagnostic),
    previousProblem: toProblem(previousDiagnostic),
    syntax: () => setDialog('syntax'),
    palette: () => setDialog('palette'),
    // Left alone outside focus mode, so Escape keeps its other uses.
    ...(focus ? { escape: () => setFocus(false) } : {}),
  };
  const latest = useRef(handlers);
  latest.current = handlers;
  useShortcuts(handlers);

  // A dialog closes back to the editor.
  const closeDialog = () => {
    setDialog(null);
    view?.focus();
  };

  // What a palette row does, once the palette is closed. An outline item is
  // found again in the outline as it is now.
  const runPalette = (action: PaletteAction) => {
    closeDialog();
    switch (action.kind) {
      case 'go': {
        const item = view && resolveItem(outlineOf(view.state), action);
        if (view && item) jumpTo(view, item.head);
        return;
      }
      case 'shortcut':
        latest.current[action.id]?.();
        return;
      case 'status':
        setStatus(doc, action.status);
        return;
      case 'projects':
        navigate('/');
        return;
    }
  };

  // The status bar's counts open the inspector at its Checks.
  const showChecks = () => {
    setFocus(false);
    setInspector(true);
    setSection('checks', true);
    requestAnimationFrame(() => document.querySelector('.inspector .checks')?.scrollIntoView({ block: 'nearest' }));
  };

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
      wideRight={pane}
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
            className={`tb hide-in-focus${inspector && !pane ? ' on' : ''}`}
            title={label('inspector')}
            aria-label="Inspector"
            aria-pressed={inspector && !pane}
            onClick={toggleInspector}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M15 4v16" />
            </svg>
          </button>
          {checked && (
            <button
              className="tb primary hide-in-focus"
              title="PDF preview"
              aria-pressed={pane}
              onClick={() => setPdfOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 3h9l4 4v14H6z" />
                <path d="M14 3v5h5" />
              </svg>
              PDF
            </button>
          )}
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
          <button
            className="kbd hide-in-focus"
            title={shortcut('palette').label}
            aria-label={shortcut('palette').label}
            onClick={() => setDialog('palette')}
          >
            {keyLabel(shortcut('palette').keys)}
          </button>
        </div>
      }
      left={outline ? <OutlinePanel view={view} updates={updates} /> : undefined}
      right={
        pane ? (
          <PdfPane
            view={view}
            updates={updates}
            snapshot={pdfSnapshot}
            onReview={() => {}}
            onClose={() => setPdfOpen(false)}
            onJump={jumpFromPdf}
          />
        ) : inspector ? (
          <Inspector
            doc={doc}
            projectId={meta.id}
            checked={checked}
            view={view}
            updates={updates}
            sections={sections}
            setSection={setSection}
          />
        ) : undefined
      }
      status={<StatusBar view={view} updates={updates} onProblems={showChecks} />}
    >
      <Editor doc={doc} checked={checked} extensions={extensions} onView={setView} />
      {pdfSnapshot && <PdfSource svg={pdfSnapshot.good?.svg ?? null} />}
      {dialog === 'syntax' && <SyntaxSheet checked={checked} onClose={closeDialog} />}
      {dialog === 'palette' && (
        <CommandPalette view={view} updates={updates} checked={checked} onRun={runPalette} onClose={closeDialog} />
      )}
    </Shell>
  );
}
