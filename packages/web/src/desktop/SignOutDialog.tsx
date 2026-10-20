import { useState } from 'react';
import type { DesktopProjectStatus } from '../platform/bridge.js';
import { serverHost } from '../platform/index.js';
import { useDesktop, useStore } from '../platform/hooks.js';
import { useSync } from '../sync/hooks.js';
import { Modal } from '../ui/Modal.js';
import { changes, osWords } from './words.js';

// Sign out? (desktop.html): sync stops and the projects stay, unless the
// user ticks their removal; then changes not on the server yet are named,
// and the button warns in red.

export interface Pending {
  title: string;
  changes: number;
}

// The projects holding changes the server does not have: edits not
// acknowledged, writes kept in memory, a project made here not uploaded.
export function notOnServer(projects: readonly DesktopProjectStatus[]): Pending[] {
  return projects
    .map((p) => ({ title: p.title, changes: Math.max(p.unsynced, p.notSaved, p.localOnly ? 1 : 0) }))
    .filter((p) => p.changes > 0);
}

// `files`: the board's files on this computer the server does not have
// (waiting to upload, or refused).
export function signOutTexts(remove: boolean, pending: readonly Pending[], files = 0) {
  const total = pending.reduce((n, p) => n + p.changes, 0);
  const lost = remove && (total > 0 || files > 0);
  const filesText = `${files} ${files === 1 ? 'file' : 'files'} not yet uploaded`;
  let warning: string | null = null;
  if (lost && total > 0) {
    warning = `${changes(total)} not yet on the server: ${pending.map((p) => `${p.title} (${p.changes})`).join(', ')}${files > 0 ? `, and ${filesText}` : ''}.`;
  } else if (lost) {
    warning = `${filesText.charAt(0).toUpperCase()}${filesText.slice(1)}.`;
  }
  return {
    warning,
    note: !remove
      ? 'Sign in again to sync. Nothing is downloaded twice.'
      : lost
        ? 'Cancel, then sync when you are online, to keep them.'
        : 'Everything is on the server: signing in again downloads it.',
    action: remove ? 'Sign out and remove' : 'Sign out',
    danger: lost,
  };
}

export function SignOutDialog({ onClose, onToast }: { onClose(): void; onToast(message: string): void }) {
  const desktop = useDesktop();
  const info = useStore(desktop.info);
  const sync = useSync();
  const files = useStore(desktop.files);
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const computer = osWords(info.os).computer;
  const texts = signOutTexts(remove, notOnServer(sync.device?.projects ?? []), files.waiting.length + files.refused.length);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await desktop.bridge.auth.signOut({ remove });
      onClose();
      onToast(
        remove
          ? `Signed out. The projects were removed from ${computer}.`
          : `Signed out. Your projects stay on ${computer}.`,
      );
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Signing out did not work.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Sign out?"
      onClose={() => !busy && onClose()}
      className="confirm sign-out"
      footer={
        <>
          <button className="tb line" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className={`tb ${texts.danger ? 'danger-fill' : 'primary'}`}
            onClick={() => void signOut()}
            disabled={busy}
          >
            {texts.action}
          </button>
        </>
      }
    >
      <p>
        Promptbook stops syncing with {serverHost()}. Your projects stay on {computer} and you can keep working on them.
      </p>
      <label className="chk">
        <input type="checkbox" checked={remove} disabled={busy} onChange={(e) => setRemove(e.target.checked)} /> Also
        remove the projects from this computer
      </label>
      {texts.warning && (
        <div className="warnbox" role="alert">
          <b>Changes not yet on the server would be lost.</b>
          <br />
          {texts.warning}
        </div>
      )}
      <p className="m">{texts.note}</p>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
