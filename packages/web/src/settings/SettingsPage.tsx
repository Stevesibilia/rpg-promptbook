import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { categories, type Category, type Settings } from 'promptbook-project';
import { api, ApiError, exportAllName, exportAllUrl } from '../api.js';
import { providerName, useAuthConfig } from '../auth/config.js';
import { useAuth } from '../auth/context.js';
import { ConnectedApps } from '../connect/ConnectedApps.js';
import { NeedsServer, NeedsServerGroup } from '../desktop/NeedsServer.js';
import { useOffline } from '../desktop/useDevice.js';
import { platform } from '../platform/index.js';
import { categoryLabels } from '../projects/list.js';
import { Shell } from '../shell/Shell.js';
import { saveTheme, storedTheme, type Theme } from '../theme.js';
import { DownloadLink } from '../ui/DownloadLink.js';
import { createSettingsSaver, type SaverState, type SettingsSaver } from './saver.js';
import './settings.css';

const sections = [
  { key: 'todo', label: 'To-do templates' },
  { key: 'documents', label: 'Document templates' },
  { key: 'author', label: 'Author and licence' },
  { key: 'account', label: 'Account' },
  { key: 'apps', label: 'Connected apps' },
  { key: 'sync', label: 'Sync and storage' },
  { key: 'appearance', label: 'Appearance' },
] as const;
type Section = (typeof sections)[number]['key'];

