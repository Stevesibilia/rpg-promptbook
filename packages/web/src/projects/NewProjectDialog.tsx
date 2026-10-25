import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { categories, skeletonDocument, templateKindOf, type Category, type Settings, type Status } from 'promptbook-project';
import { api, ApiError, type ProjectRow } from '../api.js';
import { templateEntries } from '../templates/list.js';
import { useTemplates } from '../templates/TemplatesContext.js';
import { Modal } from '../ui/Modal.js';
import { categoryLabels, plural } from './list.js';

const blurbs: Record<Category, string> = {
  campaign: 'A long story across many sessions. Holds adventures and one-shots.',
  adventure: 'A few sessions, scenes and threats. Stands alone or inside a campaign.',
  'one-shot': 'One evening. Same template as an adventure.',
};

// The skeleton with front matter keys and headings picked out, as in the mockup.
function highlight(skeleton: string): ReactNode[] {
  let inFrontMatter = false;
  return skeleton.split('\n').map((line, i) => {
    const end = i > 0 ? '\n' : '';
    if (line === '---') {
      // The first line opens the front matter, the next --- closes it.
      inFrontMatter = i === 0;
      return (
        <span key={i}>
          {end}
          <span className="k">---</span>
        </span>
      );
    }
    const key = inFrontMatter ? /^([^:\s][^:]*:)(.*)$/.exec(line) : null;
    if (key) {
      return (
        <span key={i}>
          {end}
          <span className="k">{key[1]}</span>
          {key[2]}
        </span>
      );
    }
    return (
      <span key={i}>
        {end}
        {line.startsWith('#') ? <span className="h">{line}</span> : line}
      </span>
    );
  });
}

export function NewProjectDialog({
  projects,
  projectsReady,
  onClose,
  onCreated,
}: {
  projects: readonly ProjectRow[];
  // False while the list is loading or failed: the campaigns are not known.
  projectsReady: boolean;
  onClose(): void;
  onCreated(project: ProjectRow): void;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  // Set at once, unlike busy, so a repeated Enter cannot create twice.
  const creating = useRef(false);
  const [category, setCategory] = useState<Category>('adventure');
  const [title, setTitle] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [system, setSystem] = useState('');
  const [status, setStatus] = useState<Status>('draft');
  const [seed, setSeed] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // The template chosen in the select; null for the kind's default.
  const [templateId, setTemplateId] = useState<string | null>(null);
  // Until the list is in, an own default would read as the built-in.
  const { stored, usage, loaded: templatesLoaded } = useTemplates();

  useEffect(() => {
    api
      .settings()
      .then((s) => {
        setSettings(s);
        setSystem((current) => current || s.system);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Loading the settings failed.'));
  }, []);

  const campaigns = projects.filter((p) => p.category === 'campaign');
  const systems = [...new Set(projects.map((p) => p.system).filter(Boolean))].sort();
  const campaign = category === 'campaign' ? null : (campaigns.find((c) => c.id === campaignId) ?? null);
  const todo = settings?.todoTemplates[category] ?? [];
  // The kind's templates at their latest version, the default preselected
  // (mockup state 9).
  const kind = templateKindOf(category);
  const choices = templateEntries(stored, usage, settings).filter((t) => t.kind === kind);
  const chosen = choices.find((t) => t.id === templateId) ?? choices.find((t) => t.isDefault) ?? choices[0]!;

  const skeleton = useMemo(
    () =>
      settings
        ? skeletonDocument(category, {
            title: title.trim() || 'Titolo',
            system: system.trim(),
            campaignTitle: campaign?.title ?? null,
            author: settings.author,
            copyright: settings.copyright,
            licence: settings.licence,
          }, chosen.latest)
        : '',
    [settings, category, title, system, campaign, chosen.latest],
  );

  async function create() {
    if (creating.current || busy || !settings || !templatesLoaded) return;
    if (!title.trim()) return setError('Give the project a title.');
    creating.current = true;
    setBusy(true);
    setError('');
    try {
      const { project } = await api.createProject({
        category,
        title: title.trim(),
        campaignId: campaign?.id ?? null,
        system: system.trim(),
        status,
        seed,
        template: { id: chosen.id, version: chosen.version },
      });
      onCreated(project);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Creating the project failed.');
      creating.current = false;
      setBusy(false);
    }
  }

  const defaults = settings && [settings.author, settings.licence].filter(Boolean).join(' · ');

  return (
    <Modal
      title="New project"
      onClose={onClose}
      footer={
        <>
          <span className="note">
            {defaults ? `Author and licence from Settings: ${defaults}` : 'No author or licence in Settings yet.'}
          </span>
          <button className="tb line" onClick={onClose}>
            Cancel
          </button>
          <button className="tb primary" onClick={() => void create()} disabled={busy || !settings || !templatesLoaded}>
            Create and open
          </button>
        </>
      }
    >
      <div className="cats" role="radiogroup" aria-label="Category">
        {categories.map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={category === c}
            className={`catc${category === c ? ' on' : ''}`}
            onClick={() => {
              // Adventures and one-shots share their templates; a campaign has its own.
              if (templateKindOf(c) !== kind) setTemplateId(null);
              setCategory(c);
            }}
          >
            <b>{categoryLabels[c]}</b>
            <span>{blurbs[c]}</span>
          </button>
        ))}
      </div>
      <div className="np">
        <div>
          <div className="field">
            <label htmlFor="np-title">Title</label>
            <input
              id="np-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void create()}
            />
            <span className="hint">
              Becomes <code>titolo</code> in the front matter.
            </span>
          </div>
          <div className="field">
            <label htmlFor="np-template">Template</label>
            <select id="np-template" value={chosen.id} onChange={(e) => setTemplateId(e.target.value)}>
              {choices.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · v{t.version}
                  {t.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
            <span className="hint">The project keeps this version until you update it.</span>
          </div>
          {category !== 'campaign' && (
            <div className="field">
              <label htmlFor="np-campaign">Campaign</label>
              <select
                id="np-campaign"
                value={campaignId}
                disabled={!projectsReady}
                onChange={(e) => setCampaignId(e.target.value)}
              >
                <option value="">Stand-alone</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              {!projectsReady && <span className="hint">The campaigns appear once the project list has loaded.</span>}
            </div>
          )}
          <div className="field row2">
            <div className="field">
              <label htmlFor="np-system">System</label>
              <input id="np-system" list="np-systems" value={system} onChange={(e) => setSystem(e.target.value)} />
              <datalist id="np-systems">
                {systems.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="np-status">Status</label>
              <select id="np-status" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                <option value="draft">Draft</option>
                <option value="in-progress">In progress</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="np-seed">
              Seed <span style={{ fontWeight: 400, color: 'var(--faint)' }}>(optional)</span>
            </label>
            <textarea
              id="np-seed"
              rows={3}
              style={{ font: '15px/1.45 var(--prose)' }}
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
            />
            <span className="hint">The first idea, kept as written. Later changes become dated versions.</span>
          </div>
          {error && <p className="err">{error}</p>}
        </div>
        <div className="preview" data-testid="preview">
          <h5>
            Starts with <Link to="/settings/documents">Document templates</Link>
          </h5>
          <pre className="skel">{highlight(skeleton)}</pre>
          <h5>
            To-do list <span className="n">{plural(todo.length, 'item')}</span>
            <Link to="/settings/todo">Edit templates</Link>
          </h5>
          <ul className="tlist">
            {todo.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
