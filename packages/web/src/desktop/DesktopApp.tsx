import { useEffect, useMemo, useState } from 'react';
import { api, type User } from '../api.js';
import { AppRoutes } from '../AppRoutes.js';
import { AuthContext, type Auth } from '../auth/context.js';
import type { AccountUser } from '../platform/bridge.js';
import { useDesktop, useStore } from '../platform/hooks.js';
import { platform } from '../platform/index.js';

// The desktop app's frame around the web client's pages (desktop-app design
// decisions 8, 10 and 11): main owns the account, so the session comes from
// the bridge, not from a cookie.

// The account as main knows it, until the server's answer (cached by main)
// gives the whole user.
const userOf = (u: AccountUser): User => ({
  id: u.id,
  username: u.displayName,
  displayName: u.displayName,
  email: null,
  signIn: u.signIn,
});

export function DesktopApp() {
  const desktop = useDesktop();
  const auth = useStore(desktop.auth);
  const account = auth.account;
  const [user, setUser] = useState<User | null>(null);

  const accountId = account?.id ?? null;
  useEffect(() => {
    setUser(null);
    if (!account) return;
    let live = true;
    api
      .me()
      .then(({ user }) => live && setUser(user ?? userOf(account.user)))
      .catch(() => live && setUser(userOf(account.user)));
    return () => {
      live = false;
    };
    // Read again for another account only.
  }, [accountId]);

  const value = useMemo<Auth | null>(
    () =>
      user
        ? {
            user,
            setUser,
            signOut: async () => desktop.bridge.auth.signOut({ remove: false }),
            openSignIn: () => void platform.startSignIn(),
          }
        : null,
    [user, desktop],
  );

  if (!account || !value) return null;
  return (
    <AuthContext.Provider value={value}>
      <AppRoutes key={account.id} />
    </AuthContext.Provider>
  );
}
