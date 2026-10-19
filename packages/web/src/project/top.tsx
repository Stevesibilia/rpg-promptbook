import { Link, useNavigate } from 'react-router';
import type { ProjectMeta } from 'promptbook-project';
import type * as Y from 'yjs';
import { StatusSelect } from '../projects/controls.js';
import { categoryLabels } from '../projects/list.js';
import { useProjects } from '../projects/useProjects.js';
import { HistoryIcon } from '../ui/icons.js';

// The top bar's parts every view of a project shares.

export function ProjectCrumbs({ meta }: { meta: ProjectMeta }) {
  const { projects } = useProjects();
  const campaign = meta.campaignId ? projects?.find((p) => p.id === meta.campaignId) : undefined;
  return (
    <>
      <Link to="/">Projects</Link>
      {campaign && (
        <>
          {' › '}
          <Link to={`/?p=${campaign.id}`}>{campaign.title}</Link>
        </>
      )}
      {' › '}
      <b>{meta.title}</b>
    </>
  );
}

export function ProjectMetaControls({ doc, meta }: { doc: Y.Doc; meta: ProjectMeta }) {
  return (
    <div className="top-meta hide-in-focus">
      <span className="cat">{categoryLabels[meta.category]}</span>
      <StatusSelect doc={doc} status={meta.status} />
    </div>
  );
}

export const projectPath = (id: string, view = '') => `/projects/${encodeURIComponent(id)}${view && `/${view}`}`;

// History and snapshots, on every view of a project.
export function HistoryButton({ projectId, on = false }: { projectId: string; on?: boolean }) {
  const navigate = useNavigate();
  return (
    <button
      className={`tb hide-in-focus${on ? ' on' : ''}`}
      title="History and snapshots"
      aria-label="History"
      onClick={() => navigate(projectPath(projectId, 'history'))}
    >
      <HistoryIcon />
    </button>
  );
}
