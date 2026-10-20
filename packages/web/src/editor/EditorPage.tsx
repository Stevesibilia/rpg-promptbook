import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { nextDiagnostic, previousDiagnostic } from '@codemirror/lint';
import { Prec } from '@codemirror/state';
import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';
import { blockAt, pageOf } from 'promptbook-layout';
import { readMeta, setStatus } from 'promptbook-project';
import type * as Y from 'yjs';
import { ClaudeBanner } from '../claude/ClaudeBanner.js';
import { platform } from '../platform/index.js';
import { HistoryButton, ProjectCrumbs, ProjectMetaControls } from '../project/top.js';
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
import { pdfFileName } from './pdf/pages.js';
import { PdfPane } from './pdf/PdfPane.js';
import { PdfReview } from './pdf/PdfReview.js';
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
// status bar; the PDF review over them.
export function EditorPage({ doc }: { doc: Y.Doc }) {
  const meta = useDocValue(doc, readMeta);
  const checked = meta.category !== 'campaign';

  const [outline, setOutline] = usePanel(OUTLINE_KEY);
  const [inspector, setInspector] = usePanel(INSPECTOR_KEY);
  const [sections, setSection] = useSections();
  const [focus, setFocus] = useState(false);
  const [view, setView] = useState<EditorView | null>(null);
  const [dialog, setDialog] = useState<'palette' | 'syntax' | null>(null);
  const navigate = useNavigate();
  const [pdfOpen, setPdfOpen] = usePanel(PDF_KEY, false);
  // The page the review opened on, while it is open.
  const [review, setReview] = useState<number | null>(null);
  const [pdfOptions, setPdfOptions] = usePdfOptions(meta.id);
  // The pane takes the inspector's place for adventures and one-shots.
  const pane = checked && pdfOpen;

  // The editor's updates, for the status bar.
  const listeners = useRef(new Set<(update: ViewUpdate) => void>());
  const updates = useCallback<UpdateSource>((listener) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);

  const {
    client: pdf,
    snapshot: pdfSnapshot,
    positions: pdfPositions,
  } = usePdf({
    view,
    updates,
    active: checked && ((pane && !focus) || review !== null),
    options: pdfOptions,
    title: meta.title,
  });
  const openReview = (page?: number) => {
    const good = pdfSnapshot?.good;
    const head = view?.state.selection.main.head ?? 0;
    setReview(page ?? (good ? Math.min(pageOf(pdfPositions(), head), good.pages.length) : 1));
  };
  const closeReview = () => {
    setReview(null);
    view?.focus();
  };
  // A double-click on a page: the text printed there, moved through the edits
  // made since the build read it.
  const jumpFromPdf = (page: number, y: number) => {
    const at = blockAt(pdfPositions(), page, y);
    if (!view || !at) return;
    setReview(null);
    jumpTo(view, at.from, 'center');
  };
  const savePdf = async () => {
    if (!pdf) return;
    const bytes = await pdf.pdf();
    await platform.download(
      new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
      pdfFileName(meta.title),
    );
  };
  // The PDF where it can be printed: in the browser a tab of its own, opened
  // at the click, before the build (platform/web.ts).
  const printPdf = async () => {
    if (!pdf) return;
    await platform.openPdf(pdf.pdf(), pdfFileName(meta.title));
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
  // While the review is open, only Escape, ⌘⇧P, ⌘K and its own keys act;
  // the editor's other shortcuts are swallowed.
  const swallowed = () => {};
  const handlers: ShortcutHandlers =
    review !== null
      ? {
          outline: swallowed,
          inspector: swallowed,
          focus: swallowed,
          syntax: swallowed,
          nextProblem: swallowed,
          previousProblem: swallowed,
          palette: () => setDialog('palette'),
          pdfReview: closeReview,
          escape: closeReview,
        }
      : {
          outline: () => setOutline((open) => !open),
          inspector: toggleInspector,
          focus: () => setFocus((on) => !on),
          nextProblem: toProblem(nextDiagnostic),
          previousProblem: toProblem(previousDiagnostic),
          syntax: () => setDialog('syntax'),
          palette: () => setDialog('palette'),
          ...(checked ? { pdfReview: () => openReview() } : {}),
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
      case 'pdf':
        setPdfOpen((open) => !open);
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
      project={meta.id}
      focus={focus}
      wideRight={pane}
      crumbs={<ProjectCrumbs meta={meta} />}
      topExtra={<ProjectMetaControls doc={doc} meta={meta} />}
      banner={<ClaudeBanner projectId={meta.id} />}
      topEnd={
        <div className="top-tools">
          <HistoryButton projectId={meta.id} />
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
            positions={pdfPositions}
            onReview={openReview}
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
      {review !== null && (
        <PdfReview
          snapshot={pdfSnapshot}
          initialPage={review}
          options={pdfOptions}
          setOptions={setPdfOptions}
          onClose={closeReview}
          onJump={jumpFromPdf}
          onSave={savePdf}
          onPrint={printPdf}
        />
      )}
      {dialog === 'syntax' && <SyntaxSheet checked={checked} onClose={closeDialog} />}
      {dialog === 'palette' && (
        <CommandPalette view={view} updates={updates} checked={checked} onRun={runPalette} onClose={closeDialog} />
      )}
    </Shell>
  );
}
