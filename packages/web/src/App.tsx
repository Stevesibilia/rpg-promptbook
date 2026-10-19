import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { api, setUnauthorizedHandler, type User } from './api.js';
import { AuthContext, type Auth } from './auth/context.js';
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

  useEffect(() => {
    setUnauthorizedHandler(() => registry.markSessionEnded());
    api
      .me()
      .then(({ user }) => setSession(user ? { state: 'signed-in', user } : { state: 'signed-out' }))
      .catch(() => setSession({ state: 'signed-out' }));
  }, []);

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
  if (!auth) return <SignInPage onSignedIn={(user) => setSession({ state: 'signed-in', user })} />;

  return (
    <AuthContext.Provider value={auth}>
      <Routes>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/bin" element={<BinPage />} />
        <Route path="/settings/:section?" element={<SettingsPage />} />
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
            setDialog(false);
            setSession({ state: 'signed-in', user });
            registry.reconnect();
          }}
        />
      )}
    </AuthContext.Provider>
  );
}
