import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/context.js';
import { serverHost } from '../platform/index.js';
import { useSync } from '../sync/hooks.js';
import {
  DocumentIcon,
  HistoryIcon,
  InspirationIcon,
  LogIcon,
  ProjectsIcon,
  SearchIcon,
  SettingsIcon,
  WarningIcon,
} from '../ui/icons.js';
import { statusBarSync, SyncPill, unsentCount } from './SyncPill.js';
import './shell.css';

export type RailItem = 'projects' | 'document' | 'inspiration' | 'research' | 'log' | 'history' | 'settings';

// The rail's entries for the open project (connector design decision 12), with
// the path under /projects/:id each one opens.
const projectEntries: { item: RailItem; label: string; path: string; Icon: typeof DocumentIcon }[] = [
  { item: 'document', label: 'Document', path: '', Icon: DocumentIcon },
  { item: 'inspiration', label: 'Inspiration', path: '/inspiration', Icon: InspirationIcon },
  { item: 'research', label: 'Research', path: '/research', Icon: SearchIcon },
  { item: 'log', label: 'Brainstorm log', path: '/log', Icon: LogIcon },
  { item: 'history', label: 'History', path: '/history', Icon: HistoryIcon },
];

// The frame of every signed-in page, as in the mockup: top bar, banner, rail,
// optional left panel, centre, optional right panel and status bar. Focus
// mode (the editor's) hides the rail, the panels and the top bar's controls
// but for the sync pill and those marked `.keep-in-focus`.
export function Shell({
  crumbs,
  topExtra,
  topEnd,
  rail,
  left,
  right,
  focus = false,
  wideRight = false,
  status,
  project,
  banner,
  children,
}: {
  crumbs: ReactNode;
  topExtra?: ReactNode;
  // Controls after the sync pill.
  topEnd?: ReactNode;
  rail: RailItem;
  left?: ReactNode;
  right?: ReactNode;
  focus?: boolean;
  // The right panel at the PDF preview's width.
  wideRight?: boolean;
  status?: ReactNode;
  // The open project's id: its entries in the rail are enabled.
  project?: string;
  // A banner of the page's own under the shell's, such as Claude's edit.
  banner?: ReactNode;
  children: ReactNode;
}) {
  const sync = useSync();
  const navigate = useNavigate();
  return (
    <div
      className={`app${left ? ' with-left' : ''}${right ? '' : ' no-sel'}${wideRight && right ? ' wide-right' : ''}${focus ? ' focus' : ''}`}
    >
      <header className="topbar">
        <Link className="logo" to="/" title="Promptbook">
          P
        </Link>
        <div className="crumbs">{crumbs}</div>
        {topExtra}
        <div className="spacer" />
        <SyncPill />
        {topEnd}
      </header>

      <div className="banners">
        <Banner />
        {banner}
      </div>

      <nav className="rail" aria-label="Main">
        <button
          className={rail === 'projects' ? 'on' : ''}
          data-tip="Projects"
          aria-label="Projects"
          onClick={() => navigate('/')}
        >
          <ProjectsIcon />
        </button>
        {projectEntries.map(({ item, label, path, Icon }) => (
          <button
            key={item}
            className={rail === item ? 'on' : project ? '' : 'dis'}
            data-tip={project ? label : `${label} (open a project first)`}
            aria-label={label}
            aria-current={rail === item ? 'page' : undefined}
            disabled={!project}
            onClick={() => project && navigate(`/projects/${encodeURIComponent(project)}${path}`)}
          >
            <Icon />
          </button>
        ))}
        <button
          className={`bottom last${rail === 'settings' ? ' on' : ''}`}
          data-tip="Settings and templates"
          aria-label="Settings"
          onClick={() => navigate('/settings')}
        >
          <SettingsIcon />
        </button>
      </nav>

      {left && <aside className="left">{left}</aside>}

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
          <b>Signed out.</b> Your session on {serverHost()} ended. Sign in again to send your changes.
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
