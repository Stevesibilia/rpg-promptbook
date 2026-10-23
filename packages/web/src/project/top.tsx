import { Link, useNavigate } from 'react-router';
import { gdrarchiveOf, type ProjectMeta } from 'promptbook-project';
import type * as Y from 'yjs';
import type { ProjectRow } from '../api.js';
import { StatusSelect } from '../projects/controls.js';
import { GdrarchiveLink } from '../projects/GdrarchiveLink.js';
import { categoryLabels } from '../projects/list.js';
import { useProjects } from '../projects/useProjects.js';
import { HistoryIcon } from '../ui/icons.js';

// The top bar's parts every view of a project shares.

// The project's campaign from the list, when it is one of the user's live
// campaigns: what the crumbs name and the gdrarchive link inherits from. One
// list fetch for the whole top bar (gdrarchive-link design decision 13).
export function useCampaignRow(meta: ProjectMeta): ProjectRow | undefined {
  const { projects } = useProjects();
  if (meta.category === 'campaign' || !meta.campaignId) return undefined;
  return projects?.find((p) => p.id === meta.campaignId && p.id !== meta.id && p.category === 'campaign');
}

export function ProjectCrumbs({ meta, campaign }: { meta: ProjectMeta; campaign: ProjectRow | undefined }) {
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

// The category, the status and, read-only, the gdrarchive link; focus mode
// hides them all.
export function ProjectMetaControls({
  doc,
  meta,
  campaign,
}: {
  doc: Y.Doc;
  meta: ProjectMeta;
  campaign: ProjectRow | undefined;
}) {
  const link = gdrarchiveOf(meta.gdrarchive, meta.category, campaign ?? null);
  return (
    <div className="top-meta hide-in-focus">
      <span className="cat">{categoryLabels[meta.category]}</span>
      <StatusSelect doc={doc} status={meta.status} />
      {link && <GdrarchiveLink link={link} inBar />}
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
