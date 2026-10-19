import { Link } from 'react-router';
import { readMeta } from 'promptbook-project';
import type * as Y from 'yjs';
import { StatusSelect } from '../projects/controls.js';
import { categoryLabels } from '../projects/list.js';
import { useProjects } from '../projects/useProjects.js';
import { Shell } from '../shell/Shell.js';
import { useDocValue } from '../sync/hooks.js';
import { Editor } from './Editor.js';
import './editor.css';

// The live project page: the shell around the editor (design decision 1).
export function EditorPage({ doc }: { doc: Y.Doc }) {
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
      <Editor doc={doc} checked={meta.category !== 'campaign'} />
    </Shell>
  );
}
