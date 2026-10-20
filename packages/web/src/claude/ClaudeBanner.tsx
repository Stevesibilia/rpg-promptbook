import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api, ApiError, type SnapshotRow } from '../api.js';
import { clockTime, dayOf } from '../dates.js';
import { useSnapshots } from '../history/useSnapshots.js';
import { projectPath } from '../project/top.js';
import { Confirm } from '../ui/Confirm.js';
import { useToast } from '../ui/Toast.js';
import { loadDismissed, saveDismissed, showBanner, type Dismissed } from './banner.js';
import { NeedsServer } from '../desktop/NeedsServer.js';
import { useOffline } from '../desktop/useDevice.js';

// «at 21:14» today, «on 17 Oct at 21:14» another day.
function whenOf(iso: string): string {
  const date = new Date(iso);
  const today = new Date().toDateString() === date.toDateString();
  return today ? `at ${clockTime(date)}` : `on ${dayOf(iso)} at ${clockTime(date)}`;
}

// The Document view's strip after Claude edited the project (connector design
// decision 13): what Claude edited and when, Compare, Undo and ✕. Shown for
// the newest Claude snapshot until this device dismisses or undoes it.
export function ClaudeBanner({ projectId }: { projectId: string }) {
  const { snapshots } = useSnapshots(projectId, { kind: 'claude', limit: 1 });
  const newest = snapshots?.[0] ?? null;
  const [dismissed, setDismissed] = useState<Dismissed | null>(() => loadDismissed(projectId));
  // What went wrong with an undo, for the snapshot it was tried on.
  const [problem, setProblem] = useState<{ id: string; kind: 'changed' | 'gone' } | null>(null);
  const [confirming, setConfirming] = useState<SnapshotRow | null>(null);
  const offline = useOffline();
  const [toast, showToast] = useToast();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const dismiss = (snapshot: SnapshotRow) => {
    saveDismissed(projectId, snapshot);
    setDismissed({ id: snapshot.id, at: snapshot.createdAt });
    setProblem(null);
  };

  // Answers when the undo is settled one way or the other; refusals other
  // than these two stay in the dialog.
  async function undo(snapshot: SnapshotRow) {
    try {
      await api.undoClaudeEdit(projectId, snapshot.id);
    } catch (e) {
      const kind =
        e instanceof ApiError && (e.code === 'section_changed' ? 'changed' : e.status === 404 ? 'gone' : null);
      if (!kind) throw e;
      if (alive.current) setProblem({ id: snapshot.id, kind });
      return;
    }
    if (!alive.current) return;
    dismiss(snapshot);
    showToast(`Undone. Claude's text is in History as «Before undoing».`);
  }

  const shown = newest && (showBanner(newest, dismissed) || problem?.id === newest.id) ? newest : null;
  const issue = shown && problem?.id === shown.id ? problem.kind : null;

  return (
    <>
      {shown && (
        <div className="claude-banner" role="status">
          <span className="avatar cl sm" aria-hidden="true">
            C
          </span>
          {issue === 'changed' ? (
            <span className="msg warn">
              This part changed after Claude's edit. Use{' '}
              <Link className="link" to={projectPath(projectId, 'history')}>
                History
              </Link>{' '}
              to restore the whole document.
            </span>
          ) : issue === 'gone' ? (
            <span className="msg warn">This edit is no longer in History, so it cannot be undone.</span>
          ) : (
            <>
              <span className="msg">
                <b>Claude</b> edited <b className="what">{shown.label}</b> {whenOf(shown.createdAt)}
              </span>
              <span className="sep">·</span>
              <Link
                className="link"
                to={`${projectPath(projectId, 'history')}?compare=${encodeURIComponent(shown.id)}`}
              >
                Compare
              </Link>
              <span className="sep">·</span>
              <NeedsServer>
                <button className="link" onClick={() => setConfirming(shown)} disabled={offline}>
                  Undo
                </button>
              </NeedsServer>
            </>
          )}
          <span className="spacer" />
          {!issue && <span className="hint-r">Undo puts back what Claude replaced</span>}
          <button className="tb" title="Dismiss" aria-label="Dismiss" onClick={() => dismiss(shown)}>
            ✕
          </button>
        </div>
      )}
      {confirming && (
        <Confirm
          title="Undo Claude's edit?"
          note="What Claude wrote is saved as a snapshot first."
          action="Undo the edit"
          onConfirm={() => undo(confirming)}
          onClose={() => setConfirming(null)}
        >
          <b>{confirming.label}</b> goes back to its text from before Claude's edit {whenOf(confirming.createdAt)}. Text
          you typed elsewhere stays.
        </Confirm>
      )}
      {toast}
    </>
  );
}
