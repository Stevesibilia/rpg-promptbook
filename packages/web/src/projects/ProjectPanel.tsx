import { useState } from 'react';
import { addSeedVersion, readMeta, seedVersions } from 'promptbook-project';
import type * as Y from 'yjs';
import { api, ApiError, exportName, exportUrl, type ProjectRow } from '../api.js';
import { useDocValue, useProjectDoc } from '../sync/hooks.js';
import { DeviceLine } from '../desktop/ProjectDevice.js';
import { useDeviceProject } from '../desktop/useDevice.js';
import { DownloadLink } from '../ui/DownloadLink.js';
import { Modal } from '../ui/Modal.js';
import { CampaignSelect, StatusSelect, TitleInput } from './controls.js';
import { categoryLabels, statusLabels } from './list.js';
import { TodoList } from './TodoList.js';

// The panel on the right of the list for the selected project. What the user
// changes here goes through the project's Yjs document; the document facts
// come from the server's summary.
export function ProjectPanel({
  row,
  campaigns,
  onOpen,
  onDeleted,
}: {
  row: ProjectRow;
  campaigns: readonly ProjectRow[];
  onOpen(): void;
  onDeleted(): void;
}) {
  const { doc, status } = useProjectDoc(row.id);
  const device = useDeviceProject(row.id);
  if (status === 'gone') return <p className="panel-note">This project is in the bin.</p>;
  if (!doc || status === 'loading') {
    return (
      <div className="rp-h">
        <h2 className="title-edit">{row.title}</h2>
        <div className="row">
          <span className="cat">{categoryLabels[row.category]}</span>
          <span className={`st ${row.status}`}>
            <i />
            {statusLabels[row.status]}
          </span>
        </div>
        {device && !device.downloaded ? (
          <>
            <p className="loading">Downloading…</p>
            <div className="open">
              <button className="tb primary" disabled title="Not on this device yet">
                Open
              </button>
            </div>
          </>
        ) : (
          <p className="loading">Opening…</p>
        )}
      </div>
    );
  }
  return (
    <>
      <LivePanel doc={doc} row={row} campaigns={campaigns} onOpen={onOpen} onDeleted={onDeleted} />
      {device && <DeviceLine device={device} />}
    </>
  );
}

function LivePanel({
  doc,
  row,
  campaigns,
  onOpen,
  onDeleted,
}: {
  doc: Y.Doc;
  row: ProjectRow;
  campaigns: readonly ProjectRow[];
  onOpen(): void;
  onDeleted(): void;
}) {
  const meta = useDocValue(doc, readMeta);
  const [confirm, setConfirm] = useState(false);
  return (
    <div data-testid="panel">
      <div className="rp-h">
        <TitleInput doc={doc} title={meta.title} />
        <div className="row">
          <span className="cat">{categoryLabels[meta.category]}</span>
          <StatusSelect doc={doc} status={meta.status} />
          <span className="sys">{meta.system}</span>
        </div>
        {meta.category !== 'campaign' && (
          <div className="row in">
            In <CampaignSelect doc={doc} meta={meta} campaigns={campaigns} />
          </div>
        )}
        <div className="open">
          <button className="tb primary" onClick={onOpen}>
            Open
          </button>
        </div>
      </div>

      <Seed doc={doc} />
      <TodoList doc={doc} />

      {meta.category !== 'campaign' && (
        <details className="acc" open>
          <summary>Document</summary>
          <div className="body">
            <div className="facts">
              <Fact value={row.scenes} label="scenes" />
              <Fact value={row.words} label="words" />
              <Fact value={row.errors} label="errors" tone="e" />
              <Fact value={row.warnings} label="warnings" tone="w" />
            </div>
            <p className="facts-note">As of the last save on the server.</p>
          </div>
        </details>
      )}

      <details className="acc">
        <summary>Actions</summary>
        <div className="body links">
          <DownloadLink className="tb" href={exportUrl(row.id)} name={exportName(meta.title)}>
            Export as a Markdown folder…
          </DownloadLink>
          <button className="tb danger" onClick={() => setConfirm(true)}>
            Delete…
          </button>
        </div>
      </details>

      {confirm && (
        <DeleteDialog id={row.id} title={meta.title} onClose={() => setConfirm(false)} onDeleted={onDeleted} />
      )}
    </div>
  );
}

function Fact({ value, label, tone }: { value: number | null; label: string; tone?: 'e' | 'w' }) {
  return (
    <div className="fact">
      <b className={tone && value ? tone : ''}>{value === null ? '–' : value.toLocaleString('en-GB')}</b>
      <span>{label}</span>
    </div>
  );
}

// The current seed. Editing it adds a dated version; earlier ones are kept.
function Seed({ doc }: { doc: Y.Doc }) {
  const versions = useDocValue(doc, seedVersions);
  const current = versions.at(-1)?.text ?? '';
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  const save = () => {
    if (value.trim() && value !== current) addSeedVersion(doc, value);
    setEditing(false);
  };

  return (
    <details className="acc" open>
      <summary>Seed {versions.length > 1 && <span className="cnt">{versions.length} versions</span>}</summary>
      <div className="body">
        {editing ? (
          <>
            <textarea
              className="seed-edit"
              rows={4}
              autoFocus
              aria-label="Seed"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false);
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
              }}
            />
            <div className="seed-hint">Saving keeps the earlier seed as a dated version.</div>
          </>
        ) : (
          <p
            className={`seed${current ? '' : ' empty-seed'}`}
            title="Click to change the seed"
            onClick={() => {
              setValue(current);
              setEditing(true);
            }}
          >
            {current || 'No seed yet. Click to write the first idea.'}
          </p>
        )}
      </div>
    </details>
  );
}

function DeleteDialog({
  id,
  title,
  onClose,
  onDeleted,
}: {
  id: string;
  title: string;
  onClose(): void;
  onDeleted(): void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    try {
      await api.deleteProject(id);
      onClose();
      onDeleted();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Deleting failed.');
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Delete project?"
      onClose={onClose}
      className="confirm"
      footer={
        <>
          <button className="tb line" onClick={onClose}>
            Cancel
          </button>
          <button className="tb danger-fill" onClick={() => void remove()} disabled={busy}>
            Move to bin
          </button>
        </>
      }
    >
      <p style={{ margin: '0 0 8px' }}>
        <b>{title}</b> goes to the bin. It can be restored for 30 days.
      </p>
      <p style={{ margin: 0, color: 'var(--muted)' }}>Export it first if you want a copy outside Promptbook.</p>
      {error && <p className="err">{error}</p>}
    </Modal>
  );
}
