import { useState } from 'react';
import { Link } from 'react-router';
import { api, ApiError } from '../api.js';
import { purgeDate } from '../dates.js';
import { Shell } from '../shell/Shell.js';
import { categoryLabels, plural } from './list.js';
import { useProjects } from './useProjects.js';
import './projects.css';

// The projects in the bin, each with the day it is removed for good.
export function BinPage() {
  const { projects, error, refresh } = useProjects({ bin: true });
  const [failure, setFailure] = useState('');

  async function restore(id: string) {
    try {
      await api.restoreProject(id);
      setFailure('');
      await refresh();
    } catch (e) {
      setFailure(e instanceof ApiError ? e.message : 'Restoring failed.');
    }
  }

  const sorted = [...(projects ?? [])].sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));

  return (
    <Shell
      crumbs={
        <>
          <Link to="/">Projects</Link> › <b>Bin</b>
        </>
      }
      rail="projects"
      status={projects && <span>{plural(projects.length, 'project')} in the bin</span>}
    >
      <div className="pane">
        <div className="head">
          <h1>Bin</h1>
          <p className="lead">Projects stay here for 30 days, then they are removed for good.</p>
        </div>
        {(error || failure) && <p className="err">{error || failure}</p>}
        <div className="tbl" role="table" aria-label="Bin">
          <div className="tr th bin" role="row">
            <span>Title</span>
            <span>Category</span>
            <span>Removed on</span>
            <span />
          </div>
          {!projects && <div className="empty">Loading…</div>}
          {projects && !projects.length && <div className="empty">The bin is empty.</div>}
          {sorted.map((p) => (
            <div className="tr bin" role="row" key={p.id} data-id={p.id}>
              <div className="ti">
                <b>{p.title}</b>
                <div className="meta">{p.system}</div>
              </div>
              <span className="cat">{categoryLabels[p.category]}</span>
              <span className="when">{p.deletedAt ? purgeDate(p.deletedAt) : ''}</span>
              <button className="tb line" onClick={() => void restore(p.id)}>
                Restore
              </button>
            </div>
          ))}
        </div>
        <div className="below">
          <Link className="bin-link" to="/" style={{ marginLeft: 0 }}>
            ← Back to the projects
          </Link>
        </div>
      </div>
    </Shell>
  );
}
