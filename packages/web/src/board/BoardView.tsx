import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { appendixEdit, namedCategories, type BoardRow, type ProjectMeta } from 'promptbook-project';
import type * as Y from 'yjs';
import { platform } from '../platform/index.js';
import { ProjectShell } from '../project/ProjectShell.js';
import { projectPath } from '../project/top.js';
import { CuebardDialog } from '../export/CuebardDialog.js';
import { BoardIcon, CheckIcon, ExportIcon, HelpIcon, ImportIcon, LaptopIcon, PlusIcon, UpIcon, WarningIcon } from '../ui/icons.js';
import { useToast } from '../ui/Toast.js';
import { useOffline } from '../desktop/useDevice.js';
import { ClaudeCard } from './ClaudeCard.js';
import { localLine, useLocalFiles } from './device.js';
import { CategoryTabs } from './CategoryTabs.js';
import { BoardContext, held, usePlayer, type Adding, type BoardContextValue } from './context.js';
import { DropOverlay, useWindowDrop } from './DropOverlay.js';
import { progressLine, resultLine, type IntakeState, type ResultPlace } from './intake.js';
import { MatchHelp } from './MatchHelp.js';
import { NamedGrid, NamedSummary } from './NamedGrid.js';
import { Counts, SummaryLine } from './parts.js';
import { SceneRow } from './SceneRow.js';
import {
  categoryOf,
  categoryText,
  keepsRow,
  rowFilterCounts,
  summarizeScenes,
  tabOf,
  tabParam,
  type Filter,
  type Tab,
} from './summary.js';
import { Tray } from './Tray.js';
import { useBoard } from './useBoard.js';
import { useIntake } from './useIntake.js';
import { Viewer } from './Viewer.js';
import './board.css';

