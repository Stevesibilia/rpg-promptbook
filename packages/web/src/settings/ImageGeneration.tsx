import { useEffect, useRef, useState } from 'react';
import { IMAGE_MODELS, imageModelKeys, type Settings } from 'promptbook-project';
import { api, ApiError, type ImageGenerationStatus, type Spending } from '../api.js';
import { useAuth } from '../auth/context.js';
import { generateDefaults, imageCounts, modelLine, money2 } from '../board/generate.js';
import { setGenerationStatus } from '../board/useGeneration.js';
import { clockTime } from '../dates.js';
import { useOffline } from '../desktop/useDevice.js';
import { CheckIcon, OfflineIcon, WarningIcon } from '../ui/icons.js';
import { useToast } from '../ui/Toast.js';
import { keyStatusLine, monthName, savedToast, saveError, UNREADABLE } from './imageGenerationTexts.js';

// Settings → Image generation (board-image-generation design decision 14,
// screens 10 and 10b): the OpenRouter key, the defaults for Generate and the
// spending. The status is read with a check each time the section opens
// (Q1). The key typed here lives only in this input until it is saved; the
// server never sends it back, only its last four characters.

type Loaded = { state: 'loading' } | { state: 'ready'; status: ImageGenerationStatus } | { state: 'failed'; message: string };

export function ImageGenerationSection({
  settings,
  onSave,
}: {
  settings: Settings | null;
  onSave(next: Settings): void;
}) {
  const { user } = useAuth();
  const offline = useOffline();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [toast, showToast] = useToast();
  // Answers to a request older than the latest are dropped.
  const asked = useRef(0);

  const take = (status: ImageGenerationStatus) => {
    asked.current += 1;
    setLoaded({ state: 'ready', status });
    setGenerationStatus(user.id, status);
  };

  useEffect(() => {
    if (offline) return;
    setLoaded({ state: 'loading' });
    const ask = ++asked.current;
    api.imageGeneration(true).then(
      (status) => {
        if (ask !== asked.current) return;
        setLoaded({ state: 'ready', status });
        setGenerationStatus(user.id, status);
      },
      (e: unknown) =>
        ask === asked.current &&
        setLoaded({ state: 'failed', message: e instanceof ApiError ? e.message : 'Loading failed.' }),
    );
    return () => {
      asked.current += 1;
    };
  }, [user.id, offline]);

  let body;
  if (offline) {
    body = <OfflineCard />;
  } else if (loaded.state === 'loading') {
    body = <p className="loading">Loading…</p>;
  } else if (loaded.state === 'failed') {
    body = <p className="err-inline">{loaded.message}</p>;
  } else if (!loaded.status.configured) {
    body = (
      <div className="card wide-card">
        <p className="muted" style={{ margin: 0 }}>
          This server is not set up for image generation. Its administrator turns it on with{' '}
          <code>PROMPTBOOK_SECRETS_KEY</code>.
        </p>
      </div>
    );
  } else {
    body = (
      <>
        <KeyCard status={loaded.status} onStatus={take} onToast={showToast} />
        {settings && <DefaultsCard settings={settings} onSave={onSave} />}
        <SpendingCard spending={loaded.status.spending} />
      </>
    );
  }

  return (
    <section className="imggen">
      <h2>Image generation</h2>
      <p className="lead">Generate board images with GPT Image or Nano Banana through OpenRouter, from any image prompt.</p>
      {body}
      {toast}
    </section>
  );
}

// Screen 10c: offline on the desktop, the section waits for the server.
export function OfflineCard() {
  return (
    <div className="card wide-card">
      <div className="needs-card">
        <OfflineIcon className="ic" />
        <span>Image generation is kept on the server. Connect this computer to change it.</span>
      </div>
    </div>
  );
}

