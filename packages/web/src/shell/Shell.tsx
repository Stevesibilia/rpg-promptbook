import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/context.js';
import { useSync } from '../sync/hooks.js';
import { DocumentIcon, ProjectsIcon, SettingsIcon, WarningIcon } from '../ui/icons.js';
import { statusBarSync, SyncPill, unsentCount } from './SyncPill.js';
import './shell.css';

export type RailItem = 'projects' | 'document' | 'settings';

// The frame of every signed-in page, as in the mockup: top bar, banner, rail,
// centre, optional right panel and status bar.
export function Shell({
  crumbs,
  topExtra,
  rail,
  right,
  status,
  documentLink,
  children,
}: {
  crumbs: ReactNode;
  topExtra?: ReactNode;
  rail: RailItem;
  right?: ReactNode;
  status?: ReactNode;
  // The open project's page, when there is one to go back to.
  documentLink?: string;
  children: ReactNode;
}) {
  const sync = useSync();
  const navigate = useNavigate();
  return (
    <div className={`app${right ? '' : ' no-sel'}`}>
      <header className="topbar">
        <Link className="logo" to="/" title="Promptbook">
          P
        </Link>
        <div className="crumbs">{crumbs}</div>
        {topExtra}
        <div className="spacer" />
        <SyncPill />
      </header>

      <Banner />

      <nav className="rail" aria-label="Main">
        <button
          className={rail === 'projects' ? 'on' : ''}
          data-tip="Projects"
          aria-label="Projects"
          onClick={() => navigate('/')}
        >
          <ProjectsIcon />
        </button>
        <button
          className={rail === 'document' ? 'on' : documentLink ? '' : 'dis'}
          data-tip={documentLink ? 'Document' : 'Document (open a project first)'}
          aria-label="Document"
          disabled={!documentLink && rail !== 'document'}
          onClick={() => documentLink && navigate(documentLink)}
        >
          <DocumentIcon />
        </button>
        <button
          className={`bottom last${rail === 'settings' ? ' on' : ''}`}
          data-tip="Settings and templates"
          aria-label="Settings"
          onClick={() => navigate('/settings')}
        >
          <SettingsIcon />
        </button>
      </nav>

      <main className="center">{children}</main>

      {right && <aside className="right">{right}</aside>}

      <footer className="status">
        {status}
        <span className="r">{statusBarSync(sync.state, unsentCount(sync.providers), sync.lastSync)}</span>
      </footer>
    </div>
  );
}

function Banner() {
  const sync = useSync();
  const { openSignIn } = useAuth();
  if (sync.state === 'not-saved') {
    return (
      <div className="alert" role="alert">
        <WarningIcon className="ic danger" />
        <span>
          <b>Not saved.</b> The server could not store the last changes. Copy your text before closing this tab; the
          server keeps trying.
        </span>
      </div>
    );
  }
  if (sync.state === 'signed-out') {
    return (
      <div className="alert warn" role="alert">
        <WarningIcon className="ic amber" />
        <span>
          <b>Signed out.</b> Your session on {location.host} ended. Sign in again to send your changes.
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
