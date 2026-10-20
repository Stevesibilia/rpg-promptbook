import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The compose stack the tests run against (design decision 11): its own
// project name and port, so it never touches the stack on 8090. Beside the
// password app, a second app with single sign-on against the test issuer
// (compose.oidc.yaml), on the same database.

export const port = Number(process.env.E2E_PORT ?? 8091);
// Another run on the same machine sets its own project, with its own ports.
export const project = process.env.E2E_PROJECT ?? 'promptbook-e2e';
export const baseURL = `http://localhost:${port}`;
// What the stack's server reports as its release (the rail shows it).
export const releaseVersion = 'v9.9.9';
export const username = 'e2e';
export const password = 'e2e-password-0123';

export const oidcPort = Number(process.env.E2E_OIDC_PORT ?? port + 1);
export const oidcURL = `http://localhost:${oidcPort}`;
// The app reaches the issuer by its service name; the browser is pointed at
// 127.0.0.1 for that name (playwright.config.ts).
export const issuerHost = 'issuer';
export const issuerPort = Number(process.env.E2E_ISSUER_PORT ?? 9443);
export const issuerCerts = join(tmpdir(), `promptbook-e2e-certs-${port}`);

const root = fileURLToPath(new URL('..', import.meta.url));

// Every variable compose reads is set here, so a developer's .env cannot
// change the test stack.
const env = {
  ...process.env,
  PROMPTBOOK_PORT: String(port),
  PUBLIC_URL: baseURL,
  PROMPTBOOK_ADMIN_USERNAME: username,
  PROMPTBOOK_ADMIN_PASSWORD: password,
  POSTGRES_PASSWORD: 'promptbook-e2e',
  APP_VERSION: releaseVersion,
  OIDC_APP_PORT: String(oidcPort),
  OIDC_PUBLIC_URL: oidcURL,
  ISSUER_ORIGIN: `https://${issuerHost}:${issuerPort}`,
  ISSUER_PORT: String(issuerPort),
  ISSUER_CERTS: issuerCerts,
};

export function compose(...args: string[]): string {
  const files = ['-f', 'compose.yaml', '-f', 'e2e/compose.oidc.yaml'];
  return execFileSync('docker', ['compose', '-p', project, ...files, ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}
