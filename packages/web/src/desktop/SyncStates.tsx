import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/context.js';
import { clockTime, relativeTime } from '../dates.js';
import type { DesktopProjectStatus, DeviceUsage } from '../platform/bridge.js';
import { useDesktop, useStore } from '../platform/hooks.js';
import { platform, serverHost } from '../platform/index.js';
import { registry, type SyncSnapshot } from '../sync/registry.js';
import { useSync } from '../sync/hooks.js';
import { stateLabels, type SyncState } from '../sync/state.js';
import { WarningIcon } from '../ui/icons.js';
import { useDesktopUi } from './context.js';
import { changes, osWords, size } from './words.js';

// The desktop's sync states (desktop-app design decision 11, desktop.html
// and projects.html's desktop shell): the pill and its popover, the strips
// under the top bar and the status bar's texts.

const pillClass: Record<SyncState, string> = {
  synced: '',
  syncing: 'busy',
  reconnecting: 'local',
  local: 'local',
  'not-saved': 'fail',
  'signed-out': 'out',
};

const unsent = (projects: readonly DesktopProjectStatus[]) => projects.reduce((n, p) => n + p.unsynced, 0);
const inMemory = (projects: readonly DesktopProjectStatus[]) => projects.reduce((n, p) => n + p.notSaved, 0);

// Projects the server is still sending: on the server, not yet in step.
const receiving = (sync: SyncSnapshot) =>
  (sync.device?.projects ?? []).filter((p) => !p.localOnly && !p.synced && p.unsynced === 0);

export function popoverLine(sync: SyncSnapshot): string {
  const projects = sync.device?.projects ?? [];
  switch (sync.state) {
    case 'synced':
      return 'Every change is on the server.';
    case 'syncing': {
      const up = unsent(projects);
      const down = receiving(sync).length;
      if (up && down) return `Sending ${changes(up)}, receiving ${down}.`;
      return up ? `Sending ${changes(up)}.` : 'Receiving the latest changes.';
    }
    case 'local':
    case 'reconnecting': {
      const since = sync.device?.offlineSince;
      return `${since ? `Offline since ${clockTime(new Date(since))}. ` : ''}Everything is saved here and goes to the server when you are back online.`;
    }
    case 'not-saved':
      return 'The last changes could not be written to disk. They are kept in memory and retried.';
    case 'signed-out':
      return platform.desktop?.auth.get().session === 'signed-out' ? 'You signed out.' : 'The session ended.';
  }
}

// The popover's list: what each project holds that the server has not.
export function pendingLines(sync: SyncSnapshot): { id: string; title: string; note: string }[] {
  const projects = sync.device?.projects ?? [];
  if (sync.state === 'synced') return [];
  if (sync.state === 'not-saved') {
    return projects
      .filter((p) => p.notSaved > 0)
      .map((p) => ({ id: p.id, title: p.title, note: `${changes(p.notSaved)} in memory` }));
  }
  if (sync.state === 'syncing') {
    return [
      ...projects.filter((p) => p.unsynced > 0).map((p) => ({ id: p.id, title: p.title, note: `↑ ${p.unsynced}` })),
      ...receiving(sync).map((p) => ({ id: p.id, title: p.title, note: '↓' })),
    ];
  }
  return projects.filter((p) => p.unsynced > 0).map((p) => ({ id: p.id, title: p.title, note: changes(p.unsynced) }));
}

