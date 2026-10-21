import type { ReactNode } from 'react';
import type { ProjectMeta } from 'promptbook-project';
import type * as Y from 'yjs';
import { Shell } from '../shell/Shell.js';
import { HistoryButton, ProjectCrumbs, ProjectMetaControls, useCampaignRow } from './top.js';
import type { ProjectViewId } from './views.js';

// The frame those views share.
export function ProjectShell({
  id,
  doc,
  meta,
  view,
  status,
  children,
}: {
  id: string;
  doc: Y.Doc;
  meta: ProjectMeta;
  view: ProjectViewId;
  status: ReactNode;
  children: ReactNode;
}) {
  const campaign = useCampaignRow(meta);
  return (
    <Shell
      rail={view}
      project={id}
      category={meta.category}
      crumbs={<ProjectCrumbs meta={meta} campaign={campaign} />}
      topExtra={<ProjectMetaControls doc={doc} meta={meta} campaign={campaign} />}
      topEnd={
        <div className="top-tools">
          <HistoryButton projectId={id} on={view === 'history'} />
        </div>
      }
      status={status}
    >
      {children}
    </Shell>
  );
}
