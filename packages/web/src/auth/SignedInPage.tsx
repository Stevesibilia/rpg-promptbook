import { Brand } from './SignInPage.js';

// Where a sign-in from the "Sign in to sync" dialog's window ends: the tab
// that opened it hears of the new session and carries on by itself.
export function SignedInPage() {
  return (
    <div className="full">
      <div className="auth">
        <Brand />
        <p className="signed-in">You are signed in. You can close this window.</p>
      </div>
    </div>
  );
}