export function KeyCard({
  status,
  onStatus,
  onToast,
}: {
  status: ImageGenerationStatus;
  onStatus(status: ImageGenerationStatus): void;
  onToast(message: string): void;
}) {
  const [replacing, setReplacing] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = status.key;
  const asking = !key || replacing;

  async function save() {
    const value = typed.trim();
    if (!value || busy) return;
    setBusy(true);
    setError('');
    try {
      const saved = await api.saveOpenRouterKey(value);
      setTyped('');
      setReplacing(false);
      onStatus(saved);
      onToast(savedToast(saved.key?.limitRemaining ?? null));
    } catch (e) {
      setError(saveError(e instanceof ApiError ? e.code : 'error', e instanceof ApiError ? e.message : 'Saving failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api.removeOpenRouterKey();
      const { error: _gone, ...rest } = status;
      onStatus({ ...rest, key: null });
      onToast('Key removed. Generate asks for a key again.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Removing failed.');
    } finally {
      setBusy(false);
    }
  }

  const line = key ? keyStatusLine(key, status.error, (iso) => clockTime(new Date(iso))) : null;
  return (
    <div className="card wide-card">
      <h3>OpenRouter key</h3>
      {asking ? (
        // No <form>: a submitted password field invites the browser's
        // password manager to keep the key.
        <div className="field">
          {!key && status.error === 'key_unreadable' && <p className="keyline bad">{UNREADABLE}</p>}
          <label htmlFor="or-key">Key</label>
          <div className="with-btn">
            <input
              id="or-key"
              type="password"
              placeholder="sk-or-v1-…"
              autoComplete="off"
              spellCheck={false}
              data-1p-ignore=""
              data-lpignore="true"
              data-bwignore="true"
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save();
              }}
            />
            <button className="tb primary" type="button" disabled={busy || typed.trim() === ''} onClick={() => void save()}>
              {busy ? 'Checking…' : 'Save and check'}
            </button>
            {replacing && (
              <button
                className="tb line"
                type="button"
                onClick={() => {
                  setReplacing(false);
                  setTyped('');
                  setError('');
                }}
              >
                Cancel
              </button>
            )}
          </div>
          {error ? (
            <span className="err-inline">{error}</span>
          ) : (
            <span className="hint">
              Create one at openrouter.ai/settings/keys. A spending limit on the key caps what Promptbook can spend.
            </span>
          )}
        </div>
      ) : (
        <div className="field">
          <span className="label">Key</span>
          <div className="with-btn">
            <span className="keyv">sk-or-v1-••••••••••••{key!.hint}</span>
            <button className="tb line" disabled={busy} onClick={() => setReplacing(true)}>
              Replace
            </button>
            <button className="tb danger" disabled={busy} onClick={() => void remove()}>
              Remove
            </button>
          </div>
          {line && (
            <span className={`keyline${line.ok ? '' : ' bad'}`}>
              {line.ok ? <CheckIcon className="ic" /> : <WarningIcon className="ic" />}
              <span>{line.text}</span>
            </span>
          )}
          {error && <span className="err-inline">{error}</span>}
        </div>
      )}
      <p className="hint" style={{ margin: '8px 0 0' }}>
        Stored encrypted on the server and used only to generate your images. It is never sent to the browser or the
        desktop app. Images are billed to your OpenRouter account.
      </p>
    </div>
  );
}

export function DefaultsCard({ settings, onSave }: { settings: Settings; onSave(next: Settings): void }) {
  const current = generateDefaults(settings);
  const save = (next: typeof current) =>
    onSave({ ...settings, imageGeneration: { ...next, provider: settings.imageGeneration.provider } });
  return (
    <div className="card wide-card">
      <h3>Defaults for Generate</h3>
      <div className="field">
        <span className="label">Model</span>
        <div className="models" role="group" aria-label="Model">
          {imageModelKeys.map((key) => (
            <button
              key={key}
              className={`model${current.model === key ? ' on' : ''}`}
              aria-pressed={current.model === key}
              onClick={() => current.model !== key && save({ ...current, model: key })}
            >
              <b>{IMAGE_MODELS[key].name}</b>
              <small>{IMAGE_MODELS[key].note}</small>
              <span className="mm">{modelLine(key)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label">Images per Generate</span>
        <div className="seg" role="group" aria-label="Images per Generate" style={{ width: 'max-content' }}>
          {imageCounts.map((n) => (
            <button
              key={n}
              className={current.count === n ? 'on' : ''}
              aria-pressed={current.count === n}
              onClick={() => current.count !== n && save({ ...current, count: n })}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="hint">The Generate panel starts from these; your last choice there is kept for the session.</span>
      </div>
    </div>
  );
}

export function SpendingCard({ spending }: { spending: Spending }) {
  const month = monthName(new Date());
  const images = (n: number) => `${n} ${n === 1 ? 'image' : 'images'}`;
  return (
    <div className="card wide-card">
      <h3>Spending</h3>
      <div className="bigsum">
        <div>
          <b>{money2(spending.month.cost)}</b>
          <span>
            {month}, {images(spending.month.images)}
          </span>
        </div>
        <div>
          <b>{money2(spending.all.cost)}</b>
          <span>All time, {images(spending.all.images)}</span>
        </div>
      </div>
      {spending.projects.length > 0 && (
        <table className="spt">
          <thead>
            <tr>
              <th>Project</th>
              <th className="n">Images</th>
              <th className="n">{month}</th>
            </tr>
          </thead>
          <tbody>
            {spending.projects.map((p) => (
              <tr key={p.projectId ?? 'removed'}>
                <td>{p.title ?? 'Removed projects'}</td>
                <td className="n">{p.images}</td>
                <td className="n">{money2(p.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="hint" style={{ margin: '8px 0 0' }}>
        Costs as OpenRouter reports them for each image. Removing an image does not remove its cost.
      </p>
    </div>
  );
}
