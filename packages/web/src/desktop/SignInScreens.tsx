import { useState } from 'react';
import { useAuthConfig } from '../auth/config.js';
import { Brand } from '../auth/SignInPage.js';
import type { AuthState, DesktopSyncStatus } from '../platform/bridge.js';
import { useDesktop, useStore } from '../platform/hooks.js';
import { useProjects } from '../projects/useProjects.js';
import { ExternalIcon } from '../ui/icons.js';
import { osWords, size } from './words.js';

// The desktop's full-window screens (desktop.html): Sign in, In browser,
// Sign-in failed and First sync (desktop-app design decisions 8 and 10).

const DEFAULT_SERVER = 'https://promptbook.siberio.eu';

export function SignInScreen() {
  const desktop = useDesktop();
  const auth = useStore(desktop.auth);
  const info = useStore(desktop.info);
  const config = useAuthConfig();
  const [server, setServer] = useState(() => auth.server || info.serverOrigin);
  const sso = config.state === 'ready' && config.config.signIn === 'oidc';
  return (
    <div className="full">
      <div className="auth">
        <Brand />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            desktop.startSignIn(server.trim() || DEFAULT_SERVER);
          }}
        >
          <div className="field">
            <label htmlFor="desk-server">Server</label>
            <input
              id="desk-server"
              value={server}
              placeholder={DEFAULT_SERVER}
              spellCheck={false}
              onChange={(e) => setServer(e.target.value)}
            />
            <span className="hint">Needed once. After the first sync Promptbook works offline with no time limit.</span>
          </div>
          <button className="tb primary wide" type="submit">
            <ExternalIcon />
            {sso ? 'Continue with single sign-on' : 'Continue in your browser'}
          </button>
        </form>
        <div className="foot">Opens the server's sign-in page in your default browser, then comes back here.</div>
      </div>
    </div>
  );
}

export function InBrowserScreen({ host, onToast }: { host: string; onToast(message: string): void }) {
  const desktop = useDesktop();
  return (
    <div className="full">
      <div className="auth">
        <Brand />
        <h3>Finish signing in in your browser</h3>
        <div className="spin" aria-hidden="true" />
        <p>Promptbook opened {host} in your default browser. Come back here when it says you are signed in.</p>
        <div className="btns">
          <button
            className="tb line"
            onClick={() => {
              void desktop.bridge.auth.reopen();
              onToast(`Opened ${host} in your browser again.`);
            }}
          >
            Open the browser again
          </button>
          <button className="tb" onClick={() => void desktop.bridge.auth.cancel()}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// With an account open, signing in again is for that account: Cancel goes
// back to its projects instead of Change server.
export function SignInFailedScreen({
  failure,
  accountOpen,
  onDismiss,
}: {
  failure: Extract<AuthState['signIn'], { step: 'failed' }>;
  accountOpen: boolean;
  onDismiss(): void;
}) {
  const desktop = useDesktop();
  const auth = useStore(desktop.auth);
  return (
    <div className="full">
      <div className="auth">
        <Brand />
        <div className="bad" aria-hidden="true">
          !
        </div>
        <h3 className="centred">Sign-in did not finish</h3>
        <p className="centred">{failure.message}</p>
        <div className="btns">
          <button className="tb line" onClick={onDismiss}>
            {accountOpen ? 'Cancel' : 'Change server'}
          </button>
          <button className="tb primary" onClick={() => desktop.startSignIn(auth.server || DEFAULT_SERVER)}>
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

// The projects as they arrive: ✓ once on this computer, ↓ for the one
// coming in now.
export function FirstSyncScreen({ status, onStart }: { status: DesktopSyncStatus; onStart(): void }) {
  const info = useStore(useDesktop().info);
  // Main names a project from its document, once downloaded; the list from
  // the server has every title.
  const { projects: rows } = useProjects();
  const title = (id: string, fallback: string) => rows?.find((r) => r.id === id)?.title ?? fallback;
  const projects = status.projects;
  const done = projects.filter((p) => p.downloaded);
  const current = projects.find((p) => !p.downloaded)?.id;
  const bytes = done.reduce((n, p) => n + p.bytes, 0);
  return (
    <div className="full">
      <div className="auth first-sync">
        <div className="brand">
          <div className="logo">P</div>
          <div>
            <b>Downloading your projects</b>
            <span>
              First sync on {osWords(info.os).computer} · {size(bytes)}
            </span>
          </div>
        </div>
        <div className="bar" role="progressbar" aria-valuenow={done.length} aria-valuemax={projects.length}>
          <i style={{ width: `${projects.length ? (done.length / projects.length) * 100 : 0}%` }} />
        </div>
        <ul className="dlist" aria-label="Projects">
          {projects.map((p) => (
            <li key={p.id}>
              <span>{title(p.id, p.downloaded ? p.title : '…')}</span>
              <span>{p.downloaded ? size(p.bytes) : ''}</span>
              <span className={p.downloaded ? 'okc' : p.id === current ? 'now' : ''}>
                {p.downloaded ? '✓' : p.id === current ? '↓' : ''}
              </span>
            </li>
          ))}
        </ul>
        <div className="first-acts">
          <span className="spacer" />
          <button className="tb line" onClick={onStart}>
            Start with what is downloaded
          </button>
        </div>
        <div className="foot">Downloaded projects open at once; the rest keep coming in the background.</div>
      </div>
    </div>
  );
}