// The images and music board (asset-board design decision 12,
// image-categories design decision 7): the category tabs; on Scenes one row
// per scene of the document's appendix with its image prompts and music; on
// PCs, NPCs and Handouts one card per prompt. Files are dropped anywhere on
// the window; the Unmatched tray and the viewer serve every tab.
export function BoardView({ id, doc, meta }: { id: string; doc: Y.Doc; meta: ProjectMeta }) {
  const board = useBoard(doc);
  const { parsed, rows, named, shown, tray } = board;
  const [intake, intakeState] = useIntake(id);
  const [toast, showToast] = useToast();
  const [params, setParams] = useSearchParams();
  const tab = tabParam(params.get('tab'));
  const [filter, setFilter] = useState<Filter>('all');
  const [help, setHelp] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [viewing, setViewing] = useState<{ promptId: string; fileId: string } | null>(null);
  const [adding, setAdding] = useState<Adding | null>(null);
  const player = usePlayer(id);
  const center = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  // The row a result line's link scrolls to once its tab shows.
  const scrollTo = useRef<string | null>(null);

  const loaded = parsed !== null;
  const hasRows = loaded && rows.length > 0;
  const sceneIds = useMemo(() => rows.map((r) => r.sceneId), [rows]);
  useEffect(() => intake.setScenes(sceneIds), [intake, sceneIds]);

  // A track removed or moved away (here, by Claude, in another tab) stops.
  const playing = player.current;
  const stop = player.stop;
  useEffect(() => {
    if (playing && !board.files.some((f) => f.id === playing)) stop();
  }, [playing, board.files, stop]);

  // Images can match PCs, NPCs and handouts with no appendix (O7): dropping
  // works as soon as the board has loaded.
  const drag = useWindowDrop(loaded, (files) => intake.add(files));
  const closeViewer = useCallback(() => setViewing(null), []);
  const closeHelp = useCallback(() => setHelp(false), []);
  const [editing, setEditingKeys] = useState<ReadonlySet<string>>(new Set());
  const setEditing = useCallback(
    (key: string, on: boolean) =>
      setEditingKeys((keys) => {
        if (keys.has(key) === on) return keys;
        const next = new Set(keys);
        if (on) next.add(key);
        else next.delete(key);
        return next;
      }),
    [],
  );
  // A row with an editor open, or the new prompt, stays whatever the filter.
  const beingEdited = (row: BoardRow) =>
    editing.has(`${row.sceneId}/music`) ||
    editing.has(`${row.sceneId}/track`) ||
    row.prompts.some((p) => held(editing, p.prompt.id)) ||
    (adding?.category === 'scene' && adding.sceneId === row.sceneId);

  const toTop = () => center.current?.closest('.center')?.scrollTo({ top: 0 });
  const setTab = (next: Tab) => {
    if (next !== tab) setParams(next === 'scenes' ? {} : { tab: next }, { replace: false });
    toTop();
  };
  useEffect(() => {
    const sceneId = scrollTo.current;
    if (tab !== 'scenes' || sceneId === null) return;
    scrollTo.current = null;
    document.getElementById(`row-${sceneId}`)?.scrollIntoView({ block: 'start' });
  });
  // A link of the result line: its tab, its row, with every row and card
  // shown, so a filter never hides what it points at.
  const goTo = (place: ResultPlace) => {
    setFilter('all');
    if (place.category !== 'scene') return setTab(tabOf[place.category]);
    if (tab === 'scenes') {
      scrollTo.current = null;
      document.getElementById(`row-${place.sceneId}`)?.scrollIntoView({ block: 'start' });
      return;
    }
    scrollTo.current = place.sceneId;
    setParams({}, { replace: false });
  };

  const context: BoardContextValue = {
    doc,
    projectId: id,
    rows,
    named,
    shown,
    marks: intakeState.marks,
    toast: showToast,
    openViewer: (promptId, fileId) => setViewing({ promptId, fileId }),
    player,
    mark: (fileId) => intake.mark(fileId),
    editing,
    setEditing,
    adding,
    setAdding,
  };

  const prompts = shown.size;
  const status = (
    <>
      <span>Images and music</span>
      {parsed && (
        <span>
          {hasRows ? `${rows.length} ${rows.length === 1 ? 'scene' : 'scenes'}` : 'No appendix'} · {prompts}{' '}
          {prompts === 1 ? 'image prompt' : 'image prompts'}
        </span>
      )}
    </>
  );
  const noPrompts =
    ![...shown.values()].some((p) => p.row.prompt.prompt.trim() !== '') && !rows.some((r) => r.music?.title);
  const category = categoryOf[tab];

  return (
    <ProjectShell id={id} doc={doc} meta={meta} view="board" status={status}>
      <BoardContext.Provider value={context}>
        <div className="pane board" ref={center}>
          <div className="head">
            <h1>Images and music</h1>
            <p className="lead">
              Image prompts for scenes, PCs, NPCs and handouts; music for each scene. For the table and the CueBard
              export.
            </p>
            <span className="spacer" />
            {loaded && (
              <span className="row acts">
                <button
                  className="tb line sm"
                  data-help-toggle
                  aria-expanded={help}
                  onClick={() => setHelp((open) => !open)}
                >
                  <HelpIcon />
                  How matching works
                </button>
                <button className="tb line sm" aria-haspopup="dialog" onClick={() => setExporting(true)}>
                  <ExportIcon />
                  Export for CueBard…
                </button>
                <button className="tb primary sm" onClick={() => picker.current?.click()}>
                  <ImportIcon />
                  Add files…
                </button>
                <input
                  ref={picker}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,audio/*,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.aac,.wav,.ogg,.flac"
                  hidden
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = '';
                    intake.add(files);
                  }}
                />
              </span>
            )}
            {help && loaded && <MatchHelp rows={rows} named={named} shown={shown} onClose={closeHelp} />}
            {exporting && loaded && (
              <CuebardDialog projectId={id} doc={doc} onClose={() => setExporting(false)} onToast={showToast} />
            )}
          </div>

          {parsed === null ? (
            <p className="loading">Reading the appendix…</p>
          ) : (
            <>
              <CategoryTabs tab={tab} onTab={setTab} rows={rows} named={named} marks={intakeState.marks} />
              {category === 'scene' ? (
                hasRows && <ScenesSummary rows={rows} filter={filter} setFilter={setFilter} />
              ) : (
                <NamedSummary category={category} filter={filter} setFilter={setFilter} />
              )}
              {noPrompts && <ClaudeCard title={meta.title} onToast={showToast} />}
              <OfflineLine projectId={id} />
              <Strips state={intakeState} onDismiss={() => intake.dismissResult()} intake={intake} onPlace={goTo} />
              <Tray
                files={tray}
                onHelp={() => {
                  setHelp(true);
                  toTop();
                }}
              />
              {/* Every tab stays mounted, the others hidden, so an editor's
                  draft outlives a change of tab. */}
              <div role="tabpanel" aria-label="Scenes" hidden={tab !== 'scenes'}>
                {hasRows ? (
                  <>
                    <div className="rows">
                      {rows
                        .filter((row) => keepsRow(row, filter) || beingEdited(row))
                        .map((row) => (
                          <SceneRow key={row.sceneId} row={row} filter={filter} />
                        ))}
                    </div>
                    <p className="hint" style={{ marginTop: 14 }}>
                      Rows follow the appendix. Add or rename a scene there and the board follows.
                    </p>
                  </>
                ) : (
                  <NoAppendix doc={doc} id={id} board={board} onToast={showToast} />
                )}
              </div>
              {namedCategories.map((c) => (
                <div key={c} role="tabpanel" aria-label={categoryText[c].tab} hidden={category !== c}>
                  <NamedGrid category={c} title={meta.title} filter={filter} setFilter={setFilter} />
                </div>
              ))}
            </>
          )}
          {drag && <DropOverlay count={drag} />}
          {viewing && (
            <Viewer
              promptId={viewing.promptId}
              fileId={viewing.fileId}
              onShow={(fileId) => setViewing((v) => v && { ...v, fileId })}
              onClose={closeViewer}
            />
          )}
          {toast}
        </div>
      </BoardContext.Provider>
    </ProjectShell>
  );
}

