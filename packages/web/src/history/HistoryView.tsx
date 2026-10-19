import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { readDocument, type ProjectMeta } from 'promptbook-project';
import type * as Y from 'yjs';
import { api, ApiError, type Snapshot, type SnapshotRow } from '../api.js';
import { snapshotTime } from '../dates.js';
import { projectPath } from '../project/top.js';
import { useDocValue } from '../sync/hooks.js';
import { Confirm } from '../ui/Confirm.js';
import { useToast } from '../ui/Toast.js';
import { diffRows } from './diff.js';
import { kindClasses, kindLabels, snapshotKept, snapshotTitle, wordCount } from './labels.js';
import { useSnapshots } from './useSnapshots.js';
import { documentWords } from './words.js';

function useAlive() {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return alive;
}

// History (connector specs, snapshots): Save snapshot, Now and the
// snapshots newest first, Compare, Restore, Delete on the user's own;
// `?compare=<id>` opens Compare.
export function HistoryView({ doc, projectId, meta }: { doc: Y.Doc; projectId: string; meta: ProjectMeta }) {
  const [params] = useSearchParams();
  const compare = params.get('compare');
  const list = useSnapshots(projectId);
  const [restoring, setRestoring] = useState<SnapshotRow | null>(null);
  const [toast, showToast] = useToast();
  const navigate = useNavigate();
  const alive = useAlive();

  async function restore(snapshot: SnapshotRow) {
    await api.restoreSnapshot(projectId, snapshot.id);
    if (!alive.current) return;
    list.refresh();
    showToast(
      `Restored the snapshot of ${snapshotTime(snapshot.createdAt)}. The text before it is in History as «Before restore».`,
    );
    if (compare) navigate(projectPath(projectId, 'history'));
  }

  return (
    <div className="pane">
      {compare ? (
        <Compare
          key={compare}
          doc={doc}
          projectId={projectId}
          id={compare}
          onRestore={setRestoring}
          onBack={() => navigate(projectPath(projectId, 'history'))}
        />
      ) : (
        <SnapshotList
          doc={doc}
          projectId={projectId}
          meta={meta}
          list={list}
          onRestore={setRestoring}
          onToast={showToast}
        />
      )}
      {restoring && (
        <Confirm
          title="Restore this version?"
          action="Restore"
          note="The current text is saved as a snapshot first."
          onConfirm={() => restore(restoring)}
          onClose={() => setRestoring(null)}
        >
          The document goes back to the snapshot of {snapshotTime(restoring.createdAt)}: «{snapshotTitle(restoring)}».
        </Confirm>
      )}
      {toast}
    </div>
  );
}

