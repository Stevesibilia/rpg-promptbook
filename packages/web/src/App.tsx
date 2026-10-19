import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { api, setUnauthorizedHandler, type User } from './api.js';
import { announceSignedIn, onSignedInElsewhere } from './auth/channel.js';
import { AuthContext, type Auth } from './auth/context.js';
import { SIGNED_IN_PATH, singleFlight } from './auth/oidc.js';
import { SignedInPage } from './auth/SignedInPage.js';
import { SignInPage } from './auth/SignInPage.js';
import { BinPage } from './projects/BinPage.js';
import { ProjectsPage } from './projects/ProjectsPage.js';
import { SettingsPage } from './settings/SettingsPage.js';
import { SignInDialog } from './shell/SignInDialog.js';
import { registry } from './sync/registry.js';

// CodeMirror loads with the first project page, not with the list.
const ProjectPage = lazy(() => import('./project/ProjectPage.js').then((m) => ({ default: m.ProjectPage })));

type Session = { state: 'loading' } | { state: 'signed-out' } | { state: 'signed-in'; user: User };

export function App() {
  const [session, setSession] = useState<Session>({ state: 'loading' });
  const [dialog, setDialog] = useState(false);
  const current = useRef(session);
  current.current = session;

  // Signed in again, over a page whose session had ended: sync resumes with
  // the new cookie and sends what it holds.
  const resume = useCallback((user: User) => {
    setDialog(false);
    setSession({ state: 'signed-in', user });
    registry.reconnect();
  }, []);

  // Another tab opened a session (the dialog's sign-in window among them).
  // This tab takes it if it has none or its own ended; a tab still signed in
  // keeps its own. One check at a time, however many messages arrive.
  const takeSession = useMemo(
    () =>
      singleFlight(async () => {
        const { user } = await api.me();
        if (!user) return;
        const now = current.current;
        if (now.state === 'signed-in') {
          if (registry.getSnapshot().sessionEnded) resume(user);
        } else {
          setSession({ state: 'signed-in', user });
        }
      }),
    [resume],
  );

  useEffect(() => {
    setUnauthorizedHandler(() => registry.markSessionEnded());
    api
      .me()
      .then(({ user }) => {
        // A message from another tab may have answered first.
        setSession((now) =>
          now.state !== 'loading' ? now : user ? { state: 'signed-in', user } : { state: 'signed-out' },
        );
        if (user) announceSignedIn();
      })
      .catch(() => setSession((now) => (now.state !== 'loading' ? now : { state: 'signed-out' })));
    return onSignedInElsewhere(() => void takeSession());
  }, [takeSession]);

  // While the dialog is up, coming back to this window checks for a session
  // too, in case the other window's message never arrived.
  useEffect(() => {
    if (!dialog) return;
    const onFocus = () => void takeSession();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [dialog, takeSession]);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Signed out already, or the server is away: forget the session here.
    }
    registry.closeAll();
    setSession({ state: 'signed-out' });
  }, []);

  const auth = useMemo<Auth | null>(
    () =>
      session.state === 'signed-in'
        ? {
            user: session.user,
            setUser: (user) => setSession({ state: 'signed-in', user }),
            signOut,
            openSignIn: () => setDialog(true),
          }
        : null,
    [session, signOut],
  );

  if (session.state === 'loading') return null;
  if (!auth) {
    return (
      <SignInPage
        onSignedIn={(user) => {
          setSession({ state: 'signed-in', user });
          announceSignedIn();
        }}
      />
    );
  }

  return (
    <AuthContext.Provider value={auth}>
      <Routes>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/bin" element={<BinPage />} />
        <Route path="/settings/:section?" element={<SettingsPage />} />
        <Route path={SIGNED_IN_PATH} element={<SignedInPage />} />
        <Route
          path="/projects/:id"
          element={
            <Suspense fallback={null}>
              <ProjectPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {dialog && (
        <SignInDialog
          username={auth.user.username}
          onClose={() => setDialog(false)}
          onSignedIn={(user) => {
            resume(user);
            announceSignedIn();
          }}
        />
      )}
    </AuthContext.Provider>
  );
}
