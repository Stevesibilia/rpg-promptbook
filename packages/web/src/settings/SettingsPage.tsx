import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { categories, type Category, type Settings } from 'promptbook-project';
import { api, ApiError, exportAllUrl } from '../api.js';
import { useAuth } from '../auth/context.js';
import { categoryLabels } from '../projects/list.js';
import { Shell } from '../shell/Shell.js';
import { saveTheme, storedTheme, type Theme } from '../theme.js';
import './settings.css';

const sections = [
  { key: 'todo', label: 'To-do templates' },
  { key: 'documents', label: 'Document templates' },
  { key: 'author', label: 'Author and licence' },
  { key: 'account', label: 'Account' },
  { key: 'sync', label: 'Sync and storage' },
  { key: 'appearance', label: 'Appearance' },
] as const;
type Section = (typeof sections)[number]['key'];

export function SettingsPage() {
  const params = useParams();
  const navigate = useNavigate();
  const section: Section = sections.some((s) => s.key === params.section) ? (params.section as Section) : 'todo';
  const [settings, setSettings] = useState<Settings | null>(null);
  const [state, setState] = useState<{ saving: boolean; error: string; saved: boolean }>({
    saving: false,
    error: '',
    saved: false,
  });

  useEffect(() => {
    api
      .settings()
      .then(setSettings)
      .catch((e) => setState((s) => ({ ...s, error: e instanceof ApiError ? e.message : 'Loading failed.' })));
  }, []);

  // The server takes the whole object; what it answers is what is stored.
  async function save(next: Settings) {
    setSettings(next);
    setState({ saving: true, error: '', saved: false });
    try {
      setSettings(await api.saveSettings(next));
      setState({ saving: false, error: '', saved: true });
    } catch (e) {
      setState({ saving: false, error: e instanceof ApiError ? e.message : 'Saving failed.', saved: false });
    }
  }

  const saveNote = state.error ? (
    <span className="err-inline">{state.error}</span>
  ) : state.saving ? (
    <span className="saved">Saving…</span>
  ) : state.saved ? (
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
            {section === 'todo' && settings && <TodoTemplates settings={settings} onSave={save} />}
            {section === 'documents' && <DocumentTemplates />}
            {section === 'author' && settings && <AuthorDefaults settings={settings} onSave={save} />}
            {section === 'account' && <Account />}
            {section === 'sync' && <SyncStorage />}
            {section === 'appearance' && <Appearance />}
            {!settings && (section === 'todo' || section === 'author') && (
              <p className="loading">{state.error || 'Loading…'}</p>
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
    </section>
  );
}

function Account() {
  const { user, setUser } = useAuth();
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

  return (
    <section>
      <h2>Account</h2>
      <p className="lead">One game master per server. Players have no accounts.</p>
      <div className="card narrow">
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
          {nameNote && <span className="hint">{nameNote}</span>}
        </div>
        <div className="field">
          <label htmlFor="acc-user">Username</label>
          <input id="acc-user" value={user.username} disabled />
        </div>
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
    </section>
  );
}

function SyncStorage() {
  return (
    <section>
      <h2>Sync and storage</h2>
      <p className="lead">In the browser projects live on the server; nothing is kept for offline use.</p>
      <div className="card wide-card">
        <div className="field">
          <label htmlFor="sync-server">Server</label>
          <input id="sync-server" value={location.origin} readOnly />
        </div>
      </div>
      <div className="card wide-card">
        <b>Export everything</b>
        <p className="muted" style={{ margin: '4px 0 10px' }}>
          One folder per project: the document as <code>document.md</code>, the to-do list and the seed as Markdown, and
          the project's details in <code>project.json</code>.
        </p>
        <a className="tb line" href={exportAllUrl} download>
          Export all projects…
        </a>
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
