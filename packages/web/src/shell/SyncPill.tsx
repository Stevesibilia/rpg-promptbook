import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/context.js';
import { clockTime, relativeTime } from '../dates.js';
import { registry } from '../sync/registry.js';
import { useSync } from '../sync/hooks.js';
import { stateLabels, type SyncState } from '../sync/state.js';
import { pendingChanges } from '../sync/state.js';

const pillClass: Record<SyncState, string> = {
  synced: '',
  syncing: 'busy',
  reconnecting: 'local',
  'not-saved': 'fail',
  'signed-out': 'out',
};

export const unsentCount = (providers: { unsynced: number }[]) => providers.reduce((n, p) => n + p.unsynced, 0);

const changes = (n: number) => `${n} change${n === 1 ? '' : 's'}`;

function explanation(state: SyncState, unsent: number): string {
  switch (state) {
    case 'synced':
      return 'Every change is on the server.';
    case 'syncing':
      return unsent ? `Sending ${changes(unsent)}.` : 'Receiving the latest changes.';
    case 'reconnecting':
      return unsent
        ? `The connection dropped. ${changes(unsent)} ${unsent === 1 ? 'is' : 'are'} only in this tab: keep it open until they are sent.`
        : 'The connection dropped. Promptbook reconnects on its own.';
    case 'not-saved':
      return 'The server could not store the last changes. Copy your text before closing the tab.';
    case 'signed-out':
      return 'The session ended. Sign in again in this tab: unsent changes are kept until then.';
  }
}

// The pill in the top bar and the panel it opens; the avatar opens it too.
export function SyncPill() {
  const sync = useSync();
  const { user, signOut, openSignIn } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unsent = unsentCount(sync.providers);
  const pending = pendingChanges(sync.providers);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label =
    sync.state === 'reconnecting' && unsent ? `Reconnecting… · ${changes(unsent)}` : stateLabels[sync.state];

  return (
    <div className="sync-wrap" ref={ref}>
      <button
        className={`sync ${pillClass[sync.state]}`}
        data-state={sync.state}
        title="Sync status: click for details"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <i />
        <span>{label}</span>
      </button>
      <button className="avatar" title={`Signed in as ${user.displayName}`} onClick={() => setOpen((o) => !o)}>
        {(user.displayName || user.username).slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div className="pop" role="dialog" aria-label="Sync status">
          <h4>
            <i className={`dot ${pillClass[sync.state]}`} />
            <span>{stateLabels[sync.state]}</span>
          </h4>
          <div className="sub">{explanation(sync.state, unsent)}</div>
          <dl className="kv">
            <dt>Server</dt>
            <dd>{location.host}</dd>
            <dt>Account</dt>
            <dd>{user.displayName} · local account</dd>
            <dt>Last sync</dt>
            <dd>
              {sync.lastSync ? `${clockTime(sync.lastSync)}, ${relativeTime(sync.lastSync.toISOString())}` : 'Not yet'}
            </dd>
          </dl>
          {pending.length > 0 && (
            <ul className="pend">
              {pending.map((p) => (
                <li key={p.id}>
                  <span>{p.title}</span>
                  <span>{sync.state === 'reconnecting' ? `${changes(p.changes)} in this tab` : `↑ ${p.changes}`}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="acts">
            {sync.state === 'signed-out' ? (
              <button
                className="tb line"
                onClick={() => {
                  setOpen(false);
                  openSignIn();
                }}
              >
                Sign in…
              </button>
            ) : (
              <button className="tb line" onClick={() => registry.syncNow()}>
                Sync now
              </button>
            )}
            <span className="spacer" />
            <button className="tb" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function statusBarSync(state: SyncState, unsent: number, lastSync: Date | null) {
  switch (state) {
    case 'synced':
      return (
        <span>
          {lastSync ? `Synced ${clockTime(lastSync)}` : 'Synced'} · {location.host}
        </span>
      );
    case 'syncing':
      return <span>Syncing…</span>;
    case 'reconnecting':
      return <span className="a">Reconnecting · {changes(unsent)} in this tab</span>;
    case 'not-saved':
      return <span className="d">Not saved</span>;
    case 'signed-out':
      return <span className="a">Signed out · sync paused</span>;
  }
}
