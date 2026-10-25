import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { SIGNED_IN_PATH } from './auth/oidc.js';
import { SignedInPage } from './auth/SignedInPage.js';
import { AuthorizePage } from './connect/AuthorizePage.js';
import { platform } from './platform/index.js';
import { BinPage } from './projects/BinPage.js';
import { ProjectsPage } from './projects/ProjectsPage.js';
import { SettingsPage } from './settings/SettingsPage.js';
import { TemplatesProvider } from './templates/TemplatesContext.js';

// CodeMirror loads with the first project page, not with the list.
const ProjectPage = lazy(() => import('./project/ProjectPage.js').then((m) => ({ default: m.ProjectPage })));

// The pages of a signed-in client, with the account's templates read once
// for all of them. The consent page and the sign-in window's landing page are
// the browser's only.
export function AppRoutes() {
  return (
    <TemplatesProvider>
      <Routes>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/bin" element={<BinPage />} />
        <Route path="/settings/:section?" element={<SettingsPage />} />
        {platform.kind === 'web' && <Route path={SIGNED_IN_PATH} element={<SignedInPage />} />}
        {platform.kind === 'web' && <Route path="/authorize" element={<AuthorizePage />} />}
        <Route
          path="/projects/:id/:view?"
          element={
            <Suspense fallback={null}>
              <ProjectPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TemplatesProvider>
  );
}
