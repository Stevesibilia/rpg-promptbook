import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Settings } from 'promptbook-project';
import { api, ApiError } from '../api.js';
import { NeedsServer } from '../desktop/NeedsServer.js';
import { useOffline } from '../desktop/useDevice.js';
import { Confirm } from '../ui/Confirm.js';
import { copyName, kindLabels, kinds, projectCount, templateEntries, type TemplateEntry } from './list.js';
import { useTemplates } from './TemplatesContext.js';
import './templates.css';

export const editorPath = (id: string) => `/settings/documents/${encodeURIComponent(id)}`;

// Duplicates a template as version 1 of a new one, reads the list again and
// opens the copy, as the mockup's «Duplicate» does.
export function useDuplicate() {
  const { stored, reload } = useTemplates();
  const navigate = useNavigate();
  return async (source: { id: string; version: number; name: string }) => {
    const taken = [...new Set(stored.map((t) => t.body.name))];
    const copy = await api.duplicateTemplate({ id: source.id, version: source.version }, copyName(source.name, taken));
    await reload();
    navigate(editorPath(copy.id));
  };
}

// Settings → Document templates (mockup state 1): the templates per kind,
// one default each, Duplicate, View or Edit, and Delete for an own template
// no project uses.
export function TemplateList({ settings, onSave }: { settings: Settings | null; onSave(next: Settings): void }) {
  const { stored, usage, loaded, error: loadError, reload } = useTemplates();
  const navigate = useNavigate();
  const offline = useOffline();
  const duplicate = useDuplicate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TemplateEntry | null>(null);
  const entries = templateEntries(stored, usage, settings);

  const run = async (id: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(id);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  const makeDefault = (entry: TemplateEntry) => {
    if (!settings) return;
    onSave({ ...settings, defaultTemplates: { ...settings.defaultTemplates, [entry.kind]: entry.id } });
  };

  const row = (t: TemplateEntry) => (
    <div className="trow" key={t.id} data-testid={`template-${t.id}`}>
      <div className="tn">
        <b>{t.name}</b>
        <span className="chip ver">v{t.version}</span>
        {t.builtin && <span className="chip">Built-in</span>}
        {t.isDefault && <span className="chip def">Default</span>}
      </div>
      <div className="tm">
        {t.builtin ? 'Comes with Promptbook' : t.copiedFrom ? `Copied from ${t.copiedFrom}` : 'Your own'}
        {t.system && ` · ${t.system}`} · {projectCount(t.projects)}
      </div>
      <div className="acts">
        {!t.isDefault && (
          <NeedsServer>
            <button className="tb" disabled={offline || !settings} onClick={() => makeDefault(t)}>
              Make default
            </button>
          </NeedsServer>
        )}
        <NeedsServer>
          <button
            className="tb line"
            disabled={offline || busy !== null}
            onClick={() => void run(t.id, () => duplicate(t))}
          >
            {busy === t.id ? 'Duplicating…' : 'Duplicate'}
          </button>
        </NeedsServer>
        <button className="tb line" onClick={() => navigate(editorPath(t.id))}>
          {t.builtin ? 'View' : 'Edit'}
        </button>
        {!t.builtin && !t.projects && (
          <NeedsServer>
            <button
              className="tb del"
              title="Delete this template"
              disabled={offline || busy !== null}
              onClick={() => setDeleting(t)}
            >
              Delete
            </button>
          </NeedsServer>
        )}
      </div>
    </div>
  );

  return (
    <section>
      <h2>Document templates</h2>
      <p className="lead">
        A template sets a prep document's sections, scene fields and boxes, the checks, and the PDF. A new project
        starts from its category's default. To make your own, duplicate one.
      </p>
      {loadError && !loaded && <p className="err">{loadError}</p>}
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      {kinds.map((kind) => (
        <div className="tgroup" key={kind}>
          <h3>{kindLabels[kind]}</h3>
          {entries.filter((t) => t.kind === kind).map(row)}
        </div>
      ))}
      <p className="sub">
        Editing a template never changes existing projects: each keeps the version it was made with until you update
        it from the project.
      </p>
      {deleting && (
        <Confirm
          title={`Delete ${deleting.name}?`}
          action="Delete"
          danger
          note="No project uses it. Its versions are deleted too."
          onConfirm={async () => {
            try {
              await api.deleteTemplate(deleting.id);
            } finally {
              await reload();
            }
          }}
          onClose={() => setDeleting(null)}
        >
          «{deleting.name}» goes from the list for good.
        </Confirm>
      )}
    </section>
  );
}
