import type { User } from '../api.js';
import { SignInForm } from './SignInForm.js';
import './auth.css';

// Shown without a session, at whatever address was asked for: once signed in,
// the app renders that address, so a deep link opens where it pointed.
export function SignInPage({ onSignedIn }: { onSignedIn(user: User): void }) {
  return (
    <div className="full">
      <div className="auth">
        <div className="brand">
          <div className="logo">P</div>
          <div>
            <b>Promptbook</b>
            <span>RPG Promptbook</span>
          </div>
        </div>
        <SignInForm onSignedIn={onSignedIn} />
        <div className="foot">
          {location.hostname} · no sign-up: the game master's account is created on the server.
        </div>
      </div>
    </div>
  );
}
