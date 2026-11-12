import { useEffect, useRef, useState } from 'react';
import {
  IMAGE_MODELS,
  imageModelKeys,
  imageProviderOf,
  PROVIDER_NAMES,
  type ImageProvider,
  type Settings,
} from 'promptbook-project';
import { api, ApiError, type ImageGenerationStatus, type Spending } from '../api.js';
import { useAuth } from '../auth/context.js';
import {
  generateDefaults,
  imageCounts,
  modelLine,
  money2,
  providerEstimates,
  type Estimates,
} from '../board/generate.js';
import { setGenerationStatus } from '../board/useGeneration.js';
import { clockTime } from '../dates.js';
import { useOffline } from '../desktop/useDevice.js';
import { CheckIcon, OfflineIcon, WarningIcon } from '../ui/icons.js';
import { useToast } from '../ui/Toast.js';
import {
  chosenToast,
  keyStatusLine,
  monthName,
  providerChoice,
  providerNotes,
  savedToast,
  saveError,
  TOKEN_UNREADABLE,
  tokenRemovedToast,
  tokenSaveError,
  tokenSavedToast,
  tokenStatusLine,
  UNREADABLE,
} from './imageGenerationTexts.js';

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

  // The account's choice is a setting (D5): what Settings holds is what the
  // card marks and what the board's status says, a failed save included.
  const chosen = settings ? imageProviderOf(settings) : null;
  const choose = (provider: ImageProvider, message: string | null = chosenToast(provider)) => {
    if (!settings) return;
    onSave({ ...settings, imageGeneration: { ...generateDefaults(settings), provider } });
    if (message) showToast(message);
  };
  useEffect(() => {
    if (loaded.state === 'ready' && chosen !== null && loaded.status.provider !== chosen) {
      take({ ...loaded.status, provider: chosen });
    }
  });

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
    const status = loaded.status;
    body = (
      <>
        <ProviderCard status={status} chosen={chosen ?? status.provider} onChoose={settings ? choose : null} />
        <AtelierCard
          status={status}
          onStatus={take}
          onToast={showToast}
          onRemoved={(next) => {
            // D5: the server switched to OpenRouter when its key works here.
            const switched = (chosen ?? status.provider) === 'atelier' && status.key !== null;
            take(switched ? { ...next, provider: 'openrouter' } : next);
            if (switched) choose('openrouter', null);
            showToast(tokenRemovedToast(switched));
          }}
        />
        <KeyCard status={status} onStatus={take} onToast={showToast} />
        {settings && <DefaultsCard settings={settings} onSave={onSave} estimates={providerEstimates(status)} />}
        <SpendingCard spending={status.spending} />
      </>
    );
  }

  return (
    <section className="imggen">
      <h2>Image generation</h2>
      <p className="lead">
        Generate board images with GPT Image or Nano Banana from any image prompt, through Atelier or straight through
        OpenRouter.
      </p>
      {body}
      {toast}
    </section>
  );
}

// «Generate through» (atelier-image-provider D13, screens 1 to 1d): the two
// providers in the model-picker style, each with whether its credential
// works; one without a working credential cannot be chosen.
export function ProviderCard({
  status,
  chosen,
  onChoose,
}: {
  status: ImageGenerationStatus;
  chosen: ImageProvider;
  // Null until the settings are loaded.
  onChoose: ((provider: ImageProvider) => void) | null;
}) {
  return (
    <div className="card wide-card">
      <h3>Generate through</h3>
      <div className="models through" role="group" aria-label="Generate through">
        {(['atelier', 'openrouter'] as const).map((provider) => {
          const choice = providerChoice(status, provider);
          return (
            <button
              key={provider}
              className={`model${chosen === provider ? ' on' : ''}`}
              aria-pressed={chosen === provider}
              disabled={!choice.ready || onChoose === null}
              onClick={() => chosen !== provider && onChoose?.(provider)}
            >
              <b>{PROVIDER_NAMES[provider]}</b>
              <small>{providerNotes[provider]}</small>
              <span className={choice.ready ? 'ok' : 'no'}>{choice.text}</span>
            </button>
          );
        })}
      </div>
      <span className="hint">
        Generate uses this one for every project. Images already generated keep where they came from.
      </span>
    </div>
  );
}

