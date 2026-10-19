import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { User } from '../api.js';
import { useAuthConfig } from './config.js';
import { failureMessage, signInFailure, startUrl, withoutSignIn } from './oidc.js';
import { SignInForm } from './SignInForm.js';
import './auth.css';

export function Brand() {
  return (
    <div className="brand">
      <div className="logo">P</div>
      <div>
        <b>Promptbook</b>
        <span>RPG Promptbook</span>
      </div>
    </div>
  );
}

// Shown without a session, at whatever address was asked for: once signed in,
// the app renders that address, so a deep link opens where it pointed. With
// single sign-on the provider sends the browser back to that address too.
export function SignInPage({ onSignedIn }: { onSignedIn(user: User): void }) {
  const config = useAuthConfig();
  const location = useLocation();
  const navigate = useNavigate();
  // Read before the parameter is removed below, and kept for this visit.
  const [failure] = useState(() => signInFailure(location.search));
  const shown = config.state === 'ready';

  // Once the page shows the reason, the address loses it: a reload or a
  // bookmark does not repeat an old failure, and the next sign-in does not
  // carry it back.
  useEffect(() => {
    if (shown && signInFailure(location.search)) {
      navigate(
        { pathname: location.pathname, search: withoutSignIn(location.search), hash: location.hash },
        { replace: true },
      );
    }
  }, [shown, location, navigate]);

  return (
    <div className="full">
      <div className="auth">
        <Brand />
        {config.state === 'failed' && (
          <>
            <div className="err" role="alert">
              {config.message}
            </div>
            <button className="tb primary wide" onClick={config.retry}>
              Try again
            </button>
          </>
        )}
        {config.state === 'ready' && config.config.signIn === 'password' && (
          <>
            <SignInForm onSignedIn={onSignedIn} />
            <div className="foot">
              {window.location.hostname} · no sign-up: the game master's account is created on the server.
            </div>
          </>
        )}
        {config.state === 'ready' && config.config.signIn === 'oidc' && (
          <>
            {failure && (
              <div className="err" role="alert">
                {failureMessage(failure, config.config.providerName)}
              </div>
            )}
            <ProviderButton providerName={config.config.providerName} />
            <div className="foot">
              {window.location.hostname} · accounts come from {config.config.issuerHost}. The first sign-in creates
              yours.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Leaves for the provider, coming back to this address without the reason
// of an earlier failure.
function ProviderButton({ providerName }: { providerName: string }) {
  const [leaving, setLeaving] = useState(false);

  // Back from the provider with the browser's back button, the page may come
  // from the back-forward cache as it was left: disabled.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => event.persisted && setLeaving(false);
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  return (
    <button
      className="tb primary wide"
      disabled={leaving}
      onClick={() => {
        setLeaving(true);
        window.location.href = startUrl(window.location.pathname + withoutSignIn(window.location.search));
      }}
    >
      Sign in with {providerName}
    </button>
  );
}
