import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createDb } from '../../src/db.js';
import { startApp, testConfig } from './helpers.js';

describe('health check', () => {
  it('reports the version while the database is up', async () => {
    const app = await startApp({ appVersion: 'v0.1.0' });
    const response = await app.inject({ url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, version: 'v0.1.0' });
  });

  it('reports "dev" when APP_VERSION is not set', async () => {
    const app = await startApp();
    expect((await app.inject({ url: '/api/health' })).json()).toEqual({ ok: true, version: 'dev' });
  });

  it('answers 503 with the version when the database cannot be reached', async () => {
    // Nothing listens on port 1.
    const db = createDb('postgres://pb:pb@127.0.0.1:1/promptbook');
    const app = await buildApp({ config: testConfig({ appVersion: 'v0.1.0' }), db });
    try {
      const response = await app.inject({ url: '/api/health' });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ ok: false, version: 'v0.1.0' });
    } finally {
      await app.close();
      await db.close();
    }
  });
});
