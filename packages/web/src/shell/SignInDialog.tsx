import { useRef, useState } from 'react';
import { Modal } from '../ui/Modal.js';
import { SignInForm } from '../auth/SignInForm.js';
import { useAuthConfig } from '../auth/config.js';
import { SIGNED_IN_PATH, startUrl } from '../auth/oidc.js';
import type { User } from '../api.js';

// Signing in again over the current page, so what this tab has not sent stays
// in it and goes to the server once the new session connects. With single
// sign-on the provider's pages open in a window of their own, which ends on
// /signed-in; the app hears of the new session there and closes this dialog.
export function SignInDialog({
  username,
  onClose,
  onSignedIn,
}: {
  username: string;
  onClose(): void;
  onSignedIn(user: User): void;
}) {
  const config = useAuthConfig();
  return (
    <Modal title="Sign in to sync" onClose={onClose} className="confirm">
      <p className="dialog-lead">Your session ended. Sign in again: changes in this tab are sent once you are back.</p>
      {config.state === 'loading' && <p className="dialog-lead">Loading…</p>}
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
        <SignInForm initialUsername={username} onSignedIn={onSignedIn} />
      )}
      {config.state === 'ready' && config.config.signIn === 'oidc' && (
        <ProviderWindowButton providerName={config.config.providerName} />
      )}
    </Modal>
  );
}

const WINDOW_NAME = 'promptbook-sign-in';

function ProviderWindowButton({ providerName }: { providerName: string }) {
  const opened = useRef<Window | null>(null);
  const [blocked, setBlocked] = useState(false);

  function open() {
    // A second click while the window is still open brings it forward rather
    // than starting a second sign-in, which would void the first.
    if (opened.current && !opened.current.closed) {
      opened.current.focus();
      return;
    }
    const popup = window.open(startUrl(SIGNED_IN_PATH), WINDOW_NAME, 'popup,width=520,height=720');
    setBlocked(!popup);
    if (!popup) return;
    // The tabs talk over a BroadcastChannel; the provider's pages need no
    // handle on this one.
    try {
      popup.opener = null;
    } catch {
      // Already on another origin: it has no use for it either.
    }
    opened.current = popup;
  }

  return (
    <>
      {blocked && (
        <div className="err" role="alert">
          Allow pop-ups for this site, or sign in again from a new tab.
        </div>
      )}
      <button className="tb primary wide" onClick={open}>
        Sign in with {providerName}
      </button>
    </>
  );
}
