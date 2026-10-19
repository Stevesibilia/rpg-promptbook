import { useState, type FormEvent } from 'react';
import { api, ApiError, type User } from '../api.js';

// Username, password and Sign in: the sign-in page and the dialog share it.
// A failed attempt shows the server's message and keeps the username.
export function SignInForm({
  onSignedIn,
  initialUsername = '',
}: {
  onSignedIn(user: User): void;
  initialUsername?: string;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { user } = await api.login(username, password);
      onSignedIn(user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Signing in failed.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="signin-username">Username</label>
        <input
          id="signin-username"
          autoComplete="username"
          autoFocus={!initialUsername}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="signin-password">Password</label>
        <input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          autoFocus={!!initialUsername}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {error && (
        <div className="err" role="alert">
          {error}
        </div>
      )}
      <button className="tb primary wide" type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
