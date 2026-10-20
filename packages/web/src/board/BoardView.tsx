import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { appendixEdit, type ProjectMeta } from 'promptbook-project';
import type * as Y from 'yjs';
import { platform } from '../platform/index.js';
import { ProjectShell } from '../project/ProjectShell.js';
import { projectPath } from '../project/top.js';
import { BoardIcon, CheckIcon, HelpIcon, ImportIcon, PlusIcon, UpIcon, WarningIcon } from '../ui/icons.js';
import { useToast } from '../ui/Toast.js';
import { ClaudeCard } from './ClaudeCard.js';
import { BoardContext, usePlayer, type BoardContextValue } from './context.js';
import { DropOverlay, useWindowDrop } from './DropOverlay.js';
import { progressLine, resultLine, type IntakeState } from './intake.js';
import { MatchHelp } from './MatchHelp.js';
import { SceneRow } from './SceneRow.js';
import { filterCounts, filterLabels, filters, keeps, summarize, type Filter, type HalfCounts } from './summary.js';
import { Tray } from './Tray.js';
import { useBoard } from './useBoard.js';
import { useIntake } from './useIntake.js';
import { Viewer } from './Viewer.js';
import './board.css';

// The images and music board (asset-board design decision 12): one row per
// scene of the document's appendix, with its prompts and files, the files
// dropped anywhere on the window, the Unmatched tray and the viewer.
export function BoardView({ id, doc, meta }: { id: string; doc: Y.Doc; meta: ProjectMeta }) {
  const board = useBoard(doc);
  const { parsed, rows, tray } = board;
  const [intake, intakeState] = useIntake(id);
  const [toast, showToast] = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [help, setHelp] = useState(false);
  const [viewing, setViewing] = useState<{ sceneId: string; fileId: string } | null>(null);
  const player = usePlayer(id);
  const center = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  const hasRows = parsed !== null && rows.length > 0;
  const sceneIds = useMemo(() => rows.map((r) => r.sceneId), [rows]);
  useEffect(() => intake.setScenes(sceneIds), [intake, sceneIds]);

  // A track removed or moved away (here, by Claude, in another tab) stops.
  const playing = player.current;
  const stop = player.stop;
  useEffect(() => {
    if (playing && !board.files.some((f) => f.id === playing)) stop();
  }, [playing, board.files, stop]);

  const drag = useWindowDrop(hasRows, (files) => intake.add(files));
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
  const beingEdited = (sceneId: string) => editing.has(`${sceneId}/image`) || editing.has(`${sceneId}/music`);

  const context: BoardContextValue = {
    doc,
    projectId: id,
    rows,
    marks: intakeState.marks,
    toast: showToast,
    openViewer: (sceneId, fileId) => setViewing({ sceneId, fileId }),
    player,
    mark: (fileId) => intake.mark(fileId),
    editing,
    setEditing,
  };

  const status = (
    <>
      <span>Images and music</span>
      {parsed && <span>{hasRows ? `${rows.length} ${rows.length === 1 ? 'scene' : 'scenes'}` : 'No appendix'}</span>}
    </>
  );

  return (
    <ProjectShell id={id} doc={doc} meta={meta} view="board" status={status}>
      <BoardContext.Provider value={context}>
        <div className="pane board" ref={center}>
          <div className="head">
            <h1>Images and music</h1>
            <p className="lead">One row per scene, from the document's appendix. For the table and the CueBard export.</p>
            <span className="spacer" />
            {hasRows && (
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
            {help && hasRows && <MatchHelp rows={rows} onClose={closeHelp} />}
          </div>

          {parsed === null ? (
            <p className="loading">Reading the appendix…</p>
          ) : hasRows ? (
            <>
              <Summary rows={rows} filter={filter} setFilter={setFilter} />
              {!rows.some((r) => r.image?.prompt || r.music?.title) && (
                <ClaudeCard title={meta.title} onToast={showToast} />
              )}
              <Strips state={intakeState} onDismiss={() => intake.dismissResult()} intake={intake} />
              <Tray
                files={tray}
                onHelp={() => {
                  setHelp(true);
                  center.current?.closest('.center')?.scrollTo({ top: 0 });
                }}
              />
              <div className="rows">
                {rows
                  .filter((row) => keeps(row, filter) || beingEdited(row.sceneId))
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
          {drag && <DropOverlay count={drag} />}
          {viewing && (
            <Viewer
              sceneId={viewing.sceneId}
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

function Summary({
  rows,
  filter,
  setFilter,
}: {
  rows: Parameters<typeof summarize>[0];
  filter: Filter;
  setFilter(filter: Filter): void;
}) {
  const sum = summarize(rows);
  const counts = filterCounts(rows);
  const part = (c: HalfCounts) => (
    <>
      <b>{c.chosen}</b> chosen, <b>{c.received}</b> received, <b>{c.wanted}</b> wanted
    </>
  );
  return (
    <div className="sumline">
      <span className="summary">
        <b>{sum.scenes}</b> {sum.scenes === 1 ? 'scene' : 'scenes'}
        <span className="sep">·</span>images {part(sum.images)}
        <span className="sep">·</span>music {part(sum.music)}
      </span>
      <span className="spacer" />
      <div className="segwrap">
        <div className="seg" role="group" aria-label="Filter the rows">
          {filters.map((f) => (
            <button key={f} className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {filterLabels[f]}
              <span className="n">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// The progress of a batch, then its result; the files that could not be
// added, with Retry.
function Strips({
  state,
  intake,
  onDismiss,
}: {
  state: IntakeState;
  intake: ReturnType<typeof useIntake>[0];
  onDismiss(): void;
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
            <b>{result.head}</b> {result.rest}
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
