import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { statuses, type Category, type Status } from 'promptbook-project';
import type { ProjectRow } from '../api.js';
import { relativeTime } from '../dates.js';
import { Shell } from '../shell/Shell.js';
import { ImportIcon, PlusIcon, SearchIcon } from '../ui/icons.js';
import { ImportDialog } from './ImportDialog.js';
import {
  buildList,
  categoryCounts,
  categoryLabels,
  defaultFilters,
  metaLine,
  plural,
  readFilters,
  statusLabels,
  type ListFilters,
  type SortKey,
} from './list.js';
import { NewProjectDialog } from './NewProjectDialog.js';
import { DeviceCell } from '../desktop/ProjectDevice.js';
import { useDeviceProject } from '../desktop/useDevice.js';
import { platform } from '../platform/index.js';
import { ProjectPanel } from './ProjectPanel.js';
import { useProjects } from './useProjects.js';
import './projects.css';

const FILTERS_KEY = 'promptbook.list';

function storedFilters(): ListFilters {
  try {
    return readFilters(localStorage.getItem(FILTERS_KEY));
  } catch {
    return defaultFilters();
  }
}

const tabs: { category: Category | null; label: string; count: 'all' | Category }[] = [
  { category: null, label: 'All', count: 'all' },
  { category: 'campaign', label: 'Campaigns', count: 'campaign' },
  { category: 'adventure', label: 'Adventures', count: 'adventure' },
  { category: 'one-shot', label: 'One-shots', count: 'one-shot' },
];

const sorts: { key: SortKey; label: string }[] = [
  { key: 'edited', label: 'Last edited' },
  { key: 'title', label: 'Title' },
  { key: 'due', label: 'Next due date' },
  { key: 'left', label: 'To-do left' },
];

const statusDot: Record<Status, string> = {
  draft: 'var(--faint)',
  'in-progress': 'var(--amber)',
  complete: 'var(--primary)',
};

