import { Link, useParams } from 'react-router';
import { readMeta } from 'promptbook-project';
import type * as Y from 'yjs';
import { StatusSelect } from '../projects/controls.js';
import { categoryLabels } from '../projects/list.js';
import { useProjects } from '../projects/useProjects.js';
import { Shell } from '../shell/Shell.js';
import { useDocValue, useProjectDoc } from '../sync/hooks.js';
import { Editor } from './Editor.js';
import './project.css';

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
  return <LivePage doc={doc} />;
}

function LivePage({ doc }: { doc: Y.Doc }) {
  const meta = useDocValue(doc, readMeta);
  const { projects } = useProjects();
  const campaign = meta.campaignId ? projects?.find((p) => p.id === meta.campaignId) : undefined;

  return (
    <Shell
      rail="document"
      crumbs={
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
      }
      topExtra={
        <div className="top-meta">
          <span className="cat">{categoryLabels[meta.category]}</span>
          <StatusSelect doc={doc} status={meta.status} />
        </div>
      }
      status={<span>{meta.system}</span>}
    >
      <div className="later">
        A plain Markdown editor for now: the full editor, with preview, outline and checks, comes in a later version.
      </div>
      <Editor doc={doc} />
    </Shell>
  );
}
