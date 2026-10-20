import type { ReactNode } from 'react';
import type { ProjectMeta } from 'promptbook-project';
import type * as Y from 'yjs';
import { Shell } from '../shell/Shell.js';
import { HistoryButton, ProjectCrumbs, ProjectMetaControls } from './top.js';
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
  return (
    <Shell
      rail={view}
      project={id}
      category={meta.category}
      crumbs={<ProjectCrumbs meta={meta} />}
      topExtra={<ProjectMetaControls doc={doc} meta={meta} />}
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
