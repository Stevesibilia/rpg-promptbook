import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createUser } from '../../src/accounts/users.js';
import { startFakeOpenRouter, type FakeOpenRouter } from './fake-openrouter.js';
import { capturedLog, db, ORIGIN, PASSWORD, signedIn, startApp, steve } from './helpers.js';

// The OpenRouter key per account (board-image-generation D1 and D2), against
// the fake OpenRouter.

const GOOD = 'sk-or-v1-good';
const NOLIMIT = 'sk-or-v1-nolimit';
const BAD = 'sk-or-v1-0000000000000000000000000000bad1';

let fake: FakeOpenRouter;
beforeEach(async () => {
  fake = await startFakeOpenRouter();
});
afterEach(() => fake.close());

async function signedInApp(overrides: Parameters<typeof startApp>[0] = {}, logger?: ReturnType<typeof capturedLog>) {
  await steve();
  const app = await startApp({ openRouterBaseUrl: fake.baseUrl, ...overrides }, logger ? { logger: logger.logger } : {});
  const headers = { cookie: `pb_session=${await signedIn(app)}`, origin: ORIGIN };
  return { app, headers };
}

const status = (app: FastifyInstance, headers: Record<string, string>, check = false) =>
  app.inject({ url: `/api/image-generation${check ? '?check=1' : ''}`, headers });
const save = (app: FastifyInstance, headers: Record<string, string>, key: unknown) =>
  app.inject({ method: 'PUT', url: '/api/image-generation/key', headers, payload: { key } as object });
const remove = (app: FastifyInstance, headers: Record<string, string>) =>
  app.inject({ method: 'DELETE', url: '/api/image-generation/key', headers });

const secrets = () => db.query<{ hint: string; ciphertext: Buffer }>('select hint, ciphertext from user_secrets');

