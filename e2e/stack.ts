import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The compose stack the tests run against (design decision 11): its own
// project name and port, so it never touches the stack on 8090.

export const port = Number(process.env.E2E_PORT ?? 8091);
export const baseURL = `http://localhost:${port}`;
export const username = 'e2e';
export const password = 'e2e-password-0123';

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
};

export function compose(...args: string[]): string {
  return execFileSync('docker', ['compose', '-p', 'promptbook-e2e', ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}
