import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, type User } from '../api.js';
import { AppRoutes } from '../AppRoutes.js';
import { AuthContext, type Auth } from '../auth/context.js';
import type { AccountUser, AuthState } from '../platform/bridge.js';
import { useDesktop, useStore } from '../platform/hooks.js';
import { platform } from '../platform/index.js';
import { useSync } from '../sync/hooks.js';
import { useToast } from '../ui/Toast.js';
import { DesktopContext, type DesktopUi } from './context.js';
import { SignOutDialog } from './SignOutDialog.js';
import { FirstSyncScreen, InBrowserScreen, SignInFailedScreen, SignInScreen } from './SignInScreens.js';
import '../auth/auth.css';
import './desktop.css';

// The desktop app's frame around the web client's pages (desktop-app design
// decisions 8, 10 and 11): main owns the account, so the session comes from
// the bridge, not from a cookie. Sign in, In browser, Sign-in failed and
// First sync cover the whole window; under them, the pages as in the
// browser.

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
  const sync = useSync();
  const account = auth.account;
  const accountId = account?.id ?? null;
  // The user, with the account it belongs to: the pages of another account
  // never render with the last one's.
  const [owned, setOwned] = useState<{ account: string; user: User } | null>(null);
  const user = owned && owned.account === accountId ? owned.user : null;
  const navigate = useNavigate();
  const [toast, showToast] = useToast();
  // The failure the user dismissed; a new one shows again.
  const [dismissed, setDismissed] = useState<AuthState['signIn'] | null>(null);
  // The account whose first sync the user left early.
  const [startedEarly, setStartedEarly] = useState<string | null>(null);
  // The account whose sync status has been read since it opened, so First
  // sync never flashes the list first. The one open at start was read by
  // platform.init().
  const [statusOf, setStatusOf] = useState<string | null>(accountId);
  const previous = useRef(accountId);

  useEffect(() => {
    if (previous.current === accountId) return;
    previous.current = accountId;
    // Another account, or none: its pages start from the list, and its first
    // sync is shown again (a folder removed and signed in to anew).
    navigate('/', { replace: true });
    setStartedEarly(null);
    setStatusOf(null);
    if (!accountId) return;
    let live = true;
    void desktop.registry.refresh().finally(() => live && setStatusOf(accountId));
    return () => {
      live = false;
    };
  }, [accountId, desktop, navigate]);

  useEffect(() => {
    if (!account) return;
    let live = true;
    const id = account.id;
    api
      .me()
      .then(({ user }) => live && setOwned({ account: id, user: user ?? userOf(account.user) }))
      .catch(() => live && setOwned({ account: id, user: userOf(account.user) }));
    return () => {
      live = false;
    };
    // Read again for another account only.
  }, [accountId]);

  const [signingOut, setSigningOut] = useState(false);
  const ui = useMemo<DesktopUi>(() => ({ toast: showToast, openSignOut: () => setSigningOut(true) }), [showToast]);

  const value = useMemo<Auth | null>(
    () =>
      user
        ? {
            user,
            setUser: (next: User) => {
              if (accountId) setOwned({ account: accountId, user: next });
            },
            signOut: async () => setSigningOut(true),
            openSignIn: () => void platform.startSignIn(),
          }
        : null,
    [user, accountId],
  );

  const signIn = auth.signIn;
  let screen: React.ReactNode = null;
  if (signIn.step === 'browser') {
    screen = <InBrowserScreen host={signIn.host} onToast={showToast} />;
  } else if (signIn.step === 'failed' && dismissed !== signIn) {
    screen = <SignInFailedScreen failure={signIn} accountOpen={!!account} onDismiss={() => setDismissed(signIn)} />;
  } else if (!account) {
    screen = <SignInScreen />;
  } else if (statusOf !== account.id || !value) {
    screen = <div className="full" />;
  } else if (sync.device?.firstSync && startedEarly !== account.id) {
    screen = <FirstSyncScreen status={sync.device} onStart={() => setStartedEarly(account.id)} />;
  }

  return (
    <DesktopContext.Provider value={ui}>
      {/* The pages stay under a screen that covers them, so signing in
          again leaves the open project as it was. */}
      {value && account && (
        <AuthContext.Provider value={value}>
          <AppRoutes key={account.id} />
        </AuthContext.Provider>
      )}
      {screen}
      {signingOut && account && <SignOutDialog onClose={() => setSigningOut(false)} onToast={showToast} />}
      {toast}
    </DesktopContext.Provider>
  );
}