// A server that never answers, for the timeouts.
async function silentServer(): Promise<{ baseUrl: string; close(): Promise<void> }> {
  const server = createServer(() => {});
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/api/v1`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

describe('the OpenRouter key', () => {
  it('starts with no key, without asking OpenRouter', async () => {
    const { app, headers } = await signedInApp();
    const response = await status(app, headers);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ configured: true, key: null });
    expect(response.json().error).toBeUndefined();
    expect((await status(app, headers, true)).json()).toMatchObject({ configured: true, key: null });
    expect(fake.calls).toEqual([]);
  });

  it('saves a good key after checking it, sealed, and answers its credit', async () => {
    const { app, headers } = await signedInApp();
    const response = await save(app, headers, `  ${GOOD}\n`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      configured: true,
      key: { hint: 'good', limitRemaining: 9.5 },
    });
    expect(Date.parse(response.json().key.checkedAt)).toBeGreaterThan(Date.now() - 60_000);
    expect(fake.calls).toEqual([{ method: 'GET', path: '/api/v1/key', body: null, bearer: true }]);
    const rows = await secrets();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.hint).toBe('good');
    expect(rows[0]!.ciphertext.toString('utf8')).not.toContain(GOOD);

    // Plain, the status asks OpenRouter nothing and answers no credit.
    const plain = await status(app, headers);
    expect(plain.json()).toMatchObject({ configured: true, key: { hint: 'good', limitRemaining: null } });
    expect(fake.calls).toHaveLength(1);
    // With ?check=1 it asks, and records the check.
    await db.query("update user_secrets set checked_at = now() - interval '1 day'");
    const checked = await status(app, headers, true);
    expect(checked.json()).toMatchObject({ key: { hint: 'good', limitRemaining: 9.5 } });
    expect(Date.parse(checked.json().key.checkedAt)).toBeGreaterThan(Date.now() - 60_000);
    expect(fake.calls).toHaveLength(2);
  });

  it('answers no credit for a key with no spending limit', async () => {
    const { app, headers } = await signedInApp();
    const response = await save(app, headers, NOLIMIT);
    expect(response.statusCode).toBe(200);
    expect(response.json().key).toMatchObject({ hint: 'imit', limitRemaining: null });
    expect((await status(app, headers, true)).json().error).toBeUndefined();
  });

  it('stores nothing for a key OpenRouter rejects', async () => {
    const { app, headers } = await signedInApp();
    const response = await save(app, headers, BAD);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'key_rejected', message: 'OpenRouter rejected this key.' });
    expect(await secrets()).toEqual([]);
  });

  it('stores nothing, and keeps the old key, when OpenRouter does not answer', async () => {
    const { app, headers } = await signedInApp();
    await save(app, headers, GOOD);
    fake.failNext(503);
    const failed = await save(app, headers, NOLIMIT);
    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toEqual({ error: 'openrouter_unreachable', message: 'OpenRouter did not answer. Nothing was saved.' });
    expect((await secrets()).map((r) => r.hint)).toEqual(['good']);

    await fake.close();
    const closed = await save(app, headers, NOLIMIT);
    expect(closed.statusCode).toBe(502);
    expect((await secrets()).map((r) => r.hint)).toEqual(['good']);
  });

  it('gives up on a check that takes too long', async () => {
    const silent = await silentServer();
    try {
      const { checkKey } = await import('../../src/images/openrouter.js');
      expect(await checkKey(silent.baseUrl, GOOD, 200)).toEqual({ ok: false, reason: 'openrouter_unreachable' });
    } finally {
      await silent.close();
    }
  });

  it('refuses an empty or overlong key', async () => {
    const { app, headers } = await signedInApp();
    for (const key of ['', '   ', 'x'.repeat(201), 42]) {
      const response = await save(app, headers, key);
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('validation_error');
    }
    const extra = await app.inject({
      method: 'PUT',
      url: '/api/image-generation/key',
      headers,
      payload: { key: GOOD, also: 1 },
    });
    expect(extra.statusCode).toBe(400);
    expect(fake.calls).toEqual([]);
  });

  it('removes the key, and answers 204 also with none', async () => {
    const { app, headers } = await signedInApp();
    await save(app, headers, GOOD);
    expect((await remove(app, headers)).statusCode).toBe(204);
    expect(await secrets()).toEqual([]);
    expect((await status(app, headers)).json()).toMatchObject({ configured: true, key: null });
    expect((await remove(app, headers)).statusCode).toBe(204);
  });

  it('reads a key sealed under another server key as unreadable', async () => {
    const { app, headers } = await signedInApp();
    await save(app, headers, GOOD);
    const rotated = await startApp({ openRouterBaseUrl: fake.baseUrl, secretsKey: Buffer.alloc(32, 99) });
    for (const check of [false, true]) {
      const response = await status(rotated, headers, check);
      expect(response.json()).toMatchObject({ configured: true, key: null, error: 'key_unreadable' });
    }
    expect(fake.calls).toHaveLength(1);
    // Saving again under the new key works.
    expect((await save(rotated, headers, GOOD)).statusCode).toBe(200);
    expect((await status(rotated, headers)).json().key).toMatchObject({ hint: 'good' });
  });

  it('keeps each account’s key apart: a row copied to another account does not open', async () => {
    const { app, headers } = await signedInApp();
    const anna = await createUser(db, { username: 'anna', password: PASSWORD });
    const annaHeaders = { cookie: `pb_session=${await signedIn(app, 'anna')}`, origin: ORIGIN };
    await save(app, headers, GOOD);
    expect((await status(app, annaHeaders)).json()).toMatchObject({ key: null });
    await db.query(
      `insert into user_secrets (user_id, kind, ciphertext, iv, tag, hint, checked_at)
       select $1, kind, ciphertext, iv, tag, hint, checked_at from user_secrets`,
      [anna.id],
    );
    expect((await status(app, annaHeaders)).json()).toMatchObject({ key: null, error: 'key_unreadable' });
  });

  it('answers the live check’s errors', async () => {
    const { app, headers } = await signedInApp();
    await save(app, headers, GOOD);
    const before = (await status(app, headers)).json().key.checkedAt;

    fake.failNext(401);
    const rejected = await status(app, headers, true);
    expect(rejected.json()).toMatchObject({ key: { hint: 'good', limitRemaining: null }, error: 'key_rejected' });

    fake.failNext(500);
    const down = await status(app, headers, true);
    expect(down.json()).toMatchObject({
      key: { hint: 'good', checkedAt: before, limitRemaining: null },
      error: 'openrouter_unreachable',
    });

    await fake.close();
    const gone = await status(app, headers, true);
    expect(gone.json()).toMatchObject({ key: { checkedAt: before }, error: 'openrouter_unreachable' });
  });

  it('is off without a server key: 503 not_configured to every write', async () => {
    const { app, headers } = await signedInApp({ secretsKey: null });
    expect((await status(app, headers, true)).json()).toEqual({ configured: false, key: null });
    for (const response of [await save(app, headers, GOOD), await remove(app, headers)]) {
      expect(response.statusCode).toBe(503);
      expect(response.json().error).toBe('not_configured');
    }
    expect(fake.calls).toEqual([]);
  });

  it('never answers or logs the plain key', async () => {
    const log = capturedLog();
    const { app, headers } = await signedInApp({}, log);
    const answers: string[] = [];
    const keep = async (response: Promise<{ body: string }>) => answers.push((await response).body);
    await keep(save(app, headers, BAD));
    await keep(save(app, headers, GOOD));
    await keep(status(app, headers));
    await keep(status(app, headers, true));
    fake.failNext(500);
    await keep(status(app, headers, true));
    fake.failNext(503);
    await keep(save(app, headers, BAD));
    await keep(remove(app, headers));
    expect(answers).toHaveLength(7);
    expect(log.text()).toContain('/api/image-generation');
    for (const text of [...answers, log.text()]) {
      expect(text).not.toContain(GOOD);
      expect(text).not.toContain(BAD);
      expect(text).not.toContain('sk-or-v1-');
    }
  });
});