// «6 scenes · 8 image prompts: 3 chosen, 4 received, 1 wanted · music 2
// chosen, 3 received, 1 wanted».
function ScenesSummary({ rows, filter, setFilter }: { rows: BoardRow[]; filter: Filter; setFilter(f: Filter): void }) {
  const sum = summarizeScenes(rows);
  return (
    <SummaryLine counts={rowFilterCounts(rows)} filter={filter} setFilter={setFilter} label="Filter the rows">
      <b>{sum.scenes}</b> {sum.scenes === 1 ? 'scene' : 'scenes'}
      <span className="sep">·</span>
      {sum.prompts} {sum.prompts === 1 ? 'image prompt' : 'image prompts'}: <Counts counts={sum.images} />
      <span className="sep">·</span>music <Counts counts={sum.music} />
    </SummaryLine>
  );
}

// Screen 8: offline on the desktop, the files added here wait to upload.
function OfflineLine({ projectId }: { projectId: string }) {
  const offline = useOffline();
  const local = useLocalFiles(projectId);
  const waiting = [...local.values()].filter((refused) => refused === null).length;
  if (!offline || waiting === 0) return null;
  return (
    <div className="info local" role="status">
      <LaptopIcon className="ic" />
      <span>
        <b>{localLine(waiting)}</b> Choosing and editing prompts work offline; they sync too.
      </span>
    </div>
  );
}

