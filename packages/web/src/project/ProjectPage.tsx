import { Link, useParams } from 'react-router';
import { EditorPage } from '../editor/EditorPage.js';
import { Shell } from '../shell/Shell.js';
import { useProjectDoc } from '../sync/hooks.js';

export function ProjectPage() {
  const { id = '' } = useParams();
  const { doc, status } = useProjectDoc(id);

  if (status === 'gone') {
    return (
      <Shell crumbs={<Link to="/">Projects</Link>} rail="document">
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
      <Shell crumbs={<Link to="/">Projects</Link>} rail="document">
        <p className="loading">Opening the project…</p>
      </Shell>
    );
  }
  return <EditorPage key={id} doc={doc} />;
}
