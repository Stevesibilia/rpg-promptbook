import { Navigate } from 'react-router';
import { readMeta } from 'promptbook-project';
import type * as Y from 'yjs';
import { BoardView } from '../board/BoardView.js';
import { useWindowTitle } from '../desktop/title.js';
import { HistoryView } from '../history/HistoryView.js';
import { InspirationView } from '../inspiration/InspirationView.js';
import { LogView } from '../log/LogView.js';
import { ResearchView } from '../research/ResearchView.js';
import { useDocValue } from '../sync/hooks.js';
import { ProjectShell } from './ProjectShell.js';
import { projectPath } from './top.js';
import type { ProjectViewId } from './views.js';
import './views.css';

export { projectViews, type ProjectViewId } from './views.js';

const labels: Record<ProjectViewId, string> = {
  inspiration: 'Inspiration',
  research: 'Research',
  board: 'Images and music',
  log: 'Brainstorm log',
  history: 'History',
};

// A project's view other than Document: no outline and no inspector, the
// wide centre pane (connector design decision 12). A campaign has no board
// (asset-board design decision 12): its address opens the Document.
export function ProjectView({ id, doc, view }: { id: string; doc: Y.Doc; view: ProjectViewId }) {
  const meta = useDocValue(doc, readMeta);
  useWindowTitle(meta.title);
  if (view === 'board') {
    if (meta.category === 'campaign') return <Navigate to={projectPath(id)} replace />;
    return <BoardView id={id} doc={doc} meta={meta} />;
  }
  return (
    <ProjectShell id={id} doc={doc} meta={meta} view={view} status={<span>{labels[view]}</span>}>
      {view === 'inspiration' && <InspirationView doc={doc} />}
      {view === 'research' && <ResearchView doc={doc} meta={meta} />}
      {view === 'log' && <LogView doc={doc} />}
      {view === 'history' && <HistoryView doc={doc} projectId={id} meta={meta} />}
    </ProjectShell>
  );
}