export function ProjectsPage() {
  const { projects, binCount, error, refresh } = useProjects();
  const [filters, setFilters] = useState(storedFilters);
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<'new' | 'import' | null>(null);
  const navigate = useNavigate();
  const selectedId = params.get('p');
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
    } catch {
      // Not remembered in a private window.
    }
  }, [filters]);

  // ⌘N or Ctrl+N: new project.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setDialog('new');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const list = useMemo(() => (projects ? buildList(projects, filters) : null), [projects, filters]);
  const counts = useMemo(() => categoryCounts(projects ?? []), [projects]);
  const campaigns = useMemo(() => (projects ?? []).filter((p) => p.category === 'campaign'), [projects]);
  // Importing matches campaigns and titles against the list, so it waits for it.
  const listReady = !!projects && !error;
  const selected = projects?.find((p) => p.id === selectedId) ?? null;

  const select = (id: string | null) => setParams(id ? { p: id } : {}, { replace: true });
  const open = (id: string) => navigate(`/projects/${id}`);
  const update = (patch: Partial<ListFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const toggleStatus = (status: Status) =>
    update({
      statuses: filters.statuses.includes(status)
        ? filters.statuses.filter((s) => s !== status)
        : statuses.filter((s) => s === status || filters.statuses.includes(s)),
    });

  return (
    <Shell
      crumbs={<b>Projects</b>}
      rail="projects"
      right={
        selected && (
          <ProjectPanel
            key={selected.id}
            row={selected}
            campaigns={campaigns}
            onOpen={() => open(selected.id)}
            onDeleted={() => {
              select(null);
              void refresh();
            }}
          />
        )
      }
      status={projects && <span>{plural(projects.length, 'project')}</span>}
    >
      <div className="pane">
        <div className="head">
          <h1>Projects</h1>
          <p className="lead" data-testid="count">
            {list ? `${list.shown} of ${plural(list.total, 'project')}` : ''}
          </p>
          <span className="spacer" />
          <button
            className="tb line"
            onClick={() => setDialog('import')}
            disabled={!listReady}
            title={listReady ? undefined : 'Available once the project list has loaded'}
          >
            <ImportIcon />
            Import Markdown
          </button>
          <button className="tb primary" onClick={() => setDialog('new')}>
            <PlusIcon />
            New project
          </button>
        </div>

        <div className="filters">
          <div className="search">
            <SearchIcon className="ic" />
            <input
              placeholder="Search titles and seeds"
              aria-label="Search titles and seeds"
              value={filters.query}
              onChange={(e) => update({ query: e.target.value })}
            />
          </div>
          <div className="seg" role="tablist" aria-label="Category">
            {tabs.map((tab) => (
              <button
                key={tab.label}
                role="tab"
                aria-selected={filters.category === tab.category}
                className={filters.category === tab.category ? 'on' : ''}
                onClick={() => update({ category: tab.category })}
              >
                {tab.label}
                <span className="n">{counts[tab.count]}</span>
              </button>
            ))}
          </div>
          {statuses.map((status) => (
            <button
              key={status}
              className={`fchip${filters.statuses.includes(status) ? ' on' : ''}`}
              aria-pressed={filters.statuses.includes(status)}
              onClick={() => toggleStatus(status)}
            >
              <span className="dot" style={{ background: statusDot[status] }} />
              {statusLabels[status]}
            </button>
          ))}
          <span className="spacer" />
          <label className="tog">
            <input type="checkbox" checked={filters.grouped} onChange={(e) => update({ grouped: e.target.checked })} />{' '}
            Group by campaign
          </label>
          <select
            className="sortsel"
            aria-label="Sort"
            value={filters.sort}
            onChange={(e) => update({ sort: e.target.value as SortKey })}
          >
            {sorts.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="err">{error}</p>}
        <div className="tbl" ref={tableRef} role="table" aria-label="Projects">
          <div className="tr th" role="row">
            <span>Title</span>
            <span className="c-cat">Category</span>
            <span>Status</span>
            <span>To-do</span>
            <span className="c-when">Edited</span>
            {platform.kind === 'desktop' && <span />}
          </div>
          {!list && <div className="empty">Loading…</div>}
          {list?.rows.map(({ project, child, dimmed }) => (
            <Row
              key={project.id}
              project={project}
              child={child}
              dimmed={dimmed}
              selected={project.id === selectedId}
              onSelect={() => select(project.id)}
              onOpen={() => open(project.id)}
            />
          ))}
          {list && list.shown === 0 && <div className="empty">No project matches these filters.</div>}
        </div>
        <div className="below">
          <p className="hint">Double-click a row, or press Enter, to open it.</p>
          <Link className="bin-link" to="/bin">
            Bin · {plural(binCount ?? 0, 'project')}
          </Link>
        </div>
      </div>

      {dialog === 'new' && (
        <NewProjectDialog
          projects={projects ?? []}
          projectsReady={listReady}
          onClose={() => setDialog(null)}
          onCreated={(project) => open(project.id)}
        />
      )}
      {dialog === 'import' && (
        <ImportDialog
          projects={projects ?? []}
          onClose={() => setDialog(null)}
          onImported={() => {
            setDialog(null);
            void refresh();
          }}
        />
      )}
    </Shell>
  );
}

function Row({
  project,
  child,
  dimmed,
  selected,
  onSelect,
  onOpen,
}: {
  project: ProjectRow;
  child: boolean;
  dimmed: boolean;
  selected: boolean;
  onSelect(): void;
  onOpen(): void;
}) {
  const ratio = project.todoTotal ? (project.todoDone / project.todoTotal) * 100 : 0;
  const device = useDeviceProject(project.id);
  // A project the desktop has not downloaded yet does not open.
  const downloading = !!device && !device.downloaded;
  const openRow = downloading ? () => {} : onOpen;
  return (
    <div
      className={`tr${child ? ' child' : ''}${selected ? ' sel' : ''}${dimmed ? ' dim' : ''}`}
      role="row"
      tabIndex={0}
      data-id={project.id}
      aria-selected={selected}
      title={dimmed ? 'Shown because it holds matching projects' : undefined}
      onClick={onSelect}
      onDoubleClick={openRow}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (selected ? openRow : onSelect)();
        if (event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="ti">
        <b>{project.title}</b>
        <div className="meta">{downloading ? 'Downloading…' : metaLine(project)}</div>
      </div>
      <span className="cat c-cat">{categoryLabels[project.category]}</span>
      <span className={`st ${project.status}`}>
        <i />
        {statusLabels[project.status]}
      </span>
      <span className="prog-cell">
        <span className="mini-bar">
          <i style={{ width: `${ratio}%` }} />
        </span>
        <span className="todo-count">
          {project.todoDone}/{project.todoTotal}
        </span>
      </span>
      <span className="when c-when">{relativeTime(project.editedAt)}</span>
      {device && <DeviceCell device={device} />}
    </div>
  );
}
