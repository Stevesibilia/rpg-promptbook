import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { createUser, type User } from '../../src/accounts/users.js';
import { buildApp } from '../../src/app.js';
import type { Config } from '../../src/config.js';
import { createDb } from '../../src/db.js';
import { testDatabaseUrl } from './guard.js';

export const db = createDb(testDatabaseUrl());

export const ORIGIN = 'http://localhost:8090';
export const PASSWORD = 'correct horse battery';

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    databaseUrl: testDatabaseUrl(),
    publicOrigin: ORIGIN,
    port: 0,
    sessionTtlHours: 720,
    trustProxyHops: 0,
    admin: null,
    webDist: null,
    appVersion: 'dev',
    ...overrides,
  };
}

const open: FastifyInstance[] = [];

export async function startApp(overrides: Partial<Config> = {}): Promise<FastifyInstance> {
  const app = await buildApp({ config: testConfig(overrides), db });
  open.push(app);
  return app;
}

export async function closeApps(): Promise<void> {
  await Promise.all(open.splice(0).map((app) => app.close()));
}

export const steve = (password = PASSWORD): Promise<User> =>
  createUser(db, { username: 'steve', password, displayName: 'Stefano' });

// The pb_session value a response set, or null.
export function sessionCookie(response: LightMyRequestResponse): string | null {
  return response.cookies.find((c) => c.name === 'pb_session' && c.value !== '')?.value ?? null;
}

export async function signIn(
  app: FastifyInstance,
  username = 'steve',
  password = PASSWORD,
  remoteAddress = '127.0.0.1',
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin: ORIGIN },
    payload: { username, password },
    remoteAddress,
  });
}

export async function signedIn(app: FastifyInstance, username = 'steve', password = PASSWORD): Promise<string> {
  const response = await signIn(app, username, password);
  const token = sessionCookie(response);
  if (!token) throw new Error(`Sign-in failed: ${response.statusCode} ${response.body}`);
  return token;
}