export function DesktopSyncPill({ onSignOut }: { onSignOut(): void }) {
  const sync = useSync();
  const desktop = useDesktop();
  const info = useStore(desktop.info);
  const { user, openSignIn } = useAuth();
  const ui = useDesktopUi();
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<DeviceUsage | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const signedOut = sync.state === 'signed-out';

  useEffect(() => {
    if (!open) return;
    let live = true;
    desktop.bridge.device
      .usage()
      .then((u) => live && setUsage(u))
      .catch(() => {});
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      live = false;
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, desktop]);

  const showFolder = () => {
    void desktop.bridge.device.showDataFolder();
    ui.toast(`Opened the data folder in ${osWords(info.os).manager}.`);
  };
  const how = signedOut ? 'signed out' : user.signIn === 'oidc' ? 'single sign-on' : 'local account';
  const lastSync = sync.lastSync;
  const pending = pendingLines(sync);

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
        <span>{stateLabels[sync.state]}</span>
      </button>
      <button
        className={`avatar${signedOut ? ' off' : ''}`}
        title={signedOut ? 'Signed out' : `Signed in as ${user.displayName}`}
        onClick={() => setOpen((o) => !o)}
      >
        {(user.displayName || user.username).slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div className="pop" role="dialog" aria-label="Sync status">
          <h4>
            <i className={`dot ${pillClass[sync.state]}`} />
            <span>{stateLabels[sync.state]}</span>
          </h4>
          <div className="sub">{popoverLine(sync)}</div>
          <dl className="kv">
            <dt>Server</dt>
            <dd>{serverHost()}</dd>
            <dt>Account</dt>
            <dd>
              {user.displayName} · {how}
            </dd>
            <dt>Last sync</dt>
            <dd>{lastSync ? `${clockTime(lastSync)}, ${relativeTime(lastSync.toISOString())}` : 'Not yet'}</dd>
            <dt>On this device</dt>
            <dd>{usage ? `${usage.projects} projects · ${size(usage.bytes)}` : '…'}</dd>
          </dl>
          {pending.length > 0 && (
            <ul className="pend">
              {pending.map((p) => (
                <li key={p.id}>
                  <span>{p.title}</span>
                  <span>{p.note}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="acts">
            {signedOut ? (
              <>
                <button
                  className="tb primary"
                  onClick={() => {
                    setOpen(false);
                    openSignIn();
                  }}
                >
                  Sign in
                </button>
                <button className="tb line" onClick={showFolder}>
                  Show data folder
                </button>
              </>
            ) : (
              <>
                <button className="tb line" onClick={() => registry.syncNow()}>
                  {sync.state === 'not-saved' ? 'Retry' : 'Sync now'}
                </button>
                <button className="tb line" onClick={showFolder}>
                  Show data folder
                </button>
                <span className="spacer" />
                <button
                  className="tb"
                  onClick={() => {
                    setOpen(false);
                    onSignOut();
                  }}
                >
                  Sign out
                </button>
              </>
            )}
          </div>
          {signedOut && <p className="keep">You can keep working: changes stay on this device until you sign in.</p>}
        </div>
      )}
    </div>
  );
}

// The strips between the top bar and the page: Not saved (red), Signed out
// (amber).
export function DesktopSyncStrip() {
  const sync = useSync();
  const { openSignIn } = useAuth();
  const projects = sync.device?.projects ?? [];
  if (sync.state === 'not-saved') {
    const n = inMemory(projects);
    const error = sync.device?.diskError;
    return (
      <div className="alert" role="alert">
        <WarningIcon className="ic danger" />
        <span>
          <b>Not saved.</b> {n === 1 ? 'The last change' : `The last ${n} changes`} could not be written to disk
          {error ? ` (${error})` : ''}. Free some space; Promptbook keeps them in memory and retries.
        </span>
        <span className="spacer" />
        <button className="tb line" onClick={() => registry.syncNow()}>
          Retry now
        </button>
      </div>
    );
  }
  if (sync.state === 'signed-out') {
    return (
      <div className="alert warn" role="alert">
        <WarningIcon className="ic amber" />
        <span>
          <b>Signed out.</b> Sync is paused. Keep working: changes stay on this device until you sign in.
        </span>
        <span className="spacer" />
        <button className="tb line" onClick={openSignIn}>
          Sign in…
        </button>
      </div>
    );
  }
  return null;
}

// The status bar's sync text, on the right.
export function desktopStatusSync(sync: SyncSnapshot) {
  const projects = sync.device?.projects ?? [];
  switch (sync.state) {
    case 'synced':
      return (
        <span>
          {sync.lastSync ? `Synced ${clockTime(sync.lastSync)}` : 'Synced'} · {serverHost()}
        </span>
      );
    case 'syncing':
      return <span>Syncing…</span>;
    case 'local':
    case 'reconnecting':
      return <span className="a">Offline · {changes(unsent(projects))} on this device</span>;
    case 'not-saved':
      return <span className="d">Not saved</span>;
    case 'signed-out':
      return <span className="a">Signed out · sync paused</span>;
  }
}

// «All on this device», or how many are, during the first sync.
export function DeviceStatus() {
  const projects = useSync().device?.projects ?? [];
  const here = projects.filter((p) => p.downloaded).length;
  return (
    <span>{here === projects.length ? 'All on this device' : `${here} of ${projects.length} on this device`}</span>
  );
}