// The Atelier card: the server's address, and the account's API token,
// checked with Atelier before it is stored. The token typed here lives only
// in this input until it is saved; the server sends back its last four
// characters.
export function AtelierCard({
  status,
  onStatus,
  onToast,
  onRemoved,
}: {
  status: ImageGenerationStatus;
  onStatus(status: ImageGenerationStatus): void;
  onToast(message: string): void;
  // The status without the token, once it is removed.
  onRemoved(next: ImageGenerationStatus): void;
}) {
  const [replacing, setReplacing] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { available, url, token } = status.atelier;
  const asking = !token || replacing;

  async function save() {
    const value = typed.trim();
    if (!value || busy) return;
    setBusy(true);
    setError('');
    try {
      const saved = await api.saveAtelierToken(value);
      setTyped('');
      setReplacing(false);
      onStatus(saved);
      onToast(tokenSavedToast(saved.atelier.token));
    } catch (e) {
      setError(tokenSaveError(e instanceof ApiError ? e.code : 'error', e instanceof ApiError ? e.message : 'Saving failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api.removeAtelierToken();
      const { error: _gone, ...rest } = status.atelier;
      onRemoved({ ...status, atelier: { ...rest, token: null } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Removing failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!available) {
    return (
      <div className="card wide-card">
        <h3>Atelier</h3>
        <div className="needs-card">
          <WarningIcon className="ic" />
          <span>
            This Promptbook server has no Atelier address. Whoever runs it sets <code>ATELIER_URL</code>.
          </span>
        </div>
      </div>
    );
  }

  const line = token ? tokenStatusLine(token, status.atelier.error, (iso) => clockTime(new Date(iso))) : null;
  return (
    <div className="card wide-card">
      <h3>Atelier</h3>
      <div className="field">
        <span className="label">Address</span>
        <span className="srv">{url}</span>
        <span className="hint">Set by the server.</span>
      </div>
      {asking ? (
        // No <form>, as for the OpenRouter key: no password manager keeps it.
        <div className="field">
          {!token && status.atelier.error === 'token_unreadable' && <p className="keyline bad">{TOKEN_UNREADABLE}</p>}
          <label htmlFor="atl-token">API token</label>
          <div className="with-btn">
            <input
              id="atl-token"
              type="password"
              placeholder="atl_pat_…"
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
            <span className="hint">Make a token with write access in Atelier → Settings → API tokens.</span>
          )}
        </div>
      ) : (
        <div className="field">
          <span className="label">API token</span>
          <div className="with-btn">
            <span className="keyv">atl_pat_••••••••••••{token!.hint}</span>
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
        Stored encrypted on the server, like the OpenRouter key. Images also go into an Atelier collection named after
        the project, made on the first Generate.
      </p>
    </div>
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

// The price lines are the chosen provider's estimates (D13).
export function DefaultsCard({
  settings,
  onSave,
  estimates = null,
}: {
  settings: Settings;
  onSave(next: Settings): void;
  estimates?: Estimates;
}) {
  const current = generateDefaults(settings);
  const save = (next: typeof current) =>
    onSave({ ...settings, imageGeneration: { ...next, provider: imageProviderOf(settings) } });
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
              <span className="mm">{modelLine(key, estimates)}</span>
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
              <th className="n">Atelier</th>
              <th className="n">OpenRouter</th>
              <th className="n">{month}</th>
            </tr>
          </thead>
          <tbody>
            {spending.projects.map((p) => (
              <tr key={p.projectId ?? 'removed'}>
                <td>{p.title ?? 'Removed projects'}</td>
                <td className="n">{p.images}</td>
                <td className="n">{money2(p.atelier ?? 0)}</td>
                <td className="n">{money2(p.openrouter ?? 0)}</td>
                <td className="n">{money2(p.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="hint" style={{ margin: '8px 0 0' }}>
        Costs as Atelier or OpenRouter report them for each image. Atelier's cap also counts what you make in Atelier
        itself. Removing an image does not remove its cost.
      </p>
    </div>
  );
}