export function SettingsPage() {
  const params = useParams();
  const navigate = useNavigate();
  const section: Section = sections.some((s) => s.key === params.section) ? (params.section as Section) : 'todo';
  const [state, setState] = useState<SaverState | null>(null);
  const [loadError, setLoadError] = useState('');
  const saver = useRef<SettingsSaver | null>(null);

  useEffect(() => {
    api
      .settings()
      .then((loaded) => {
        saver.current = createSettingsSaver(loaded, api.saveSettings, setState, (e) =>
          e instanceof ApiError ? e.message : 'Saving failed.',
        );
        setState(saver.current.state());
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : 'Loading failed.'));
  }, []);

  const settings = state?.settings ?? null;
  const save = (next: Settings) => saver.current?.save(next);

  const saveNote = state?.error ? (
    <span className="err-inline">{state.error}</span>
  ) : state?.saving ? (
    <span className="saved">Saving…</span>
  ) : state?.saved ? (
    <span className="saved">Saved</span>
  ) : null;

  return (
    <Shell crumbs={<b>Settings</b>} rail="settings" status={saveNote}>
      <div className="pane">
        <div className="head">
          <h1>Settings</h1>
        </div>
        <div className="set">
          <nav aria-label="Settings">
            {sections.map((s) => (
              <button
                key={s.key}
                className={section === s.key ? 'on' : ''}
                onClick={() => navigate(`/settings/${s.key}`)}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <div>
            {section === 'todo' && settings && (
              // Its inputs are keyed by their text, so a restored list redraws.
              <TodoTemplates settings={settings} onSave={save} />
            )}
            {section === 'documents' && <DocumentTemplates />}
            {section === 'author' && settings && (
              // Keyed, so the fields show the restored values after a failure.
              <AuthorDefaults key={state?.revision} settings={settings} onSave={save} />
            )}
            {section === 'account' && <Account />}
            {section === 'apps' && <ConnectedApps />}
            {section === 'sync' && <SyncStorage />}
            {section === 'appearance' && <Appearance />}
            {!settings && (section === 'todo' || section === 'author') && (
              <p className="loading">{loadError || 'Loading…'}</p>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function TodoTemplates({ settings, onSave }: { settings: Settings; onSave(next: Settings): void }) {
  const [category, setCategory] = useState<Category>('adventure');
  const [adding, setAdding] = useState('');
  const [dragged, setDragged] = useState<number | null>(null);
  const items = settings.todoTemplates[category];

  const write = (next: string[]) =>
    onSave({ ...settings, todoTemplates: { ...settings.todoTemplates, [category]: next } });

  return (
    <section>
      <h2>To-do templates</h2>
      <p className="lead">
        A new project starts with a copy of its category's list. Editing a template never changes existing projects.
      </p>
      <div className="tabs" role="tablist">
        {categories.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={c === category}
            className={c === category ? 'on' : ''}
            onClick={() => setCategory(c)}
          >
            {categoryLabels[c]}
          </button>
        ))}
      </div>
      <NeedsServerGroup>
        <div className="card">
          <ul className="tpl">
            {items.map((item, i) => (
              <li
                key={`${category}-${i}-${item}`}
                onDragOver={(e) => dragged !== null && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragged === null || dragged === i) return;
                  const next = [...items];
                  const [moved] = next.splice(dragged, 1);
                  next.splice(i, 0, moved!);
                  setDragged(null);
                  write(next);
                }}
              >
                <span
                  className="grip"
                  draggable
                  title="Drag to reorder"
                  onDragStart={(e) => {
                    setDragged(i);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', item);
                  }}
                  onDragEnd={() => setDragged(null)}
                >
                  ⠿
                </span>
                <input
                  className="t"
                  aria-label={`Item ${i + 1}`}
                  defaultValue={item}
                  onBlur={(e) => {
                    const text = e.target.value.trim();
                    if (!text) e.target.value = item;
                    else if (text !== item) write(items.map((t, j) => (j === i ? text : t)));
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
                <button
                  className="x"
                  title="Remove"
                  aria-label={`Remove ${item}`}
                  onClick={() => write(items.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <form
            className="tpl-add"
            onSubmit={(e) => {
              e.preventDefault();
              if (adding.trim()) write([...items, adding.trim()]);
              setAdding('');
            }}
          >
            <input
              placeholder="+ Add an item"
              aria-label="New template item"
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
            />
          </form>
        </div>
      </NeedsServerGroup>
    </section>
  );
}

function DocumentTemplates() {
  return (
    <section>
      <h2>Document templates</h2>
      <p className="lead">The skeleton a new project's prep document starts from.</p>
      <div className="card">
        <b>Adventure and one-shot</b> ·{' '}
        <span className="muted">
          avventura@1, checked by the format package: front matter, the fixed sections, one empty scene{' '}
          <code>### S1.</code>, the appendix.
        </span>
      </div>
      <div className="card">
        <b>Campaign</b> ·{' '}
        <span className="muted">
          no checked template yet. Plain Markdown with headings: Premessa, Fronti, PNG ricorrenti, Fili aperti,
          Sessioni. Not validated.
        </span>
      </div>
    </section>
  );
}

function AuthorDefaults({ settings, onSave }: { settings: Settings; onSave(next: Settings): void }) {
  const field = (
    key: 'author' | 'copyright' | 'licence' | 'system',
    label: string,
    hint?: React.ReactNode,
    placeholder?: string,
  ) => (
    <div className="field">
      <label htmlFor={`set-${key}`}>{label}</label>
      <input
        id={`set-${key}`}
        defaultValue={settings[key]}
        placeholder={placeholder}
        onBlur={(e) => e.target.value.trim() !== settings[key] && onSave({ ...settings, [key]: e.target.value.trim() })}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
  return (
    <section>
      <h2>Author and licence</h2>
      <p className="lead">
        Copied into a new project's front matter (<code>autore</code>, <code>copyright</code>, <code>licenza</code>),
        where each project can change them.
      </p>
      <NeedsServerGroup>
        <div className="card narrow">
          {field('author', 'Author')}
          {field('copyright', 'Copyright')}
          {field('licence', 'Licence', 'An SPDX id, or free text.')}
          {field(
            'system',
            'Default system',
            <>
              Pre-fills <code>sistema</code>; leave empty to choose each time.
            </>,
            'e.g. Kulthos',
          )}
        </div>
      </NeedsServerGroup>
    </section>
  );
}

function Account() {
  const { user, setUser } = useAuth();
  const config = useAuthConfig();
  const provider = providerName(config);
  const [name, setName] = useState(user.displayName);
  const [nameNote, setNameNote] = useState('');
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveName() {
    const value = name.trim();
    if (!value || value === user.displayName) return setName(user.displayName);
    try {
      const { user: updated } = await api.setDisplayName(value);
      setUser(updated);
      setNameNote('Saved');
    } catch (e) {
      setNameNote(e instanceof ApiError ? e.message : 'Saving failed.');
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (next !== repeat) return setNote({ ok: false, text: 'The new passwords do not match.' });
    if (next.length < 12) return setNote({ ok: false, text: 'The new password needs at least 12 characters.' });
    try {
      await api.changePassword(current, next);
      setNote({ ok: true, text: 'Password changed. Every other session was signed out.' });
      setChanging(false);
      setCurrent('');
      setNext('');
      setRepeat('');
    } catch (e) {
      setNote({ ok: false, text: e instanceof ApiError ? e.message : 'Changing the password failed.' });
    }
  }

  const nameField = (hint: string | null) => (
    <div className="field">
      <label htmlFor="acc-name">Display name</label>
      <input
        id="acc-name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setNameNote('');
        }}
        onBlur={() => void saveName()}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {(nameNote || hint) && <span className="hint">{nameNote || hint}</span>}
    </div>
  );
  const usernameField = (
    <div className="field">
      <label htmlFor="acc-user">Username</label>
      <input id="acc-user" value={user.username} disabled />
    </div>
  );

  // An account from the provider has no password here: its name and email
  // come from there.
  if (user.signIn === 'oidc') {
    // The texts name the provider: wait for its name rather than flash a
    // stand-in.
    if (config.state === 'loading') return null;
    return (
      <section>
        <h2>Account</h2>
        <p className="lead">Your account comes from {provider}. Players have no accounts.</p>
        <NeedsServerGroup>
          <div className="card narrow">
            {nameField(`Taken from ${provider} at the first sign-in; change it here if you like.`)}
            {usernameField}
            <p className="okline">
              <i />
              Signed in through {provider}
              {user.email && ` · ${user.email}`}
            </p>
          </div>
        </NeedsServerGroup>
      </section>
    );
  }

  return (
    <section>
      <h2>Account</h2>
      <p className="lead">One game master per server. Players have no accounts.</p>
      <NeedsServerGroup>
        <div className="card narrow">
          {nameField(null)}
          {usernameField}
          {changing ? (
            <form onSubmit={(e) => void changePassword(e)}>
              <div className="field">
                <label htmlFor="pw-current">Current password</label>
                <input
                  id="pw-current"
                  type="password"
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="pw-next">New password</label>
                <input
                  id="pw-next"
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  required
                />
                <span className="hint">At least 12 characters. Every other session is signed out.</span>
              </div>
              <div className="field">
                <label htmlFor="pw-repeat">New password again</label>
                <input
                  id="pw-repeat"
                  type="password"
                  autoComplete="new-password"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  required
                />
              </div>
              <div className="row-acts">
                <button className="tb primary" type="submit">
                  Change password
                </button>
                <button className="tb" type="button" onClick={() => setChanging(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              className="tb line"
              onClick={() => {
                setChanging(true);
                setNote(null);
              }}
            >
              Change password…
            </button>
          )}
          {note && <p className={note.ok ? 'ok-note' : 'err'}>{note.text}</p>}
        </div>
      </NeedsServerGroup>
    </section>
  );
}

function SyncStorage() {
  const offline = useOffline();
  return (
    <section>
      <h2>Sync and storage</h2>
      <p className="lead">In the browser projects live on the server; nothing is kept for offline use.</p>
      <div className="card wide-card">
        <div className="field">
          <label htmlFor="sync-server">Server</label>
          <input id="sync-server" value={platform.serverOrigin} readOnly />
        </div>
      </div>
      <div className="card wide-card">
        <b>Export everything</b>
        <p className="muted" style={{ margin: '4px 0 10px' }}>
          One folder per project: the document as <code>document.md</code>, the to-do list and the seed as Markdown, and
          the project's details in <code>project.json</code>.
        </p>
        <NeedsServer>
          <DownloadLink className="tb line" href={exportAllUrl} name={exportAllName()} disabled={offline}>
            Export all projects…
          </DownloadLink>
        </NeedsServer>
      </div>
    </section>
  );
}

function Appearance() {
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const options: { key: Theme; label: string }[] = [
    { key: 'dark', label: 'Dark' },
    { key: 'light', label: 'Light' },
    { key: 'system', label: 'System' },
  ];
  return (
    <section>
      <h2>Appearance</h2>
      <div className="card narrow">
        <div className="field">
          <span className="label">Theme</span>
          <div className="seg" role="radiogroup" aria-label="Theme">
            {options.map((o) => (
              <button
                key={o.key}
                role="radio"
                aria-checked={theme === o.key}
                className={theme === o.key ? 'on' : ''}
                onClick={() => {
                  saveTheme(o.key);
                  setTheme(o.key);
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
          <span className="hint">Remembered in this browser.</span>
        </div>
      </div>
    </section>
  );
}
