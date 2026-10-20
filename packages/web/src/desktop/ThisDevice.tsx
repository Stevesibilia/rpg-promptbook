import { useEffect, useState } from 'react';
import { useAuth } from '../auth/context.js';
import { dayOf } from '../dates.js';
import type { DeviceUsage, LocalSnapshotsMode } from '../platform/bridge.js';
import { useDesktop, useStore } from '../platform/hooks.js';
import { serverHost } from '../platform/index.js';
import { DiskIcon } from '../ui/icons.js';
import { useDesktopUi } from './context.js';
import { osWords, size } from './words.js';

// Settings → This device (desktop-app design decision 13, desktop.html): the
// data folder and the space it takes, local snapshots, the version and its
// updates, and signing out.

const modes: { key: LocalSnapshotsMode; label: string }[] = [
  { key: 'hourly', label: 'Every hour while editing, keep 7 days' },
  { key: 'quarter', label: 'Every 15 minutes, keep 2 days' },
  { key: 'off', label: 'Off' },
];

export function ThisDevice() {
  const desktop = useDesktop();
  const info = useStore(desktop.info);
  const auth = useStore(desktop.auth);
  const updates = useStore(desktop.updates);
  const { user } = useAuth();
  const ui = useDesktopUi();
  const [usage, setUsage] = useState<DeviceUsage | null>(null);
  const [checking, setChecking] = useState(false);
  const words = osWords(info.os);
  const host = serverHost();

  useEffect(() => {
    let live = true;
    desktop.bridge.device
      .usage()
      .then((u) => live && setUsage(u))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [desktop]);

  async function check() {
    if (checking) return;
    setChecking(true);
    try {
      await desktop.bridge.updates.check();
    } finally {
      setChecking(false);
    }
  }

  const since = auth.account ? dayOf(auth.account.signedInAt) : '';
  const signedIn = auth.session === 'active';

  return (
    <section>
      <h2>This device</h2>
      <p className="lead">
        Projects live on {words.computer} and sync with {host} when online.
      </p>
      <div className="card wide-card">
        <div className="field">
          <label htmlFor="dev-folder">Data folder</label>
          <div className="pathrow">
            <input id="dev-folder" value={info.dataFolder} readOnly />
            <button
              className="tb line"
              onClick={() => {
                void desktop.bridge.device.showDataFolder();
                ui.toast(`Opened the data folder in ${words.manager}.`);
              }}
            >
              {words.show}
            </button>
          </div>
        </div>
        <div className="usage">
          <DiskIcon className="ic" />
          {usage ? (
            <>
              <b>{size(usage.bytes)}</b> {usage.projects} projects · {usage.localSnapshots} local snapshots
            </>
          ) : (
            '…'
          )}
        </div>
      </div>
      <div className="card wide-card">
        <div className="field">
          <label htmlFor="dev-snapshots">Local snapshots</label>
          <select
            id="dev-snapshots"
            value={info.localSnapshots}
            onChange={(e) => {
              void desktop.bridge.device
                .setLocalSnapshots(e.target.value as LocalSnapshotsMode)
                .then(desktop.refreshInfo);
            }}
          >
            {modes.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="hint">
            Taken on this device, next to the server's. They show up in History tagged "This device".
          </span>
        </div>
        {!info.signInRemembered && <p className="needs-line">Sign-in is not remembered on this computer</p>}
      </div>
      <div className="card wide-card row">
        <span className="grow">
          <b>Version</b> <code>{info.version}</code>
          <span className="hint block">
            {info.updates === 'self'
              ? 'Updates download by themselves and install when you restart.'
              : 'New versions are downloaded from GitHub: this build cannot update itself.'}
          </span>
        </span>
        <button className="tb line" onClick={() => void check()} disabled={checking}>
          {checking || (updates.kind === 'idle' && updates.checking) ? 'Checking…' : 'Check for updates'}
        </button>
      </div>
      <div className="card wide-card row">
        <span className="grow">
          <b>Sign out</b>
          <span className="hint block">
            {signedIn
              ? `Signed in as ${user.displayName} on ${host}${since ? ` since ${since}` : ''}.`
              : `Signed out of ${host}. Your projects stay on ${words.computer}.`}
          </span>
        </span>
        <button className="tb line" onClick={ui.openSignOut}>
          Sign out…
        </button>
      </div>
    </section>
  );
}
