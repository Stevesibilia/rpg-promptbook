import { readMeta } from 'promptbook-project';
import type * as Y from 'yjs';
import { useWindowTitle } from '../desktop/title.js';
import { HistoryView } from '../history/HistoryView.js';
import { InspirationView } from '../inspiration/InspirationView.js';
import { LogView } from '../log/LogView.js';
import { ResearchView } from '../research/ResearchView.js';
import { Shell } from '../shell/Shell.js';
import { useDocValue } from '../sync/hooks.js';
import { HistoryButton, ProjectCrumbs, ProjectMetaControls } from './top.js';
import './views.css';

export const projectViews = ['inspiration', 'research', 'log', 'history'] as const;
export type ProjectViewId = (typeof projectViews)[number];

const labels: Record<ProjectViewId, string> = {
  inspiration: 'Inspiration',
  research: 'Research',
  log: 'Brainstorm log',
  history: 'History',
};

// A project's view other than Document: no outline and no inspector, the
// wide centre pane (connector design decision 12).
export function ProjectView({ id, doc, view }: { id: string; doc: Y.Doc; view: ProjectViewId }) {
  const meta = useDocValue(doc, readMeta);
  useWindowTitle(meta.title);
  return (
    <Shell
      rail={view}
      project={id}
      crumbs={<ProjectCrumbs meta={meta} />}
      topExtra={<ProjectMetaControls doc={doc} meta={meta} />}
      topEnd={
        <div className="top-tools">
          <HistoryButton projectId={id} on={view === 'history'} />
        </div>
      }
      status={<span>{labels[view]}</span>}
    >
      {view === 'inspiration' && <InspirationView doc={doc} />}
      {view === 'research' && <ResearchView doc={doc} meta={meta} />}
      {view === 'log' && <LogView doc={doc} />}
      {view === 'history' && <HistoryView doc={doc} projectId={id} meta={meta} />}
    </Shell>
  );
}
