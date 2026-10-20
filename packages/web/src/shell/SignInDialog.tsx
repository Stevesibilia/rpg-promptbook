import { useState } from 'react';
import { Modal } from '../ui/Modal.js';
import { SignInForm } from '../auth/SignInForm.js';
import { useAuthConfig } from '../auth/config.js';
import type { User } from '../api.js';
import { platform } from '../platform/index.js';

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

function ProviderWindowButton({ providerName }: { providerName: string }) {
  const [blocked, setBlocked] = useState(false);
  return (
    <>
      {blocked && (
        <div className="err" role="alert">
          Allow pop-ups for this site, or sign in again from a new tab.
        </div>
      )}
      <button className="tb primary wide" onClick={() => setBlocked(!platform.startSignIn())}>
        Sign in with {providerName}
      </button>
    </>
  );
}