// The progress of a batch, then its result; the files that could not be
// added, with Retry.
function Strips({
  state,
  intake,
  onDismiss,
  onPlace,
}: {
  state: IntakeState;
  intake: ReturnType<typeof useIntake>[0];
  onDismiss(): void;
  onPlace(place: ResultPlace): void;
}) {
  const where = platform.kind === 'web' ? 'browser' : 'desktop';
  const result = state.result && resultLine(state.result);
  return (
    <>
      {state.working ? (
        <div className="info" role="status">
          <UpIcon className="ic" />
          <span>{progressLine(state, where)}</span>
        </div>
      ) : result ? (
        <div className="info good" role="status">
          <CheckIcon className="ic" />
          <span>
            <b>{result.head}</b>{' '}
            {result.places.map((place, i) => (
              <Fragment key={place.key}>
                {i > 0 && ' · '}
                <button className="lnk" onClick={() => onPlace(place)}>
                  {place.label}
                </button>
                : {place.counts}
              </Fragment>
            ))}
            {result.places.length > 0 && '. '}
            {result.rest}
          </span>
          <button className="tb xs x" title="Dismiss" aria-label="Dismiss" onClick={onDismiss}>
            ✕
          </button>
        </div>
      ) : null}
      {state.failed.length > 0 && (
        <div className="info bad" role="alert">
          {state.failed.map((f) => (
            <div className="failed-row" key={f.key}>
              <WarningIcon className="ic" />
              <span className="fn" title={f.name}>
                {f.name}
              </span>
              <span className="why">{f.message}</span>
              {f.retry && (
                <button className="tb xs line" onClick={() => intake.retry(f.key)}>
                  Retry
                </button>
              )}
              <button className="tb xs" title="Dismiss" aria-label={`Dismiss ${f.name}`} onClick={() => intake.dismiss(f.key)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// «S1 to S6», «S1», or nothing without scenes.
function sceneRange(ids: string[]): string {
  if (ids.length === 0) return '';
  if (ids.length === 1) return ` (${ids[0]})`;
  return ` (${ids[0]} to ${ids.at(-1)})`;
}

// Screen 3: no appendix, or one with no rows.
function NoAppendix({
  doc,
  id,
  board,
  onToast,
}: {
  doc: Y.Doc;
  id: string;
  board: ReturnType<typeof useBoard>;
  onToast(message: string): void;
}) {
  const [busy, setBusy] = useState(false);
  const ids = [...new Set(board.parsed!.model.scenes.flatMap((s) => (s.id ? [s.id] : [])))];

  // The edit is computed against the text as parsed: when the text moved on
  // meanwhile, parsed again first.
  async function add() {
    if (busy) return;
    setBusy(true);
    try {
      const text = doc.getText('document');
      for (let attempt = 0; attempt < 5; attempt++) {
        const parsed = await board.parseNow();
        if (parsed.text !== text.toString()) continue;
        const edit = appendixEdit(parsed.text, parsed.model);
        if (edit) {
          doc.transact(() => {
            if (edit.to > edit.from) text.delete(edit.from, edit.to - edit.from);
            text.insert(edit.from, edit.insert);
          });
        }
        const n = new Set(parsed.model.scenes.flatMap((s) => (s.id ? [s.id] : []))).size;
        onToast(`Appendix added with ${n} ${n === 1 ? 'scene' : 'scenes'}. Fill in visual: and mood:, or ask Claude.`);
        return;
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card emptyst">
      <div className="big-ic">
        <BoardIcon className="ic" />
      </div>
      <h2>No scenes for the board yet</h2>
      <p>
        The board makes one row per scene from the appendix{' '}
        <b style={{ color: 'var(--text)' }}>Appendice: immagini e musica</b> at the end of the document. This document
        has no appendix, or the appendix has no scenes.
      </p>
      <pre>
        <b>## Appendice: immagini e musica</b>
        {'\n\n'}
        <b>### S1. La casa che cede</b>
        {'\n\nvisual: collapsed 1900s Sicilian library at night, …\n\nmood: chaotic, suffocating, low rumbling drones, …'}
      </pre>
      <div className="row">
        <button className="tb primary" disabled={busy} onClick={() => void add()}>
          <PlusIcon />
          Add the appendix
        </button>
        <Link className="tb line" to={projectPath(id)}>
          Open the document
        </Link>
      </div>
      <p className="hint" style={{ margin: '10px 0 0' }}>
        Add the appendix writes the heading and one row per scene{sceneRange(ids)} with empty <code>visual:</code> and{' '}
        <code>mood:</code> lines. Claude can fill them in.
      </p>
    </div>
  );
}
