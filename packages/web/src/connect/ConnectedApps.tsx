import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type Grant } from '../api.js';
import { providerName, useAuthConfig } from '../auth/config.js';
import { longDate, snapshotTime } from '../dates.js';
import { NeedsServer } from '../desktop/NeedsServer.js';
import { useOffline } from '../desktop/useDevice.js';
import { platform } from '../platform/index.js';
import { Confirm } from '../ui/Confirm.js';
import { useToast } from '../ui/Toast.js';
import { hostOf } from '../inspiration/links.js';
import { grantName } from './consent.js';
import './connect.css';

const access = { read: 'Read only', read_write: 'Read and edit', app: 'Desktop app' } as const;

// Settings, Connected apps (connector design decision 8): the apps the user
// allowed, Revoke, and how to connect Claude.
export function ConnectedApps() {
  const config = useAuthConfig();
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [revoking, setRevoking] = useState<Grant | null>(null);
  const [resource, setResource] = useState(`${platform.serverOrigin}/api/mcp`);
  const [toast, showToast] = useToast();
  const offline = useOffline();
  const urlInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .grants()
      .then(({ grants }) => setGrants(grants))
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : 'Loading failed.'));
    // The server's own name for the connector, from PUBLIC_URL; the address
    // this page was opened at may be another.
    api
      .mcpResource()
      .then(({ resource }) => setResource(resource))
      .catch(() => {});
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(resource);
      showToast('Connector URL copied.');
    } catch {
      // No clipboard outside a secure context: select it for ⌘C.
      urlInput.current?.select();
      showToast('Press ⌘C to copy the selected URL.');
    }
  }

  const signInStep =
    config.state === 'ready' && config.config.signIn === 'oidc'
      ? `Sign in with ${providerName(config)} and `
      : 'Sign in to Promptbook and ';

  return (
    <section>
      <h2>Connected apps</h2>
      <p className="lead">
        Apps you allowed to use your Promptbook. Each one acts as you, within the access you gave it.
      </p>
      {grants ? (
        <div className="apps" role="table" aria-label="Connected apps">
          <div className="ar th" role="row">
            <span role="columnheader">App</span>
            <span role="columnheader">Access</span>
            <span role="columnheader">Approved</span>
            <span role="columnheader">Last used</span>
            <span />
          </div>
          {grants.length === 0 && <div className="ar none">No connected apps.</div>}
          {grants.map((g) => {
            const site = g.client_uri ? hostOf(g.client_uri) : '';
            const name = grantName(g);
            return (
              <div className="ar" role="row" key={g.id} data-id={g.id}>
                <span className="nm" role="cell">
                  <span className="avatar cl">{g.client_name.trim().charAt(0).toUpperCase() || '?'}</span>
                  <span>
                    <b>{name}</b>
                    {/* The desktop app is Promptbook's own: no site to show. */}
                    {!g.first_party && <small>{site || 'no site given'}</small>}
                  </span>
                </span>
                <span className="d" role="cell">
                  {access[g.scope]}
                </span>
                <span className="d" role="cell">
                  {longDate(g.created_at)}
                </span>
                <span className="d" role="cell">
                  {g.last_used_at ? snapshotTime(g.last_used_at) : 'never'}
                </span>
                <NeedsServer>
                  <button
                    className="tb danger"
                    onClick={() => setRevoking(g)}
                    aria-label={`Revoke ${name}`}
                    disabled={offline}
                  >
                    Revoke
                  </button>
                </NeedsServer>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="loading">{loadError || 'Loading…'}</p>
      )}
      <div className="card wide-card">
        <b>How to connect Claude</b>
        <p className="muted" style={{ margin: '4px 0 10px' }}>
          Works in Claude on the web and in Claude Desktop.
        </p>
        <div className="urlrow">
          <input ref={urlInput} value={resource} readOnly aria-label="Connector URL" />
          <button className="tb line" onClick={() => void copy()}>
            Copy
          </button>
        </div>
        <ol className="steps">
          <li>
            In claude.ai open <b>Settings → Connectors → Add custom connector</b>.
          </li>
          <li>Paste the URL above.</li>
          <li>
            {signInStep}
            <b>Allow</b> on the Promptbook page that opens.
          </li>
        </ol>
      </div>
      {revoking && (
        <Confirm
          title={`Revoke ${grantName(revoking)}?`}
          action="Revoke"
          danger
          note={
            revoking.first_party
              ? 'To sync it again, sign in from Promptbook on that computer.'
              : 'To use it again, connect it from claude.ai and allow it on the authorize page.'
          }
          onClose={() => setRevoking(null)}
          onConfirm={async () => {
            await api.revokeGrant(revoking.id);
            setGrants((list) => list?.filter((g) => g.id !== revoking.id) ?? null);
            showToast(`${grantName(revoking)} revoked.`);
          }}
        >
          {revoking.first_party
            ? 'It stops syncing with your projects at once.'
            : 'It loses access to your projects at once, in every chat.'}
        </Confirm>
      )}
      {toast}
    </section>
  );
}
