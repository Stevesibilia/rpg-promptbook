import { Link, Navigate, useParams } from 'react-router';
import { EditorPage } from '../editor/EditorPage.js';
import { Shell } from '../shell/Shell.js';
import { useProjectDoc } from '../sync/hooks.js';
import { ProjectView, projectViews, type ProjectViewId } from './ProjectView.js';

const isView = (value: string): value is ProjectViewId => (projectViews as readonly string[]).includes(value);

// A project's page (connector design decision 12): the Document view, or
// Inspiration, Research, Brainstorm log or History. The project's document
// stays open while the user moves between them.
export function ProjectPage() {
  const { id = '', view } = useParams();
  const { doc, status } = useProjectDoc(id);

  if (view !== undefined && !isView(view)) return <Navigate to={`/projects/${encodeURIComponent(id)}`} replace />;
  if (status === 'gone') {
    return (
      <Shell crumbs={<Link to="/">Projects</Link>} rail={view ?? 'document'}>
        <div className="pane">
          <p className="panel-note">
            This project is in the bin, or it does not exist. <Link to="/">Back to the projects</Link>
          </p>
        </div>
      </Shell>
    );
  }
  if (!doc || status === 'loading') {
    return (
      <Shell crumbs={<Link to="/">Projects</Link>} rail={view ?? 'document'}>
        <p className="loading">Opening the project…</p>
      </Shell>
    );
  }
  if (view === undefined) return <EditorPage key={id} doc={doc} />;
  return <ProjectView key={id} id={id} doc={doc} view={view} />;
}
