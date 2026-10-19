import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { api, ApiError, type ConsentRequest, type OAuthScope } from '../api.js';
import { providerName, useAuthConfig } from '../auth/config.js';
import { useAuth } from '../auth/context.js';
import { Brand } from '../auth/SignInPage.js';
import { defaultScope, forwardedParameters, nameSource } from './consent.js';
import '../auth/auth.css';
import './connect.css';

const scopes: { key: OAuthScope; label: string; hint: string }[] = [
  {
    key: 'read',
    label: 'Read your projects',
    hint: 'Documents, seed, research, brainstorm log and to-do lists. No changes.',
  },
  {
    key: 'read_write',
    label: 'Read and edit your projects',
    hint: "Claude's edits are checked against the template and saved as snapshots first.",
  },
];

type State =
  | { state: 'loading' }
  | { state: 'failed'; code: string; message: string }
  | { state: 'ready'; request: ConsentRequest };

// The connector's authorization endpoint (connector design decision 8): a
// page of the app, so the app's sign-in covers it and a signed-out visitor
// comes back here with the request intact. The server validates the request
// before anything shows and builds every address the browser is sent to; the
// page builds none. Nothing is approved without a press of Allow.
export function AuthorizePage() {
  const { search } = useLocation();
  const { user, signOut } = useAuth();
  const config = useAuthConfig();
  const parameters = useMemo(() => forwardedParameters(search), [search]);
  const [state, setState] = useState<State>({ state: 'loading' });
  const [scope, setScope] = useState<OAuthScope>('read');
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    let live = true;
    setState({ state: 'loading' });
    api
      .consentRequest(new URLSearchParams(parameters))
      .then((request) => {
        if (!live) return;
        setScope(defaultScope(request.requested_scopes));
        setState({ state: 'ready', request });
      })
      .catch((e: unknown) => live && setState(failure(e, 'The request could not be read.')));
    return () => {
      live = false;
    };
  }, [parameters]);

  async function decide(allow: boolean) {
    setDeciding(true);
    try {
      const { redirect_to } = allow ? await api.approve(parameters, scope) : await api.deny(parameters);
      // A whole navigation: the address belongs to the client, not to this app.
      window.location.assign(redirect_to);
    } catch (e) {
      setState(failure(e, 'The answer could not be recorded.'));
      setDeciding(false);
    }
  }

  const here = window.location.host;
  let body;
  if (state.state === 'loading') {
    body = <p className="signed-in">Checking the request…</p>;
  } else if (state.state === 'failed') {
    body = (
      <>
        <h3>Cannot connect</h3>
        <div className="consent-err" role="alert">
          {state.message}
        </div>
        <p className="consent-note">
          Reported as <code>{state.code}</code>. Nothing was approved and you were not sent anywhere. Close this tab and
          connect again from the app that opened it.
        </p>
      </>
    );
  } else {
    const { request } = state;
    const source = nameSource(parameters.client_id ?? '');
    const offered = scopes.filter((s) => s.key === 'read' || request.requested_scopes.includes(s.key));
    const signedInWith =
      user.signIn === 'oidc'
        ? config.state === 'loading'
          ? ''
          : `Signed in through ${providerName(config)}`
        : 'Signed in with a password';
    body = (
      <>
        <h3>{request.client_name} wants to use your Promptbook</h3>
        <div className="box">
          <span className="avatar cl">{initial(request.client_name)}</span>
          <span>
            <b>
              {request.client_name}
              {!source && (
                <span className="unverified" title="Any app can give itself any name. Check where the request is from.">
                  unverified
                </span>
              )}
            </b>
            <small>
              Request from <b className="host">{request.redirect_host}</b>
              {source && <> · name published by {source}</>}
            </small>
          </span>
        </div>
        <div className="box">
          <span className="avatar">{initial(user.displayName)}</span>
          <span>
            <b>
              {user.displayName} · {user.username}
            </b>
            <small>{signedInWith}</small>
          </span>
          <button className="end link" onClick={() => void signOut()}>
            Not you?
          </button>
        </div>
        {request.loopback_only && (
          <div className="consent-warn" role="status">
            This app runs on your own computer, and Promptbook cannot tell it apart from any other program running
            there. Allow it only if you started it yourself.
          </div>
        )}
        <div className="may" id="may">
          {request.client_name} may
        </div>
        <div role="radiogroup" aria-labelledby="may">
          {offered.map((s) => (
            <label key={s.key} className="choice">
              <input
                type="radio"
                name="scope"
                checked={scope === s.key}
                disabled={deciding}
                onChange={() => setScope(s.key)}
              />
              <span>
                <b>{s.label}</b>
                <small>{s.hint}</small>
              </span>
            </label>
          ))}
        </div>
        <div className="btns">
          <button className="tb line" disabled={deciding} onClick={() => void decide(false)}>
            Deny
          </button>
          <button className="tb primary" disabled={deciding} onClick={() => void decide(true)}>
            Allow
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="full consent">
      <div className="auth">
        <Brand />
        {body}
        <div className="foot">{here} · revoke any time in Settings → Connected apps.</div>
      </div>
    </div>
  );
}

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '?';

function failure(e: unknown, fallback: string): State {
  return e instanceof ApiError
    ? { state: 'failed', code: e.code, message: e.message }
    : { state: 'failed', code: 'error', message: fallback };
}
