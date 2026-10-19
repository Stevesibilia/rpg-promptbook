import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type AuthConfig } from '../api.js';

export type ConfigState =
  { state: 'loading' } | { state: 'failed'; message: string } | { state: 'ready'; config: AuthConfig };

// Which sign-in the server offers, asked again on every mount, so a page
// opened after the deployment switched modes sees the new one.
export function useAuthConfig(): ConfigState & { retry(): void } {
  const [state, setState] = useState<ConfigState>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ state: 'loading' });
    api
      .config()
      .then((config) => live && setState({ state: 'ready', config }))
      .catch(
        (e: unknown) =>
          live && setState({ state: 'failed', message: e instanceof ApiError ? e.message : 'Loading failed.' }),
      );
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}

// The provider's name for the texts of a single sign-on account, also when
// the server has single sign-on turned off or has not answered yet.
export function providerName(state: ConfigState): string {
  return state.state === 'ready' && state.config.signIn === 'oidc' ? state.config.providerName : 'single sign-on';
}