function SnapshotList({
  doc,
  projectId,
  meta,
  list,
  onRestore,
  onToast,
}: {
  doc: Y.Doc;
  projectId: string;
  meta: ProjectMeta;
  list: ReturnType<typeof useSnapshots>;
  onRestore(snapshot: SnapshotRow): void;
  onToast(message: string): void;
}) {
  const text = useDeferredValue(useDocValue(doc, readDocument));
  const words = useMemo(() => documentWords(text, meta.category), [text, meta.category]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SnapshotRow | null>(null);
  const navigate = useNavigate();
  const alive = useAlive();

  async function save() {
    const label = name.trim();
    if (!label) return setError('Give the snapshot a name.');
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.createSnapshot(projectId, label);
      if (!alive.current) return;
      setName('');
      list.refresh();
      onToast('Snapshot saved.');
    } catch (e) {
      if (alive.current) setError(e instanceof ApiError ? e.message : 'The snapshot could not be saved.');
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  async function remove(snapshot: SnapshotRow) {
    try {
      await api.deleteSnapshot(projectId, snapshot.id);
    } catch (e) {
      // Already gone, here or in another tab: the list shows it so.
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    }
    if (alive.current) list.refresh();
  }

  return (
    <>
      <div className="head">
        <h1>History</h1>
        <p className="lead">Snapshots of the prep document. Restoring never loses the current text.</p>
      </div>
      <div className="card row snap-save">
        <b style={{ marginRight: 4 }}>Save snapshot</b>
        <input
          aria-label="Snapshot name"
          placeholder="Name, e.g. before the read-through"
          maxLength={200}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
        />
        <button className="tb primary" disabled={saving} onClick={() => void save()}>
          Save snapshot
        </button>
        {error && (
          <span className="err inline-err" role="alert">
            {error}
          </span>
        )}
      </div>
      <div className="snap" role="table" aria-label="Snapshots">
        <div className="sr th" role="row">
          <span>When</span>
          <span>Snapshot</span>
          <span style={{ textAlign: 'right' }}>Words</span>
          <span />
        </div>
        <div className="sr now" role="row">
          <span className="when">Now</span>
          <span className="k">
            <b>Current text</b>
          </span>
          <span className="w">{wordCount(words)}</span>
          <span className="a" />
        </div>
        {list.snapshots === null && !list.error && <div className="sr none">Reading the snapshots…</div>}
        {list.error && (
          <div className="sr none err" role="alert">
            {list.error}
          </div>
        )}
        {list.snapshots?.length === 0 && <div className="sr none">No snapshots yet.</div>}
        {list.snapshots?.map((s) => (
          <div className="sr" role="row" key={s.id}>
            <span className="when">{snapshotTime(s.createdAt)}</span>
            <span className="k">
              <span className={`who-chip ${kindClasses[s.kind]}`}>{kindLabels[s.kind]}</span>
              <b>{snapshotTitle(s)}</b>
              <div className="meta">{snapshotKept(s)}</div>
            </span>
            <span className="w">{wordCount(s.words)}</span>
            <span className="a">
              <button
                className="tb sm line"
                onClick={() => navigate(`${projectPath(projectId, 'history')}?compare=${encodeURIComponent(s.id)}`)}
              >
                Compare
              </button>
              <button className="tb sm line" onClick={() => onRestore(s)}>
                Restore
              </button>
              {s.kind === 'user' && (
                <button className="tb sm danger" onClick={() => setDeleting(s)}>
                  Delete
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
      <p className="hint">Claude's snapshots are kept 30 days; yours until you delete them.</p>
      {deleting && (
        <Confirm
          title="Delete this snapshot?"
          action="Delete"
          danger
          note="The prep document is not touched."
          onConfirm={() => remove(deleting)}
          onClose={() => setDeleting(null)}
        >
          «{deleting.label}» of {snapshotTime(deleting.createdAt)} is removed from History.
        </Confirm>
      )}
    </>
  );
}

function Compare({
  doc,
  projectId,
  id,
  onRestore,
  onBack,
}: {
  doc: Y.Doc;
  projectId: string;
  id: string;
  onRestore(snapshot: SnapshotRow): void;
  onBack(): void;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The view is keyed by the snapshot's id, so one answer only ever reaches
  // it; `alive` drops the answer of a view already left.
  const alive = useAlive();
  useEffect(() => {
    api
      .snapshot(projectId, id)
      .then(({ snapshot }) => alive.current && setSnapshot(snapshot))
      .catch((e: unknown) => {
        if (!alive.current) return;
        setError(
          e instanceof ApiError && e.status === 404
            ? 'This snapshot is no longer in History: it expired or was deleted.'
            : e instanceof ApiError
              ? e.message
              : 'The snapshot could not be read.',
        );
      });
  }, [projectId, id, alive]);

  const text = useDeferredValue(useDocValue(doc, readDocument));
  const diff = useMemo(() => (snapshot ? diffRows(snapshot.text, text) : null), [snapshot, text]);

  return (
    <>
      <div className="head">
        <button className="tb line" onClick={onBack}>
          ← History
        </button>
        <h1>Compare</h1>
        {snapshot && <p className="lead">Snapshot of {snapshotTime(snapshot.createdAt)} → now</p>}
      </div>
      {error && <p className="empty-line">{error}</p>}
      {!snapshot && !error && <p className="loading">Reading the snapshot…</p>}
      {snapshot && diff && (
        <>
          <div className="card row" style={{ justifyContent: 'space-between' }}>
            <span>
              <span className={`who-chip ${kindClasses[snapshot.kind]}`}>{kindLabels[snapshot.kind]}</span>
              {snapshotTitle(snapshot)}
            </span>
            <span className="row">
              <span className="diff-counts">
                <span className="plus">+{diff.added}</span> · <span className="minus">−{diff.removed}</span> lines ·
                unified
              </span>
              <button className="tb primary" onClick={() => onRestore(snapshot)}>
                Restore this version
              </button>
            </span>
          </div>
          {diff.rows.length === 0 ? (
            <p className="empty-line">No difference: the snapshot holds the current text.</p>
          ) : (
            <div className="diff" role="table" aria-label="Changes from the snapshot to now">
              {diff.rows.map((row, i) =>
                row.kind === 'gap' ? (
                  <div className="dl hunk" role="row" key={i}>
                    <span className="n" />
                    <span className="n" />
                    <span className="g" />
                    <span className="t">{row.text}</span>
                  </div>
                ) : (
                  <div
                    className={`dl${row.kind === 'add' ? ' ins' : row.kind === 'del' ? ' rem' : ''}`}
                    role="row"
                    key={i}
                  >
                    <span className="n">{row.old ?? ''}</span>
                    <span className="n">{row.new ?? ''}</span>
                    <span className="g">{row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ''}</span>
                    <span className="t">{row.text}</span>
                  </div>
                ),
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
